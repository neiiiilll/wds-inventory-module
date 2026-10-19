-- WDS Inventory role-based access for Firebase-authenticated Google users.
-- Apply after 20261014000000_inventory_schema.sql and before deploying the RBAC UI.

create table if not exists public.app_users (
  firebase_uid text primary key,
  email text not null,
  display_name text not null,
  role text not null check (role in ('Administrator', 'Inventory Staff', 'Viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

create unique index if not exists app_users_email_lower_idx
  on public.app_users (lower(email));

create table if not exists public.user_role_history (
  id uuid primary key default gen_random_uuid(),
  target_uid text not null references public.app_users(firebase_uid),
  target_email text not null,
  previous_role text check (previous_role is null or previous_role in ('Administrator', 'Inventory Staff', 'Viewer')),
  new_role text not null check (new_role in ('Administrator', 'Inventory Staff', 'Viewer')),
  previous_active boolean,
  new_active boolean not null,
  reason text not null check (length(btrim(reason)) > 0),
  actor_uid text not null,
  actor_email text not null,
  occurred_at timestamptz not null default now()
);

create index if not exists user_role_history_target_idx
  on public.user_role_history(target_uid, occurred_at desc);

alter table public.app_users enable row level security;
alter table public.user_role_history enable row level security;

create or replace function public.current_firebase_uid()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select nullif(auth.jwt() ->> 'sub', '');
$$;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.role
  from public.app_users u
  where u.firebase_uid = public.current_firebase_uid()
    and u.active = true;
$$;

create or replace function public.current_app_user_active()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.app_users u
    where u.firebase_uid = public.current_firebase_uid()
      and u.active = true
  );
$$;

create or replace function public.current_app_display_name()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.display_name
  from public.app_users u
  where u.firebase_uid = public.current_firebase_uid()
    and u.active = true;
$$;

create or replace function public.register_current_app_user()
returns public.app_users
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claims jsonb := auth.jwt();
  caller_uid text := nullif(claims ->> 'sub', '');
  caller_email text := lower(btrim(coalesce(claims ->> 'email', '')));
  caller_name text := btrim(coalesce(claims ->> 'name', claims ->> 'email', ''));
  assigned_role text;
  result public.app_users;
begin
  if caller_uid is null or caller_email = '' then
    raise exception 'A verified Firebase UID and email are required.';
  end if;

  assigned_role := case
    when caller_email in ('neilchristiand17@gmail.com', 'ojt@likhainternet.com')
      then 'Administrator'
    else 'Viewer'
  end;

  insert into public.app_users (
    firebase_uid, email, display_name, role, active, last_login_at
  ) values (
    caller_uid, caller_email, coalesce(nullif(caller_name, ''), caller_email), assigned_role, true, now()
  )
  on conflict (firebase_uid) do nothing
  returning * into result;

  if found then
    if assigned_role = 'Administrator' then
      insert into public.user_role_history (
        target_uid, target_email, previous_role, new_role,
        previous_active, new_active, reason, actor_uid, actor_email
      ) values (
        result.firebase_uid, result.email, null, result.role,
        null, result.active, 'Bootstrap administrator registration', caller_uid, caller_email
      );
    end if;
    return result;
  end if;

  update public.app_users set
    email = caller_email,
    display_name = coalesce(nullif(caller_name, ''), caller_email),
    updated_at = now(),
    last_login_at = now()
  where firebase_uid = caller_uid
  returning * into result;

  return result;
end;
$$;

create or replace function public.set_app_user_access(
  target_uid text,
  next_role text,
  next_active boolean,
  change_reason text
)
returns public.app_users
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_uid text := public.current_firebase_uid();
  caller_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  previous public.app_users;
  result public.app_users;
begin
  if public.current_app_role() is distinct from 'Administrator' then
    raise exception 'Administrator access is required.';
  end if;
  if next_role not in ('Administrator', 'Inventory Staff', 'Viewer') then
    raise exception 'Invalid application role.';
  end if;
  if nullif(btrim(change_reason), '') is null then
    raise exception 'Change reason is required.';
  end if;
  if target_uid = caller_uid and (next_role <> 'Administrator' or next_active is not true) then
    raise exception 'You cannot change your own Administrator access.';
  end if;

  select * into previous
  from public.app_users
  where firebase_uid = target_uid
  for update;
  if not found then
    raise exception 'User account was not found.';
  end if;

  update public.app_users set
    role = next_role,
    active = next_active,
    updated_at = now()
  where firebase_uid = target_uid
  returning * into result;

  insert into public.user_role_history (
    target_uid, target_email, previous_role, new_role,
    previous_active, new_active, reason, actor_uid, actor_email
  ) values (
    result.firebase_uid, result.email, previous.role, result.role,
    previous.active, result.active, btrim(change_reason), caller_uid, caller_email
  );

  return result;
end;
$$;

revoke all on function public.current_firebase_uid() from public;
revoke all on function public.current_app_role() from public;
revoke all on function public.current_app_user_active() from public;
revoke all on function public.current_app_display_name() from public;
revoke all on function public.register_current_app_user() from public;
revoke all on function public.set_app_user_access(text, text, boolean, text) from public;
grant execute on function public.current_firebase_uid() to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_app_user_active() to authenticated;
grant execute on function public.current_app_display_name() to authenticated;
grant execute on function public.register_current_app_user() to authenticated;
grant execute on function public.set_app_user_access(text, text, boolean, text) to authenticated;

drop policy if exists "app users self or admin read" on public.app_users;
create policy "app users self or admin read"
  on public.app_users for select to authenticated
  using (
    firebase_uid = public.current_firebase_uid()
    or public.current_app_role() = 'Administrator'
  );

drop policy if exists "administrators read role history" on public.user_role_history;
create policy "administrators read role history"
  on public.user_role_history for select to authenticated
  using (public.current_app_role() = 'Administrator');

grant select on public.app_users to authenticated;
grant select on public.user_role_history to authenticated;

drop policy if exists "demo snapshot read" on public.workflow_snapshots;
drop policy if exists "demo snapshot write" on public.workflow_snapshots;
drop policy if exists "assigned users read workflow snapshot" on public.workflow_snapshots;
drop policy if exists "operational users insert workflow snapshot" on public.workflow_snapshots;
drop policy if exists "operational users update workflow snapshot" on public.workflow_snapshots;

create policy "assigned users read workflow snapshot"
  on public.workflow_snapshots for select to authenticated
  using (public.current_app_user_active());
create policy "operational users insert workflow snapshot"
  on public.workflow_snapshots for insert to authenticated
  with check (public.current_app_role() in ('Administrator', 'Inventory Staff'));
create policy "operational users update workflow snapshot"
  on public.workflow_snapshots for update to authenticated
  using (public.current_app_role() in ('Administrator', 'Inventory Staff'))
  with check (public.current_app_role() in ('Administrator', 'Inventory Staff'));

revoke all on public.workflow_snapshots from anon;
revoke insert, update, delete on public.workflow_snapshots from authenticated;
grant select, insert, update on public.workflow_snapshots to authenticated;

do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'departments','personnel','suppliers','inventory_items','inventory_movements',
    'material_requests','material_request_lines','material_request_history',
    'purchase_requests','purchase_request_lines','purchase_request_approval_steps',
    'purchase_orders','purchase_order_lines','inspection_acceptance_reports',
    'inspection_acceptance_lines','requisition_issue_slips','ris_lines','ris_releases',
    'document_form_fields','document_counters'
  ] loop
    for policy_name in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.current_app_user_active())',
      'assigned users read ' || table_name, table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.current_app_role() in (''Administrator'', ''Inventory Staff''))',
      'operational users insert ' || table_name, table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.current_app_role() in (''Administrator'', ''Inventory Staff'')) with check (public.current_app_role() in (''Administrator'', ''Inventory Staff''))',
      'operational users update ' || table_name, table_name
    );

    execute format('revoke all on public.%I from anon', table_name);
    execute format('revoke insert, update, delete on public.%I from authenticated', table_name);
    execute format('grant select, insert, update on public.%I to authenticated', table_name);
  end loop;
end $$;

create or replace function public.protect_material_request_requester()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.current_app_role() = 'Inventory Staff' then
    if tg_op = 'INSERT' and btrim(new.requester_name) is distinct from btrim(public.current_app_display_name()) then
      raise exception 'Inventory Staff can create requests only for their own assigned name.';
    end if;
    if tg_op = 'UPDATE' and new.requester_name is distinct from old.requester_name then
      raise exception 'Only an Administrator can change requesting personnel.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_material_request_requester on public.material_requests;
create trigger protect_material_request_requester
  before insert or update on public.material_requests
  for each row execute function public.protect_material_request_requester();

create or replace function public.protect_snapshot_requesters()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_request jsonb;
  new_request jsonb;
  old_requests jsonb := '[]'::jsonb;
  request_count integer;
  distinct_request_count integer;
begin
  if public.current_app_role() <> 'Inventory Staff' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select coalesce(state -> 'requests', '[]'::jsonb)
    into old_requests
    from public.workflow_snapshots
    where id = new.id;
    old_requests := coalesce(old_requests, '[]'::jsonb);
  else
    old_requests := coalesce(old.state -> 'requests', '[]'::jsonb);
  end if;

  select count(*), count(distinct value ->> 'id')
  into request_count, distinct_request_count
  from jsonb_array_elements(coalesce(new.state -> 'requests', '[]'::jsonb));
  if request_count <> distinct_request_count
    or exists (
      select 1 from jsonb_array_elements(coalesce(new.state -> 'requests', '[]'::jsonb))
      where nullif(btrim(value ->> 'id'), '') is null
    ) then
    raise exception 'Material Request IDs must be present and unique.';
  end if;

  for old_request in
    select value from jsonb_array_elements(old_requests)
  loop
    select value into new_request
    from jsonb_array_elements(coalesce(new.state -> 'requests', '[]'::jsonb))
    where value ->> 'id' = old_request ->> 'id'
    limit 1;

    if new_request is null then
      raise exception 'Only an Administrator can remove a Material Request.';
    end if;
    if new_request ->> 'person' is distinct from old_request ->> 'person' then
      raise exception 'Only an Administrator can change requesting personnel.';
    end if;
  end loop;

  for new_request in
    select new_value.value
    from jsonb_array_elements(coalesce(new.state -> 'requests', '[]'::jsonb)) new_value
    where not exists (
      select 1
      from jsonb_array_elements(old_requests) old_value
      where old_value.value ->> 'id' = new_value.value ->> 'id'
    )
  loop
    if btrim(coalesce(new_request ->> 'person', '')) is distinct from btrim(public.current_app_display_name()) then
      raise exception 'Inventory Staff can create requests only for their own assigned name.';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists protect_snapshot_requesters on public.workflow_snapshots;
create trigger protect_snapshot_requesters
  before insert or update on public.workflow_snapshots
  for each row execute function public.protect_snapshot_requesters();

comment on table public.app_users is 'Firebase Google users and their WDS Inventory application role.';
comment on table public.user_role_history is 'Append-only audit history for Administrator access changes.';
