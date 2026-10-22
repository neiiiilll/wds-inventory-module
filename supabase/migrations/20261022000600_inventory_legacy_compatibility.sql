-- Forward-only compatibility for the approved legacy shared app_users table.
--
-- The pre-existing service desk schema requires app_users.role on insert. The
-- inventory provisioning callable does not own that legacy authorization field,
-- so keep its accepted Viewer value as the database default. Fresh canonical
-- installations do not have this column and therefore skip this block.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_users'
      and column_name = 'role'
  ) then
    alter table public.app_users alter column role set default 'Viewer';
  end if;
end
$$;
