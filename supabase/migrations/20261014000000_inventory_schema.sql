-- WDS Inventory Module Supabase migration
-- Apply this file in Supabase SQL Editor before enabling application sync.
-- The workflow_snapshots row is a compatibility bridge for the existing
-- React mockup. The normalized records are the production data model.

create extension if not exists pgcrypto;

create table if not exists public.workflow_snapshots (
  id text primary key check (id = 'default'),
  state jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.workflow_snapshots enable row level security;
drop policy if exists "demo snapshot read" on public.workflow_snapshots;
drop policy if exists "demo snapshot write" on public.workflow_snapshots;
create policy "demo snapshot read" on public.workflow_snapshots for select to anon, authenticated using (id = 'default');
create policy "demo snapshot write" on public.workflow_snapshots for all to anon, authenticated using (id = 'default') with check (id = 'default');

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.personnel (
  id uuid primary key default gen_random_uuid(),
  employee_no text unique,
  full_name text not null,
  email text unique,
  position_title text,
  department_id uuid references public.departments(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_code text not null unique,
  supplier_name text not null,
  address text,
  contact_name text,
  contact_email text,
  contact_phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  item_code text not null unique,
  item_name text not null,
  category text,
  description text,
  brand text,
  model text,
  unit_of_measure text not null,
  minimum_quantity numeric(18,3) not null default 0 check (minimum_quantity >= 0),
  supplier_id uuid references public.suppliers(id),
  location text,
  bin text,
  unit_cost numeric(18,4),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id),
  movement_date date not null,
  movement_type text not null check (movement_type in ('Opening Balance','Stock In','Stock Out','Return','Adjustment','Damaged','Lost')),
  quantity_delta numeric(18,3) not null check (quantity_delta <> 0),
  previous_quantity numeric(18,3),
  next_quantity numeric(18,3),
  unit_cost numeric(18,4),
  reference_no text not null,
  source_type text,
  source_id uuid,
  performed_by text not null,
  remarks text,
  posted_at timestamptz not null default now(),
  idempotency_key uuid not null unique
);

create table if not exists public.material_requests (
  id uuid primary key default gen_random_uuid(),
  reference_no text not null unique,
  parent_request_id uuid references public.material_requests(id),
  requester_name text not null,
  requested_for_name text,
  department text,
  request_date date not null,
  purpose text not null,
  status text not null default 'Draft' check (status in ('Draft','For PR','In PR','In PO','Closed','Cancelled')),
  edit_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.material_request_lines (
  id uuid primary key default gen_random_uuid(),
  material_request_id uuid not null references public.material_requests(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id),
  quantity numeric(18,3) not null check (quantity > 0),
  specification text,
  unique (material_request_id, item_id)
);

create table if not exists public.material_request_history (
  id uuid primary key default gen_random_uuid(),
  material_request_id uuid not null references public.material_requests(id) on delete cascade,
  event_type text not null,
  reason text,
  changes jsonb not null default '[]'::jsonb,
  actor_name text not null,
  occurred_at timestamptz not null default now()
);

create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  reference_no text not null unique,
  material_request_id uuid not null references public.material_requests(id),
  request_date date not null,
  requester_name text not null,
  supplier_name text,
  quotation_reference text,
  selection_reason text,
  status text not null default 'Draft' check (status in ('Draft','Submitted','Returned','Rejected','Approved')),
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_request_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id),
  quantity numeric(18,3) not null check (quantity > 0),
  unit_price numeric(18,4),
  specification text,
  unique (purchase_request_id, item_id)
);

create table if not exists public.purchase_request_approval_steps (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests(id) on delete cascade,
  step_order smallint not null check (step_order between 1 and 4),
  stage text not null check (stage in ('Department Head','Budget Review','Procurement / Internal Control','Final Approver')),
  reviewer_name text not null,
  decision text check (decision in ('Approved','Returned','Rejected')),
  reason text,
  acted_at timestamptz,
  unique (purchase_request_id, step_order)
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  reference_no text not null unique,
  purchase_request_id uuid not null unique references public.purchase_requests(id),
  supplier_name text not null,
  order_date date not null,
  expected_delivery_date date,
  status text not null default 'Draft' check (status in ('Draft','Approved','Dispatched','Partially Received','Received','Closed','Cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id),
  ordered_quantity numeric(18,3) not null check (ordered_quantity > 0),
  unit_price numeric(18,4) not null check (unit_price >= 0),
  specification text,
  unique (purchase_order_id, item_id)
);

create table if not exists public.inspection_acceptance_reports (
  id uuid primary key default gen_random_uuid(),
  reference_no text not null unique,
  purchase_order_id uuid not null references public.purchase_orders(id),
  delivery_reference text not null,
  delivery_date date not null,
  status text not null default 'Draft' check (status in ('Draft','Inspected','Accepted','Partially Accepted','Rejected','Posted')),
  findings text,
  inspected_by text,
  accepted_by text,
  inspected_at timestamptz,
  accepted_at timestamptz,
  stock_posted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.inspection_acceptance_lines (
  id uuid primary key default gen_random_uuid(),
  iar_id uuid not null references public.inspection_acceptance_reports(id) on delete cascade,
  purchase_order_line_id uuid not null references public.purchase_order_lines(id),
  delivered_quantity numeric(18,3) not null default 0 check (delivered_quantity >= 0),
  accepted_quantity numeric(18,3) not null default 0 check (accepted_quantity >= 0),
  damaged_quantity numeric(18,3) not null default 0 check (damaged_quantity >= 0),
  rejected_quantity numeric(18,3) not null default 0 check (rejected_quantity >= 0),
  finding text,
  check (accepted_quantity + damaged_quantity + rejected_quantity <= delivered_quantity),
  unique (iar_id, purchase_order_line_id)
);

create table if not exists public.requisition_issue_slips (
  id uuid primary key default gen_random_uuid(),
  reference_no text not null unique,
  requester_name text not null,
  request_date date not null,
  approval_reference text,
  purpose text,
  status text not null default 'Draft' check (status in ('Draft','Approved','Partially Released','Released','Cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.ris_lines (
  id uuid primary key default gen_random_uuid(),
  ris_id uuid not null references public.requisition_issue_slips(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id),
  requested_quantity numeric(18,3) not null check (requested_quantity > 0),
  unique (ris_id, item_id)
);

create table if not exists public.ris_releases (
  id uuid primary key default gen_random_uuid(),
  ris_line_id uuid not null references public.ris_lines(id),
  release_date date not null,
  released_quantity numeric(18,3) not null check (released_quantity > 0),
  recipient_name text not null,
  unit_cost numeric(18,4),
  asset_tag text,
  created_at timestamptz not null default now()
);

create table if not exists public.document_form_fields (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('IAR','RIS','STOCK_CARD')),
  document_id uuid not null,
  fields jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (document_type, document_id)
);

create table if not exists public.document_counters (
  document_type text not null check (document_type in ('MR','PR','PO','IAR','RIS')),
  period char(7) not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  last_number integer not null default 0,
  primary key (document_type, period)
);

-- RLS is enabled on all normalized records. The current demo bridge allows
-- anon access only to its one compatibility row; replace that policy with
-- authenticated role policies before production deployment.
do $$ declare table_name text; begin
  foreach table_name in array array[
    'departments','personnel','suppliers','inventory_items','inventory_movements',
    'material_requests','material_request_lines','material_request_history',
    'purchase_requests','purchase_request_lines','purchase_request_approval_steps',
    'purchase_orders','purchase_order_lines','inspection_acceptance_reports',
    'inspection_acceptance_lines','requisition_issue_slips','ris_lines','ris_releases',
    'document_form_fields','document_counters'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy "authenticated access %s" on public.%I for all to authenticated using (true) with check (true)', table_name, table_name);
  end loop;
exception when duplicate_object then null;
end $$;

create index if not exists inventory_movements_stock_card_idx on public.inventory_movements(item_id, movement_date, posted_at);
create index if not exists material_request_history_request_idx on public.material_request_history(material_request_id, occurred_at);
create index if not exists iar_po_idx on public.inspection_acceptance_reports(purchase_order_id, delivery_date);

-- Keep an existing project aligned if an earlier version created electronic signatures.
drop table if exists public.electronic_signatures;

-- Remove legacy electronic-signature fields from the compatibility snapshot.
update public.workflow_snapshots
set state = jsonb_set(
  jsonb_set(
    jsonb_set(
      state,
      '{iars}',
      coalesce((
        select jsonb_agg(row - 'inspectionSignature' - 'acceptanceSignature')
        from jsonb_array_elements(coalesce(state->'iars', '[]'::jsonb)) as elements(row)
      ), '[]'::jsonb),
      true
    ),
    '{ris}',
    coalesce((
      select jsonb_agg(row - 'requestedSignature')
      from jsonb_array_elements(coalesce(state->'ris', '[]'::jsonb)) as elements(row)
    ), '[]'::jsonb),
    true
  ),
  '{releases}',
  coalesce((
    select jsonb_agg(row - 'signature' - 'recipientSignature')
    from jsonb_array_elements(coalesce(state->'releases', '[]'::jsonb)) as elements(row)
  ), '[]'::jsonb),
  true
),
updated_at = now()
where id = 'default';
