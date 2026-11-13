-- At most one open alert of each kind per cat, so two check-ins saved at the same
-- moment can't open the same alert twice. The server opens an alert when a
-- Kidney Watch rule starts firing and resolves it when the rule stops.
create unique index alerts_one_open_per_kind on alerts (cat_id, kind) where resolved_at is null;
