-- Kidney Watch judges only recent data (audit, 15 Nov). Before this, the last 7 check-ins
-- counted however old they were, so a member who stopped checking in for a month still saw
-- "steady", and one old breathing count over 30 kept the page red for ever.
--   drinking  : judged on the last 7 check-ins only when 7 fall in the last 14 days;
--               otherwise "learning" (lapsed = she had a baseline before and needs to check in again)
--   weight    : judged only when the latest weigh-in is within the last 35 days
--   breathing : only a count from the last 7 days can make the page red
-- Unchanged: amber at 4+ "more" or 4+ "less" of those 7, or weight down 5%+ against the
-- weigh-in nearest 28 days earlier; red over 30 a minute. p_today exists so tests can pin the
-- day; the app calls it with the cat id only.
drop function if exists kidney_watch_status(uuid);

create function kidney_watch_status(p_cat_id uuid, p_today date default current_date)
returns table (status text, reasons text[], checkins_total int, more_in_last_7 int, less_in_last_7 int, weight_change_pct numeric, latest_breaths int, recent_checkins int, lapsed boolean)
language plpgsql stable as $$
declare
  v_total int;
  v_recent int;
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
  select count(*), count(*) filter (where date >= p_today - 13)
    into v_total, v_recent
    from check_ins where cat_id = p_cat_id;

  if v_recent >= 7 then
    select count(*) filter (where drinking = 'more'),
           count(*) filter (where drinking = 'less')
      into v_more, v_less
      from (select drinking from check_ins where cat_id = p_cat_id and date >= p_today - 13 order by date desc limit 7) last7;
    if v_more >= 4 then v_reasons := array_append(v_reasons, 'drinking_more'); end if;
    if v_less >= 4 then v_reasons := array_append(v_reasons, 'drinking_less'); end if;
  end if;

  select date, cat_lb into v_latest_date, v_latest_lb
    from weigh_ins where cat_id = p_cat_id order by date desc, created_at desc limit 1;
  if v_latest_date is not null and v_latest_date >= p_today - 35 then
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
    from breathing_counts
   where cat_id = p_cat_id and taken_at >= (p_today - 7)::timestamptz
   order by taken_at desc limit 1;
  if v_breaths > 30 then v_reasons := array_append(v_reasons, 'breathing_over_30'); end if;

  v_status := case
    when 'breathing_over_30' = any (v_reasons) then 'red'
    when cardinality(v_reasons) > 0 then 'amber'
    when v_recent < 7 then 'learning'
    else 'steady'
  end;

  return query select v_status, v_reasons, v_total, v_more, v_less, v_change, v_breaths, v_recent, (v_recent < 7 and v_total >= 7);
end $$;

grant execute on function kidney_watch_status(uuid, date) to authenticated;
