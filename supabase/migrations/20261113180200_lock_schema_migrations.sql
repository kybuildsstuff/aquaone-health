-- The runner's bookkeeping table must not be reachable through the Data API.
alter table public.schema_migrations enable row level security;
-- no policies: only the service role / direct DB connection can read it.
