-- Inventory procurement, inspection, issuance, return, and count workflows.

create table if not exists public.inv_material_requests (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  request_no text not null,
  requester_personnel_id uuid,
  job text,
  requested_on date not null default current_date,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'partially_ordered', 'ordered', 'closed', 'cancelled')),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inv_material_requests_pkey primary key (id),
  constraint inv_material_requests_tenant_id_id_key unique (tenant_id, id),
  constraint inv_material_requests_tenant_request_no_key unique (tenant_id, request_no),
  constraint inv_material_requests_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_material_requests_requester_fk foreign key (tenant_id, requester_personnel_id)
    references public.personnel (tenant_id, id)
);

create table if not exists public.inv_material_request_lines (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  material_request_id uuid not null,
  line_no integer not null check (line_no > 0),
  item_id uuid,
  quantity numeric not null check (quantity > 0),
  specification text,
  created_at timestamptz not null default now(),
  constraint inv_material_request_lines_pkey primary key (id),
  constraint inv_material_request_lines_tenant_id_id_key unique (tenant_id, id),
  constraint inv_material_request_lines_parent_line_key unique (tenant_id, material_request_id, line_no),
  constraint inv_material_request_lines_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_material_request_lines_request_fk foreign key (tenant_id, material_request_id)
    references public.inv_material_requests (tenant_id, id),
  constraint inv_material_request_lines_item_fk foreign key (tenant_id, item_id)
    references public.inv_inventory_items (tenant_id, id)
);

create table if not exists public.inv_supplier_quotations (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  quotation_no text not null,
  material_request_id uuid not null,
  supplier_id uuid not null,
  valid_until date,
  terms text,
  status text not null default 'draft',
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inv_supplier_quotations_pkey primary key (id),
  constraint inv_supplier_quotations_tenant_id_id_key unique (tenant_id, id),
  constraint inv_supplier_quotations_tenant_quotation_no_key unique (tenant_id, quotation_no),
  constraint inv_supplier_quotations_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_supplier_quotations_request_fk foreign key (tenant_id, material_request_id)
    references public.inv_material_requests (tenant_id, id),
  constraint inv_supplier_quotations_supplier_fk foreign key (tenant_id, supplier_id)
    references public.inv_suppliers (tenant_id, id)
);

create table if not exists public.inv_supplier_quotation_lines (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  quotation_id uuid not null,
  line_no integer not null check (line_no > 0),
  item_id uuid,
  quantity numeric not null check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0),
  created_at timestamptz not null default now(),
  constraint inv_supplier_quotation_lines_pkey primary key (id),
  constraint inv_supplier_quotation_lines_tenant_id_id_key unique (tenant_id, id),
  constraint inv_supplier_quotation_lines_parent_line_key unique (tenant_id, quotation_id, line_no),
  constraint inv_supplier_quotation_lines_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_supplier_quotation_lines_quotation_fk foreign key (tenant_id, quotation_id)
    references public.inv_supplier_quotations (tenant_id, id),
  constraint inv_supplier_quotation_lines_item_fk foreign key (tenant_id, item_id)
    references public.inv_inventory_items (tenant_id, id)
);

create table if not exists public.inv_purchase_requests (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  request_no text not null,
  material_request_id uuid,
  quotation_id uuid,
  status text not null default 'draft',
  revision integer not null default 1 check (revision > 0),
  requested_on date not null default current_date,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inv_purchase_requests_pkey primary key (id),
  constraint inv_purchase_requests_tenant_id_id_key unique (tenant_id, id),
  constraint inv_purchase_requests_tenant_request_no_key unique (tenant_id, request_no),
  constraint inv_purchase_requests_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_purchase_requests_material_request_fk foreign key (tenant_id, material_request_id)
    references public.inv_material_requests (tenant_id, id),
  constraint inv_purchase_requests_quotation_fk foreign key (tenant_id, quotation_id)
    references public.inv_supplier_quotations (tenant_id, id)
);

create table if not exists public.inv_purchase_request_lines (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  purchase_request_id uuid not null,
  line_no integer not null check (line_no > 0),
  item_id uuid,
  quantity numeric not null check (quantity > 0),
  unit_price_snapshot numeric check (unit_price_snapshot is null or unit_price_snapshot >= 0),
  created_at timestamptz not null default now(),
  constraint inv_purchase_request_lines_pkey primary key (id),
  constraint inv_purchase_request_lines_tenant_id_id_key unique (tenant_id, id),
  constraint inv_purchase_request_lines_parent_line_key unique (tenant_id, purchase_request_id, line_no),
  constraint inv_purchase_request_lines_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_purchase_request_lines_request_fk foreign key (tenant_id, purchase_request_id)
    references public.inv_purchase_requests (tenant_id, id),
  constraint inv_purchase_request_lines_item_fk foreign key (tenant_id, item_id)
    references public.inv_inventory_items (tenant_id, id)
);

create table if not exists public.inv_purchase_request_approvals (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  purchase_request_id uuid not null,
  approval_stage text not null,
  reviewer_user_id uuid,
  decision text not null,
  reason text,
  acted_at timestamptz not null default now(),
  constraint inv_purchase_request_approvals_pkey primary key (id),
  constraint inv_purchase_request_approvals_tenant_id_id_key unique (tenant_id, id),
  constraint inv_purchase_request_approvals_stage_key unique (tenant_id, purchase_request_id, approval_stage),
  constraint inv_purchase_request_approvals_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_purchase_request_approvals_request_fk foreign key (tenant_id, purchase_request_id)
    references public.inv_purchase_requests (tenant_id, id),
  constraint inv_purchase_request_approvals_reviewer_fk foreign key (reviewer_user_id)
    references public.app_users (id)
);

create table if not exists public.inv_purchase_orders (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  order_no text not null,
  purchase_request_id uuid,
  supplier_id uuid not null,
  ordered_on date not null default current_date,
  expected_on date,
  status text not null default 'draft',
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inv_purchase_orders_pkey primary key (id),
  constraint inv_purchase_orders_tenant_id_id_key unique (tenant_id, id),
  constraint inv_purchase_orders_tenant_order_no_key unique (tenant_id, order_no),
  constraint inv_purchase_orders_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_purchase_orders_request_fk foreign key (tenant_id, purchase_request_id)
    references public.inv_purchase_requests (tenant_id, id),
  constraint inv_purchase_orders_supplier_fk foreign key (tenant_id, supplier_id)
    references public.inv_suppliers (tenant_id, id)
);

create table if not exists public.inv_purchase_order_lines (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  purchase_order_id uuid not null,
  line_no integer not null check (line_no > 0),
  item_id uuid,
  quantity numeric not null check (quantity > 0),
  agreed_price numeric not null check (agreed_price >= 0),
  created_at timestamptz not null default now(),
  constraint inv_purchase_order_lines_pkey primary key (id),
  constraint inv_purchase_order_lines_tenant_id_id_key unique (tenant_id, id),
  constraint inv_purchase_order_lines_parent_line_key unique (tenant_id, purchase_order_id, line_no),
  constraint inv_purchase_order_lines_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_purchase_order_lines_order_fk foreign key (tenant_id, purchase_order_id)
    references public.inv_purchase_orders (tenant_id, id),
  constraint inv_purchase_order_lines_item_fk foreign key (tenant_id, item_id)
    references public.inv_inventory_items (tenant_id, id)
);

create table if not exists public.inv_purchase_order_dispatches (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  purchase_order_id uuid not null,
  dispatched_at timestamptz not null default now(),
  dispatch_method text not null,
  recipient text,
  external_reference text,
  actor_user_id uuid,
  constraint inv_purchase_order_dispatches_pkey primary key (id),
  constraint inv_purchase_order_dispatches_tenant_id_id_key unique (tenant_id, id),
  constraint inv_purchase_order_dispatches_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_purchase_order_dispatches_order_fk foreign key (tenant_id, purchase_order_id)
    references public.inv_purchase_orders (tenant_id, id),
  constraint inv_purchase_order_dispatches_actor_fk foreign key (actor_user_id)
    references public.app_users (id)
);

create table if not exists public.inv_inspection_reports (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  purchase_order_id uuid not null,
  delivery_reference text not null,
  inspected_at timestamptz,
  status text not null default 'pending',
  acknowledged_by_user_id uuid,
  accepted_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inv_inspection_reports_pkey primary key (id),
  constraint inv_inspection_reports_tenant_id_id_key unique (tenant_id, id),
  constraint inv_inspection_reports_delivery_key unique (tenant_id, purchase_order_id, delivery_reference),
  constraint inv_inspection_reports_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_inspection_reports_order_fk foreign key (tenant_id, purchase_order_id)
    references public.inv_purchase_orders (tenant_id, id),
  constraint inv_inspection_reports_acknowledged_fk foreign key (acknowledged_by_user_id)
    references public.app_users (id),
  constraint inv_inspection_reports_accepted_fk foreign key (accepted_by_user_id)
    references public.app_users (id)
);

create table if not exists public.inv_inspection_report_lines (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  inspection_report_id uuid not null,
  purchase_order_line_id uuid not null,
  delivered_quantity numeric not null check (delivered_quantity >= 0),
  accepted_quantity numeric not null default 0 check (accepted_quantity >= 0),
  damaged_quantity numeric not null default 0 check (damaged_quantity >= 0),
  rejected_quantity numeric not null default 0 check (rejected_quantity >= 0),
  unit_cost numeric not null check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  constraint inv_inspection_report_lines_pkey primary key (id),
  constraint inv_inspection_report_lines_tenant_id_id_key unique (tenant_id, id),
  constraint inv_inspection_report_lines_order_line_key
    unique (tenant_id, inspection_report_id, purchase_order_line_id),
  constraint inv_inspection_report_lines_quantities_check
    check (accepted_quantity + damaged_quantity + rejected_quantity <= delivered_quantity),
  constraint inv_inspection_report_lines_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_inspection_report_lines_report_fk foreign key (tenant_id, inspection_report_id)
    references public.inv_inspection_reports (tenant_id, id),
  constraint inv_inspection_report_lines_order_line_fk foreign key (tenant_id, purchase_order_line_id)
    references public.inv_purchase_order_lines (tenant_id, id)
);

create table if not exists public.inv_supplier_returns (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  inspection_line_id uuid not null,
  quantity numeric not null check (quantity > 0),
  return_reference text not null,
  returned_at timestamptz not null default now(),
  status text not null default 'draft',
  constraint inv_supplier_returns_pkey primary key (id),
  constraint inv_supplier_returns_tenant_id_id_key unique (tenant_id, id),
  constraint inv_supplier_returns_tenant_return_reference_key unique (tenant_id, return_reference),
  constraint inv_supplier_returns_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_supplier_returns_inspection_line_fk foreign key (tenant_id, inspection_line_id)
    references public.inv_inspection_report_lines (tenant_id, id)
);

create table if not exists public.inv_requisition_issue_slips (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  ris_no text not null,
  material_request_id uuid,
  requester_personnel_id uuid,
  job text,
  approved_by_user_id uuid,
  status text not null default 'draft',
  requested_on date not null default current_date,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inv_requisition_issue_slips_pkey primary key (id),
  constraint inv_requisition_issue_slips_tenant_id_id_key unique (tenant_id, id),
  constraint inv_requisition_issue_slips_tenant_ris_no_key unique (tenant_id, ris_no),
  constraint inv_requisition_issue_slips_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_requisition_issue_slips_material_request_fk foreign key (tenant_id, material_request_id)
    references public.inv_material_requests (tenant_id, id),
  constraint inv_requisition_issue_slips_requester_fk foreign key (tenant_id, requester_personnel_id)
    references public.personnel (tenant_id, id),
  constraint inv_requisition_issue_slips_approver_fk foreign key (approved_by_user_id)
    references public.app_users (id)
);

create table if not exists public.inv_requisition_issue_slip_lines (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  ris_id uuid not null,
  line_no integer not null check (line_no > 0),
  item_id uuid not null,
  requested_quantity numeric not null check (requested_quantity > 0),
  created_at timestamptz not null default now(),
  constraint inv_requisition_issue_slip_lines_pkey primary key (id),
  constraint inv_requisition_issue_slip_lines_tenant_id_id_key unique (tenant_id, id),
  constraint inv_requisition_issue_slip_lines_parent_line_key unique (tenant_id, ris_id, line_no),
  constraint inv_requisition_issue_slip_lines_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_requisition_issue_slip_lines_ris_fk foreign key (tenant_id, ris_id)
    references public.inv_requisition_issue_slips (tenant_id, id),
  constraint inv_requisition_issue_slip_lines_item_fk foreign key (tenant_id, item_id)
    references public.inv_inventory_items (tenant_id, id)
);

create table if not exists public.inv_ris_releases (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  ris_line_id uuid not null,
  movement_line_id uuid not null,
  quantity numeric not null check (quantity > 0),
  unit_cost numeric not null check (unit_cost >= 0),
  recipient_name text not null,
  released_at timestamptz not null default now(),
  constraint inv_ris_releases_pkey primary key (id),
  constraint inv_ris_releases_tenant_id_id_key unique (tenant_id, id),
  constraint inv_ris_releases_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_ris_releases_ris_line_fk foreign key (tenant_id, ris_line_id)
    references public.inv_requisition_issue_slip_lines (tenant_id, id),
  constraint inv_ris_releases_movement_line_fk foreign key (tenant_id, movement_line_id)
    references public.inv_stock_movement_lines (tenant_id, id)
);

create table if not exists public.inv_material_returns (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  release_id uuid not null,
  movement_id uuid,
  quantity numeric not null check (quantity > 0),
  condition text not null,
  accepted boolean not null default false,
  reason text,
  credit numeric not null default 0 check (credit >= 0),
  returned_at timestamptz not null default now(),
  constraint inv_material_returns_pkey primary key (id),
  constraint inv_material_returns_tenant_id_id_key unique (tenant_id, id),
  constraint inv_material_returns_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_material_returns_release_fk foreign key (tenant_id, release_id)
    references public.inv_ris_releases (tenant_id, id),
  constraint inv_material_returns_movement_fk foreign key (tenant_id, movement_id)
    references public.inv_stock_movements (tenant_id, id)
);

create table if not exists public.inv_stock_counts (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  location_id uuid not null,
  count_date date not null default current_date,
  status text not null default 'draft',
  counter_user_id uuid,
  approver_user_id uuid,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inv_stock_counts_pkey primary key (id),
  constraint inv_stock_counts_tenant_id_id_key unique (tenant_id, id),
  constraint inv_stock_counts_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_stock_counts_location_fk foreign key (tenant_id, location_id)
    references public.inv_storage_locations (tenant_id, id),
  constraint inv_stock_counts_counter_fk foreign key (counter_user_id) references public.app_users (id),
  constraint inv_stock_counts_approver_fk foreign key (approver_user_id) references public.app_users (id)
);

create table if not exists public.inv_stock_count_lines (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  stock_count_id uuid not null,
  item_id uuid not null,
  recorded_quantity numeric not null check (recorded_quantity >= 0),
  counted_quantity numeric not null check (counted_quantity >= 0),
  adjustment_movement_id uuid,
  created_at timestamptz not null default now(),
  constraint inv_stock_count_lines_pkey primary key (id),
  constraint inv_stock_count_lines_tenant_id_id_key unique (tenant_id, id),
  constraint inv_stock_count_lines_item_key unique (tenant_id, stock_count_id, item_id),
  constraint inv_stock_count_lines_tenant_fk foreign key (tenant_id) references public.tenants (id),
  constraint inv_stock_count_lines_count_fk foreign key (tenant_id, stock_count_id)
    references public.inv_stock_counts (tenant_id, id),
  constraint inv_stock_count_lines_item_fk foreign key (tenant_id, item_id)
    references public.inv_inventory_items (tenant_id, id),
  constraint inv_stock_count_lines_adjustment_fk foreign key (tenant_id, adjustment_movement_id)
    references public.inv_stock_movements (tenant_id, id)
);

create table if not exists public.inv_document_counters (
  tenant_id uuid not null,
  document_type text not null,
  period_month date not null
    check (period_month = date_trunc('month', period_month::timestamptz)::date),
  last_number bigint not null default 0 check (last_number >= 0),
  constraint inv_document_counters_pkey primary key (tenant_id, document_type, period_month),
  constraint inv_document_counters_tenant_fk foreign key (tenant_id) references public.tenants (id)
);
