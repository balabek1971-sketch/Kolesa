create extension if not exists pgcrypto;

do $$
begin
  create type public.listing_condition as enum ('new', 'used');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  city text,
  is_dealer boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  brand text not null,
  model text not null,
  category text not null default 'cars',
  city text not null,
  price_kzt bigint not null check (price_kzt > 0),
  year integer not null check (year between 1900 and 2100),
  mileage_km integer not null default 0 check (mileage_km >= 0),
  condition public.listing_condition not null default 'used',
  body_type text,
  gearbox text,
  origin_country text,
  engine_type text,
  steering text,
  drivetrain text,
  availability text not null default 'in_stock',
  engine_volume numeric(3, 1),
  color_name text,
  metallic boolean not null default false,
  seller_name text not null default 'Частный продавец',
  card_color text not null default '#243b55',
  has_photo boolean not null default false,
  can_finance boolean not null default false,
  cleared boolean not null default true,
  damaged boolean not null default false,
  description text,
  score integer not null default 0,
  status text not null default 'active' check (status in ('draft', 'active', 'sold', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.listings add column if not exists origin_country text;
alter table public.listings add column if not exists engine_type text;
alter table public.listings add column if not exists steering text;
alter table public.listings add column if not exists drivetrain text;
alter table public.listings add column if not exists availability text not null default 'in_stock';
alter table public.listings add column if not exists engine_volume numeric(3, 1);
alter table public.listings add column if not exists color_name text;
alter table public.listings add column if not exists metallic boolean not null default false;
alter table public.listings add column if not exists seller_name text not null default 'Частный продавец';
alter table public.listings add column if not exists card_color text not null default '#243b55';
alter table public.listings add column if not exists score integer not null default 0;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists listings_set_updated_at on public.listings;
create trigger listings_set_updated_at
before update on public.listings
for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, full_name)
select id, nullif(raw_user_meta_data ->> 'full_name', '')
from auth.users
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;
alter table public.favorites enable row level security;

drop policy if exists "profiles visible to everyone" on public.profiles;
drop policy if exists "users view own profile" on public.profiles;
create policy "users view own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "active listings visible to everyone" on public.listings;
create policy "active listings visible to everyone"
on public.listings for select
to anon, authenticated
using (status = 'active');

drop policy if exists "owners view own listings" on public.listings;
create policy "owners view own listings"
on public.listings for select
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "authenticated users create listings" on public.listings;
create policy "authenticated users create listings"
on public.listings for insert
to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "owners update own listings" on public.listings;
create policy "owners update own listings"
on public.listings for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "owners delete own listings" on public.listings;
create policy "owners delete own listings"
on public.listings for delete
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "listing photos visible to everyone" on public.listing_photos;
create policy "listing photos visible to everyone"
on public.listing_photos for select
to anon, authenticated
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_photos.listing_id
      and listings.status = 'active'
  )
);

drop policy if exists "owners manage listing photos" on public.listing_photos;
create policy "owners manage listing photos"
on public.listing_photos for all
to authenticated
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_photos.listing_id
      and listings.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.listings
    where listings.id = listing_photos.listing_id
      and listings.owner_id = auth.uid()
  )
);

drop policy if exists "users manage own favorites" on public.favorites;
create policy "users manage own favorites"
on public.favorites for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant usage on schema public to anon, authenticated;
grant select on public.listings, public.listing_photos to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant insert, update, delete on public.listings, public.listing_photos to authenticated;
grant select, insert, delete on public.favorites to authenticated;

create index if not exists listings_filters_idx on public.listings
  (category, city, brand, condition, year, price_kzt, status);

create index if not exists listings_owner_idx on public.listings (owner_id, created_at desc);
create index if not exists listing_photos_order_idx on public.listing_photos (listing_id, sort_order);

create index if not exists listings_search_idx on public.listings using gin (
  to_tsvector('simple', coalesce(brand, '') || ' ' || coalesce(model, '') || ' ' || coalesce(city, ''))
);
