begin;

alter table public.listings
  add column if not exists duplicate_fingerprint text;

create or replace function public.normalize_listing_duplicate_value(
  p_value text
)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select regexp_replace(
    lower(trim(coalesce(p_value, ''))),
    '[[:space:]]+',
    ' ',
    'g'
  );
$$;

create or replace function public.build_listing_duplicate_fingerprint(
  p_listing public.listings
)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select md5(concat_ws(
    chr(31),
    public.normalize_listing_duplicate_value(p_listing.brand_name),
    public.normalize_listing_duplicate_value(p_listing.model_name),
    p_listing.year::text,
    p_listing.condition::text,
    p_listing.mileage_km::text,
    public.normalize_listing_duplicate_value(p_listing.body_type),
    public.normalize_listing_duplicate_value(p_listing.engine_type),
    coalesce(p_listing.engine_volume::text, ''),
    public.normalize_listing_duplicate_value(p_listing.gearbox),
    public.normalize_listing_duplicate_value(p_listing.drivetrain),
    public.normalize_listing_duplicate_value(p_listing.steering),
    public.normalize_listing_duplicate_value(p_listing.color_name)
  ));
$$;

create or replace function public.set_listing_duplicate_fingerprint()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'active' and new.deleted_at is null then
    new.duplicate_fingerprint :=
      public.build_listing_duplicate_fingerprint(new);
  else
    new.duplicate_fingerprint := null;
  end if;

  return new;
end;
$$;

drop trigger if exists listings_set_duplicate_fingerprint
  on public.listings;

create trigger listings_set_duplicate_fingerprint
before insert or update on public.listings
for each row execute function public.set_listing_duplicate_fingerprint();

update public.listings
set duplicate_fingerprint = case
  when status = 'active' and deleted_at is null
    then public.build_listing_duplicate_fingerprint(listings)
  else null
end;

create unique index if not exists listings_owner_active_duplicate_idx
  on public.listings (owner_id, duplicate_fingerprint)
  where status = 'active'
    and deleted_at is null
    and duplicate_fingerprint is not null;

revoke all on function public.normalize_listing_duplicate_value(text)
  from public, anon, authenticated;
revoke all on function public.build_listing_duplicate_fingerprint(public.listings)
  from public, anon, authenticated;
revoke all on function public.set_listing_duplicate_fingerprint()
  from public, anon, authenticated;

grant execute on function public.normalize_listing_duplicate_value(text)
  to service_role;
grant execute on function public.build_listing_duplicate_fingerprint(public.listings)
  to service_role;
grant execute on function public.set_listing_duplicate_fingerprint()
  to service_role;

commit;
