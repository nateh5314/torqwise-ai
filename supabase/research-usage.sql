-- Run in the same Supabase project as subscriptions.sql.
create table if not exists public.research_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists research_usage_user_created_idx on public.research_usage(user_id, created_at desc);
alter table public.research_usage enable row level security;
revoke all on public.research_usage from anon, authenticated;

-- Atomically reserve a report for the UTC calendar month. The advisory lock prevents
-- concurrent requests for the same user from overshooting the free allowance.
create or replace function public.reserve_research_usage(p_user_id uuid, p_monthly_limit integer default 3)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_month_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  v_used bigint;
  v_usage_id bigint;
  v_limit integer := greatest(1, least(coalesce(p_monthly_limit, 3), 100));
begin
  if p_user_id is null then raise exception 'p_user_id is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || v_month_start::text, 0));
  select count(*) into v_used from public.research_usage where user_id=p_user_id and created_at>=v_month_start;
  if v_used >= v_limit then return jsonb_build_object('allowed',false,'remaining',0); end if;
  insert into public.research_usage(user_id) values(p_user_id) returning id into v_usage_id;
  return jsonb_build_object('allowed',true,'remaining',greatest(0,v_limit-v_used-1),'usage_id',v_usage_id);
end;
$$;

create or replace function public.release_research_usage(p_user_id uuid, p_usage_id bigint)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  v_month_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  v_deleted integer;
begin
  if p_user_id is null or p_usage_id is null then return false; end if;
  delete from public.research_usage where id=p_usage_id and user_id=p_user_id and created_at>=v_month_start;
  get diagnostics v_deleted = row_count;
  return v_deleted=1;
end;
$$;

revoke all on function public.reserve_research_usage(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_research_usage(uuid, bigint) from public, anon, authenticated;
grant execute on function public.reserve_research_usage(uuid, integer) to service_role;
grant execute on function public.release_research_usage(uuid, bigint) to service_role;
