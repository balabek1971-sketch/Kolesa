begin;

create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_phone text;
begin
  normalized_phone := nullif(
    regexp_replace(coalesce(new.phone, ''), '[^0-9]', '', 'g'),
    ''
  );

  if normalized_phone is not null then
    normalized_phone := '+' || normalized_phone;
  end if;

  insert into public.profiles (
    id,
    display_name,
    phone_e164,
    phone_verified_at
  )
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    normalized_phone,
    new.phone_confirmed_at
  )
  on conflict (id) do update
  set phone_e164 = excluded.phone_e164,
      phone_verified_at = excluded.phone_verified_at,
      updated_at = now();

  insert into public.account_roles (user_id, role)
  values (new.id, 'user')
  on conflict do nothing;

  return new;
end;
$$;

update public.profiles as profile
set phone_e164 = case
      when nullif(
        regexp_replace(coalesce(auth_user.phone, ''), '[^0-9]', '', 'g'),
        ''
      ) is null then null
      else '+' || regexp_replace(auth_user.phone, '[^0-9]', '', 'g')
    end,
    phone_verified_at = auth_user.phone_confirmed_at,
    updated_at = now()
from auth.users as auth_user
where profile.id = auth_user.id;

commit;
