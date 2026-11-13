-- AquaOne Health v1: core schema with row-level security.
-- Every owner-facing table is reachable only through the owner's own cats (or her own user row).

create extension if not exists pgcrypto;

-- Enums ---------------------------------------------------------------------
create type member_status as enum ('trial', 'active', 'past_due', 'cancelled', 'ended');
create type cat_pronoun as enum ('he', 'she', 'they');
create type cat_lives as enum ('indoor', 'outdoor', 'both');
create type cat_food as enum ('dry', 'wet', 'mix');
create type drinking_level as enum ('less', 'normal', 'more');
create type chat_role as enum ('user', 'assistant');
create type safety_category as enum ('plant', 'food', 'household', 'medicine');
create type safety_verdict as enum ('safe', 'caution', 'toxic');
create type alert_level as enum ('amber', 'red');

-- updated_at helper -----------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Members (written only by the service role, from billing webhooks) ----------
create table members (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  shopify_customer_id text,
  contract_id text unique,
  status member_status not null default 'trial',
  trial_ends_at timestamptz,
  paid_through timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger members_updated_at before update on members
  for each row execute function set_updated_at();

-- Cats -------------------------------------------------------------------------
create table cats (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  pronoun cat_pronoun not null default 'they',
  age_years numeric(4,1) check (age_years >= 0 and age_years <= 40),
  breed text,
  lives cat_lives,
  food cat_food,
  conditions text[] not null default '{}',
  vet_name text,
  vet_phone text,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cats_owner_idx on cats (owner_id);
create trigger cats_updated_at before update on cats
  for each row execute function set_updated_at();

-- True when the signed-in user owns the cat. SECURITY DEFINER so policies on
-- child tables don't recurse through cats' own policy.
create or replace function owns_cat(p_cat_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from cats where id = p_cat_id and owner_id = auth.uid());
$$;

-- Daily drinking check-ins -------------------------------------------------------
create table check_ins (
  id uuid primary key default gen_random_uuid(),
  cat_id uuid not null references cats (id) on delete cascade,
  date date not null,
  drinking drinking_level not null,
  created_at timestamptz not null default now(),
  unique (cat_id, date)
);

-- Weigh-ins: owner alone, then owner holding the cat ------------------------------
create table weigh_ins (
  id uuid primary key default gen_random_uuid(),
  cat_id uuid not null references cats (id) on delete cascade,
  date date not null,
  owner_lb numeric(6,2) not null check (owner_lb > 0),
  with_cat_lb numeric(6,2) not null check (with_cat_lb > owner_lb),
  cat_lb numeric(6,2) generated always as (with_cat_lb - owner_lb) stored,
  created_at timestamptz not null default now()
);
create index weigh_ins_cat_date_idx on weigh_ins (cat_id, date);

-- Sleeping breathing counts ----------------------------------------------------------
create table breathing_counts (
  id uuid primary key default gen_random_uuid(),
  cat_id uuid not null references cats (id) on delete cascade,
  taken_at timestamptz not null default now(),
  breaths_per_min smallint not null check (breaths_per_min between 1 and 200)
);
create index breathing_counts_cat_taken_idx on breathing_counts (cat_id, taken_at);

-- Care-task library (read-only to members) ---------------------------------------------
create table care_tasks (
  id text primary key,
  title text not null,
  detail text,
  tags text[] not null default '{}',
  min_age numeric(4,1),
  conditions text[] not null default '{}'
);

-- The three tasks picked for a cat on a day, and which are done -----------------------------
create table care_plan_days (
  id uuid primary key default gen_random_uuid(),
  cat_id uuid not null references cats (id) on delete cascade,
  date date not null,
  task_ids text[] not null default '{}',
  done_ids text[] not null default '{}',
  unique (cat_id, date)
);

-- The assistant conversation ---------------------------------------------------------------
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  cat_id uuid not null references cats (id) on delete cascade,
  role chat_role not null,
  content text not null,
  flagged_urgent boolean not null default false,
  created_at timestamptz not null default now()
);
create index chat_messages_cat_created_idx on chat_messages (cat_id, created_at);

-- Is it safe? list (read-only to members) -------------------------------------------------------
create table safety_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  aliases text[] not null default '{}',
  category safety_category not null,
  verdict safety_verdict not null,
  summary text not null,
  what_to_do text,
  source text not null
);

create table safety_lookups (
  id uuid primary key default gen_random_uuid(),
  cat_id uuid not null references cats (id) on delete cascade,
  query text not null,
  matched_item_id uuid references safety_items (id) on delete set null,
  created_at timestamptz not null default now()
);
create index safety_lookups_cat_created_idx on safety_lookups (cat_id, created_at);
create index safety_lookups_item_idx on safety_lookups (matched_item_id);

-- Kidney Watch alerts --------------------------------------------------------------------------
create table alerts (
  id uuid primary key default gen_random_uuid(),
  cat_id uuid not null references cats (id) on delete cascade,
  kind text not null,
  level alert_level not null,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index alerts_cat_opened_idx on alerts (cat_id, opened_at);

-- Reminder preferences, one row per user -----------------------------------------------------------
create table reminder_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  by_text boolean not null default true,
  by_email boolean not null default false,
  phone text,
  checkin_time time not null default '08:00',
  checkin_on boolean not null default true,
  aquaone_on boolean not null default true,
  weighin_on boolean not null default true,
  monthly_summary_on boolean not null default true,
  quiet_start time not null default '21:00',
  quiet_end time not null default '07:00',
  timezone text not null default 'America/New_York',
  updated_at timestamptz not null default now()
);
create trigger reminder_prefs_updated_at before update on reminder_prefs
  for each row execute function set_updated_at();

-- Every email we send (service role only) -------------------------------------------------------------
create table email_log (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members (id) on delete set null,
  to_email text not null,
  kind text not null,
  provider_id text,
  status text not null default 'sent',
  created_at timestamptz not null default now()
);
create index email_log_member_idx on email_log (member_id);

-- Row-level security -------------------------------------------------------------------------------------
alter table members enable row level security;
alter table cats enable row level security;
alter table check_ins enable row level security;
alter table weigh_ins enable row level security;
alter table breathing_counts enable row level security;
alter table care_tasks enable row level security;
alter table care_plan_days enable row level security;
alter table chat_messages enable row level security;
alter table safety_items enable row level security;
alter table safety_lookups enable row level security;
alter table alerts enable row level security;
alter table reminder_prefs enable row level security;
alter table email_log enable row level security;

-- members: she can read her own row; no client writes (service role bypasses RLS).
create policy members_read_own on members for select to authenticated
  using (auth_user_id = auth.uid());

-- cats: full control of her own cats.
create policy cats_own on cats for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- child tables: rows for her own cats only.
create policy check_ins_own on check_ins for all to authenticated
  using (owns_cat(cat_id)) with check (owns_cat(cat_id));
create policy weigh_ins_own on weigh_ins for all to authenticated
  using (owns_cat(cat_id)) with check (owns_cat(cat_id));
create policy breathing_counts_own on breathing_counts for all to authenticated
  using (owns_cat(cat_id)) with check (owns_cat(cat_id));
create policy care_plan_days_own on care_plan_days for all to authenticated
  using (owns_cat(cat_id)) with check (owns_cat(cat_id));
create policy chat_messages_own on chat_messages for all to authenticated
  using (owns_cat(cat_id)) with check (owns_cat(cat_id));
create policy safety_lookups_own on safety_lookups for all to authenticated
  using (owns_cat(cat_id)) with check (owns_cat(cat_id));
-- alerts are written by the server; she may read and resolve her own.
create policy alerts_read_own on alerts for select to authenticated
  using (owns_cat(cat_id));
create policy alerts_resolve_own on alerts for update to authenticated
  using (owns_cat(cat_id)) with check (owns_cat(cat_id));

-- libraries: readable by any signed-in user, no client writes.
create policy care_tasks_read on care_tasks for select to authenticated using (true);
create policy safety_items_read on safety_items for select to authenticated using (true);

-- reminder prefs: her own row.
create policy reminder_prefs_own on reminder_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- email_log: no client access at all (RLS on, no policy).
