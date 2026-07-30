-- ==========================================
-- RLS hardening: ensure authenticated users can self-bootstrap
-- their profile row and that every active user can read/write
-- the application tables.
--
-- This migration is idempotent and safe to re-apply.
-- ==========================================

-- 1. Recreate the on_auth_user_created trigger so any auth.users
--    row that slipped past the original trigger gets a profile.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    'user',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- 2. Backfill profiles for any pre-existing auth.users without one.
insert into public.profiles (id, name, role, active)
select
  users.id,
  coalesce(users.raw_user_meta_data ->> 'name', split_part(users.email, '@', 1)),
  'user',
  false
from auth.users as users
left join public.profiles p on p.id = users.id
where p.id is null
on conflict (id) do nothing;

-- 3. Make sure every application table has RLS enabled and the
--    permissive active-user policy applied. The legacy file
--    supabase/fix_policies.sql referenced "public products" and
--    could have stripped these policies; reapply defensively.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'produtos', 'accessories', 'acessorios', 'clientes',
    'orcamentos', 'rail_pricing', 'vendedores', 'visits'
  ]
  loop
    execute format('alter table public.%I enable row level security', tbl);

    execute format(
      'drop policy if exists %I on public.%I',
      tbl || '_active_users',
      tbl
    );

    execute format(
      'create policy %I on public.%I for all to authenticated '
      'using ((select private.is_active_user())) '
      'with check ((select private.is_active_user()))',
      tbl || '_active_users',
      tbl
    );
  end loop;
end;
$$;

-- 4. Refresh grants to align with the policy baseline.
grant select, insert, update, delete on table
  public.accessories, public.acessorios, public.clientes,
  public.orcamentos, public.produtos, public.rail_pricing,
  public.vendedores, public.visits
to authenticated;

-- 5. Profiles: keep the read/update rules, but also allow admins to
--    flip active=true so a freshly seeded admin row is usable.
drop policy if exists profiles_admin_activate on public.profiles;
create policy profiles_admin_activate
on public.profiles for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

-- 6. Ensure configuracoes still has admin-gated write and
--    active-user read (idempotent).
drop policy if exists configuracoes_read on public.configuracoes;
create policy configuracoes_read
on public.configuracoes for select to authenticated
using ((select private.is_active_user()));

drop policy if exists configuracoes_insert_admin on public.configuracoes;
create policy configuracoes_insert_admin
on public.configuracoes for insert to authenticated
with check ((select private.is_admin()));

drop policy if exists configuracoes_update_admin on public.configuracoes;
create policy configuracoes_update_admin
on public.configuracoes for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists configuracoes_delete_admin on public.configuracoes;
create policy configuracoes_delete_admin
on public.configuracoes for delete to authenticated
using ((select private.is_admin()));

alter table public.configuracoes enable row level security;
