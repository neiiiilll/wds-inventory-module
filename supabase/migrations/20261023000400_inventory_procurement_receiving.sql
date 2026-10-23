-- Inventory-only receiving, inspection and exactly-once receipt transactions.
alter table public.inv_inspection_reports
  add column if not exists reconciliation_mode text,
  add column if not exists reconciliation_reason text,
  add column if not exists reconciliation_evidence text,
  add column if not exists reconciled_by_user_id uuid references public.app_users(id),
  add column if not exists reconciled_at timestamptz;

create function public.inv_post_inspection_receipt(p_tenant uuid,p_actor uuid,p_report uuid) returns uuid
language plpgsql set search_path=public,pg_temp as $$
declare report public.inv_inspection_reports%rowtype; line record; tracking text; movement_lines jsonb:='[]'; tags text[]; tag text; movement jsonb; asset_id uuid; line_no integer:=0; accepted_total numeric:=0;
begin
 select * into report from public.inv_inspection_reports where tenant_id=p_tenant and id=p_report for update;
 if not found then raise exception using errcode='P0002',message='Inspection report is unavailable.'; end if;
 if report.receipt_movement_id is not null then return report.receipt_movement_id; end if;
 if report.status not in ('inspected','accepted','reconciliation_required') then raise exception using errcode='55000',message='Completed inspection is required.'; end if;
 for line in
  select il.*,ol.item_id,ol.agreed_price,i.cost_method,u.quantity_precision
  from public.inv_inspection_report_lines il
  join public.inv_purchase_order_lines ol on ol.tenant_id=p_tenant and ol.id=il.purchase_order_line_id
  join public.inv_inventory_items i on i.tenant_id=p_tenant and i.id=ol.item_id and i.active
  join public.inv_units u on u.tenant_id=p_tenant and u.id=i.unit_id and u.active
  where il.tenant_id=p_tenant and il.inspection_report_id=p_report order by il.id for update of il
 loop
  if line.accepted_quantity=0 then continue; end if;
  accepted_total:=accepted_total+line.accepted_quantity;
  if line.location_id is null or not exists(select 1 from public.inv_storage_locations l where l.tenant_id=p_tenant and l.id=line.location_id and l.active) then raise exception using errcode='55000',message='A current receiving location is required.'; end if;
  if line.cost_method<>'average' then raise exception using errcode='55000',message='Only weighted-average receipt valuation is currently supported.'; end if;
  select t.mode into tracking from public.inv_item_tracking t where t.tenant_id=p_tenant and t.item_id=line.item_id;
  if tracking is null then raise exception using errcode='55000',message='Item tracking setup is required.'; end if;
  if line.accepted_quantity<>round(line.accepted_quantity,line.quantity_precision) then raise exception using errcode='22023',message='Accepted quantity precision is invalid.'; end if;
  if tracking='quantity_only' then
   if coalesce(cardinality(line.asset_tags),0)<>0 then raise exception using errcode='22023',message='Quantity-only items do not accept asset tags.'; end if;
   line_no:=line_no+1;movement_lines:=movement_lines||jsonb_build_array(jsonb_build_object('lineNo',line_no,'itemId',line.item_id,'locationId',line.location_id,'signedQuantity',line.accepted_quantity,'unitCost',line.agreed_price));
  elsif tracking='individually_tagged' then
   if line.accepted_quantity<>trunc(line.accepted_quantity) or line.accepted_quantity<>coalesce(cardinality(line.asset_tags),0) then raise exception using errcode='55000',message='Tagged receipts require one unique tag per whole accepted unit.'; end if;
   tags:=line.asset_tags;
   if cardinality(tags)<>(select count(distinct x) from unnest(tags) x) then raise exception using errcode='22023',message='Duplicate asset tag.'; end if;
   foreach tag in array tags loop
    insert into public.inv_inventory_assets(tenant_id,item_id,asset_tag,acquisition_cost,acquired_at,location_id,status) values(p_tenant,line.item_id,btrim(tag),line.agreed_price,coalesce(report.delivered_on,current_date),line.location_id,'in_stock') returning id into asset_id;
    line_no:=line_no+1;movement_lines:=movement_lines||jsonb_build_array(jsonb_build_object('lineNo',line_no,'itemId',line.item_id,'locationId',line.location_id,'signedQuantity',1,'unitCost',line.agreed_price,'assetId',asset_id));
   end loop;
  else raise exception using errcode='55000',message='Item tracking setup is unsupported.';
  end if;
 end loop;
 if accepted_total=0 then return null; end if;
 movement:=public.inv_post_stock_movement_core(p_tenant,p_actor,'receipt','inventory_procurement',p_report::text,'procurement:receipt:'||p_report::text,'Accepted inspection receipt',movement_lines);
 return (movement->>'movementId')::uuid;
end $$;

create function public.inv_receiving_command(p_tenant uuid,p_actor uuid,p_kind text,p_id uuid,p_version bigint,p_input jsonb) returns jsonb
language plpgsql set search_path=public,pg_temp as $$
declare po public.inv_purchase_orders%rowtype; report public.inv_inspection_reports%rowtype; il public.inv_inspection_report_lines%rowtype; source public.inv_purchase_order_lines%rowtype; entry record; new_id uuid; receipt_id uuid; document_date date; quantity numeric; accepted numeric; damaged numeric; rejected numeric; used numeric; tags text[]; new_version bigint; reference_value text; reason_value text; evidence_value text; candidate_count integer;
begin
 if p_kind='recordDelivery' then
  perform public.inv_read_object(p_input,array['deliveredOn','reference','replacementOfReportId','lines']);
  select * into po from public.inv_purchase_orders where tenant_id=p_tenant and id=p_id for update;
  if not found then raise exception using errcode='P0002',message='Purchase order is unavailable.'; end if;
  perform public.inv_procurement_version(po.version,p_version);
  if po.status not in ('dispatched','partially_received') or po.dispatched_at is null then raise exception using errcode='55000',message='A dispatched purchase order is required.'; end if;
  document_date:=public.inv_procurement_date(p_input->>'deliveredOn');if document_date<(po.dispatched_at at time zone 'Asia/Manila')::date then raise exception using errcode='22023',message='Delivery date precedes dispatch.'; end if;
  reference_value:=public.inv_procurement_text(p_input,'reference',500);
  if exists(select 1 from public.inv_inspection_reports r where r.tenant_id=p_tenant and r.purchase_order_id=po.id and lower(r.delivery_reference)=lower(reference_value)) then raise exception using errcode='23505',message='Delivery reference already exists.'; end if;
  new_id:=gen_random_uuid();
  insert into public.inv_inspection_reports(id,tenant_id,purchase_order_id,delivery_reference,delivered_on,status,report_no,version,workflow_managed,created_by_user_id,replacement_of_report_id)
  values(new_id,p_tenant,po.id,reference_value,document_date,'pending',public.inv_next_document_number(p_tenant,'IR',document_date),1,true,p_actor,nullif(p_input->>'replacementOfReportId','')::uuid);
  for entry in select * from public.inv_procurement_lines(p_input->'lines',array['purchaseOrderLineId','quantity','replacementOfLineId']) loop
   select * into source from public.inv_purchase_order_lines where tenant_id=p_tenant and id=(entry.value->>'purchaseOrderLineId')::uuid and purchase_order_id=po.id;
   if not found then raise exception using errcode='P0002',message='Purchase order line is unavailable.'; end if;
   quantity:=public.inv_procurement_decimal(entry.value->'quantity',(public.inv_procurement_item_snapshot(p_tenant,source.item_id)->>'quantityPrecision')::integer);
   if p_input ? 'replacementOfReportId' then
    select * into il from public.inv_inspection_report_lines where tenant_id=p_tenant and id=nullif(entry.value->>'replacementOfLineId','')::uuid and inspection_report_id=(p_input->>'replacementOfReportId')::uuid and purchase_order_line_id=source.id for update;
    if not found then raise exception using errcode='P0002',message='Replacement source line is unavailable.'; end if;
    if (select status from public.inv_inspection_reports where tenant_id=p_tenant and id=il.inspection_report_id) not in ('inspected','accepted','reconciliation_required') then raise exception using errcode='55000',message='Replacement source must be inspected.'; end if;
    select coalesce(sum(x.delivered_quantity),0) into used from public.inv_inspection_report_lines x join public.inv_inspection_reports r on r.tenant_id=p_tenant and r.id=x.inspection_report_id where x.tenant_id=p_tenant and x.replacement_of_line_id=il.id;
    if quantity>il.rejected_quantity-used then raise exception using errcode='55000',message='Replacement exceeds rejected capacity.'; end if;
   else
    if entry.value ? 'replacementOfLineId' then raise exception using errcode='22023',message='Unexpected replacement line.'; end if;
    select coalesce(sum(x.delivered_quantity),0) into used from public.inv_inspection_report_lines x join public.inv_inspection_reports r on r.tenant_id=p_tenant and r.id=x.inspection_report_id where x.tenant_id=p_tenant and x.purchase_order_line_id=source.id and r.replacement_of_report_id is null;
    if quantity>source.quantity-used then raise exception using errcode='55000',message='Delivery exceeds remaining ordered quantity.'; end if;
   end if;
   insert into public.inv_inspection_report_lines(tenant_id,inspection_report_id,purchase_order_line_id,delivered_quantity,unit_cost,item_snapshot,replacement_of_line_id) values(p_tenant,new_id,source.id,quantity,source.agreed_price,source.item_snapshot,nullif(entry.value->>'replacementOfLineId','')::uuid);
  end loop;
  update public.inv_purchase_orders set status='partially_received',version=version+1 where tenant_id=p_tenant and id=po.id returning version into new_version;
  return jsonb_build_object('id',new_id,'kind','inspection','version',1,'parentVersion',new_version,'reference',reference_value,'status','pending');
 end if;
 select * into report from public.inv_inspection_reports where tenant_id=p_tenant and id=p_id for update;
 if not found then raise exception using errcode='P0002',message='Inspection report is unavailable.'; end if;
 perform public.inv_procurement_version(report.version,p_version);
 if p_kind='recordInspection' then
  perform public.inv_read_object(p_input,array['inspectedOn','findings','lines']);if report.status<>'pending' or not report.workflow_managed then raise exception using errcode='55000',message='Pending managed delivery is required.'; end if;
  document_date:=public.inv_procurement_date(p_input->>'inspectedOn');if document_date<report.delivered_on then raise exception using errcode='22023',message='Inspection date precedes delivery.'; end if;
  for entry in select * from public.inv_procurement_lines(p_input->'lines',array['inspectionLineId','acceptedQuantity','damagedQuantity','rejectedQuantity','locationId','assetTags']) loop
   select * into il from public.inv_inspection_report_lines where tenant_id=p_tenant and id=(entry.value->>'inspectionLineId')::uuid and inspection_report_id=report.id for update;
   if not found then raise exception using errcode='P0002',message='Inspection line is unavailable.'; end if;
   select * into source from public.inv_purchase_order_lines where tenant_id=p_tenant and id=il.purchase_order_line_id;
   accepted:=public.inv_procurement_decimal(entry.value->'acceptedQuantity',(public.inv_procurement_item_snapshot(p_tenant,source.item_id)->>'quantityPrecision')::integer,true);
   damaged:=public.inv_procurement_decimal(entry.value->'damagedQuantity',(public.inv_procurement_item_snapshot(p_tenant,source.item_id)->>'quantityPrecision')::integer,true);
   rejected:=public.inv_procurement_decimal(entry.value->'rejectedQuantity',(public.inv_procurement_item_snapshot(p_tenant,source.item_id)->>'quantityPrecision')::integer,true);
   if accepted+damaged+rejected<>il.delivered_quantity then raise exception using errcode='22023',message='Inspection quantities must account for the delivery.'; end if;
   if not exists(select 1 from public.inv_storage_locations l where l.tenant_id=p_tenant and l.id=(entry.value->>'locationId')::uuid and l.active) then raise exception using errcode='P0002',message='Receiving location is unavailable.'; end if;
   if entry.value ? 'assetTags' then select array_agg(x) into tags from jsonb_array_elements_text(entry.value->'assetTags') x; else tags:=null; end if;
   update public.inv_inspection_report_lines set accepted_quantity=accepted,damaged_quantity=damaged,rejected_quantity=rejected,location_id=(entry.value->>'locationId')::uuid,asset_tags=tags where tenant_id=p_tenant and id=il.id;
  end loop;
  if (select count(*) from public.inv_inspection_report_lines where tenant_id=p_tenant and inspection_report_id=report.id)<>jsonb_array_length(p_input->'lines') then raise exception using errcode='22023',message='Every delivery line must be inspected.'; end if;
  update public.inv_inspection_reports set status='inspected',inspected_at=document_date::timestamp at time zone 'Asia/Manila',acknowledged_by_user_id=p_actor,findings=public.inv_procurement_text(p_input,'findings',2000),version=version+1 where tenant_id=p_tenant and id=report.id returning version into new_version;
  return jsonb_build_object('id',report.id,'kind','inspection','version',new_version,'parentVersion',(select version from public.inv_purchase_orders where tenant_id=p_tenant and id=report.purchase_order_id),'reference',report.report_no,'status','inspected');
 end if;
 if p_kind in ('acceptInspection','postAcceptedReceipt') then
  if not report.workflow_managed then raise exception using errcode='55000',message='Historical accepted receipts require reconciliation.'; end if;
  if report.status='accepted' and report.receipt_movement_id is not null then return jsonb_build_object('id',report.id,'kind','inspection','version',report.version,'reference',report.report_no,'status','accepted'); end if;
  if report.status<>'inspected' then raise exception using errcode='55000',message='Completed inspection is required.'; end if;
  if p_kind='acceptInspection' then perform public.inv_read_object(p_input,array['acceptedOn','reference']);document_date:=public.inv_procurement_date(p_input->>'acceptedOn');if document_date<(report.inspected_at at time zone 'Asia/Manila')::date then raise exception using errcode='22023',message='Acceptance date precedes inspection.'; end if;reference_value:=public.inv_procurement_text(p_input,'reference',500);else perform public.inv_read_object(p_input,array[]::text[]);end if;
  receipt_id:=public.inv_post_inspection_receipt(p_tenant,p_actor,report.id);
  update public.inv_inspection_reports set status='accepted',accepted_by_user_id=p_actor,accepted_at=coalesce(document_date::timestamp at time zone 'Asia/Manila',now()),receipt_movement_id=receipt_id,receipt_resolution=case when receipt_id is null then 'all_rejected' else 'posted' end,version=version+1 where tenant_id=p_tenant and id=report.id returning version into new_version;
  return jsonb_build_object('id',report.id,'kind','inspection','version',new_version,'reference',report.report_no,'status','accepted');
 end if;
 if p_kind='recordSupplierReturn' then
  perform public.inv_read_object(p_input,array['inspectionLineId','quantity','returnedOn','reference','reason']);
  select * into il from public.inv_inspection_report_lines where tenant_id=p_tenant and id=(p_input->>'inspectionLineId')::uuid and inspection_report_id=report.id for update;
  if not found then raise exception using errcode='P0002',message='Rejected inspection line is unavailable.'; end if;
  quantity:=public.inv_procurement_decimal(p_input->'quantity',6);select coalesce(sum(r.quantity),0) into used from public.inv_supplier_returns r where r.tenant_id=p_tenant and r.inspection_line_id=il.id and r.status<>'cancelled';
  if quantity>il.rejected_quantity-used then raise exception using errcode='55000',message='Supplier return exceeds rejected capacity.'; end if;
  reference_value:=public.inv_procurement_text(p_input,'reference',500);reason_value:=public.inv_procurement_text(p_input,'reason',500);document_date:=public.inv_procurement_date(p_input->>'returnedOn');
  insert into public.inv_supplier_returns(tenant_id,inspection_line_id,quantity,return_reference,returned_at,status,created_by_user_id,reason) values(p_tenant,il.id,quantity,reference_value,document_date::timestamp at time zone 'Asia/Manila','recorded',p_actor,reason_value);
  update public.inv_inspection_reports set version=version+1 where tenant_id=p_tenant and id=report.id returning version into new_version;
  return jsonb_build_object('id',report.id,'kind','inspection','version',new_version,'reference',reference_value,'status',report.status);
 end if;
 if p_kind='reconcileHistoricalReceipt' then
  perform public.inv_read_object(p_input,array['mode','movementId','reason','evidence']);if report.workflow_managed or report.status<>'accepted' or report.receipt_movement_id is not null then raise exception using errcode='55000',message='An unlinked historical accepted report is required.'; end if;
  reason_value:=public.inv_procurement_text(p_input,'reason',500);evidence_value:=public.inv_procurement_text(p_input,'evidence',2000);
  if p_input->>'mode'='linkExistingMovement' then
   receipt_id:=(p_input->>'movementId')::uuid;
   select count(*) into candidate_count from public.inv_stock_movements m where m.tenant_id=p_tenant and m.source_type='inventory_procurement' and m.source_reference=report.id::text and m.movement_type='receipt' and m.posted_at is not null;
   if candidate_count<>1 or not exists(select 1 from public.inv_stock_movements m where m.tenant_id=p_tenant and m.id=receipt_id and m.source_type='inventory_procurement' and m.source_reference=report.id::text and m.movement_type='receipt' and m.posted_at is not null) then raise exception using errcode='55000',message='A unique proven receipt movement is required.'; end if;
   if exists(
    with expected as (select ol.item_id,exl.location_id,sum(exl.accepted_quantity) quantity,ol.agreed_price unit_cost from public.inv_inspection_report_lines exl join public.inv_purchase_order_lines ol on ol.tenant_id=p_tenant and ol.id=exl.purchase_order_line_id where exl.tenant_id=p_tenant and exl.inspection_report_id=report.id and exl.accepted_quantity>0 group by ol.item_id,exl.location_id,ol.agreed_price),
    actual as (select ml.item_id,ml.location_id,sum(ml.signed_quantity) quantity,ml.unit_cost from public.inv_stock_movement_lines ml where ml.tenant_id=p_tenant and ml.movement_id=receipt_id group by ml.item_id,ml.location_id,ml.unit_cost)
    select 1 from expected full join actual using(item_id,location_id,unit_cost) where expected.quantity is distinct from actual.quantity
   ) then raise exception using errcode='55000',message='Receipt movement does not exactly match the accepted report.'; end if;
  elsif p_input->>'mode'='confirmUnposted' then
   if exists(select 1 from public.inv_stock_movements m where m.tenant_id=p_tenant and m.source_reference=report.id::text and m.posted_at is not null) then raise exception using errcode='55000',message='Existing receipt evidence is ambiguous.'; end if;
   receipt_id:=public.inv_post_inspection_receipt(p_tenant,p_actor,report.id);
  else raise exception using errcode='22023',message='Invalid reconciliation mode.';
  end if;
  update public.inv_inspection_reports set receipt_movement_id=receipt_id,receipt_resolution=p_input->>'mode',reconciliation_mode=p_input->>'mode',reconciliation_reason=reason_value,reconciliation_evidence=evidence_value,reconciled_by_user_id=p_actor,reconciled_at=now(),version=version+1 where tenant_id=p_tenant and id=report.id returning version into new_version;
  return jsonb_build_object('id',report.id,'kind','inspection','version',new_version,'reference',report.report_no,'status','accepted');
 end if;
 raise exception using errcode='22023',message='Unsupported receiving command.';
end $$;

create or replace function public.inv_execute_procurement_command(p_tenant_id uuid,p_actor_user_id uuid,p_kind text,p_document_id uuid,p_expected_version bigint,p_idempotency_key text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare outcome jsonb;
begin
 perform public.inv_require_procurement_access(p_tenant_id,p_actor_user_id,p_kind in ('reassignPendingReviewer','reconcileHistoricalReceipt'),true);
 if p_kind not in ('createMaterialRequest','editMaterialRequest','approveMaterialRequest','createAdditionalMaterialRequest','createQuotation','createPurchaseRequest','revisePurchaseRequest','submitPurchaseRequest','reviewPurchaseRequest','reassignPendingReviewer','createPurchaseOrder','dispatchPurchaseOrder','recordDelivery','recordInspection','acceptInspection','postAcceptedReceipt','recordSupplierReturn','reconcileHistoricalReceipt') then raise exception using errcode='22023',message='Unsupported procurement command.'; end if;
 outcome:=public.inv_begin_procurement_command(p_tenant_id,p_actor_user_id,p_kind,p_idempotency_key,jsonb_build_object('id',p_document_id,'expectedVersion',p_expected_version,'input',p_input));if outcome is not null then return outcome;end if;
 perform pg_advisory_xact_lock(hashtextextended('inventory-procurement:'||p_tenant_id::text,0));
 perform public.inv_require_procurement_access(p_tenant_id,p_actor_user_id,p_kind in ('reassignPendingReviewer','reconcileHistoricalReceipt'),true);
 if p_kind in ('recordDelivery','recordInspection','acceptInspection','postAcceptedReceipt','recordSupplierReturn','reconcileHistoricalReceipt') then outcome:=public.inv_receiving_command(p_tenant_id,p_actor_user_id,p_kind,p_document_id,p_expected_version,p_input);else outcome:=public.inv_document_command(p_tenant_id,p_actor_user_id,p_kind,p_document_id,p_expected_version,p_input);end if;
 outcome:=outcome||jsonb_build_object('replayed',false,'invalidations',jsonb_build_array('dashboard','procurement','inventory','movements','references'));
 perform public.inv_procurement_event(p_tenant_id,p_actor_user_id,outcome->>'kind',(outcome->>'id')::uuid,p_kind,null,jsonb_build_object('input',p_input,'version',outcome->'version'));
 update public.inv_procurement_commands set result=outcome where tenant_id=p_tenant_id and kind=p_kind and idempotency_key=btrim(p_idempotency_key);return outcome;
end $$;
revoke all on function public.inv_post_inspection_receipt(uuid,uuid,uuid),public.inv_receiving_command(uuid,uuid,text,uuid,bigint,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.inv_execute_procurement_command(uuid,uuid,text,uuid,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.inv_execute_procurement_command(uuid,uuid,text,uuid,bigint,text,jsonb) to service_role;
