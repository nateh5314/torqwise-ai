-- TORQWISE first-party fitment catalog foundation.
-- No application is considered verified until a human-reviewed evidence record is added.
create table if not exists public.fitment_applications (
  id bigint generated always as identity primary key,
  part_number text not null,
  brand text,
  part_name text,
  vehicle_year_start integer,
  vehicle_year_end integer,
  make text,
  model text,
  trim text,
  engine text,
  drive_type text,
  axle_position text,
  abs_type text,
  market text,
  status text not null default 'unverified'
    check (status in ('unverified','cross_reference','verified')),
  evidence jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence) = 'array'),
  fitment_notes text,
  reviewer text,
  reviewed_at timestamptz,
  source_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (vehicle_year_start is null or vehicle_year_start between 1900 and 2200),
  check (vehicle_year_end is null or vehicle_year_end between 1900 and 2200),
  check (vehicle_year_start is null or vehicle_year_end is null or vehicle_year_end >= vehicle_year_start),
  check (status <> 'verified' or (reviewed_at is not null and jsonb_array_length(evidence) > 0))
);

create index if not exists fitment_applications_part_number_idx
  on public.fitment_applications (lower(part_number));
create index if not exists fitment_applications_vehicle_idx
  on public.fitment_applications (lower(make), lower(model), vehicle_year_start, vehicle_year_end);
create index if not exists fitment_applications_status_idx
  on public.fitment_applications (status);

alter table public.fitment_applications enable row level security;
drop policy if exists "Public can read reviewed fitment records" on public.fitment_applications;
create policy "Public can read reviewed fitment records"
  on public.fitment_applications for select to anon, authenticated
  using (status in ('verified','cross_reference'));
-- No public insert/update/delete policies: edits require a trusted server-side process.
