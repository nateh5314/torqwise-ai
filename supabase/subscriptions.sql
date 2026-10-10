-- Run this in the Supabase SQL Editor for the TORQWISE project.
-- Never expose SUPABASE_SERVICE_ROLE_KEY in browser code.
create table if not exists public.subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text not null unique,
  price_id text,
  status text not null default 'incomplete',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);
create index if not exists subscriptions_customer_id_idx on public.subscriptions(stripe_customer_id);
alter table public.subscriptions enable row level security;
-- Users can read their own row only. All writes are server-side using service-role credentials.
drop policy if exists "Users can read their own subscription" on public.subscriptions;
create policy "Users can read their own subscription"
  on public.subscriptions for select to authenticated
  using (auth.uid() = user_id);
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;
