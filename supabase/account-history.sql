-- TORQWISE per-account history. Run once in the Supabase SQL Editor.
create table if not exists public.account_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('research','diagnostic','parts','job')),
  title text not null,
  asset text,
  serial text,
  topic text,
  prompt text,
  result text,
  sources jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists account_history_user_created_idx on public.account_history(user_id, created_at desc);
create index if not exists account_history_user_kind_created_idx on public.account_history(user_id, kind, created_at desc);
alter table public.account_history enable row level security;
revoke all on public.account_history from anon, authenticated;
-- Access only through Netlify functions after verifying the caller's Supabase session.
