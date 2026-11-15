-- Ask photos that no message points to any more (audit, 15 Nov): a deleted cat's messages go
-- with it, but its files in storage stayed; so did a photo whose message failed to save.
-- Only files older than p_before are listed, so an upload still in flight is never touched.
-- Service role only (the nightly ask-photos cron).
create or replace function ask_photo_orphans(p_before timestamptz, p_limit int default 500)
returns table (name text)
language sql stable security definer set search_path = '' as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'ask-photos'
     and o.created_at < p_before
     and not exists (select 1 from public.chat_messages m where m.photo_path = o.name)
   order by o.created_at
   limit p_limit
$$;

revoke all on function ask_photo_orphans(timestamptz, int) from public, anon, authenticated;
grant execute on function ask_photo_orphans(timestamptz, int) to service_role;
