-- Search ranking fixes found by probing the live list:
--  * misspellings are judged on the meaningful words only, so "zz plant" doesn't match every "... plant";
--  * on a tie, the entry whose own name was matched wins (the list has separate entries for a plant's
--    other names, e.g. "Chlorophytum" and "Spider Plant"), then the closest name, then the shortest.

-- The words that carry meaning: generic words like "plant" or "my" are dropped (unless nothing is left).
create or replace function public.safe_core(t text) returns text
language sql immutable parallel safe as $$
  select coalesce(nullif(trim(regexp_replace(
    ' ' || safe_norm(t) || ' ',
    '( (plant|plants|flower|flowers|tree|trees|bush|shrub|leaf|leaves|the|a|an|my|cat|cats|ate|eat|some|of|is|it|safe|for|toxic)(?= ))+',
    ' ', 'g')), ''), safe_norm(t))
$$;

create or replace function public.search_safety_items(q text, max_results int default 8)
returns table (id uuid, name text, category safety_category, severity safety_severity, matched text, score real)
language sql stable security invoker
set search_path = public, extensions
as $$
  with nq as (select safe_norm(q) as v, safe_core(q) as c),
  terms as (
    select i.id, i.name, i.category, i.severity, t.term, safe_norm(t.term) as nt, safe_core(t.term) as ct
    from safety_items i,
    lateral unnest(array[i.name] || i.aliases || case when i.scientific_name is null then '{}'::text[] else array[i.scientific_name] end) as t(term)
  ),
  scored as (
    select terms.id, terms.name, terms.category, terms.severity, terms.term,
      (case
        when terms.nt = nq.v then 1.0
        when terms.nt like nq.v || '%' then 0.9
        when ' ' || terms.nt || ' ' like '% ' || nq.v || ' %' then 0.8
        else greatest(similarity(terms.ct, nq.c), word_similarity(nq.c, terms.ct) * 0.85)
      end)::real as score
    from terms, nq
    where length(nq.v) >= 2
  ),
  best as (
    select distinct on (scored.id) scored.* from scored where scored.score >= 0.35
    order by scored.id, scored.score desc, length(scored.term)
  )
  select best.id, best.name, best.category, best.severity, best.term, best.score
  from best, nq
  order by best.score desc,
    (safe_norm(best.term) = safe_norm(best.name)) desc,
    similarity(safe_norm(best.name), nq.v) desc,
    length(best.name), best.name
  limit greatest(1, least(max_results, 25))
$$;

revoke all on function public.search_safety_items(text, int) from public, anon;
grant execute on function public.search_safety_items(text, int) to authenticated, service_role;
