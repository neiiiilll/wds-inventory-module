-- Additive Inventory-only foundation. No shared/schema/Service Desk mutations.
alter table public.inv_material_requests
  add column if not exists requester_user_id uuid references public.app_users(id),
  add column if not exists requester_name text,
  add column if not exists created_by_user_id uuid references public.app_users(id),
  add column if not exists parent_request_id uuid,
  add column if not exists approved_by_user_id uuid references public.app_users(id),
  add column if not exists approved_at timestamptz,
  add column if not exists approval_reference text,
  add column if not exists workflow_revision bigint not null default 1,
  add column if not exists workflow_managed boolean not null default false,
  add constraint inv_material_requests_parent_workflow_fk foreign key(tenant_id,parent_request_id) references public.inv_material_requests(tenant_id,id);
alter table public.inv_material_request_lines add column if not exists item_snapshot jsonb;
alter table public.inv_supplier_quotations
  add column if not exists quoted_on date,
  add column if not exists external_reference text,
  add column if not exists request_revision bigint,
  add column if not exists created_by_user_id uuid references public.app_users(id),
  add column if not exists workflow_managed boolean not null default false;
alter table public.inv_supplier_quotation_lines add column if not exists item_snapshot jsonb;
alter table public.inv_purchase_requests
  add column if not exists selection_reason text,
  add column if not exists requester_user_id uuid references public.app_users(id),
  add column if not exists requester_name text,
  add column if not exists created_by_user_id uuid references public.app_users(id),
  add column if not exists workflow_managed boolean not null default false;
alter table public.inv_purchase_request_lines add column if not exists item_snapshot jsonb;
alter table public.inv_purchase_orders
  add column if not exists created_by_user_id uuid references public.app_users(id),
  add column if not exists workflow_managed boolean not null default false;
alter table public.inv_purchase_order_lines add column if not exists item_snapshot jsonb;
alter table public.inv_inspection_reports
  add column if not exists report_no text,
  add column if not exists delivered_on date,
  add column if not exists findings text,
  add column if not exists version bigint not null default 1,
  add column if not exists workflow_managed boolean not null default false,
  add column if not exists created_by_user_id uuid references public.app_users(id),
  add column if not exists accepted_at timestamptz,
  add column if not exists receipt_movement_id uuid,
  add column if not exists receipt_resolution text,
  add column if not exists replacement_of_report_id uuid,
  add column if not exists print_fields jsonb,
  add constraint inv_inspection_reports_receipt_workflow_fk foreign key(tenant_id,receipt_movement_id) references public.inv_stock_movements(tenant_id,id),
  add constraint inv_inspection_reports_replacement_workflow_fk foreign key(tenant_id,replacement_of_report_id) references public.inv_inspection_reports(tenant_id,id);
create unique index inv_inspection_receipt_workflow_unique on public.inv_inspection_reports(tenant_id,receipt_movement_id) where receipt_movement_id is not null;
create unique index inv_inspection_number_workflow_unique on public.inv_inspection_reports(tenant_id,report_no) where report_no is not null;
alter table public.inv_inspection_report_lines
  add column if not exists item_snapshot jsonb,
  add column if not exists location_id uuid,
  add column if not exists asset_tags text[],
  add column if not exists replacement_of_line_id uuid,
  add constraint inv_inspection_lines_location_workflow_fk foreign key(tenant_id,location_id) references public.inv_storage_locations(tenant_id,id),
  add constraint inv_inspection_lines_replacement_workflow_fk foreign key(tenant_id,replacement_of_line_id) references public.inv_inspection_report_lines(tenant_id,id);
alter table public.inv_supplier_returns
  add column if not exists version bigint not null default 1,
  add column if not exists created_by_user_id uuid references public.app_users(id),
  add column if not exists reason text;
alter table public.inv_suppliers add column if not exists version bigint not null default 1;
alter table public.inv_warehouses add column if not exists version bigint not null default 1;
alter table public.inv_storage_locations add column if not exists version bigint not null default 1;

create table public.inv_procurement_review_steps (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
  purchase_request_id uuid not null, revision bigint not null check(revision>0),
  stage_order smallint not null check(stage_order between 1 and 4),
  reviewer_membership_id uuid not null,
  decision text check(decision in ('approved','returned','rejected')),
  acted_by_user_id uuid references public.app_users(id), acted_at timestamptz, reason text,
  unique(tenant_id,purchase_request_id,revision,stage_order), unique(tenant_id,id),
  foreign key(tenant_id,purchase_request_id) references public.inv_purchase_requests(tenant_id,id),
  foreign key(tenant_id,reviewer_membership_id) references public.tenant_memberships(tenant_id,id)
);
create table public.inv_item_tracking (
  tenant_id uuid not null, item_id uuid not null,
  mode text not null check(mode in ('quantity_only','individually_tagged')),
  configured_by_user_id uuid not null references public.app_users(id), reason text not null check(btrim(reason)<>''),
  version bigint not null default 1, configured_at timestamptz not null default now(),
  primary key(tenant_id,item_id), foreign key(tenant_id,item_id) references public.inv_inventory_items(tenant_id,id)
);
create table public.inv_procurement_commands (
  tenant_id uuid not null references public.tenants(id), kind text not null, idempotency_key text not null,
  actor_user_id uuid not null references public.app_users(id), fingerprint text not null, result jsonb,
  created_at timestamptz not null default now(), primary key(tenant_id,kind,idempotency_key)
);
create table public.inv_procurement_events (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  document_kind text not null, document_id uuid not null, action text not null,
  actor_user_id uuid not null references public.app_users(id), reason text,
  details jsonb not null default '{}', occurred_at timestamptz not null default now()
);
create index inv_procurement_events_document_idx on public.inv_procurement_events(tenant_id,document_kind,document_id,occurred_at,id);
create table public.inv_procurement_attachments (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  document_kind text not null, document_id uuid not null, storage_path text not null unique,
  file_name text not null, mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg')),
  byte_size bigint not null check(byte_size between 1 and 5242880), checksum text,
  uploaded_by_user_id uuid not null references public.app_users(id),
  state text not null default 'pending' check(state in ('pending','ready','rejected')),
  created_at timestamptz not null default now(), finalized_at timestamptz
);
create index inv_procurement_attachment_parent_idx on public.inv_procurement_attachments(tenant_id,document_kind,document_id,state);

alter table public.inv_procurement_review_steps enable row level security;
alter table public.inv_item_tracking enable row level security;
alter table public.inv_procurement_commands enable row level security;
alter table public.inv_procurement_events enable row level security;
alter table public.inv_procurement_attachments enable row level security;
revoke all on public.inv_procurement_review_steps,public.inv_item_tracking,public.inv_procurement_commands,public.inv_procurement_events,public.inv_procurement_attachments from public,anon,authenticated,service_role;

-- Callable identity is trusted only as an actor selector, never as role/tenant proof.
create function public.inv_require_procurement_access(p_tenant_id uuid,p_actor_user_id uuid,p_admin_only boolean default false,p_write boolean default true)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare assigned_role text; membership_count integer;
begin
  select count(*) into membership_count from public.tenant_memberships where user_id=p_actor_user_id;
  if membership_count<>1 then raise exception using errcode='42501',message='Inventory access is not permitted.'; end if;
  select r.role_key into assigned_role
    from public.app_users u join public.tenant_memberships m on m.user_id=u.id
    join public.tenants t on t.id=m.tenant_id
    join public.membership_roles r on r.membership_id=m.id and r.app_key='inventory'
    join public.app_roles ar on ar.app_key=r.app_key and ar.role_key=r.role_key
    join public.applications a on a.app_key=r.app_key
    where u.id=p_actor_user_id and u.active and m.tenant_id=p_tenant_id and m.status='active' and t.active and a.active
      and r.role_key in ('administrator','inventory_staff','viewer')
    order by case r.role_key when 'administrator' then 1 when 'inventory_staff' then 2 else 3 end limit 1;
  if assigned_role is null or (p_admin_only and assigned_role<>'administrator') or (p_write and assigned_role='viewer') then
    raise exception using errcode='42501',message='Inventory access is not permitted.';
  end if;
  return assigned_role;
end $$;

-- Called inside a single command transaction. Pending outcomes cannot survive rollback.
create function public.inv_begin_procurement_command(p_tenant_id uuid,p_actor_user_id uuid,p_kind text,p_key text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous public.inv_procurement_commands%rowtype; expected_fingerprint text;
begin
  perform public.inv_require_procurement_access(p_tenant_id,p_actor_user_id);
  if p_key is null or length(btrim(p_key)) not between 1 and 200 or p_kind is null or length(p_kind)>100 then
    raise exception using errcode='22023',message='Invalid command key.';
  end if;
  expected_fingerprint:=encode(sha256(convert_to(jsonb_build_object('actor',p_actor_user_id,'payload',p_payload)::text,'UTF8')),'hex');
  insert into public.inv_procurement_commands(tenant_id,kind,idempotency_key,actor_user_id,fingerprint)
    values(p_tenant_id,p_kind,btrim(p_key),p_actor_user_id,expected_fingerprint) on conflict do nothing;
  select * into strict previous from public.inv_procurement_commands
    where tenant_id=p_tenant_id and kind=p_kind and idempotency_key=btrim(p_key) for update;
  if previous.actor_user_id<>p_actor_user_id or previous.fingerprint<>expected_fingerprint then
    raise exception using errcode='40001',message='Command key was already used for another request.';
  end if;
  if previous.result is not null then return previous.result||'{"replayed":true}'::jsonb; end if;
  return null;
end $$;
revoke all on function public.inv_require_procurement_access(uuid,uuid,boolean,boolean) from public,anon,authenticated,service_role;
revoke all on function public.inv_begin_procurement_command(uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
-- Internal guards intentionally have no direct browser/service-role execute grant.
