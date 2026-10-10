-- Run once in the TORQWISE Supabase SQL Editor to enable the private finance panel.
create table if not exists public.business_expenses (
  id bigint generated always as identity primary key,
  description text not null check (char_length(description) between 1 and 180),
  category text not null default 'Other' check (category in ('Software & AI','Hosting & tools','Marketing','Fees','Equipment','Travel','Professional services','Other')),
  amount numeric(10,2) not null check (amount > 0 and amount <= 10000000),
  expense_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists business_expenses_date_idx on public.business_expenses(expense_date desc);
alter table public.business_expenses enable row level security;
revoke all on public.business_expenses from anon, authenticated;
-- Only the allowlisted admin Netlify function can read or write this table.
