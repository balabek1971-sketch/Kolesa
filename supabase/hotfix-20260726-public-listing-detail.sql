begin;

create or replace function public.get_public_listing_detail(
  p_listing_id uuid
)
returns table (
  id uuid,
  title text,
  brand_name text,
  model_name text,
  city_name text,
  category text,
  price_kzt bigint,
  year integer,
  mileage_km integer,
  condition public.listing_condition,
  body_type text,
  gearbox text,
  origin_country text,
  engine_type text,
  steering text,
  drivetrain text,
  engine_volume numeric,
  color_name text,
  metallic boolean,
  cleared boolean,
  damaged boolean,
  has_vehicle_history boolean,
  description text,
  contact_phone_e164 text,
  seller_name text,
  published_at timestamptz,
  media jsonb
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
    l.category,
    l.price_kzt,
    l.year,
    l.mileage_km,
    l.condition,
    l.body_type,
    l.gearbox,
    l.origin_country,
    l.engine_type,
    l.steering,
    l.drivetrain,
    l.engine_volume,
    l.color_name,
    l.metallic,
    l.cleared,
    l.damaged,
    l.has_vehicle_history,
    l.description,
    l.contact_phone_e164,
    coalesce(nullif(trim(p.display_name), ''), 'Частный продавец'),
    l.published_at,
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
          'sort_order', m.sort_order,
          'mime_type', m.mime_type,
          'width', m.width,
          'height', m.height,
          'duration_seconds', m.duration_seconds
        )
        order by
          case when m.kind = 'photo' then 0 else 1 end,
          m.sort_order,
          m.created_at
      )
      from public.listing_media m
      where m.listing_id = l.id
        and m.status = 'ready'
        and m.deleted_at is null
    ), '[]'::jsonb)
  from public.listings l
  left join public.profiles p on p.id = l.owner_id
  where l.id = p_listing_id
    and l.status = 'active'
    and l.deleted_at is null;
$$;

revoke all on function public.get_public_listing_detail(uuid)
  from public;
grant execute on function public.get_public_listing_detail(uuid)
  to anon, authenticated, service_role;

commit;
