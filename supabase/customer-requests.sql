-- Run in the TORQWISE Supabase SQL Editor.
create table if not exists public.customer_requests (
  id bigint generated always as identity primary key,
  request_code text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  service text not null,
  label text not null,
  quoted_price numeric(10,2),
  status text not null default 'Request received',
  customer_email text not null,
  customer_type text,
  vehicle text,
  details text,
  deadline date,
  created_at timestamptz not null default now()
);
create index if not exists customer_requests_user_created_idx on public.customer_requests(user_id, created_at desc);
alter table public.customer_requests enable row level security;
revoke all on public.customer_requests from anon, authenticated;
-- Only server functions with the service-role key may access request records.
