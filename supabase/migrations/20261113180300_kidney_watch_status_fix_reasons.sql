-- Fix: append reason codes with array_append (text[] || literal was parsed as an array literal). Rules unchanged from decision 7.
--   learning : fewer than 7 check-ins (drinking rules not evaluated yet)
--   amber    : 4+ of the last 7 check-ins are 'more', or 4+ are 'less',
--              or the latest weigh-in is 5%+ below the reference weigh-in
--              (the one nearest to 28 days earlier, within 21–35 days earlier)
--   red      : the latest breathing count is over 30 a minute
-- Priority: red > amber > learning > steady. `reasons` lists every rule that fired.
-- SECURITY INVOKER: called with a member's session, RLS limits it to her own cats.

create or replace function kidney_watch_status(p_cat_id uuid)
returns table (status text, reasons text[], checkins_total int, more_in_last_7 int, less_in_last_7 int, weight_change_pct numeric, latest_breaths int)
language plpgsql stable as $$
declare
  v_total int;
  v_more int := 0;
  v_less int := 0;
  v_latest_date date;
  v_latest_lb numeric;
  v_ref_lb numeric;
  v_change numeric;
  v_breaths int;
  v_reasons text[] := '{}';
  v_status text;
begin
  select count(*) into v_total from check_ins where cat_id = p_cat_id;

  if v_total >= 7 then
    select count(*) filter (where drinking = 'more'),
           count(*) filter (where drinking = 'less')
      into v_more, v_less
      from (select drinking from check_ins where cat_id = p_cat_id order by date desc limit 7) last7;
    if v_more >= 4 then v_reasons := array_append(v_reasons, 'drinking_more'); end if;
    if v_less >= 4 then v_reasons := array_append(v_reasons, 'drinking_less'); end if;
  end if;

  select date, cat_lb into v_latest_date, v_latest_lb
    from weigh_ins where cat_id = p_cat_id order by date desc, created_at desc limit 1;
  if v_latest_date is not null then
    select cat_lb into v_ref_lb
      from weigh_ins
     where cat_id = p_cat_id
       and date between v_latest_date - 35 and v_latest_date - 21
     order by abs((v_latest_date - 28) - date), date asc
     limit 1;
    if v_ref_lb is not null and v_ref_lb > 0 then
      v_change := round((v_latest_lb - v_ref_lb) / v_ref_lb * 100, 1);
      if v_change <= -5 then v_reasons := array_append(v_reasons, 'weight_down_5pct'); end if;
    end if;
  end if;

  select breaths_per_min into v_breaths
    from breathing_counts where cat_id = p_cat_id order by taken_at desc limit 1;
  if v_breaths > 30 then v_reasons := array_append(v_reasons, 'breathing_over_30'); end if;

  v_status := case
    when 'breathing_over_30' = any (v_reasons) then 'red'
    when cardinality(v_reasons) > 0 then 'amber'
    when v_total < 7 then 'learning'
    else 'steady'
  end;

  return query select v_status, v_reasons, v_total, v_more, v_less, v_change, v_breaths;
end $$;

grant execute on function kidney_watch_status(uuid) to authenticated;
