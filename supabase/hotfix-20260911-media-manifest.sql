begin;

alter table public.listings
  add column if not exists expected_photo_count smallint not null default 0
    check (expected_photo_count between 0 and 20),
  add column if not exists expects_video boolean not null default false;

update public.listings listing
set expected_photo_count = media.photo_count,
    expects_video = media.video_count > 0
from (
  select
    listing_id,
    count(*) filter (where kind = 'photo')::smallint as photo_count,
    count(*) filter (where kind = 'video')::smallint as video_count
  from public.listing_media
  where deleted_at is null
  group by listing_id
) media
where listing.id = media.listing_id
  and listing.expected_photo_count = 0;

create or replace function public.set_own_listing_media_manifest(
  p_listing_id uuid,
  p_expected_photo_count smallint,
  p_expects_video boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if p_expected_photo_count < 0 or p_expected_photo_count > 20 then
    raise exception 'Invalid photo count';
  end if;

  update public.listings
  set expected_photo_count = p_expected_photo_count,
      expects_video = coalesce(p_expects_video, false),
      updated_at = now()
  where id = p_listing_id
    and owner_id = auth.uid()
    and status in ('draft', 'rejected')
    and deleted_at is null;

  if not found then
    raise exception 'Listing draft cannot be updated';
  end if;
end;
$$;

revoke all on function public.set_own_listing_media_manifest(uuid, smallint, boolean) from public, anon;
grant execute on function public.set_own_listing_media_manifest(uuid, smallint, boolean) to authenticated, service_role;

drop function if exists public.get_own_listings();
create function public.get_own_listings()
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
  video_count bigint,
  expected_photo_count smallint,
  expects_video boolean
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
    ),
    (
      select count(*)
      from public.listing_media m
      where m.listing_id = l.id
        and m.kind = 'photo'
        and m.status = 'ready'
        and m.deleted_at is null
    ),
    (
      select count(*)
      from public.listing_media m
      where m.listing_id = l.id
        and m.kind = 'video'
        and m.status = 'ready'
        and m.deleted_at is null
    ),
    l.expected_photo_count,
    l.expects_video
  from public.listings l
  where l.owner_id = (select auth.uid())
    and l.deleted_at is null
  order by l.updated_at desc, l.id desc;
$$;

revoke all on function public.get_own_listings() from public, anon;
grant execute on function public.get_own_listings() to authenticated;

commit;
