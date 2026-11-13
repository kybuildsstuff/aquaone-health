-- Ranking tweak found by the search tests: a one-word misspelling ("ibuprofin") scored just under
-- the confident line. Partial-word matches now count more when she typed only meaningful words, and
-- less when generic words were dropped (so "rubber plant" doesn't prefer "rubber band").

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
        word_similarity(nq.c, t.ct) * (case when nq.c = nq.v then 0.9 else 0.7 end)
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
