-- TORQWISE Pro research bundle: three included fixed-scope service requests per UTC month.
-- Apply this migration in the same Supabase project as subscriptions.sql and customer-requests.sql.
alter table public.customer_requests
  add column if not exists included_with_pro boolean not null default false;

create table if not exists public.pro_service_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_code text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists pro_service_usage_user_created_idx
  on public.pro_service_usage(user_id, created_at desc);
alter table public.pro_service_usage enable row level security;
revoke all on public.pro_service_usage from anon, authenticated;

-- Atomically reserve one included service request; prevents concurrent requests
-- from exceeding the monthly allowance.
create or replace function public.reserve_pro_service_usage(
  p_user_id uuid,
  p_request_code text,
  p_monthly_limit integer default 3
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_month_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  v_used bigint;
  v_id bigint;
  v_limit integer := greatest(1, least(coalesce(p_monthly_limit, 3), 20));
begin
  if p_user_id is null or p_request_code is null or length(trim(p_request_code)) = 0 then
    raise exception 'user and request code are required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':pro-service:' || v_month_start::text, 0));
  select count(*) into v_used
    from public.pro_service_usage
    where user_id = p_user_id and created_at >= v_month_start;
  if v_used >= v_limit then
    return jsonb_build_object('allowed', false, 'remaining', 0);
  end if;
  insert into public.pro_service_usage(user_id, request_code)
    values (p_user_id, trim(p_request_code)) returning id into v_id;
  return jsonb_build_object('allowed', true, 'remaining', greatest(0, v_limit - v_used - 1), 'usage_id', v_id);
end;
$$;

create or replace function public.release_pro_service_usage(p_user_id uuid, p_request_code text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_deleted integer;
begin
  if p_user_id is null or p_request_code is null then return false; end if;
  delete from public.pro_service_usage
    where user_id = p_user_id and request_code = trim(p_request_code);
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;

revoke all on function public.reserve_pro_service_usage(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.release_pro_service_usage(uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_pro_service_usage(uuid, text, integer) to service_role;
grant execute on function public.release_pro_service_usage(uuid, text) to service_role;
