-- Run in the TORQWISE Supabase SQL Editor.
create table if not exists public.customer_requests (
  id bigint generated always as identity primary key,
  request_code text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  service text not null,
  label text not null,
  quoted_price numeric(10,2),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','paid','refunded')),
  stripe_checkout_session_id text,
  paid_at timestamptz,
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

-- Safe additive migration for projects that created this table before one-time checkout.
alter table public.customer_requests add column if not exists payment_status text not null default 'unpaid';
alter table public.customer_requests add column if not exists stripe_checkout_session_id text;
alter table public.customer_requests add column if not exists paid_at timestamptz;
create index if not exists customer_requests_payment_status_idx on public.customer_requests(payment_status, created_at desc);
