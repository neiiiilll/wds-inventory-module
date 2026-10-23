-- Explicit Inventory-only setup and display-only print metadata.
alter table public.inv_material_requests add column if not exists print_fields jsonb;
alter table public.inv_supplier_quotations add column if not exists print_fields jsonb;
alter table public.inv_purchase_requests add column if not exists print_fields jsonb;
alter table public.inv_purchase_orders add column if not exists print_fields jsonb;

create function public.inv_setup_command(p_tenant uuid,p_actor uuid,p_kind text,p_id uuid,p_version bigint,p_input jsonb) returns jsonb
language plpgsql set search_path=public,pg_temp as $$
declare new_id uuid;new_version bigint;code_value text;name_value text;active_value boolean;kind_value text;fields_value jsonb;mode_value text;current_tracking public.inv_item_tracking%rowtype;
begin
 if p_kind='saveSupplier' then
  perform public.inv_read_object(p_input,array['code','name','contactName','email','phone','address','active']);code_value:=public.inv_procurement_text(p_input,'code',100);name_value:=public.inv_procurement_text(p_input,'name',300);active_value:=coalesce((p_input->>'active')::boolean,true);
  if p_id is null then insert into public.inv_suppliers(tenant_id,supplier_code,name,contact_name,contact_email,contact_phone,address,active) values(p_tenant,code_value,name_value,p_input->>'contactName',p_input->>'email',p_input->>'phone',p_input->>'address',active_value) returning id,version into new_id,new_version;
  else update public.inv_suppliers set supplier_code=code_value,name=name_value,contact_name=p_input->>'contactName',contact_email=p_input->>'email',contact_phone=p_input->>'phone',address=p_input->>'address',active=active_value,version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_id and version=p_version returning id,version into new_id,new_version;if new_id is null then raise exception using errcode='40001',message='Supplier changed or is unavailable.';end if;end if;
  return jsonb_build_object('id',new_id,'kind','suppliers','version',new_version,'reference',code_value,'status',case when active_value then 'active' else 'inactive' end);
 end if;
 if p_kind='saveWarehouse' then
  perform public.inv_read_object(p_input,array['code','name','active']);code_value:=public.inv_procurement_text(p_input,'code',100);name_value:=public.inv_procurement_text(p_input,'name',300);active_value:=coalesce((p_input->>'active')::boolean,true);
  if p_id is null then insert into public.inv_warehouses(tenant_id,code,name,active) values(p_tenant,code_value,name_value,active_value) returning id,version into new_id,new_version;
  else update public.inv_warehouses set code=code_value,name=name_value,active=active_value,version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_id and version=p_version returning id,version into new_id,new_version;if new_id is null then raise exception using errcode='40001',message='Warehouse changed or is unavailable.';end if;end if;
  return jsonb_build_object('id',new_id,'kind','warehouses','version',new_version,'reference',code_value,'status',case when active_value then 'active' else 'inactive' end);
 end if;
 if p_kind='saveStorageLocation' then
  perform public.inv_read_object(p_input,array['warehouseId','code','bin','active']);code_value:=public.inv_procurement_text(p_input,'code',100);active_value:=coalesce((p_input->>'active')::boolean,true);
  if not exists(select 1 from public.inv_warehouses w where w.tenant_id=p_tenant and w.id=(p_input->>'warehouseId')::uuid and w.active) then raise exception using errcode='P0002',message='Active warehouse is unavailable.';end if;
  if p_id is null then insert into public.inv_storage_locations(tenant_id,warehouse_id,location_code,bin,active) values(p_tenant,(p_input->>'warehouseId')::uuid,code_value,p_input->>'bin',active_value) returning id,version into new_id,new_version;
  else update public.inv_storage_locations set warehouse_id=(p_input->>'warehouseId')::uuid,location_code=code_value,bin=p_input->>'bin',active=active_value,version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_id and version=p_version returning id,version into new_id,new_version;if new_id is null then raise exception using errcode='40001',message='Location changed or is unavailable.';end if;end if;
  return jsonb_build_object('id',new_id,'kind','locations','version',new_version,'reference',code_value,'status',case when active_value then 'active' else 'inactive' end);
 end if;
 if p_kind='configureItemTracking' then
  perform public.inv_read_object(p_input,array['mode','reason']);mode_value:=p_input->>'mode';if mode_value not in ('quantity_only','individually_tagged') then raise exception using errcode='22023',message='Invalid tracking mode.';end if;
  if not exists(select 1 from public.inv_inventory_items i where i.tenant_id=p_tenant and i.id=p_id and i.active) then raise exception using errcode='P0002',message='Inventory item is unavailable.';end if;
  select * into current_tracking from public.inv_item_tracking where tenant_id=p_tenant and item_id=p_id for update;
  if found then perform public.inv_procurement_version(current_tracking.version,p_version);else if p_version<>0 then raise exception using errcode='40001',message='Tracking setup changed.';end if;end if;
  if (not found or current_tracking.mode<>mode_value) and ((mode_value='individually_tagged' and exists(select 1 from public.inv_inventory_balances b where b.tenant_id=p_tenant and b.item_id=p_id and (b.quantity<>0 or b.inventory_value<>0))) or (mode_value='quantity_only' and exists(select 1 from public.inv_inventory_assets a where a.tenant_id=p_tenant and a.item_id=p_id))) then raise exception using errcode='55000',message='Existing stock or assets require tracking reconciliation.';end if;
  insert into public.inv_item_tracking(tenant_id,item_id,mode,configured_by_user_id,reason,version,configured_at) values(p_tenant,p_id,mode_value,p_actor,public.inv_procurement_text(p_input,'reason',500),1,now()) on conflict(tenant_id,item_id) do update set mode=excluded.mode,configured_by_user_id=p_actor,reason=excluded.reason,version=public.inv_item_tracking.version+1,configured_at=now() returning version into new_version;
  return jsonb_build_object('id',p_id,'kind','tracking','version',new_version,'reference',mode_value,'status','configured');
 end if;
 if p_kind='saveDocumentPrintFields' then
  perform public.inv_read_object(p_input,array['kind','fields']);kind_value:=p_input->>'kind';fields_value:=p_input->'fields';perform public.inv_read_object(fields_value,array['organizationName','organizationAddress','attention','note','footer','deliveryInstructions']);
  if (select count(*) from jsonb_object_keys(fields_value))>6 or exists(select 1 from jsonb_each_text(fields_value) e where length(btrim(e.value)) not between 1 and 500) then raise exception using errcode='22023',message='Invalid print metadata.';end if;
  if kind_value='material_request' then update public.inv_material_requests set print_fields=fields_value,version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_id and version=p_version returning version into new_version;
  elsif kind_value='quotation' then update public.inv_supplier_quotations set print_fields=fields_value,version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_id and version=p_version returning version into new_version;
  elsif kind_value='purchase_request' then update public.inv_purchase_requests set print_fields=fields_value,version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_id and version=p_version returning version into new_version;
  elsif kind_value='purchase_order' then update public.inv_purchase_orders set print_fields=fields_value,version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_id and version=p_version returning version into new_version;
  elsif kind_value='inspection' then update public.inv_inspection_reports set print_fields=fields_value,version=version+1,updated_at=now() where tenant_id=p_tenant and id=p_id and version=p_version returning version into new_version;
  else raise exception using errcode='22023',message='Invalid document kind.';end if;
  if new_version is null then raise exception using errcode='40001',message='Document changed or is unavailable.';end if;
  return jsonb_build_object('id',p_id,'kind',kind_value,'version',new_version,'status','saved');
 end if;
 raise exception using errcode='22023',message='Unsupported setup command.';
end $$;

create or replace function public.inv_execute_procurement_command(p_tenant_id uuid,p_actor_user_id uuid,p_kind text,p_document_id uuid,p_expected_version bigint,p_idempotency_key text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare outcome jsonb;admin_kind boolean:=p_kind in ('reassignPendingReviewer','reconcileHistoricalReceipt','saveSupplier','saveWarehouse','saveStorageLocation','configureItemTracking');
begin
 perform public.inv_require_procurement_access(p_tenant_id,p_actor_user_id,admin_kind,true);
 if p_kind not in ('createMaterialRequest','editMaterialRequest','approveMaterialRequest','createAdditionalMaterialRequest','createQuotation','createPurchaseRequest','revisePurchaseRequest','submitPurchaseRequest','reviewPurchaseRequest','reassignPendingReviewer','createPurchaseOrder','dispatchPurchaseOrder','recordDelivery','recordInspection','acceptInspection','postAcceptedReceipt','recordSupplierReturn','reconcileHistoricalReceipt','saveSupplier','saveWarehouse','saveStorageLocation','configureItemTracking','saveDocumentPrintFields') then raise exception using errcode='22023',message='Unsupported procurement command.';end if;
 outcome:=public.inv_begin_procurement_command(p_tenant_id,p_actor_user_id,p_kind,p_idempotency_key,jsonb_build_object('id',p_document_id,'expectedVersion',p_expected_version,'input',p_input));if outcome is not null then return outcome;end if;
 perform pg_advisory_xact_lock(hashtextextended('inventory-procurement:'||p_tenant_id::text,0));perform public.inv_require_procurement_access(p_tenant_id,p_actor_user_id,admin_kind,true);
 if p_kind in ('saveSupplier','saveWarehouse','saveStorageLocation','configureItemTracking','saveDocumentPrintFields') then outcome:=public.inv_setup_command(p_tenant_id,p_actor_user_id,p_kind,p_document_id,p_expected_version,p_input);
 elsif p_kind in ('recordDelivery','recordInspection','acceptInspection','postAcceptedReceipt','recordSupplierReturn','reconcileHistoricalReceipt') then outcome:=public.inv_receiving_command(p_tenant_id,p_actor_user_id,p_kind,p_document_id,p_expected_version,p_input);
 else outcome:=public.inv_document_command(p_tenant_id,p_actor_user_id,p_kind,p_document_id,p_expected_version,p_input);end if;
 outcome:=outcome||jsonb_build_object('replayed',false,'invalidations',jsonb_build_array('dashboard','procurement','inventory','movements','references'));
 perform public.inv_procurement_event(p_tenant_id,p_actor_user_id,outcome->>'kind',(outcome->>'id')::uuid,p_kind,null,jsonb_build_object('input',p_input,'version',outcome->'version'));update public.inv_procurement_commands set result=outcome where tenant_id=p_tenant_id and kind=p_kind and idempotency_key=btrim(p_idempotency_key);return outcome;
end $$;
revoke all on function public.inv_setup_command(uuid,uuid,text,uuid,bigint,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.inv_execute_procurement_command(uuid,uuid,text,uuid,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.inv_execute_procurement_command(uuid,uuid,text,uuid,bigint,text,jsonb) to service_role;
