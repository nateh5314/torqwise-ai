-- Stripe subscription linkage for TORQWISE. Apply after the core usage migration.
alter table public.torqwise_subscriptions
  add column if not exists stripe_customer_id text unique,
  add column if not exists stripe_subscription_id text unique,
  add column if not exists stripe_price_id text,
  add column if not exists cancel_at_period_end boolean not null default false;

create index if not exists torqwise_subscriptions_stripe_subscription_idx
  on public.torqwise_subscriptions (stripe_subscription_id);

-- Only service-role code should write subscription entitlements.
revoke insert, update, delete on table public.torqwise_subscriptions from anon, authenticated;
