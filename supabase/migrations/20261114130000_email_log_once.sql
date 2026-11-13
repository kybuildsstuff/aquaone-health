-- One welcome and one trial-ending email per member, ever.
-- A send first claims its row (status 'sending'), then becomes 'sent' or 'failed'.
-- Only live claims ('sending', 'sent') are unique, so a failed attempt stays on
-- record and a later run may try again.
create unique index email_log_once_per_member_kind
  on email_log (member_id, kind)
  where member_id is not null and status in ('sending', 'sent');
