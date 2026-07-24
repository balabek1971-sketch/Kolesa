begin;

create or replace function public.save_listing_draft(
  p_listing_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_listing_id uuid;
  v_contact_phone text;
  v_condition public.listing_condition;
begin
  if v_owner_id is null then
    raise exception 'Authentication is required';
  end if;

  select phone_e164
  into v_contact_phone
  from public.profiles
  where id = v_owner_id
    and status = 'active'
    and phone_verified_at is not null
    and deleted_at is null;

  if v_contact_phone is null then
    raise exception 'A verified phone number is required';
  end if;

  if coalesce(p_payload ->> 'condition', 'used') = 'new' then
    v_condition := 'new';
  else
    v_condition := 'used';
  end if;

  if p_listing_id is null then
    insert into public.listings (
      owner_id,
      title,
      brand_name,
      model_name,
      city_name,
      category,
      price_kzt,
      year,
      mileage_km,
      condition,
      body_type,
      gearbox,
      origin_country,
      engine_type,
      steering,
      drivetrain,
      engine_volume,
      color_name,
      metallic,
      cleared,
      damaged,
      has_vehicle_history,
      description,
      contact_phone_e164,
      status
    ) values (
      v_owner_id,
      trim(p_payload ->> 'title'),
      trim(p_payload ->> 'brand_name'),
      trim(p_payload ->> 'model_name'),
      trim(p_payload ->> 'city_name'),
      'cars',
      (p_payload ->> 'price_kzt')::bigint,
      (p_payload ->> 'year')::integer,
      coalesce((p_payload ->> 'mileage_km')::integer, 0),
      v_condition,
      nullif(trim(p_payload ->> 'body_type'), ''),
      nullif(trim(p_payload ->> 'gearbox'), ''),
      nullif(trim(p_payload ->> 'origin_country'), ''),
      nullif(trim(p_payload ->> 'engine_type'), ''),
      nullif(trim(p_payload ->> 'steering'), ''),
      nullif(trim(p_payload ->> 'drivetrain'), ''),
      nullif(p_payload ->> 'engine_volume', '')::numeric,
      nullif(trim(p_payload ->> 'color_name'), ''),
      coalesce((p_payload ->> 'metallic')::boolean, false),
      coalesce((p_payload ->> 'cleared')::boolean, true),
      coalesce((p_payload ->> 'damaged')::boolean, false),
      coalesce((p_payload ->> 'has_vehicle_history')::boolean, false),
      nullif(trim(p_payload ->> 'description'), ''),
      v_contact_phone,
      'draft'
    )
    returning id into v_listing_id;
  else
    update public.listings
    set title = trim(p_payload ->> 'title'),
        brand_name = trim(p_payload ->> 'brand_name'),
        model_name = trim(p_payload ->> 'model_name'),
        city_name = trim(p_payload ->> 'city_name'),
        price_kzt = (p_payload ->> 'price_kzt')::bigint,
        year = (p_payload ->> 'year')::integer,
        mileage_km = coalesce((p_payload ->> 'mileage_km')::integer, 0),
        condition = v_condition,
        body_type = nullif(trim(p_payload ->> 'body_type'), ''),
        gearbox = nullif(trim(p_payload ->> 'gearbox'), ''),
        origin_country = nullif(trim(p_payload ->> 'origin_country'), ''),
        engine_type = nullif(trim(p_payload ->> 'engine_type'), ''),
        steering = nullif(trim(p_payload ->> 'steering'), ''),
        drivetrain = nullif(trim(p_payload ->> 'drivetrain'), ''),
        engine_volume = nullif(p_payload ->> 'engine_volume', '')::numeric,
        color_name = nullif(trim(p_payload ->> 'color_name'), ''),
        metallic = coalesce((p_payload ->> 'metallic')::boolean, false),
        cleared = coalesce((p_payload ->> 'cleared')::boolean, true),
        damaged = coalesce((p_payload ->> 'damaged')::boolean, false),
        has_vehicle_history = coalesce((p_payload ->> 'has_vehicle_history')::boolean, false),
        description = nullif(trim(p_payload ->> 'description'), ''),
        contact_phone_e164 = v_contact_phone,
        rejection_reason = null,
        status = 'draft',
        version = version + 1,
        updated_at = now()
    where id = p_listing_id
      and owner_id = v_owner_id
      and status in ('draft', 'rejected')
      and deleted_at is null
    returning id into v_listing_id;

    if v_listing_id is null then
      raise exception 'Listing draft cannot be updated';
    end if;
  end if;

  return v_listing_id;
end;
$$;

revoke all on function public.save_listing_draft(uuid, jsonb) from public, anon;
grant execute on function public.save_listing_draft(uuid, jsonb) to authenticated, service_role;

create or replace function public.submit_own_listing_for_moderation(
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

  perform public.submit_listing_for_moderation(p_listing_id, v_owner_id);
end;
$$;

revoke all on function public.submit_own_listing_for_moderation(uuid) from public, anon;
grant execute on function public.submit_own_listing_for_moderation(uuid) to authenticated, service_role;

commit;
