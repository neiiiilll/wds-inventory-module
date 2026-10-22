-- Inventory indexes, timestamp maintenance, and browser-access lockdown.

create index if not exists inv_storage_locations_tenant_warehouse_idx
  on public.inv_storage_locations (tenant_id, warehouse_id, active);
create index if not exists inv_inventory_items_tenant_active_name_idx
  on public.inv_inventory_items (tenant_id, active, name, id);
create index if not exists inv_inventory_assets_tenant_item_idx
  on public.inv_inventory_assets (tenant_id, item_id, status);
create index if not exists inv_inventory_balances_tenant_location_idx
  on public.inv_inventory_balances (tenant_id, location_id, item_id);
create index if not exists inv_stock_movements_tenant_occurred_idx
  on public.inv_stock_movements (tenant_id, occurred_at desc, id);
create index if not exists inv_stock_movement_lines_tenant_item_idx
  on public.inv_stock_movement_lines (tenant_id, item_id, location_id, created_at desc);
create index if not exists inv_material_requests_tenant_status_idx
  on public.inv_material_requests (tenant_id, status, requested_on desc);
create index if not exists inv_material_request_lines_tenant_item_idx
  on public.inv_material_request_lines (tenant_id, item_id);
create index if not exists inv_supplier_quotations_tenant_request_idx
  on public.inv_supplier_quotations (tenant_id, material_request_id, status);
create index if not exists inv_purchase_requests_tenant_status_idx
  on public.inv_purchase_requests (tenant_id, status, requested_on desc);
create index if not exists inv_purchase_orders_tenant_status_idx
  on public.inv_purchase_orders (tenant_id, status, expected_on);
create index if not exists inv_inspection_reports_tenant_order_idx
  on public.inv_inspection_reports (tenant_id, purchase_order_id, status);
create index if not exists inv_requisition_issue_slips_tenant_status_idx
  on public.inv_requisition_issue_slips (tenant_id, status, requested_on desc);
create index if not exists inv_stock_counts_tenant_status_idx
  on public.inv_stock_counts (tenant_id, status, count_date desc);

create or replace function public.inv_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

do $$
declare
  inventory_table text;
begin
  for inventory_table in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name like 'inv\_%' escape '\'
      and c.column_name = 'updated_at'
    order by c.table_name
  loop
    execute format('drop trigger if exists inv_set_updated_at on public.%I', inventory_table);
    execute format(
      'create trigger inv_set_updated_at before update on public.%I for each row execute function public.inv_set_updated_at()',
      inventory_table
    );
  end loop;
end
$$;

do $$
declare
  inventory_table text;
  inventory_policy text;
begin
  for inventory_table in
    select t.tablename
    from pg_tables t
    where t.schemaname = 'public'
      and t.tablename like 'inv\_%' escape '\'
    order by t.tablename
  loop
    execute format('alter table public.%I enable row level security', inventory_table);

    for inventory_policy in
      select p.policyname
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = inventory_table
    loop
      execute format('drop policy if exists %I on public.%I', inventory_policy, inventory_table);
    end loop;

    execute format('revoke all on table public.%I from anon, authenticated', inventory_table);
    execute format('grant all on table public.%I to service_role', inventory_table);
  end loop;
end
$$;
