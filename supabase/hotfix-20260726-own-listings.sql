begin;

create or replace function public.get_own_listings()
returns table (
  id uuid,
  title text,
  brand_name text,
  model_name text,
  city_name text,
  price_kzt bigint,
  year integer,
  mileage_km integer,
  condition public.listing_condition,
  body_type text,
  status public.listing_status,
  rejection_reason text,
  published_at timestamptz,
  expires_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  cover_object_key text,
  photo_count bigint,
  video_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id,
    l.title,
    l.brand_name,
    l.model_name,
    l.city_name,
    l.price_kzt,
    l.year,
    l.mileage_km,
    l.condition,
    l.body_type,
    l.status,
    l.rejection_reason,
    l.published_at,
    l.expires_at,
    l.archived_at,
    l.created_at,
    l.updated_at,
    (
      select m.object_key
      from public.listing_media m
      where m.listing_id = l.id
        and m.kind = 'photo'
        and m.status = 'ready'
        and m.deleted_at is null
      order by m.sort_order, m.created_at
      limit 1
    ) as cover_object_key,
    (
      select count(*)
      from public.listing_media m
      where m.listing_id = l.id
        and m.kind = 'photo'
        and m.status = 'ready'
        and m.deleted_at is null
    ) as photo_count,
    (
      select count(*)
      from public.listing_media m
      where m.listing_id = l.id
        and m.kind = 'video'
        and m.status = 'ready'
        and m.deleted_at is null
    ) as video_count
  from public.listings l
  where l.owner_id = (select auth.uid())
    and l.deleted_at is null
  order by l.updated_at desc, l.id desc;
$$;

revoke all on function public.get_own_listings() from public, anon;
grant execute on function public.get_own_listings() to authenticated;

commit;
