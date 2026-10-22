-- Inventory-required shared multitenant foundation.
-- Coordinate these shared additions with the service desk team before production.
-- Existing shared data is preserved; this migration never references svc_* objects.

create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid not null default gen_random_uuid(),
  firebase_uid text not null,
  email text,
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_inventory_pkey primary key (id),
  constraint app_users_inventory_firebase_uid_key unique (firebase_uid)
);

-- Upgrade the earlier prototype app_users table without replacing its data or PK.
alter table public.app_users add column if not exists id uuid default gen_random_uuid();
alter table public.app_users add column if not exists active boolean default true;
alter table public.app_users add column if not exists updated_at timestamptz default now();
update public.app_users set id = gen_random_uuid() where id is null;
update public.app_users set active = true where active is null;
alter table public.app_users alter column id set default gen_random_uuid();
alter table public.app_users alter column id set not null;
alter table public.app_users alter column active set default true;
alter table public.app_users alter column active set not null;
create unique index if not exists app_users_id_uidx on public.app_users (id);
create unique index if not exists app_users_firebase_uid_uidx on public.app_users (firebase_uid);

create table if not exists public.tenants (
  id uuid not null default gen_random_uuid(),
  tenant_key text not null unique
    check (tenant_key = lower(tenant_key) and tenant_key ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_pkey primary key (id)
);

insert into public.tenants (tenant_key, name, active)
values ('inventory-test', 'Inventory Test Tenant', true)
on conflict (tenant_key) do update
set name = excluded.name,
    active = excluded.active,
    updated_at = now();

create table if not exists public.applications (
  app_key text not null check (app_key ~ '^[a-z][a-z0-9_]*$'),
  display_name text not null,
  active boolean not null default true,
  constraint applications_pkey primary key (app_key)
);

create table if not exists public.app_roles (
  app_key text not null,
  role_key text not null check (role_key ~ '^[a-z][a-z0-9_]*$'),
  display_name text not null,
  constraint app_roles_pkey primary key (app_key, role_key),
  constraint app_roles_app_key_fkey foreign key (app_key) references public.applications (app_key)
);

create unique index if not exists app_roles_app_key_role_key_uidx
  on public.app_roles (app_key, role_key);

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

create table if not exists public.tenant_memberships (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  status text not null default 'active'
    check (status in ('invited', 'active', 'suspended', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_memberships_pkey primary key (id),
  constraint tenant_memberships_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint tenant_memberships_user_fk foreign key (user_id) references public.app_users (id)
);

create unique index if not exists tenant_memberships_tenant_id_id_uidx
  on public.tenant_memberships (tenant_id, id);
create unique index if not exists tenant_memberships_user_id_uidx
  on public.tenant_memberships (user_id);

create table if not exists public.membership_roles (
  membership_id uuid not null,
  app_key text not null,
  role_key text not null,
  created_at timestamptz not null default now(),
  constraint membership_roles_pkey primary key (membership_id, app_key, role_key),
  constraint membership_roles_membership_fk foreign key (membership_id)
    references public.tenant_memberships (id),
  constraint membership_roles_app_role_fk foreign key (app_key, role_key)
    references public.app_roles (app_key, role_key)
);

create table if not exists public.departments (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint departments_inventory_pkey primary key (id),
  constraint departments_inventory_tenant_fk foreign key (tenant_id) references public.tenants (id)
);

alter table public.departments add column if not exists tenant_id uuid;
alter table public.departments add column if not exists updated_at timestamptz default now();
update public.departments
set tenant_id = (select id from public.tenants where tenant_key = 'inventory-test')
where tenant_id is null;
alter table public.departments alter column tenant_id set not null;
create unique index if not exists departments_tenant_id_id_uidx
  on public.departments (tenant_id, id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.departments'::regclass
      and conname = 'departments_inventory_tenant_fk'
  ) then
    alter table public.departments
      add constraint departments_inventory_tenant_fk
      foreign key (tenant_id) references public.tenants (id);
  end if;
end
$$;

create table if not exists public.personnel (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  employee_code text not null,
  full_name text not null,
  department_id uuid,
  user_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personnel_inventory_pkey primary key (id),
  constraint personnel_inventory_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint personnel_inventory_user_fk foreign key (user_id) references public.app_users (id),
  constraint personnel_inventory_department_fk foreign key (tenant_id, department_id)
    references public.departments (tenant_id, id)
);

alter table public.personnel add column if not exists tenant_id uuid;
alter table public.personnel add column if not exists employee_code text;
alter table public.personnel add column if not exists user_id uuid;
update public.personnel
set tenant_id = (select id from public.tenants where tenant_key = 'inventory-test')
where tenant_id is null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'personnel' and column_name = 'employee_no'
  ) then
    execute $sql$
      update public.personnel
      set employee_code = coalesce(employee_code, employee_no, 'LEGACY-' || id::text)
      where employee_code is null
    $sql$;
  else
    update public.personnel
    set employee_code = 'LEGACY-' || id::text
    where employee_code is null;
  end if;
end
$$;

alter table public.personnel alter column tenant_id set not null;
alter table public.personnel alter column employee_code set not null;
create unique index if not exists personnel_tenant_id_id_uidx
  on public.personnel (tenant_id, id);
create unique index if not exists personnel_tenant_employee_code_uidx
  on public.personnel (tenant_id, employee_code);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.personnel'::regclass
      and conname = 'personnel_inventory_tenant_fk'
  ) then
    alter table public.personnel
      add constraint personnel_inventory_tenant_fk
      foreign key (tenant_id) references public.tenants (id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.personnel'::regclass
      and conname = 'personnel_inventory_user_fk'
  ) then
    alter table public.personnel
      add constraint personnel_inventory_user_fk
      foreign key (user_id) references public.app_users (id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.personnel'::regclass
      and conname = 'personnel_inventory_department_fk'
  ) then
    alter table public.personnel
      add constraint personnel_inventory_department_fk
      foreign key (tenant_id, department_id) references public.departments (tenant_id, id);
  end if;
end
$$;

create table if not exists public.attachments (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  checksum text,
  uploaded_by_user_id uuid,
  uploaded_at timestamptz not null default now(),
  constraint attachments_pkey primary key (id),
  constraint attachments_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint attachments_uploader_fk foreign key (uploaded_by_user_id) references public.app_users (id)
);

create table if not exists public.audit_events (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  actor_user_id uuid,
  occurred_at timestamptz not null default now(),
  request_id uuid,
  constraint audit_events_pkey primary key (id),
  constraint audit_events_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint audit_events_actor_fk foreign key (actor_user_id) references public.app_users (id)
);

create table if not exists public.user_role_history (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  membership_id uuid not null,
  app_key text not null,
  old_role_key text,
  new_role_key text,
  reason text not null,
  actor_user_id uuid,
  occurred_at timestamptz not null default now(),
  constraint user_role_history_pkey primary key (id),
  constraint user_role_history_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint user_role_history_actor_fk foreign key (actor_user_id) references public.app_users (id),
  constraint user_role_history_membership_fk foreign key (tenant_id, membership_id)
    references public.tenant_memberships (tenant_id, id)
);

-- An existing user_role_history may be owned by the earlier prototype. Inventory
-- preserves it instead of rewriting old audit rows; new inventory auditing uses
-- public.audit_events.

do $$
declare
  required_table text;
  required_column record;
begin
  foreach required_table in array array[
    'app_users', 'tenants', 'applications', 'app_roles',
    'tenant_memberships', 'membership_roles', 'departments', 'personnel',
    'attachments', 'audit_events', 'user_role_history'
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
      ('attachments', 'tenant_id'), ('audit_events', 'tenant_id')
    ) as expected(table_name, column_name)
  loop
    if not exists (
      select 1 from information_schema.columns c
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
