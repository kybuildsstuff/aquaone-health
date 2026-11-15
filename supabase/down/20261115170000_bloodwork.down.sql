-- Undo for 20261115170000_bloodwork.sql. Run only after the app code is reverted.
-- Storage can't be changed from SQL: afterwards empty and delete the lab-photos bucket with the
-- Storage API (supabaseAdmin().storage.emptyBucket('lab-photos') then .deleteBucket('lab-photos')).
drop table if exists lab_results;
drop table if exists lab_panels;
delete from schema_migrations where name = '20261115170000_bloodwork.sql';
