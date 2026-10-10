-- Run in the same Supabase project as subscriptions.sql.
create table if not exists public.research_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists research_usage_user_created_idx on public.research_usage(user_id, created_at desc);
alter table public.research_usage enable row level security;
revoke all on public.research_usage from anon, authenticated;
-- Usage rows are written/read only by server functions using the service-role key.
