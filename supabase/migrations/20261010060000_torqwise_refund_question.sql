-- Refund a previously consumed question if upstream AI research fails.
-- Called only by the trusted Netlify server using the Supabase server key.
create or replace function public.torqwise_refund_question(
  p_user_id uuid,
  p_period_type text,
  p_period_start date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_period_type not in ('daily', 'monthly') then
    raise exception 'Invalid quota period type';
  end if;

  update public.torqwise_usage
     set question_count = greatest(question_count - 1, 0),
         updated_at = now()
   where user_id = p_user_id
     and period_type = p_period_type
     and period_start = p_period_start
     and question_count > 0;
end;
$$;

revoke all on function public.torqwise_refund_question(uuid, text, date) from public;
revoke all on function public.torqwise_refund_question(uuid, text, date) from anon;
revoke all on function public.torqwise_refund_question(uuid, text, date) from authenticated;
grant execute on function public.torqwise_refund_question(uuid, text, date) to service_role;
