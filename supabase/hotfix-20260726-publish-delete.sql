begin;

create or replace function public.publish_own_listing(
  p_listing_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
begin
  if v_owner_id is null then
    raise exception 'Authentication is required';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_owner_id
      and status = 'active'
      and phone_verified_at is not null
      and deleted_at is null
  ) then
    raise exception 'A verified phone number is required';
  end if;

  if not exists (
    select 1
    from public.listings
    where id = p_listing_id
      and owner_id = v_owner_id
      and status in ('draft', 'rejected', 'pending_moderation')
      and deleted_at is null
      and length(trim(title)) between 3 and 120
      and length(trim(brand_name)) > 0
      and length(trim(model_name)) > 0
      and length(trim(city_name)) > 0
      and price_kzt > 0
  ) then
    raise exception 'Listing is incomplete or cannot be published';
  end if;

  if not exists (
    select 1
    from public.listing_media
    where listing_id = p_listing_id
      and kind = 'photo'
      and status = 'ready'
      and deleted_at is null
  ) then
    raise exception 'At least one ready photo is required';
  end if;

  update public.listings
  set status = 'active',
      rejection_reason = null,
      moderation_reason = null,
      published_at = now(),
      expires_at = now() + interval '30 days',
      archived_at = null,
      version = version + 1,
      updated_at = now()
  where id = p_listing_id
    and owner_id = v_owner_id;
end;
$$;

create or replace function public.delete_own_listing(
  p_listing_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
begin
  if v_owner_id is null then
    raise exception 'Authentication is required';
  end if;

  update public.listings
  set status = 'deleted',
      deleted_at = now(),
      archived_at = coalesce(archived_at, now()),
      version = version + 1,
      updated_at = now()
  where id = p_listing_id
    and owner_id = v_owner_id
    and deleted_at is null;

  if not found then
    raise exception 'Listing was not found';
  end if;
end;
$$;

revoke all on function public.publish_own_listing(uuid) from public, anon;
revoke all on function public.delete_own_listing(uuid) from public, anon;
grant execute on function public.publish_own_listing(uuid) to authenticated, service_role;
grant execute on function public.delete_own_listing(uuid) to authenticated, service_role;

update public.listings l
set status = 'active',
    rejection_reason = null,
    published_at = coalesce(l.published_at, now()),
    expires_at = now() + interval '30 days',
    archived_at = null,
    version = version + 1,
    updated_at = now()
where l.status = 'pending_moderation'
  and l.deleted_at is null
  and exists (
    select 1
    from public.listing_media m
    where m.listing_id = l.id
      and m.kind = 'photo'
      and m.status = 'ready'
      and m.deleted_at is null
  );

commit;
