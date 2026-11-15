-- Ask that can see (Ky, 15 Nov): a photo can go with a question. Photos are kept privately
-- for 90 days (a daily job deletes older ones and clears photo_path); photo_note is the
-- model's one-line description, kept so later questions can refer back to the photo.
alter table chat_messages add column if not exists photo_path text;
alter table chat_messages add column if not exists photo_note text;

-- Private bucket: no storage policies, so only the server (service role) can read or write.
-- The chat screen shows photos through short-lived signed URLs made on the server.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ask-photos', 'ask-photos', false, 4194304, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
