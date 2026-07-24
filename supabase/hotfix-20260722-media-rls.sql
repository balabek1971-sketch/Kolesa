-- Apply after schema-v2.sql. This keeps protected listing columns private while
-- allowing listing_media and listing_stats policies to verify listing state.

create or replace function public.is_listing_public(p_listing_id uuid)
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

create or replace function public.owns_listing(p_listing_id uuid)
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
      and owner_id = (select auth.uid())
      and deleted_at is null
  );
$$;

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
      and owner_id <> (select auth.uid())
  );
$$;

drop policy if exists "active_media_public_read" on public.listing_media;
create policy "active_media_public_read"
on public.listing_media for select
to anon, authenticated
using (
  status = 'ready'
  and deleted_at is null
  and public.is_listing_public(listing_id)
);

drop policy if exists "owners_read_own_media" on public.listing_media;
create policy "owners_read_own_media"
on public.listing_media for select
to authenticated
using (public.owns_listing(listing_id));

drop policy if exists "active_listing_stats_public_read" on public.listing_stats;
create policy "active_listing_stats_public_read"
on public.listing_stats for select
to anon, authenticated
using (public.is_listing_public(listing_id));

drop policy if exists "owners_read_own_listing_stats" on public.listing_stats;
create policy "owners_read_own_listing_stats"
on public.listing_stats for select
to authenticated
using (public.owns_listing(listing_id));

drop policy if exists "favorites_manage_own" on public.favorites;
create policy "favorites_manage_own"
on public.favorites for all
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and public.can_favorite_listing(listing_id)
);

revoke all on function public.is_listing_public(uuid) from public, anon, authenticated;
revoke all on function public.owns_listing(uuid) from public, anon, authenticated;
revoke all on function public.can_favorite_listing(uuid) from public, anon, authenticated;

grant execute on function public.is_listing_public(uuid) to anon, authenticated, service_role;
grant execute on function public.owns_listing(uuid) to authenticated, service_role;
grant execute on function public.can_favorite_listing(uuid) to authenticated, service_role;

