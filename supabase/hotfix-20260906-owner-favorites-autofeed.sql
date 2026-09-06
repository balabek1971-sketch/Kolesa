-- Allow owners to favorite and see their own active listings in Autolenta.
-- Owner behavior events remain excluded by record_behavior_event, so this does
-- not allow owners to inflate views or recommendation signals.

create or replace function public.can_favorite_listing(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.listings
    where id = p_listing_id
      and status = 'active'
      and deleted_at is null
  );
$$;

create or replace function public.update_favorite_counter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if exists (
      select 1 from public.listings l
      where l.id = new.listing_id and l.owner_id = new.user_id
    ) then
      return new;
    end if;
    update public.listing_stats
    set favorites_count = favorites_count + 1,
        updated_at = now()
    where listing_id = new.listing_id;
    return new;
  end if;

  if exists (
    select 1 from public.listings l
    where l.id = old.listing_id and l.owner_id = old.user_id
  ) then
    return old;
  end if;
  update public.listing_stats
  set favorites_count = greatest(favorites_count - 1, 0),
      updated_at = now()
  where listing_id = old.listing_id;
  return old;
end;
$$;

update public.listing_stats stats
set favorites_count = counted.favorites_count,
    updated_at = now()
from (
  select
    listing.id as listing_id,
    count(favorite.listing_id)::bigint as favorites_count
  from public.listings listing
  left join public.favorites favorite
    on favorite.listing_id = listing.id
   and favorite.user_id <> listing.owner_id
  group by listing.id
) counted
where stats.listing_id = counted.listing_id
  and stats.favorites_count is distinct from counted.favorites_count;

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

revoke all on function public.can_favorite_listing(uuid) from public, anon, authenticated;
revoke all on function public.get_personalized_autofeed(uuid, uuid, integer, integer, jsonb) from public;
revoke all on function public.update_favorite_counter() from public, anon, authenticated;

grant execute on function public.can_favorite_listing(uuid) to authenticated, service_role;
grant execute on function public.get_personalized_autofeed(uuid, uuid, integer, integer, jsonb)
  to anon, authenticated, service_role;
