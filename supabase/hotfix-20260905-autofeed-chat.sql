-- Autolenta recommendations and buyer/seller conversations.
-- Apply once in the Supabase SQL editor.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_distinct_participants check (buyer_id <> seller_id),
  unique (listing_id, buyer_id, seller_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  deleted_at timestamptz,
  constraint messages_body_length check (length(trim(body)) between 1 and 2000)
);

create index if not exists conversations_buyer_recent_idx
  on public.conversations (buyer_id, (coalesce(last_message_at, created_at)) desc);
create index if not exists conversations_seller_recent_idx
  on public.conversations (seller_id, (coalesce(last_message_at, created_at)) desc);
create index if not exists messages_conversation_recent_idx
  on public.messages (conversation_id, created_at desc)
  where deleted_at is null;
create index if not exists messages_sender_rate_idx
  on public.messages (sender_id, created_at desc);

create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (c.buyer_id = (select auth.uid()) or c.seller_id = (select auth.uid()))
  );
$$;

create or replace function public.touch_conversation_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
after insert on public.messages
for each row execute function public.touch_conversation_from_message();

create or replace function public.start_listing_conversation(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_seller_id uuid;
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select owner_id into v_seller_id
  from public.listings
  where id = p_listing_id
    and status = 'active'
    and deleted_at is null;

  if v_seller_id is null then
    raise exception 'listing_not_available' using errcode = 'P0002';
  end if;
  if v_seller_id = v_user_id then
    raise exception 'cannot_message_yourself' using errcode = '22023';
  end if;

  insert into public.conversations (listing_id, buyer_id, seller_id)
  values (p_listing_id, v_user_id, v_seller_id)
  on conflict (listing_id, buyer_id, seller_id)
  do update set updated_at = public.conversations.updated_at
  returning id into v_conversation_id;

  return v_conversation_id;
end;
$$;

create or replace function public.send_conversation_message(
  p_conversation_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_message_id uuid;
  v_body text := trim(p_body);
begin
  if v_user_id is null or not public.is_conversation_participant(p_conversation_id) then
    raise exception 'conversation_not_available' using errcode = '42501';
  end if;
  if length(v_body) < 1 or length(v_body) > 2000 then
    raise exception 'invalid_message' using errcode = '22023';
  end if;
	if (
		select count(*)
		from public.messages recent
		where recent.sender_id = v_user_id
		  and recent.created_at >= now() - interval '10 seconds'
	) >= 5 then
		raise exception 'too_many_messages' using errcode = 'P0001';
	end if;
	if exists (
		select 1
		from public.messages recent
		where recent.conversation_id = p_conversation_id
		  and recent.sender_id = v_user_id
		  and recent.body = v_body
		  and recent.created_at >= now() - interval '30 seconds'
	) then
		raise exception 'duplicate_message' using errcode = '23505';
	end if;

  insert into public.messages (conversation_id, sender_id, body)
  values (p_conversation_id, v_user_id, v_body)
  returning id into v_message_id;

  return v_message_id;
end;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or not public.is_conversation_participant(p_conversation_id) then
    raise exception 'conversation_not_available' using errcode = '42501';
  end if;

  update public.messages
  set read_at = now()
  where conversation_id = p_conversation_id
    and sender_id <> v_user_id
    and read_at is null
    and deleted_at is null;
end;
$$;

create or replace function public.get_my_conversations()
returns table (
  id uuid,
  listing_id uuid,
  listing_title text,
  listing_price_kzt bigint,
  listing_photo_object_key text,
  other_user_id uuid,
  other_display_name text,
  last_message_body text,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.listing_id,
    l.title,
    l.price_kzt,
    (
      select m.object_key
      from public.listing_media m
      where m.listing_id = c.listing_id
        and m.kind = 'photo'
        and m.status = 'ready'
        and m.deleted_at is null
      order by m.sort_order, m.created_at
      limit 1
    ),
    case when c.buyer_id = (select auth.uid()) then c.seller_id else c.buyer_id end,
    coalesce(nullif(trim(p.display_name), ''), 'Пользователь QazAuto'),
    last_message.body,
    coalesce(last_message.created_at, c.created_at),
    (
      select count(*)
      from public.messages unread
      where unread.conversation_id = c.id
        and unread.sender_id <> (select auth.uid())
        and unread.read_at is null
        and unread.deleted_at is null
    )
  from public.conversations c
  join public.listings l on l.id = c.listing_id
  join public.profiles p
    on p.id = case when c.buyer_id = (select auth.uid()) then c.seller_id else c.buyer_id end
  left join lateral (
    select m.body, m.created_at
    from public.messages m
    where m.conversation_id = c.id and m.deleted_at is null
    order by m.created_at desc
    limit 1
  ) last_message on true
  where c.buyer_id = (select auth.uid()) or c.seller_id = (select auth.uid())
  order by coalesce(last_message.created_at, c.created_at) desc;
$$;

create or replace function public.get_conversation_messages(p_conversation_id uuid)
returns table (
  id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz,
  read_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.sender_id, m.body, m.created_at, m.read_at
  from public.messages m
  where m.conversation_id = p_conversation_id
    and m.deleted_at is null
    and public.is_conversation_participant(p_conversation_id)
  order by m.created_at asc
  limit 500;
$$;

-- Events are signals for ranking, not public counters. Owner interactions are ignored.
create or replace function public.record_behavior_event(
  p_event_id uuid,
  p_occurred_at timestamptz,
  p_event_type public.behavior_event_type,
  p_anonymous_id uuid,
  p_session_id uuid,
  p_listing_id uuid default null,
  p_position integer default null,
  p_active_milliseconds integer default null,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_occurred_at timestamptz := greatest(
    least(coalesce(p_occurred_at, now()), now() + interval '1 minute'),
    now() - interval '1 day'
  );
begin
  if v_user_id is null and p_anonymous_id is null then
    return false;
  end if;
	if octet_length(coalesce(p_metadata, '{}'::jsonb)::text) > 4096 then
		return false;
	end if;
	if (
		select count(*)
		from public.behavior_events recent
		where recent.occurred_at >= now() - interval '1 minute'
		  and (
			(v_user_id is not null and recent.user_id = v_user_id)
			or (v_user_id is null and recent.anonymous_id = p_anonymous_id)
		  )
	) >= 120 then
		return false;
	end if;
  if p_listing_id is not null and exists (
    select 1 from public.listings l
    where l.id = p_listing_id and l.owner_id = v_user_id
  ) then
    return false;
  end if;

  insert into public.behavior_events (
    event_id, occurred_at, event_type, user_id, anonymous_id, session_id,
    listing_id, position, active_milliseconds, metadata
  ) values (
    p_event_id, v_occurred_at, p_event_type, v_user_id, p_anonymous_id, p_session_id,
    p_listing_id, p_position, p_active_milliseconds,
    coalesce(p_metadata, '{}'::jsonb) - 'phone' - 'email'
  )
  on conflict do nothing;
  return true;
end;
$$;

create or replace function public.get_personalized_autofeed(
  p_anonymous_id uuid,
  p_session_id uuid,
  p_limit integer default 5,
  p_offset integer default 0,
  p_filters jsonb default '{}'::jsonb
)
returns table (
  id uuid,
  title text,
  brand_name text,
  model_name text,
  city_name text,
  price_kzt bigint,
  year integer,
  mileage_km integer,
  body_type text,
  gearbox text,
  engine_type text,
  engine_volume numeric,
  seller_name text,
  rank_score numeric,
  media jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with viewer_events as (
    select
      coalesce(l.brand_name, nullif(e.metadata ->> 'brand', '')) as brand_name,
      coalesce(l.model_name, nullif(e.metadata ->> 'model', '')) as model_name,
      coalesce(l.body_type, nullif(e.metadata ->> 'body', '')) as body_type,
      (
        case e.event_type
          when 'favorite' then 15.0
          when 'message_started' then 14.0
          when 'contact_reveal' then 12.0
          when 'search' then 8.0
          when 'qualified_view' then 7.0
          when 'open' then 4.0
          when 'active_view' then least(coalesce(e.active_milliseconds, 0) / 10000.0, 6.0)
          when 'unfavorite' then -8.0
          when 'hide' then -15.0
          else 0.15
        end
      ) * exp(-extract(epoch from (now() - e.occurred_at)) / 1209600.0) as weight
    from public.behavior_events e
    left join public.listings l on l.id = e.listing_id
    where e.occurred_at >= now() - interval '30 days'
      and (
        ((select auth.uid()) is not null and e.user_id = (select auth.uid()))
        or (p_anonymous_id is not null and e.anonymous_id = p_anonymous_id)
      )
  ),
  preference as (
    select brand_name, model_name, body_type, sum(weight) as weight
    from viewer_events
    group by brand_name, model_name, body_type
  ),
  candidates as (
    select
      l.*,
      coalesce((select sum(p.weight) from preference p where p.model_name = l.model_name and p.brand_name = l.brand_name), 0) * 0.62
      + coalesce((select sum(p.weight) from preference p where p.brand_name = l.brand_name), 0) * 0.23
      + coalesce((select sum(p.weight) from preference p where p.body_type = l.body_type), 0) * 0.08
      + ln(1 + coalesce(s.qualified_views, 0) + coalesce(s.favorites_count, 0) * 4) * 0.04
      + greatest(0, 1 - extract(epoch from (now() - l.published_at)) / 1209600.0) * 0.02
      + (mod(abs(hashtext(l.id::text || coalesce(p_session_id::text, ''))), 1000) / 1000.0) * 0.01
      as score
    from public.listings l
    left join public.listing_stats s on s.listing_id = l.id
    where l.status = 'active'
      and l.deleted_at is null
      and exists (
        select 1 from public.listing_media v
        where v.listing_id = l.id
          and v.kind = 'video'
          and v.status = 'ready'
          and v.deleted_at is null
      )
      and (coalesce(p_filters ->> 'brand', '') = '' or l.brand_name = p_filters ->> 'brand')
      and (coalesce(p_filters ->> 'model', '') = '' or l.model_name = p_filters ->> 'model')
      and (coalesce(p_filters ->> 'city', '') = '' or l.city_name = p_filters ->> 'city')
      and (coalesce(p_filters ->> 'body', '') = '' or l.body_type = p_filters ->> 'body')
      and (coalesce(p_filters ->> 'yearFrom', '') = '' or l.year >= (p_filters ->> 'yearFrom')::integer)
      and (coalesce(p_filters ->> 'yearTo', '') = '' or l.year <= (p_filters ->> 'yearTo')::integer)
      and (coalesce(p_filters ->> 'priceFrom', '') = '' or l.price_kzt >= (p_filters ->> 'priceFrom')::bigint)
      and (coalesce(p_filters ->> 'priceTo', '') = '' or l.price_kzt <= (p_filters ->> 'priceTo')::bigint)
  )
  select
    c.id,
    c.title,
    c.brand_name,
    c.model_name,
    c.city_name,
    c.price_kzt,
    c.year,
    c.mileage_km,
    c.body_type,
    c.gearbox,
    c.engine_type,
    c.engine_volume,
    coalesce(nullif(trim(p.display_name), ''), 'Частный продавец'),
	  c.score::numeric,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'kind', m.kind,
          'provider', m.provider,
          'object_key', m.object_key,
          'provider_asset_id', m.provider_asset_id,
          'poster_object_key', m.poster_object_key,
          'variants', m.variants,
          'mime_type', m.mime_type,
		  'status', m.status,
          'sort_order', m.sort_order
        )
        order by case when m.kind = 'video' then 0 else 1 end, m.sort_order
      )
      from public.listing_media m
      where m.listing_id = c.id
        and m.status = 'ready'
        and m.deleted_at is null
        and (m.kind = 'video' or (m.kind = 'photo' and m.sort_order < 3))
    ), '[]'::jsonb)
  from candidates c
  left join public.profiles p on p.id = c.owner_id
  order by c.score desc, c.published_at desc, c.id
  limit least(greatest(p_limit, 1), 10)
  offset greatest(p_offset, 0);
$$;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "conversation_participants_read" on public.conversations;
create policy "conversation_participants_read"
on public.conversations for select to authenticated
using ((select auth.uid()) in (buyer_id, seller_id));

drop policy if exists "conversation_participants_read_messages" on public.messages;
create policy "conversation_participants_read_messages"
on public.messages for select to authenticated
using (public.is_conversation_participant(conversation_id));

revoke all on public.conversations, public.messages from anon, authenticated;
grant select on public.conversations, public.messages to authenticated;

revoke all on function public.is_conversation_participant(uuid) from public, anon, authenticated;
revoke all on function public.start_listing_conversation(uuid) from public, anon, authenticated;
revoke all on function public.send_conversation_message(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_conversation_read(uuid) from public, anon, authenticated;
revoke all on function public.get_my_conversations() from public, anon, authenticated;
revoke all on function public.get_conversation_messages(uuid) from public, anon, authenticated;
revoke all on function public.record_behavior_event(uuid, timestamptz, public.behavior_event_type, uuid, uuid, uuid, integer, integer, jsonb) from public;
revoke all on function public.get_personalized_autofeed(uuid, uuid, integer, integer, jsonb) from public;

grant execute on function public.is_conversation_participant(uuid) to authenticated, service_role;
grant execute on function public.start_listing_conversation(uuid) to authenticated, service_role;
grant execute on function public.send_conversation_message(uuid, text) to authenticated, service_role;
grant execute on function public.mark_conversation_read(uuid) to authenticated, service_role;
grant execute on function public.get_my_conversations() to authenticated, service_role;
grant execute on function public.get_conversation_messages(uuid) to authenticated, service_role;
grant execute on function public.record_behavior_event(uuid, timestamptz, public.behavior_event_type, uuid, uuid, uuid, integer, integer, jsonb) to anon, authenticated, service_role;
grant execute on function public.get_personalized_autofeed(uuid, uuid, integer, integer, jsonb) to anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
