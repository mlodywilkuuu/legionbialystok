-- Uruchom TEN plik dopiero po utworzeniu użytkownika w Supabase Authentication.
-- E-mail administratora:
-- mpiotrowski@legionbialystok.pl
-- Hasła nie zapisujemy w repozytorium ani SQL.

insert into public.admin_profiles(user_id,email,permissions,is_full_admin,updated_at)
select
  id,
  email,
  array[
    'articles','stories','team1','team2','academy','people','gallery',
    'table','seasons','matches','documents','contact'
  ]::text[],
  true,
  now()
from auth.users
where lower(email) = lower('mpiotrowski@legionbialystok.pl')
on conflict (user_id)
do update set
  email = excluded.email,
  permissions = excluded.permissions,
  is_full_admin = true,
  updated_at = now();
