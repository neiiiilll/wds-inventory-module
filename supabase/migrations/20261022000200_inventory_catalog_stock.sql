-- Inventory catalog, locations, assets, balances, and stock ledger.

create table if not exists public.inv_suppliers (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  supplier_code text not null,
  name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inv_suppliers_pkey primary key (id),
  constraint inv_suppliers_tenant_id_id_key unique (tenant_id, id),
  constraint inv_suppliers_tenant_code_key unique (tenant_id, supplier_code),
  constraint inv_suppliers_tenant_fk foreign key (tenant_id) references public.tenants (id)
);

create table if not exists public.inv_categories (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inv_categories_pkey primary key (id),
  constraint inv_categories_tenant_id_id_key unique (tenant_id, id),
  constraint inv_categories_tenant_code_key unique (tenant_id, code),
  constraint inv_categories_tenant_fk foreign key (tenant_id) references public.tenants (id)
);

create table if not exists public.inv_units (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  code text not null,
  name text not null,
  symbol text,
  quantity_precision smallint not null default 0 check (quantity_precision between 0 and 6),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inv_units_pkey primary key (id),
  constraint inv_units_tenant_id_id_key unique (tenant_id, id),
  constraint inv_units_tenant_code_key unique (tenant_id, code),
  constraint inv_units_tenant_fk foreign key (tenant_id) references public.tenants (id)
);

create table if not exists public.inv_warehouses (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inv_warehouses_pkey primary key (id),
  constraint inv_warehouses_tenant_id_id_key unique (tenant_id, id),
  constraint inv_warehouses_tenant_code_key unique (tenant_id, code),
  constraint inv_warehouses_tenant_fk foreign key (tenant_id) references public.tenants (id)
);

create table if not exists public.inv_storage_locations (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  warehouse_id uuid not null,
  location_code text not null,
  bin text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inv_storage_locations_pkey primary key (id),
  constraint inv_storage_locations_tenant_id_id_key unique (tenant_id, id),
  constraint inv_storage_locations_tenant_code_key unique (tenant_id, warehouse_id, location_code),
  constraint inv_storage_locations_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_storage_locations_warehouse_fk foreign key (tenant_id, warehouse_id)
    references public.inv_warehouses (tenant_id, id)
);

create table if not exists public.inv_inventory_items (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  item_code text not null,
  name text not null,
  description text,
  category_id uuid not null,
  unit_id uuid not null,
  supplier_id uuid,
  cost_method text not null default 'average' check (cost_method in ('average', 'fifo', 'standard')),
  minimum_quantity numeric not null default 0 check (minimum_quantity >= 0),
  active boolean not null default true,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inv_inventory_items_pkey primary key (id),
  constraint inv_inventory_items_tenant_id_id_key unique (tenant_id, id),
  constraint inv_inventory_items_tenant_item_code_key unique (tenant_id, item_code),
  constraint inv_inventory_items_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_inventory_items_category_fk foreign key (tenant_id, category_id)
    references public.inv_categories (tenant_id, id),
  constraint inv_inventory_items_unit_fk foreign key (tenant_id, unit_id)
    references public.inv_units (tenant_id, id),
  constraint inv_inventory_items_supplier_fk foreign key (tenant_id, supplier_id)
    references public.inv_suppliers (tenant_id, id)
);

create table if not exists public.inv_inventory_assets (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  item_id uuid not null,
  asset_tag text not null,
  serial_number text,
  acquisition_cost numeric not null default 0 check (acquisition_cost >= 0),
  acquired_at date,
  location_id uuid,
  status text not null default 'in_stock'
    check (status in ('in_stock', 'assigned', 'maintenance', 'retired', 'lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inv_inventory_assets_pkey primary key (id),
  constraint inv_inventory_assets_tenant_id_id_key unique (tenant_id, id),
  constraint inv_inventory_assets_tenant_asset_tag_key unique (tenant_id, asset_tag),
  constraint inv_inventory_assets_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_inventory_assets_item_fk foreign key (tenant_id, item_id)
    references public.inv_inventory_items (tenant_id, id),
  constraint inv_inventory_assets_location_fk foreign key (tenant_id, location_id)
    references public.inv_storage_locations (tenant_id, id)
);

create table if not exists public.inv_inventory_balances (
  tenant_id uuid not null,
  item_id uuid not null,
  location_id uuid not null,
  quantity numeric not null default 0,
  inventory_value numeric not null default 0,
  average_cost numeric not null default 0,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  constraint inv_inventory_balances_pkey primary key (tenant_id, item_id, location_id),
  constraint inv_inventory_balances_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_inventory_balances_item_fk foreign key (tenant_id, item_id)
    references public.inv_inventory_items (tenant_id, id),
  constraint inv_inventory_balances_location_fk foreign key (tenant_id, location_id)
    references public.inv_storage_locations (tenant_id, id)
);

create table if not exists public.inv_stock_movements (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  movement_type text not null
    check (movement_type in ('receipt', 'issue', 'transfer', 'adjustment', 'return', 'writeoff')),
  source_type text,
  source_reference text,
  occurred_at timestamptz not null default now(),
  idempotency_key text not null,
  actor_user_id uuid,
  posted_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inv_stock_movements_pkey primary key (id),
  constraint inv_stock_movements_tenant_id_id_key unique (tenant_id, id),
  constraint inv_stock_movements_tenant_idempotency_key unique (tenant_id, idempotency_key),
  constraint inv_stock_movements_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_stock_movements_actor_fk foreign key (actor_user_id) references public.app_users (id)
);

create table if not exists public.inv_stock_movement_lines (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  movement_id uuid not null,
  line_no integer not null check (line_no > 0),
  item_id uuid not null,
  location_id uuid not null,
  signed_quantity numeric not null check (signed_quantity <> 0),
  unit_cost numeric not null default 0 check (unit_cost >= 0),
  value_delta numeric not null default 0,
  balance_after numeric,
  asset_id uuid,
  created_at timestamptz not null default now(),
  constraint inv_stock_movement_lines_pkey primary key (id),
  constraint inv_stock_movement_lines_tenant_id_id_key unique (tenant_id, id),
  constraint inv_stock_movement_lines_movement_line_key unique (tenant_id, movement_id, line_no),
  constraint inv_stock_movement_lines_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_stock_movement_lines_movement_fk foreign key (tenant_id, movement_id)
    references public.inv_stock_movements (tenant_id, id),
  constraint inv_stock_movement_lines_item_fk foreign key (tenant_id, item_id)
    references public.inv_inventory_items (tenant_id, id),
  constraint inv_stock_movement_lines_location_fk foreign key (tenant_id, location_id)
    references public.inv_storage_locations (tenant_id, id),
  constraint inv_stock_movement_lines_asset_fk foreign key (tenant_id, asset_id)
    references public.inv_inventory_assets (tenant_id, id)
);
