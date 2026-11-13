-- Is it safe? (decision 6): severity levels, extra facts, and a forgiving search over our own list.
-- The AI never decides safety; it only names the item, which is then matched here.

create extension if not exists pg_trgm with schema extensions;

create type safety_severity as enum ('safe', 'mild', 'toxic', 'emergency');

-- The table is empty until the seed migration that follows, so the new not-null column needs no default.
alter table safety_items
  add column severity safety_severity not null,
  add column scientific_name text,
  add column toxic_principle text,
  add column updated_at timestamptz not null default now();

-- verdict (the original three-way column) always follows severity, so nothing can disagree.
alter table safety_items add constraint safety_items_verdict_matches_severity check (
  verdict = case severity when 'safe' then 'safe'::safety_verdict when 'mild' then 'caution'::safety_verdict else 'toxic'::safety_verdict end
);
alter table safety_items add constraint safety_items_what_to_do_present check (length(coalesce(what_to_do, '')) > 0);
alter table safety_items add constraint safety_items_summary_present check (length(summary) > 0);
create unique index safety_items_name_lower_idx on safety_items (lower(name));

-- How a lookup was made: typed into the search box, or from a photo.
alter table safety_lookups add column method text not null default 'search' check (method in ('search', 'photo'));

-- Lower-case, letters and digits only, single spaces.
create or replace function public.safe_norm(t text) returns text
language sql immutable parallel safe as $$
  select trim(regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', ' ', 'g'))
$$;

-- Best matches for what she typed (or what the photo model named), across names, aliases and
-- scientific names: exact, then prefix, then whole word, then trigram similarity for misspellings.
-- security invoker: row-level security on safety_items still decides who can read the list.
create or replace function public.search_safety_items(q text, max_results int default 8)
returns table (id uuid, name text, category safety_category, severity safety_severity, matched text, score real)
language sql stable security invoker
set search_path = public, extensions
as $$
  with nq as (select safe_norm(q) as v),
  terms as (
    select i.id, i.name, i.category, i.severity, t.term, safe_norm(t.term) as nt
    from safety_items i,
    lateral unnest(array[i.name] || i.aliases || case when i.scientific_name is null then '{}'::text[] else array[i.scientific_name] end) as t(term)
  ),
  scored as (
    select terms.id, terms.name, terms.category, terms.severity, terms.term,
      (case
        when terms.nt = nq.v then 1.0
        when terms.nt like nq.v || '%' then 0.9
        when ' ' || terms.nt || ' ' like '% ' || nq.v || ' %' then 0.8
        else greatest(similarity(terms.nt, nq.v), word_similarity(nq.v, terms.nt) * 0.85)
      end)::real as score
    from terms, nq
    where length(nq.v) >= 2
  ),
  best as (
    select distinct on (scored.id) scored.* from scored where scored.score >= 0.35
    order by scored.id, scored.score desc
  )
  select best.id, best.name, best.category, best.severity, best.term, best.score
  from best
  order by best.score desc, (safe_norm(best.name) = (select v from nq)) desc, length(best.name), best.name
  limit greatest(1, least(max_results, 25))
$$;

revoke all on function public.search_safety_items(text, int) from public, anon;
grant execute on function public.search_safety_items(text, int) to authenticated, service_role;
