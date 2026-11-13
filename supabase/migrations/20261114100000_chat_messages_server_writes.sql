-- Ask: members may only READ their own conversation. Both sides of it are written by the
-- server (POST /api/ask) after it has proved she owns the cat, so she can't delete her
-- questions to reset the daily cap, or write words into the assistant's mouth.
drop policy if exists chat_messages_own on chat_messages;
create policy chat_messages_read_own on chat_messages for select to authenticated
  using (owns_cat(cat_id));
