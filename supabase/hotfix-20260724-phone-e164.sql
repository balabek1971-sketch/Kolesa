begin;

alter table public.profiles
  drop constraint if exists profiles_phone_e164_check;

alter table public.profiles
  add constraint profiles_phone_e164_check
  check (phone_e164 is null or phone_e164 ~ '^[+][1-9][0-9]{7,14}$');

alter table public.listings
  drop constraint if exists listings_contact_phone_e164_check;

alter table public.listings
  add constraint listings_contact_phone_e164_check
  check (
    contact_phone_e164 is null
    or contact_phone_e164 ~ '^[+][1-9][0-9]{7,14}$'
  );

commit;
