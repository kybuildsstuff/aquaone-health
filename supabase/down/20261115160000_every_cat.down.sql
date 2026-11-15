-- Undo for 20261115160000_every_cat.sql. Run only after the app code is reverted.
drop trigger if exists cats_limit on cats;
drop function if exists enforce_cat_limit();
drop index if exists cats_owner_active_idx;
alter table cats drop column if exists archived_at;
delete from schema_migrations where name = '20261115160000_every_cat.sql';
