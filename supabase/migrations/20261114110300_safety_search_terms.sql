-- Faster, better-ranked search: every name, alias and scientific name is normalised once into
-- safety_terms (kept in step with safety_items by a trigger), instead of on every keystroke.
-- Ranking: exact > prefix > whole words > fuzzy on the full text > fuzzy on the meaningful words.

-- "tree", "leaf" etc. are part of real names ("tea tree"), so only the most generic words are dropped.
create or replace function public.safe_core(t text) returns text
language sql immutable parallel safe as $$
  select coalesce(nullif(trim(regexp_replace(
    ' ' || safe_norm(t) || ' ',
    '( (plant|plants|flower|flowers|the|a|an|my|cat|cats|ate|eat|some|of|is|it|safe|for|toxic)(?= ))+',
    ' ', 'g')), ''), safe_norm(t))
$$;

create table safety_terms (
  item_id uuid not null references safety_items (id) on delete cascade,
  term text not null,
  nt text not null,   -- safe_norm(term)
  ct text not null,   -- safe_core(term)
  is_name boolean not null
);
create index safety_terms_item_idx on safety_terms (item_id);
alter table safety_terms enable row level security;
create policy safety_terms_read on safety_terms for select to authenticated using (true);

create or replace function public.refresh_safety_terms() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from safety_terms;
  insert into safety_terms (item_id, term, nt, ct, is_name)
  select distinct on (i.id, safe_norm(t.term)) i.id, t.term, safe_norm(t.term), safe_core(t.term), t.term = i.name
  from safety_items i,
  lateral unnest(array[i.name] || i.aliases || case when i.scientific_name is null then '{}'::text[] else array[i.scientific_name] end) as t(term)
  where safe_norm(t.term) <> ''
  order by i.id, safe_norm(t.term), (t.term = i.name) desc;
  return null;
end $$;
revoke all on function public.refresh_safety_terms() from public, anon, authenticated;

create trigger safety_items_refresh_terms after insert or update or delete on safety_items
  for each statement execute function refresh_safety_terms();

-- Fill it now for the rows already seeded.
insert into safety_terms (item_id, term, nt, ct, is_name)
select distinct on (i.id, safe_norm(t.term)) i.id, t.term, safe_norm(t.term), safe_core(t.term), t.term = i.name
from safety_items i,
lateral unnest(array[i.name] || i.aliases || case when i.scientific_name is null then '{}'::text[] else array[i.scientific_name] end) as t(term)
where safe_norm(t.term) <> ''
order by i.id, safe_norm(t.term), (t.term = i.name) desc;

create or replace function public.search_safety_items(q text, max_results int default 8)
returns table (id uuid, name text, category safety_category, severity safety_severity, matched text, score real)
language sql stable security invoker
set search_path = public, extensions
as $$
  with nq as (select safe_norm(q) as v, safe_core(q) as c),
  scored as (
    select t.item_id, t.term, t.is_name,
      greatest(
        case
          when t.nt = nq.v then 1.0
          when t.nt like nq.v || '%' then 0.9
          when ' ' || t.nt || ' ' like '% ' || nq.v || ' %' then 0.8
          else 0
        end,
        similarity(t.nt, nq.v),
        case when nq.c <> nq.v then similarity(t.ct, nq.c) * 0.9 else 0 end,
        word_similarity(nq.c, t.ct) * 0.75
      )::real as score
    from safety_terms t, nq
    where length(nq.v) >= 2
  ),
  best as (
    select distinct on (s.item_id) s.* from scored s where s.score >= 0.35
    order by s.item_id, s.score desc, s.is_name desc, length(s.term)
  )
  select i.id, i.name, i.category, i.severity, b.term, b.score
  from best b join safety_items i on i.id = b.item_id, nq
  order by b.score desc, b.is_name desc, similarity(safe_norm(i.name), nq.v) desc, length(i.name), i.name
  limit greatest(1, least(max_results, 25))
$$;

revoke all on function public.search_safety_items(text, int) from public, anon;
grant execute on function public.search_safety_items(text, int) to authenticated, service_role;
