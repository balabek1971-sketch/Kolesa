-- Browser/PWA push subscriptions and idempotent message delivery receipts.
-- Apply once in the Supabase SQL editor.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint push_endpoint_length check (length(endpoint) between 20 and 2048),
  constraint push_p256dh_length check (length(p256dh) between 40 and 256),
  constraint push_auth_length check (length(auth_secret) between 16 and 128)
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id, last_seen_at desc);

create table if not exists public.push_deliveries (
  message_id uuid not null references public.messages(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  response_status integer,
  last_error text,
  primary key (message_id, subscription_id)
);

alter table public.push_subscriptions enable row level security;
alter table public.push_deliveries enable row level security;

revoke all on table public.push_subscriptions from public, anon, authenticated;
revoke all on table public.push_deliveries from public, anon, authenticated;
grant all on table public.push_subscriptions to service_role;
grant all on table public.push_deliveries to service_role;
