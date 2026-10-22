-- Inventory-owned prerequisites for the shared multitenant database.
-- Coordinate the shared unique indexes with the service desk team before production.

create extension if not exists pgcrypto;

do $$
declare
  required_table text;
  required_column record;
begin
  foreach required_table in array array[
    'app_users',
    'tenants',
    'applications',
    'app_roles',
    'tenant_memberships',
    'membership_roles',
    'departments',
    'personnel',
    'attachments',
    'audit_events',
    'user_role_history'
  ] loop
    if to_regclass('public.' || required_table) is null then
      raise exception 'Inventory prerequisite is missing shared table public.%', required_table;
    end if;
  end loop;

  for required_column in
    select * from (values
      ('app_users', 'id'), ('app_users', 'firebase_uid'), ('app_users', 'active'),
      ('tenants', 'id'), ('tenants', 'tenant_key'), ('tenants', 'active'),
      ('applications', 'app_key'), ('applications', 'active'),
      ('app_roles', 'app_key'), ('app_roles', 'role_key'),
      ('tenant_memberships', 'id'), ('tenant_memberships', 'tenant_id'),
      ('tenant_memberships', 'user_id'), ('tenant_memberships', 'status'),
      ('membership_roles', 'membership_id'), ('membership_roles', 'app_key'),
      ('membership_roles', 'role_key'), ('departments', 'id'),
      ('departments', 'tenant_id'), ('personnel', 'id'), ('personnel', 'tenant_id'),
      ('attachments', 'tenant_id'), ('audit_events', 'tenant_id'),
      ('user_role_history', 'tenant_id')
    ) as expected(table_name, column_name)
  loop
    if not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = required_column.table_name
        and c.column_name = required_column.column_name
    ) then
      raise exception 'Inventory prerequisite is missing shared column public.%.%',
        required_column.table_name, required_column.column_name;
    end if;
  end loop;

end
$$;

create unique index if not exists app_roles_app_key_role_key_uidx
  on public.app_roles (app_key, role_key);
create unique index if not exists tenant_memberships_tenant_id_id_uidx
  on public.tenant_memberships (tenant_id, id);
create unique index if not exists departments_tenant_id_id_uidx
  on public.departments (tenant_id, id);
create unique index if not exists personnel_tenant_id_id_uidx
  on public.personnel (tenant_id, id);
create unique index if not exists tenant_memberships_user_id_uidx
  on public.tenant_memberships (user_id);

insert into public.applications (app_key, display_name, active)
values ('inventory', 'Inventory', true)
on conflict (app_key) do update
set display_name = excluded.display_name,
    active = excluded.active;

insert into public.app_roles (app_key, role_key, display_name)
values
  ('inventory', 'administrator', 'Administrator'),
  ('inventory', 'inventory_staff', 'Inventory Staff'),
  ('inventory', 'viewer', 'Viewer')
on conflict (app_key, role_key) do update
set display_name = excluded.display_name;

insert into public.tenants (tenant_key, name, active)
values ('inventory-test', 'Inventory Test Tenant', true)
on conflict (tenant_key) do update
set name = excluded.name,
    active = excluded.active,
    updated_at = now();
