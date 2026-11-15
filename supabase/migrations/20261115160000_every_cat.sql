-- Every cat in the house (Ky, 15 Nov, answers 1a and 4a): up to four active cats per member on the
-- one plan; "remove" archives a cat (history kept, slot freed, can be brought back).
alter table cats add column if not exists archived_at timestamptz;
create index if not exists cats_owner_active_idx on cats (owner_id) where archived_at is null;

-- The limit lives in the database too, so two quick taps or two tabs can't make a fifth cat.
create or replace function enforce_cat_limit() returns trigger
language plpgsql as $$
begin
  if new.archived_at is null and (tg_op = 'INSERT' or old.archived_at is not null) then
    perform pg_advisory_xact_lock(hashtext(new.owner_id::text));
    if (select count(*) from cats where owner_id = new.owner_id and archived_at is null and id <> new.id) >= 4 then
      raise exception 'cat_limit' using errcode = 'P0001', hint = 'A member can have up to four cats.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists cats_limit on cats;
create trigger cats_limit before insert or update of archived_at on cats
  for each row execute function enforce_cat_limit();
