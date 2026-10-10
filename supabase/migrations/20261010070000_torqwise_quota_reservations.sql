-- Reservation-specific quota rollback. This avoids decrementing another
-- concurrent request's usage when one AI request fails.
create table if not exists public.torqwise_quota_reservations (
  reservation_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_type text not null check (period_type in ('daily', 'monthly')),
  period_start date not null,
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.torqwise_quota_reservations enable row level security;
revoke all on table public.torqwise_quota_reservations from public, anon, authenticated;

create or replace function public.torqwise_consume_question_v2(
  p_user_id uuid,
  p_plan text default 'free'
)
returns table (
  allowed boolean,
  used integer,
  "limit" integer,
  remaining integer,
  period_type text,
  period_start date,
  reservation_id uuid
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
  v_reservation_id uuid;
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

  if v_plan in ('driver', 'pro') and v_status = 'active'
     and v_period_end is not null and v_period_end > now() then
    v_period_type := 'monthly';
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

  select u.question_count into v_used
    from public.torqwise_usage as u
   where u.user_id = p_user_id
     and u.period_type = v_period_type
     and u.period_start = v_period_start
   for update;

  if v_used >= v_limit then
    return query select false, v_used, v_limit, 0, v_period_type, v_period_start, null::uuid;
    return;
  end if;

  update public.torqwise_usage as u
     set question_count = u.question_count + 1, updated_at = now()
   where u.user_id = p_user_id
     and u.period_type = v_period_type
     and u.period_start = v_period_start
  returning u.question_count into v_used;

  insert into public.torqwise_quota_reservations (user_id, period_type, period_start)
  values (p_user_id, v_period_type, v_period_start)
  returning reservation_id into v_reservation_id;

  return query select true, v_used, v_limit, greatest(v_limit - v_used, 0),
    v_period_type, v_period_start, v_reservation_id;
end;
$$;

create or replace function public.torqwise_refund_question_v2(
  p_reservation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_period_type text;
  v_period_start date;
begin
  if p_reservation_id is null then
    return false;
  end if;

  update public.torqwise_quota_reservations
     set refunded_at = now()
   where reservation_id = p_reservation_id
     and refunded_at is null
  returning user_id, period_type, period_start
       into v_user_id, v_period_type, v_period_start;

  if not found then
    return false;
  end if;

  update public.torqwise_usage
     set question_count = greatest(question_count - 1, 0),
         updated_at = now()
   where user_id = v_user_id
     and period_type = v_period_type
     and period_start = v_period_start
     and question_count > 0;

  return true;
end;
$$;

revoke all on function public.torqwise_consume_question_v2(uuid, text) from public, anon, authenticated;
revoke all on function public.torqwise_refund_question_v2(uuid) from public, anon, authenticated;
grant execute on function public.torqwise_consume_question_v2(uuid, text) to service_role;
grant execute on function public.torqwise_refund_question_v2(uuid) to service_role;
