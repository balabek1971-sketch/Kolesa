begin;

create table if not exists public.listing_automated_moderation (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  revision integer not null default 1 check (revision > 0),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'approved', 'changes_requested', 'failed')),
  model_name text not null default '@cf/facebook/detr-resnet-50',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  photo_passed boolean,
  video_passed boolean,
  result jsonb not null default '{}'::jsonb,
  error_code text,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists listing_automated_moderation_status_idx
  on public.listing_automated_moderation (status, requested_at);

alter table public.listing_automated_moderation enable row level security;

create or replace function public.queue_listing_for_automated_moderation(
  p_listing_id uuid,
  p_owner_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision integer;
begin
  if p_owner_id is null or not exists (
    select 1
    from public.profiles profile
    where profile.id = p_owner_id
      and profile.status = 'active'
      and profile.phone_verified_at is not null
      and profile.deleted_at is null
  ) then
    raise exception 'verified_phone_required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.listings listing
    where listing.id = p_listing_id
      and listing.owner_id = p_owner_id
      and listing.status in ('draft', 'rejected', 'pending_moderation')
      and listing.deleted_at is null
      and length(trim(listing.title)) between 4 and 120
      and length(trim(listing.brand_name)) > 0
      and length(trim(listing.model_name)) > 0
      and length(trim(listing.city_name)) > 0
      and listing.price_kzt > 0
  ) then
    raise exception 'listing_incomplete_or_not_editable' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.listing_media media
    where media.listing_id = p_listing_id
      and media.kind = 'photo'
      and media.status = 'ready'
      and media.deleted_at is null
  ) then
    raise exception 'ready_photo_required' using errcode = '22023';
  end if;

  update public.listings
  set status = 'media_processing',
      rejection_reason = null,
      version = version + 1,
      updated_at = now()
  where id = p_listing_id
    and owner_id = p_owner_id;

  insert into public.listing_automated_moderation as job (
    listing_id,
    revision,
    status,
    attempt_count,
    photo_passed,
    video_passed,
    result,
    error_code,
    requested_at,
    started_at,
    completed_at,
    updated_at
  ) values (
    p_listing_id,
    1,
    'queued',
    0,
    null,
    null,
    '{}'::jsonb,
    null,
    now(),
    null,
    null,
    now()
  )
  on conflict (listing_id) do update
  set revision = job.revision + 1,
      status = 'queued',
      attempt_count = 0,
      photo_passed = null,
      video_passed = null,
      result = '{}'::jsonb,
      error_code = null,
      requested_at = now(),
      started_at = null,
      completed_at = null,
      updated_at = now()
  returning revision into v_revision;

  return v_revision;
end;
$$;

create or replace function public.claim_listing_automated_moderation(
  p_listing_id uuid,
  p_revision integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.listing_automated_moderation
  set status = 'processing',
      attempt_count = attempt_count + 1,
      started_at = coalesce(started_at, now()),
      error_code = null,
      updated_at = now()
  where listing_id = p_listing_id
    and revision = p_revision
    and status in ('queued', 'processing');

  return found;
end;
$$;

create or replace function public.retry_listing_automated_moderation(
  p_listing_id uuid,
  p_revision integer,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.listing_automated_moderation
  set status = 'queued',
      error_code = left(nullif(trim(p_error_code), ''), 200),
      updated_at = now()
  where listing_id = p_listing_id
    and revision = p_revision
    and status = 'processing';
end;
$$;

create or replace function public.fail_listing_moderation_dispatch(
  p_listing_id uuid,
  p_revision integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.listing_automated_moderation
  set status = 'failed',
      error_code = 'dispatch_failed',
      completed_at = now(),
      updated_at = now()
  where listing_id = p_listing_id
    and revision = p_revision
    and status = 'queued';

  if found then
    update public.listings
    set status = 'draft',
        rejection_reason = null,
        version = version + 1,
        updated_at = now()
    where id = p_listing_id
      and status = 'media_processing';
  end if;
end;
$$;

create or replace function public.complete_listing_automated_moderation(
  p_listing_id uuid,
  p_revision integer,
  p_approved boolean,
  p_photo_passed boolean,
  p_video_passed boolean,
  p_reason text,
  p_result jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings%rowtype;
  v_approved boolean := coalesce(p_approved, false);
  v_reason text := left(nullif(trim(p_reason), ''), 1000);
  v_fingerprint text;
  v_job_status text;
begin
  select job.status into v_job_status
  from public.listing_automated_moderation job
  where job.listing_id = p_listing_id
    and job.revision = p_revision;

  if v_job_status in ('approved', 'changes_requested') then
    return;
  end if;

  if v_job_status is distinct from 'processing' then
    raise exception 'stale_or_unclaimed_moderation_job' using errcode = '22023';
  end if;

  select listing.* into v_listing
  from public.listings listing
  where listing.id = p_listing_id
    and listing.status = 'media_processing'
    and listing.deleted_at is null
  for update;

  if not found then
    raise exception 'listing_not_waiting_for_moderation' using errcode = '22023';
  end if;

  v_approved := v_approved
    and coalesce(p_photo_passed, false)
    and coalesce(p_video_passed, true);

  if v_approved then
    v_fingerprint := public.build_listing_duplicate_fingerprint(v_listing);
    if exists (
      select 1
      from public.listings duplicate
      where duplicate.owner_id = v_listing.owner_id
        and duplicate.id <> v_listing.id
        and duplicate.status = 'active'
        and duplicate.deleted_at is null
        and duplicate.duplicate_fingerprint = v_fingerprint
    ) then
      v_approved := false;
      v_reason := 'Этот автомобиль уже опубликован в вашем аккаунте.';
    end if;
  end if;

  if v_approved then
    update public.listings
    set status = 'active',
        rejection_reason = null,
        published_at = now(),
        expires_at = now() + interval '30 days',
        archived_at = null,
        version = version + 1,
        updated_at = now()
    where id = p_listing_id;
  else
    update public.listings
    set status = 'rejected',
        rejection_reason = coalesce(v_reason, 'Добавьте хотя бы одну чёткую фотографию автомобиля.'),
        version = version + 1,
        updated_at = now()
    where id = p_listing_id;
  end if;

  update public.listing_automated_moderation
  set status = case when v_approved then 'approved' else 'changes_requested' end,
      photo_passed = p_photo_passed,
      video_passed = p_video_passed,
      result = coalesce(p_result, '{}'::jsonb),
      error_code = null,
      completed_at = now(),
      updated_at = now()
  where listing_id = p_listing_id
    and revision = p_revision;
end;
$$;

create or replace function public.fail_listing_automated_moderation(
  p_listing_id uuid,
  p_revision integer,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.listing_automated_moderation
  set status = 'failed',
      error_code = left(coalesce(nullif(trim(p_error_code), ''), 'moderation_failed'), 200),
      completed_at = now(),
      updated_at = now()
  where listing_id = p_listing_id
    and revision = p_revision
    and status in ('queued', 'processing');

  if found then
    update public.listings
    set status = 'rejected',
        rejection_reason = 'Автоматическая проверка временно не завершилась. Попробуйте опубликовать ещё раз.',
        version = version + 1,
        updated_at = now()
    where id = p_listing_id
      and status = 'media_processing';
  end if;
end;
$$;

revoke all on table public.listing_automated_moderation from public, anon, authenticated;
grant all on table public.listing_automated_moderation to service_role;

revoke all on function public.queue_listing_for_automated_moderation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_listing_automated_moderation(uuid, integer) from public, anon, authenticated;
revoke all on function public.retry_listing_automated_moderation(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.fail_listing_moderation_dispatch(uuid, integer) from public, anon, authenticated;
revoke all on function public.complete_listing_automated_moderation(uuid, integer, boolean, boolean, boolean, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_listing_automated_moderation(uuid, integer, text) from public, anon, authenticated;

grant execute on function public.queue_listing_for_automated_moderation(uuid, uuid) to service_role;
grant execute on function public.claim_listing_automated_moderation(uuid, integer) to service_role;
grant execute on function public.retry_listing_automated_moderation(uuid, integer, text) to service_role;
grant execute on function public.fail_listing_moderation_dispatch(uuid, integer) to service_role;
grant execute on function public.complete_listing_automated_moderation(uuid, integer, boolean, boolean, boolean, text, jsonb) to service_role;
grant execute on function public.fail_listing_automated_moderation(uuid, integer, text) to service_role;

revoke execute on function public.publish_own_listing(uuid) from authenticated;

commit;
