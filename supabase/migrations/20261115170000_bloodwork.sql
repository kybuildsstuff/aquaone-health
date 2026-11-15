-- Bloodwork, explained (Ky, 15 Nov, answers 5a–8a): a photo of a lab report becomes one panel of
-- results. The model only reads the numbers; our code explains them (src/lib/bloodwork.ts).
-- Photos are kept privately with the panel until she deletes it (8a).
create table if not exists lab_panels (
  id uuid primary key default gen_random_uuid(),
  cat_id uuid not null references cats (id) on delete cascade,
  taken_on date not null,                 -- the date on the report, else the day she added it
  date_from_report boolean not null default false,
  lab_name text check (length(lab_name) <= 120),
  photo_path text,
  readable text not null check (readable in ('full', 'partial')),
  created_at timestamptz not null default now()
);
create index if not exists lab_panels_cat_idx on lab_panels (cat_id, taken_on desc);

create table if not exists lab_results (
  id uuid primary key default gen_random_uuid(),
  panel_id uuid not null references lab_panels (id) on delete cascade,
  cat_id uuid not null references cats (id) on delete cascade,
  position int not null,
  test_code text,                         -- our id for a test we explain (null: not on our list)
  name text not null check (length(name) between 1 and 120),   -- as printed on the report
  value numeric,                          -- null when the report shows text (e.g. "Negative")
  value_text text not null check (length(value_text) <= 40),
  unit text check (length(unit) <= 30),
  ref_low numeric,
  ref_high numeric,
  lab_flag text check (lab_flag in ('high', 'low')),
  created_at timestamptz not null default now()
);
create index if not exists lab_results_cat_code_idx on lab_results (cat_id, test_code);
create index if not exists lab_results_panel_idx on lab_results (panel_id, position);

alter table lab_panels enable row level security;
alter table lab_results enable row level security;
create policy lab_panels_own on lab_panels for all to authenticated using (owns_cat(cat_id)) with check (owns_cat(cat_id));
create policy lab_results_own on lab_results for all to authenticated using (owns_cat(cat_id)) with check (owns_cat(cat_id));

-- Private bucket, no storage policies: only the server reads or writes; shown via signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lab-photos', 'lab-photos', false, 4194304, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
