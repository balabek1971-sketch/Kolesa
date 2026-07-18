create type listing_condition as enum ('new', 'used');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  city text,
  is_dealer boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null,
  brand text not null,
  model text not null,
  category text not null default 'cars',
  city text not null,
  price_kzt integer not null check (price_kzt > 0),
  year integer not null check (year between 1990 and 2027),
  mileage_km integer not null default 0 check (mileage_km >= 0),
  condition listing_condition not null default 'used',
  body_type text,
  gearbox text,
  engine text,
  color text,
  has_photo boolean not null default false,
  can_finance boolean not null default false,
  cleared boolean not null default true,
  damaged boolean not null default false,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;
alter table public.favorites enable row level security;

create policy "profiles visible to everyone" on public.profiles for select using (true);
create policy "users update own profile" on public.profiles for update using (auth.uid() = id);
create policy "active listings visible to everyone" on public.listings for select using (status = 'active');
create policy "authenticated users create listings" on public.listings for insert with check (auth.uid() = owner_id);
create policy "owners update own listings" on public.listings for update using (auth.uid() = owner_id);
create policy "listing photos visible to everyone" on public.listing_photos for select using (true);
create policy "users manage own favorites" on public.favorites for all using (auth.uid() = user_id);

create index listings_filters_idx on public.listings
  (category, city, brand, condition, year, price_kzt, can_finance, cleared, damaged);

create index listings_search_idx on public.listings using gin (
  to_tsvector('simple', coalesce(brand, '') || ' ' || coalesce(model, '') || ' ' || coalesce(city, ''))
);
