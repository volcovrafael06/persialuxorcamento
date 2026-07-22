-- Security and data-integrity baseline for the authenticated single-company app.
-- Before enabling this migration in production, create the first Supabase Auth
-- user and promote its profile to role = 'admin', active = true after the
-- migration is applied.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  role text not null default 'user',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('admin', 'user'))
);

alter table public.profiles enable row level security;

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

insert into public.profiles (id, name, role, active)
select
  users.id,
  coalesce(users.raw_user_meta_data ->> 'name', split_part(users.email, '@', 1)),
  'user',
  false
from auth.users as users
on conflict (id) do nothing;

-- Safe first-run bootstrap: create exactly one Auth user before applying this
-- migration. That sole account becomes the initial active administrator.
do $$
begin
  if (select count(*) from auth.users) = 1
     and not exists (
       select 1 from public.profiles where role = 'admin' and active = true
     ) then
    update public.profiles
    set role = 'admin', active = true, updated_at = now()
    where id = (select id from auth.users order by created_at limit 1);
  end if;
end;
$$;

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and active = true
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and active = true
      and role = 'admin'
  );
$$;

revoke execute on function private.is_active_user() from public, anon;
revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_active_user() to authenticated, service_role;
grant execute on function private.is_admin() to authenticated, service_role;

-- Consolidate the seller model used by both visits and budgets.
alter table public.visits add column if not exists vendedor_id uuid;

do $$
begin
  if to_regclass('public.sellers') is not null then
    insert into public.vendedores (id, nome, email, ativo, created_at)
    select id, name, email, true, created_at
    from public.sellers
    on conflict (id) do nothing;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'visits'
        and column_name = 'seller_id'
    ) then
      update public.visits
      set vendedor_id = seller_id
      where vendedor_id is null and seller_id is not null;
    end if;
  end if;
end;
$$;

alter table public.visits drop constraint if exists visits_seller_id_fkey;
alter table public.visits drop constraint if exists visits_vendedor_id_fkey;
alter table public.visits
  add constraint visits_vendedor_id_fkey
  foreign key (vendedor_id) references public.vendedores(id) on delete set null;
alter table public.visits drop column if exists seller_id;
drop table if exists public.sellers;

-- Canonical status values.
update public.orcamentos
set status = case lower(coalesce(status, ''))
  when 'pending' then 'pendente'
  when '' then 'pendente'
  else lower(status)
end;

alter table public.orcamentos alter column status set default 'pendente';
alter table public.orcamentos alter column status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orcamentos_status_check'
      and conrelid = 'public.orcamentos'::regclass
  ) then
    alter table public.orcamentos
      add constraint orcamentos_status_check
      check (status in ('pendente', 'finalizado', 'cancelado'));
  end if;
end;
$$;

update public.visits
set status = case lower(coalesce(status, ''))
  when 'pending' then 'agendada'
  when 'confirmed' then 'confirmada'
  when 'cancelled' then 'cancelada'
  when '' then 'agendada'
  else lower(status)
end;

alter table public.visits alter column status set default 'agendada';
alter table public.visits alter column status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'visits_status_check'
      and conrelid = 'public.visits'::regclass
  ) then
    alter table public.visits
      add constraint visits_status_check
      check (status in ('agendada', 'confirmada', 'cancelada'));
  end if;
end;
$$;

-- Generate budget numbers transactionally in Postgres.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rail_pricing_rail_type_key'
      and conrelid = 'public.rail_pricing'::regclass
  ) then
    alter table public.rail_pricing
      add constraint rail_pricing_rail_type_key unique (rail_type);
  end if;
end;
$$;

create sequence if not exists public.orcamentos_numero_seq
  as integer
  start with 985
  increment by 1
  minvalue 1;

select setval(
  'public.orcamentos_numero_seq',
  greatest(coalesce((select max(numero_orcamento) from public.orcamentos), 984), 984),
  true
);

alter sequence public.orcamentos_numero_seq owned by public.orcamentos.numero_orcamento;
alter table public.orcamentos
  alter column numero_orcamento set default nextval('public.orcamentos_numero_seq');
alter table public.orcamentos alter column numero_orcamento set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orcamentos_numero_orcamento_key'
      and conrelid = 'public.orcamentos'::regclass
  ) then
    alter table public.orcamentos
      add constraint orcamentos_numero_orcamento_key unique (numero_orcamento);
  end if;
end;
$$;

-- Foreign-key indexes used by joins, deletes and RLS checks.
create index if not exists orcamentos_cliente_id_idx on public.orcamentos (cliente_id);
create index if not exists orcamentos_vendedor_id_idx on public.orcamentos (vendedor_id);
create index if not exists visits_vendedor_id_idx on public.visits (vendedor_id);

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Remove all legacy permissive policies from application tables.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'accessories', 'acessorios', 'clientes', 'configuracoes', 'orcamentos',
        'produtos', 'rail_pricing', 'vendedores', 'visits', 'profiles'
      ])
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end;
$$;

revoke all on table
  public.accessories,
  public.acessorios,
  public.clientes,
  public.configuracoes,
  public.orcamentos,
  public.produtos,
  public.rail_pricing,
  public.vendedores,
  public.visits,
  public.profiles
from anon, authenticated;

grant select, insert, update, delete on table
  public.accessories,
  public.acessorios,
  public.clientes,
  public.orcamentos,
  public.produtos,
  public.rail_pricing,
  public.vendedores,
  public.visits
to authenticated;

grant select on table public.configuracoes to authenticated;
grant insert, update, delete on table public.configuracoes to authenticated;
grant select on table public.profiles to authenticated;
grant update (name) on table public.profiles to authenticated;
grant usage, select on sequence public.orcamentos_numero_seq to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'accessories', 'acessorios', 'clientes', 'orcamentos', 'produtos',
    'rail_pricing', 'vendedores', 'visits'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated '
      'using ((select private.is_active_user())) '
      'with check ((select private.is_active_user()))',
      table_name || '_active_users',
      table_name
    );
  end loop;
end;
$$;

create policy profiles_read
on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));

create policy profiles_update_own_name
on public.profiles for update to authenticated
using (id = (select auth.uid()) and active = true)
with check (id = (select auth.uid()) and active = true);

create policy configuracoes_read
on public.configuracoes for select to authenticated
using ((select private.is_active_user()));

create policy configuracoes_insert_admin
on public.configuracoes for insert to authenticated
with check ((select private.is_admin()));

create policy configuracoes_update_admin
on public.configuracoes for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy configuracoes_delete_admin
on public.configuracoes for delete to authenticated
using ((select private.is_admin()));

-- Keep company assets private; authenticated users can read and admins can write.
update storage.buckets set public = false where id = 'images';

drop policy if exists "Allow public uploads to Images" on storage.objects;
drop policy if exists "Public Access to Images" on storage.objects;

create policy images_read_authenticated
on storage.objects for select to authenticated
using (bucket_id = 'images' and (select private.is_active_user()));

create policy images_insert_admin
on storage.objects for insert to authenticated
with check (
  bucket_id = 'images'
  and (select private.is_admin())
  and lower(storage.extension(name)) = any (array['png', 'jpg', 'jpeg', 'webp'])
);

create policy images_update_admin
on storage.objects for update to authenticated
using (bucket_id = 'images' and (select private.is_admin()))
with check (
  bucket_id = 'images'
  and (select private.is_admin())
  and lower(storage.extension(name)) = any (array['png', 'jpg', 'jpeg', 'webp'])
);

create policy images_delete_admin
on storage.objects for delete to authenticated
using (bucket_id = 'images' and (select private.is_admin()));
