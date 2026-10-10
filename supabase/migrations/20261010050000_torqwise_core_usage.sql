-- Core TORQWISE account plans and server-enforced question quotas.
-- Safe to apply to an existing project: tables are created only when missing.
create table if not exists public.torqwise_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_type text not null check (period_type in ('daily', 'monthly')),
  period_start date not null,
  question_count integer not null default 0 check (question_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, period_type, period_start)
);

create table if not exists public.torqwise_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'driver', 'pro')),
  status text not null default 'free' check (status in ('free', 'active', 'past_due', 'cancelled')),
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.torqwise_usage enable row level security;
alter table public.torqwise_subscriptions enable row level security;

revoke all on table public.torqwise_usage from anon, authenticated;
revoke all on table public.torqwise_subscriptions from anon, authenticated;
grant select on table public.torqwise_usage to authenticated;

create or replace function public.torqwise_consume_question(
  p_user_id uuid,
  p_plan text default 'free'
)
returns table (
  allowed boolean,
  used integer,
  "limit" integer,
  remaining integer,
  period_type text,
  period_start date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text := 'free';
  v_status text := 'free';
  v_period_end timestamptz;
  v_period_type text;
  v_period_start date;
  v_limit integer;
  v_used integer;
begin
  if p_user_id is null then
    raise exception 'User id is required';
  end if;

  select s.plan, s.status, s.current_period_end
    into v_plan, v_status, v_period_end
    from public.torqwise_subscriptions as s
   where s.user_id = p_user_id;

  if not found then
    v_plan := 'free';
    v_status := 'free';
  end if;

  if v_plan in ('driver', 'pro') and v_status = 'active' and (v_period_end is null or v_period_end > now()) then
    v_period_type := 'monthly';
    -- Paid quota periods are keyed to the UTC calendar month.
    v_period_start := date_trunc('month', now() at time zone 'UTC')::date;
    v_limit := case v_plan when 'driver' then 100 when 'pro' then 400 else 3 end;
  else
    v_period_type := 'daily';
    v_period_start := (now() at time zone 'UTC')::date;
    v_limit := 3;
  end if;

  insert into public.torqwise_usage (user_id, period_type, period_start, question_count, updated_at)
  values (p_user_id, v_period_type, v_period_start, 0, now())
  on conflict (user_id, period_type, period_start) do nothing;

  select u.question_count
    into v_used
    from public.torqwise_usage as u
   where u.user_id = p_user_id
     and u.period_type = v_period_type
     and u.period_start = v_period_start
   for update;

  if v_used >= v_limit then
    return query select false, v_used, v_limit, 0, v_period_type, v_period_start;
    return;
  end if;

  update public.torqwise_usage as u
     set question_count = u.question_count + 1,
         updated_at = now()
   where u.user_id = p_user_id
     and u.period_type = v_period_type
     and u.period_start = v_period_start
  returning u.question_count into v_used;

  return query select true, v_used, v_limit, greatest(v_limit - v_used, 0), v_period_type, v_period_start;
end;
$$;

revoke all on function public.torqwise_consume_question(uuid, text) from public;
revoke all on function public.torqwise_consume_question(uuid, text) from anon;
revoke all on function public.torqwise_consume_question(uuid, text) from authenticated;
grant execute on function public.torqwise_consume_question(uuid, text) to service_role;
