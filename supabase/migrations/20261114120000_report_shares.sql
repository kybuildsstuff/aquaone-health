-- Vet report share links (decision 8: reports share through the phone's share sheet).
-- A link carries a random token; only its SHA-256 hash is stored, so a copy of this table
-- cannot be turned back into working links. The owner creates and revokes links for her
-- own cat; nobody reads a report through this table directly. The public /r/<token> page
-- runs on the server, looks the hash up with the service role, and shows that one cat only.
-- How long a link lasts is set in the app (SHARE_LINK_DAYS in src/lib/report.ts); the
-- check below is only a hard ceiling so no link can ever be made to last for good.

create table report_shares (
  id uuid primary key default gen_random_uuid(),
  cat_id uuid not null references cats (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '90 days')
);
create index report_shares_cat_idx on report_shares (cat_id);

alter table report_shares enable row level security;

-- She can make a link only for her own cat, as herself.
create policy report_shares_insert_own on report_shares for insert to authenticated
  with check (owns_cat(cat_id) and created_by = auth.uid());
-- She can see her own cat's links (hashes and dates only; the token itself is never stored).
create policy report_shares_read_own on report_shares for select to authenticated
  using (owns_cat(cat_id));
-- She can revoke them. Only revoked_at may change (column grant below).
create policy report_shares_revoke_own on report_shares for update to authenticated
  using (owns_cat(cat_id)) with check (owns_cat(cat_id));

revoke update on report_shares from authenticated, anon;
grant update (revoked_at) on report_shares to authenticated;
revoke all on report_shares from anon;
