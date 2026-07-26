begin;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'listing_media'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%cloudflare_stream%'
      and pg_get_constraintdef(con.oid) like '%kind%'
  loop
    execute format(
      'alter table public.listing_media drop constraint %I',
      constraint_name
    );
  end loop;
end $$;

alter table public.listing_media
  add constraint listing_media_kind_provider_check
  check (
    (kind = 'photo' and provider = 'cloudflare_r2' and sort_order between 0 and 19)
    or
    (kind = 'video' and provider in ('cloudflare_r2', 'cloudflare_stream') and sort_order = 0)
  );

commit;
