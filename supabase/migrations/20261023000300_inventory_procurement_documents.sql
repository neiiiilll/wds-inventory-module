-- Inventory-only document state machine. Existing records remain historical.
alter table public.inv_material_request_lines add column workflow_active boolean not null default true;
alter table public.inv_supplier_quotation_lines add column material_request_line_id uuid,
 add constraint inv_quote_source_workflow_fk foreign key(tenant_id,material_request_line_id) references public.inv_material_request_lines(tenant_id,id);
alter table public.inv_purchase_request_lines add column quotation_line_id uuid,add column material_request_line_id uuid,
 add constraint inv_pr_quote_source_workflow_fk foreign key(tenant_id,quotation_line_id) references public.inv_supplier_quotation_lines(tenant_id,id),
 add constraint inv_pr_requirement_source_workflow_fk foreign key(tenant_id,material_request_line_id) references public.inv_material_request_lines(tenant_id,id);
alter table public.inv_purchase_order_lines add column purchase_request_line_id uuid,
 add constraint inv_po_pr_source_workflow_fk foreign key(tenant_id,purchase_request_line_id) references public.inv_purchase_request_lines(tenant_id,id);
alter table public.inv_supplier_quotations add column supplier_snapshot jsonb;
alter table public.inv_purchase_requests add column supplier_snapshot jsonb;
alter table public.inv_purchase_requests add column approved_by_user_id uuid references public.app_users(id),add column approved_at timestamptz,add column approval_reference text;
alter table public.inv_purchase_orders add column supplier_snapshot jsonb;
alter table public.inv_purchase_orders add column dispatched_at timestamptz,add column dispatch_reference text,add column dispatch_method text,add column dispatch_recipient text,add column dispatch_reason text,add column dispatched_by_user_id uuid references public.app_users(id);
create unique index inv_one_managed_pr_per_mr on public.inv_purchase_requests(tenant_id,material_request_id) where workflow_managed;
create index inv_pr_line_requirement_workflow_idx on public.inv_purchase_request_lines(tenant_id,material_request_line_id);
create index inv_po_line_pr_workflow_idx on public.inv_purchase_order_lines(tenant_id,purchase_request_line_id);

create function public.inv_procurement_text(p_input jsonb,p_key text,p_max integer,p_required boolean default true) returns text
language plpgsql immutable set search_path=public,pg_temp as $$
declare v text;
begin
 if p_input->p_key is null or p_input->p_key='null'::jsonb then
  if p_required then raise exception using errcode='22023',message='Required document text is missing.'; end if; return null;
 end if;
 if jsonb_typeof(p_input->p_key)<>'string' then raise exception using errcode='22023',message='Document text is invalid.'; end if;
 v:=btrim(p_input->>p_key);
 if length(v)>p_max or (p_required and v='') then raise exception using errcode='22023',message='Document text is invalid.'; end if;
 return nullif(v,'');
end $$;
create function public.inv_procurement_date(p_value text,p_default boolean default false) returns date
language plpgsql stable set search_path=public,pg_temp as $$
begin
 if p_value is null and p_default then return (now() at time zone 'Asia/Manila')::date; end if;
 if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}$' then raise exception using errcode='22023',message='Invalid document date.'; end if;
 return p_value::date;
end $$;
create function public.inv_procurement_decimal(p_value jsonb,p_precision integer,p_zero boolean default false) returns numeric
language plpgsql immutable set search_path=public,pg_temp as $$
declare v numeric; text_value text;
begin
 text_value:=p_value#>>'{}';
 if jsonb_typeof(p_value) not in ('string','number') or text_value is null or length(text_value)>32 or text_value !~ '^[0-9]+([.][0-9]{1,6})?$' then raise exception using errcode='22023',message='Invalid quantity or price.'; end if;
 v:=text_value::numeric;
 if (not p_zero and v<=0) or v<0 or v<>round(v,p_precision) then raise exception using errcode='22023',message='Invalid quantity precision or price.'; end if;
 return v;
end $$;
create function public.inv_procurement_version(p_actual bigint,p_expected bigint) returns void
language plpgsql immutable set search_path=public,pg_temp as $$
begin
 if p_expected is null or p_expected<1 or p_expected>9007199254740991 then raise exception using errcode='22023',message='A current version is required.'; end if;
 if p_actual<>p_expected then raise exception using errcode='40001',message='The document changed.'; end if;
end $$;
create function public.inv_procurement_lines(p_lines jsonb,p_keys text[]) returns table(n integer,value jsonb)
language plpgsql immutable set search_path=public,pg_temp as $$
declare entry record;
begin
 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 200 then raise exception using errcode='22023',message='Use 1 to 200 document lines.'; end if;
 for entry in select a.value,a.ordinality from jsonb_array_elements(p_lines) with ordinality a loop
  perform public.inv_read_object(entry.value,p_keys); n:=entry.ordinality::integer;value:=entry.value;return next;
 end loop;
end $$;
create function public.inv_procurement_item_snapshot(p_tenant uuid,p_item uuid) returns jsonb
language plpgsql stable set search_path=public,pg_temp as $$
declare snapshot jsonb;
begin
 select jsonb_build_object('itemId',i.id,'itemCode',i.item_code,'name',i.name,'unitId',u.id,'unitName',u.name,'unitSymbol',u.symbol,'quantityPrecision',u.quantity_precision,'itemVersion',i.version,'costMethod',i.cost_method) into snapshot
 from public.inv_inventory_items i join public.inv_units u on u.tenant_id=p_tenant and u.id=i.unit_id and u.active where i.tenant_id=p_tenant and i.id=p_item and i.active;
 if snapshot is null then raise exception using errcode='P0002',message='Inventory item is unavailable.'; end if; return snapshot;
end $$;
create function public.inv_procurement_same_identity(p_snapshot jsonb,p_current jsonb) returns boolean
language sql immutable set search_path=public,pg_temp as $$
 select p_snapshot is not null and jsonb_build_array(p_snapshot->'itemId',p_snapshot->'itemCode',p_snapshot->'name',p_snapshot->'unitId',p_snapshot->'unitName',p_snapshot->'unitSymbol',p_snapshot->'quantityPrecision')=jsonb_build_array(p_current->'itemId',p_current->'itemCode',p_current->'name',p_current->'unitId',p_current->'unitName',p_current->'unitSymbol',p_current->'quantityPrecision')
$$;
create function public.inv_procurement_supplier_snapshot(p_tenant uuid,p_supplier uuid) returns jsonb
language plpgsql stable set search_path=public,pg_temp as $$
declare snapshot jsonb;
begin
 select jsonb_build_object('id',s.id,'code',s.supplier_code,'name',s.name,'address',s.address,'contactName',s.contact_name,'email',s.contact_email,'phone',s.contact_phone) into snapshot from public.inv_suppliers s where s.tenant_id=p_tenant and s.id=p_supplier and s.active;
 if snapshot is null then raise exception using errcode='P0002',message='Inventory supplier is unavailable.'; end if;return snapshot;
end $$;
create function public.inv_procurement_event(p_tenant uuid,p_actor uuid,p_kind text,p_id uuid,p_action text,p_reason text,p_details jsonb default '{}') returns void
language sql set search_path=public,pg_temp as $$
 insert into public.inv_procurement_events(tenant_id,document_kind,document_id,action,actor_user_id,reason,details) values(p_tenant,p_kind,p_id,p_action,p_actor,p_reason,coalesce(p_details,'{}'))
$$;
create function public.inv_procurement_reviewer(p_tenant uuid,p_user uuid) returns uuid
language plpgsql stable set search_path=public,pg_temp as $$
declare membership uuid;
begin
 perform public.inv_require_procurement_access(p_tenant,p_user,false,true);
 select m.id into strict membership from public.tenant_memberships m where m.tenant_id=p_tenant and m.user_id=p_user and m.status='active';return membership;
end $$;
create function public.inv_procurement_requirement_unissued(p_tenant uuid,p_request uuid,p_item uuid) returns numeric
language sql stable set search_path=public,pg_temp as $$
 select coalesce(sum(r.quantity),0)-coalesce(sum((select coalesce(sum(ret.quantity),0) from public.inv_material_returns ret join public.inv_stock_movements rm on rm.tenant_id=p_tenant and rm.id=ret.movement_id and rm.posted_at is not null where ret.tenant_id=p_tenant and ret.release_id=r.id and ret.accepted and lower(ret.condition)='usable')),0)
 from public.inv_ris_releases r join public.inv_requisition_issue_slip_lines rl on rl.tenant_id=p_tenant and rl.id=r.ris_line_id join public.inv_requisition_issue_slips ris on ris.tenant_id=p_tenant and ris.id=rl.ris_id
 join public.inv_stock_movement_lines ml on ml.tenant_id=p_tenant and ml.id=r.movement_line_id join public.inv_stock_movements m on m.tenant_id=p_tenant and m.id=ml.movement_id and m.posted_at is not null
 where r.tenant_id=p_tenant and ris.material_request_id=p_request and rl.item_id=p_item
$$;

create function public.inv_prepare_purchase_request(p_tenant uuid,p_request uuid,p_input jsonb,p_existing_pr uuid default null) returns jsonb
language plpgsql set search_path=public,pg_temp as $$
declare mr public.inv_material_requests%rowtype; quote public.inv_supplier_quotations%rowtype; quoted record; line record; reviewer jsonb; memberships jsonb:='[]'; lines jsonb:='[]'; seen uuid[]:='{}'; source_id uuid; amount numeric; reserved numeric; remaining numeric; requested_date date; snapshot jsonb;
begin
 select * into mr from public.inv_material_requests r where r.tenant_id=p_tenant and r.id=p_request;
 if not found then raise exception using errcode='P0002',message='Material request is unavailable.'; end if;
 if not mr.workflow_managed or mr.approved_by_user_id is null or mr.status<>'approved' then raise exception using errcode='55000',message='Current approval is required.'; end if;
 select * into quote from public.inv_supplier_quotations q where q.tenant_id=p_tenant and q.id=(p_input->>'quotationId')::uuid and q.material_request_id=p_request;
 if not found then raise exception using errcode='P0002',message='Quotation is unavailable.'; end if;
 requested_date:=public.inv_procurement_date(p_input->>'requestedOn');
 if not quote.workflow_managed or quote.request_revision<>mr.workflow_revision or quote.status<>'recorded' or requested_date<quote.quoted_on or (quote.valid_until is not null and (requested_date>quote.valid_until or quote.valid_until<(now() at time zone 'Asia/Manila')::date)) then raise exception using errcode='55000',message='Quotation is stale or expired.'; end if;
 perform public.inv_procurement_supplier_snapshot(p_tenant,quote.supplier_id);
 if jsonb_typeof(p_input->'reviewers') is distinct from 'array' or jsonb_array_length(p_input->'reviewers')<>4 then raise exception using errcode='22023',message='Assign four reviewers.'; end if;
 for reviewer in select value from jsonb_array_elements(p_input->'reviewers') loop
  memberships:=memberships||jsonb_build_array(public.inv_procurement_reviewer(p_tenant,(reviewer#>>'{}')::uuid));
 end loop;
 for line in select * from public.inv_procurement_lines(p_input->'lines',array['quotationLineId','quantity']) loop
  source_id:=(line.value->>'quotationLineId')::uuid;
  if source_id is null or source_id=any(seen) then raise exception using errcode='22023',message='Duplicate or invalid quotation line.'; end if;seen:=array_append(seen,source_id);
  select ql.*,rl.quantity as required_quantity,rl.workflow_active,rl.material_request_id,rl.specification into quoted
   from public.inv_supplier_quotation_lines ql join public.inv_material_request_lines rl on rl.tenant_id=p_tenant and rl.id=ql.material_request_line_id
   where ql.tenant_id=p_tenant and ql.id=source_id and ql.quotation_id=quote.id and rl.material_request_id=p_request;
  if not found then raise exception using errcode='P0002',message='Quotation line is unavailable.'; end if;
  snapshot:=public.inv_procurement_item_snapshot(p_tenant,quoted.item_id);
  if not quoted.workflow_active or not public.inv_procurement_same_identity(quoted.item_snapshot,snapshot) then raise exception using errcode='55000',message='Quotation identity changed.'; end if;
  amount:=public.inv_procurement_decimal(line.value->'quantity',(snapshot->>'quantityPrecision')::integer);
  select coalesce(sum(pl.quantity),0) into reserved from public.inv_purchase_request_lines pl join public.inv_purchase_requests pr on pr.tenant_id=p_tenant and pr.id=pl.purchase_request_id where pl.tenant_id=p_tenant and pl.material_request_line_id=quoted.material_request_line_id and pr.status in ('submitted','approved') and (p_existing_pr is null or pr.id<>p_existing_pr);
  remaining:=quoted.required_quantity-greatest(0,public.inv_procurement_requirement_unissued(p_tenant,p_request,quoted.item_id))-reserved;
  if amount>quoted.quantity or amount>remaining then raise exception using errcode='55000',message='Quantity exceeds the unfulfilled requirement.'; end if;
  lines:=lines||jsonb_build_array(jsonb_build_object('lineNo',line.n,'itemId',quoted.item_id,'quotationLineId',quoted.id,'materialRequestLineId',quoted.material_request_line_id,'quantity',amount::text,'unitPrice',quoted.unit_price::text,'snapshot',quoted.item_snapshot));
 end loop;
 return jsonb_build_object('quotationId',quote.id,'requestedOn',requested_date,'selectionReason',public.inv_procurement_text(p_input,'selectionReason',500),'reviewerMemberships',memberships,'lines',lines);
end $$;

create function public.inv_document_command(p_tenant uuid,p_actor uuid,p_kind text,p_id uuid,p_version bigint,p_input jsonb) returns jsonb
language plpgsql set search_path=public,pg_temp as $$
declare role_key text; mr public.inv_material_requests%rowtype; parent public.inv_material_requests%rowtype; quote public.inv_supplier_quotations%rowtype; pr public.inv_purchase_requests%rowtype; po public.inv_purchase_orders%rowtype; step public.inv_procurement_review_steps%rowtype;
 line record; source record; data jsonb; snapshot jsonb; supplier jsonb; before_data jsonb; input_lines jsonb; route jsonb; result jsonb; seen uuid[]:='{}'; seen_numbers integer[]:='{}'; item_id_value uuid; line_id uuid; reviewer_user uuid; requester_person uuid; requester_user uuid; requester_name_value text; actor_name text; job_value text; reason_value text; reference_value text; new_id uuid; number_value text; amount numeric; reserved numeric; document_date date; remaining numeric; new_version bigint; parent_version bigint; line_number integer; row_count integer; current_step integer; same_content boolean;
begin
 role_key:=public.inv_require_procurement_access(p_tenant,p_actor,p_kind='reassignPendingReviewer',true);
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception using errcode='22023',message='Expected command input.'; end if;
 select coalesce(nullif(u.display_name,''),'Inventory user') into actor_name from public.app_users u where u.id=p_actor;

 if p_kind in ('createMaterialRequest','createAdditionalMaterialRequest','editMaterialRequest','approveMaterialRequest') then
  if p_kind not in ('createMaterialRequest') then
   select * into mr from public.inv_material_requests r where r.tenant_id=p_tenant and r.id=p_id for update;
   if not found then raise exception using errcode='P0002',message='Material request is unavailable.'; end if;
   perform public.inv_procurement_version(mr.version,p_version);
  end if;
  if p_kind='approveMaterialRequest' then
   perform public.inv_read_object(p_input,array['reference']);
   if mr.status not in ('draft','submitted','approved') or (mr.workflow_managed and mr.approved_by_user_id is not null) or exists(select 1 from public.inv_purchase_requests r where r.tenant_id=p_tenant and r.material_request_id=mr.id) or exists(select 1 from public.inv_requisition_issue_slips r where r.tenant_id=p_tenant and r.material_request_id=mr.id) then raise exception using errcode='55000',message='Requirement already progressed.'; end if;
   if nullif(btrim(mr.job),'') is null then raise exception using errcode='55000',message='Complete the requirement before approval.'; end if;
   for source in select * from public.inv_material_request_lines l where l.tenant_id=p_tenant and l.material_request_id=mr.id and l.workflow_active order by l.line_no loop
    if source.item_id is null or source.item_id=any(seen) or nullif(btrim(source.specification),'') is null then raise exception using errcode='55000',message='Resolve requirement lines before approval.'; end if;seen:=array_append(seen,source.item_id);
    snapshot:=public.inv_procurement_item_snapshot(p_tenant,source.item_id);perform public.inv_procurement_decimal(to_jsonb(source.quantity::text),(snapshot->>'quantityPrecision')::integer);
    if source.item_snapshot is not null and not public.inv_procurement_same_identity(source.item_snapshot,snapshot) then raise exception using errcode='55000',message='Revise changed item identity before approval.'; end if;
    update public.inv_material_request_lines set item_snapshot=coalesce(item_snapshot,snapshot||jsonb_build_object('specification',source.specification)) where tenant_id=p_tenant and id=source.id;
   end loop;
   if cardinality(seen)=0 then raise exception using errcode='55000',message='Requirement lines are missing.'; end if;
   reference_value:=public.inv_procurement_text(p_input,'reference',500);
   update public.inv_material_requests set status='approved',workflow_managed=true,approved_by_user_id=p_actor,approved_at=now(),approval_reference=reference_value,version=version+1 where tenant_id=p_tenant and id=mr.id returning version into new_version;
   return jsonb_build_object('id',mr.id,'kind','material_request','version',new_version,'reference',mr.request_no,'status','approved');
  end if;
  if p_kind='editMaterialRequest' then
   perform public.inv_read_object(p_input,array['job','requesterPersonnelId','lines','reason']);reason_value:=public.inv_procurement_text(p_input,'reason',500);
   if mr.status not in ('draft','submitted','approved') or exists(select 1 from public.inv_purchase_requests r where r.tenant_id=p_tenant and r.material_request_id=mr.id) or exists(select 1 from public.inv_requisition_issue_slips r where r.tenant_id=p_tenant and r.material_request_id=mr.id) then raise exception using errcode='55000',message='Requirement already progressed.'; end if;
  else
   perform public.inv_read_object(p_input,array['job','requesterPersonnelId','requestedOn','lines']);
  end if;
  job_value:=public.inv_procurement_text(p_input,'job',500,false);
  if p_kind='createAdditionalMaterialRequest' then
   if job_value is distinct from mr.job then raise exception using errcode='55000',message='Additional requests must preserve the job.'; end if;parent:=mr;
  end if;
  if p_kind='editMaterialRequest' and ((mr.parent_request_id is not null and job_value is distinct from (select r.job from public.inv_material_requests r where r.tenant_id=p_tenant and r.id=mr.parent_request_id)) or (job_value is distinct from mr.job and exists(select 1 from public.inv_material_requests r where r.tenant_id=p_tenant and r.parent_request_id=mr.id))) then raise exception using errcode='55000',message='Linked job is locked.'; end if;
  requester_user:=case when p_kind='editMaterialRequest' then mr.requester_user_id else p_actor end;
  requester_person:=case when p_kind='editMaterialRequest' then mr.requester_personnel_id else null end;
  requester_name_value:=case when p_kind='editMaterialRequest' then coalesce(mr.requester_name,actor_name) else actor_name end;
  if p_input?'requesterPersonnelId' then
   select p.id,p.user_id,p.full_name into requester_person,requester_user,requester_name_value from public.personnel p where p.tenant_id=p_tenant and p.id=(p_input->>'requesterPersonnelId')::uuid and p.active;
   if not found then raise exception using errcode='P0002',message='Requester is unavailable.'; end if;
   if role_key<>'administrator' and (requester_user is distinct from p_actor or (p_kind='editMaterialRequest' and requester_person is distinct from mr.requester_personnel_id)) then raise exception using errcode='42501',message='Requester override is not permitted.'; end if;
  elsif p_kind<>'editMaterialRequest' then
   select count(*) into row_count from public.personnel p where p.tenant_id=p_tenant and p.user_id=p_actor and p.active;
   if row_count>1 then raise exception using errcode='55000',message='Requester linkage needs configuration.'; end if;
   if row_count=1 then select p.id,p.full_name into requester_person,requester_name_value from public.personnel p where p.tenant_id=p_tenant and p.user_id=p_actor and p.active; end if;
  end if;
  document_date:=case when p_kind='editMaterialRequest' then mr.requested_on else public.inv_procurement_date(p_input->>'requestedOn',true) end;
  if p_kind='editMaterialRequest' then
   new_id:=mr.id;number_value:=mr.request_no;
   select jsonb_build_object('job',mr.job,'requesterPersonnelId',mr.requester_personnel_id,'lines',coalesce(jsonb_agg(to_jsonb(l) order by l.line_no),'[]')) into before_data from public.inv_material_request_lines l where l.tenant_id=p_tenant and l.material_request_id=mr.id and l.workflow_active;
   update public.inv_material_request_lines set workflow_active=false where tenant_id=p_tenant and material_request_id=mr.id;
  else
   new_id:=gen_random_uuid();number_value:=public.inv_next_document_number(p_tenant,'MR',document_date);
   insert into public.inv_material_requests(id,tenant_id,request_no,requester_personnel_id,requester_user_id,requester_name,created_by_user_id,parent_request_id,job,requested_on,workflow_managed) values(new_id,p_tenant,number_value,requester_person,requester_user,requester_name_value,p_actor,case when p_kind='createAdditionalMaterialRequest' then parent.id else null end,job_value,document_date,true);
  end if;
  for line in select * from public.inv_procurement_lines(p_input->'lines',case when p_kind='editMaterialRequest' then array['itemId','quantity','specification'] else array['itemId','quantity','specification','lineNo'] end) loop
   item_id_value:=(line.value->>'itemId')::uuid;
   if item_id_value is null or item_id_value=any(seen) then raise exception using errcode='22023',message='Duplicate or invalid requirement item.'; end if;seen:=array_append(seen,item_id_value);
   snapshot:=public.inv_procurement_item_snapshot(p_tenant,item_id_value)||jsonb_build_object('specification',public.inv_procurement_text(line.value,'specification',1000,false));
   amount:=public.inv_procurement_decimal(line.value->'quantity',(snapshot->>'quantityPrecision')::integer);
   line_id:=null;
   if p_kind='editMaterialRequest' then select l.id into line_id from public.inv_material_request_lines l where l.tenant_id=p_tenant and l.material_request_id=new_id and l.item_id=item_id_value order by l.line_no limit 1; end if;
   if line_id is not null then
    update public.inv_material_request_lines set quantity=amount,specification=snapshot->>'specification',item_snapshot=snapshot,workflow_active=true where tenant_id=p_tenant and id=line_id;
   else
    line_number:=case when p_kind='editMaterialRequest' then (select coalesce(max(l.line_no),0)+1 from public.inv_material_request_lines l where l.tenant_id=p_tenant and l.material_request_id=new_id) else coalesce((line.value->>'lineNo')::integer,line.n) end;
    if line_number<1 or line_number=any(seen_numbers) then raise exception using errcode='22023',message='Invalid line number.'; end if;seen_numbers:=array_append(seen_numbers,line_number);
    insert into public.inv_material_request_lines(tenant_id,material_request_id,line_no,item_id,quantity,specification,item_snapshot) values(p_tenant,new_id,line_number,item_id_value,amount,snapshot->>'specification',snapshot);
   end if;
  end loop;
  if p_kind='editMaterialRequest' then
   update public.inv_material_requests set job=job_value,requester_personnel_id=requester_person,requester_user_id=requester_user,requester_name=requester_name_value,status='draft',approved_by_user_id=null,approved_at=null,approval_reference=null,workflow_revision=workflow_revision+1,workflow_managed=true,version=version+1 where tenant_id=p_tenant and id=new_id returning version into new_version;
   update public.inv_supplier_quotations set status='stale',version=version+1 where tenant_id=p_tenant and material_request_id=new_id and workflow_managed and status<>'stale';
   perform public.inv_procurement_event(p_tenant,p_actor,'material_request',new_id,'requirementRevision',reason_value,jsonb_build_object('before',before_data));
  else new_version:=1;end if;
  result:=jsonb_build_object('id',new_id,'kind','material_request','version',new_version,'reference',number_value,'status','draft');
  if p_kind='createAdditionalMaterialRequest' then
   update public.inv_material_requests set version=version+1 where tenant_id=p_tenant and id=parent.id returning version into parent_version;
   perform public.inv_procurement_event(p_tenant,p_actor,'material_request',parent.id,'additionalRequirement',null,jsonb_build_object('id',new_id,'reference',number_value));result:=result||jsonb_build_object('parentVersion',parent_version);
  end if;
  return result;
 end if;

 if p_kind='createQuotation' then
  perform public.inv_read_object(p_input,array['materialRequestId','supplierId','reference','quotedOn','validUntil','terms','lines']);
  select * into mr from public.inv_material_requests r where r.tenant_id=p_tenant and r.id=(p_input->>'materialRequestId')::uuid for update;
  if not found then raise exception using errcode='P0002',message='Requirement is unavailable.'; end if;
  if not mr.workflow_managed or mr.status<>'approved' or mr.approved_by_user_id is null or exists(select 1 from public.inv_purchase_requests r where r.tenant_id=p_tenant and r.material_request_id=mr.id and (not r.workflow_managed or r.status not in ('draft','returned'))) or exists(select 1 from public.inv_requisition_issue_slips r where r.tenant_id=p_tenant and r.material_request_id=mr.id) then raise exception using errcode='55000',message='Requirement is not open for quotations.'; end if;
  supplier:=public.inv_procurement_supplier_snapshot(p_tenant,(p_input->>'supplierId')::uuid);reference_value:=public.inv_procurement_text(p_input,'reference',500);document_date:=public.inv_procurement_date(p_input->>'quotedOn');
  if document_date<mr.requested_on or (p_input->>'validUntil' is not null and public.inv_procurement_date(p_input->>'validUntil')<document_date) then raise exception using errcode='22023',message='Invalid quotation dates.'; end if;
  if exists(select 1 from public.inv_supplier_quotations q where q.tenant_id=p_tenant and q.material_request_id=mr.id and q.supplier_id=(supplier->>'id')::uuid and lower(q.external_reference)=lower(reference_value)) then raise exception using errcode='40001',message='Quotation reference already exists.'; end if;
  new_id:=gen_random_uuid();number_value:=public.inv_next_document_number(p_tenant,'SQ',document_date);
  insert into public.inv_supplier_quotations(id,tenant_id,quotation_no,material_request_id,supplier_id,valid_until,terms,status,quoted_on,external_reference,request_revision,created_by_user_id,workflow_managed,supplier_snapshot) values(new_id,p_tenant,number_value,mr.id,(supplier->>'id')::uuid,(p_input->>'validUntil')::date,public.inv_procurement_text(p_input,'terms',2000,false),'recorded',document_date,reference_value,mr.workflow_revision,p_actor,true,supplier);
  for line in select * from public.inv_procurement_lines(p_input->'lines',array['materialRequestLineId','quantity','unitPrice']) loop
   line_id:=(line.value->>'materialRequestLineId')::uuid;if line_id is null or line_id=any(seen) then raise exception using errcode='22023',message='Invalid quotation line.'; end if;seen:=array_append(seen,line_id);
   select * into source from public.inv_material_request_lines l where l.tenant_id=p_tenant and l.id=line_id and l.material_request_id=mr.id and l.workflow_active;
   if not found then raise exception using errcode='P0002',message='Requirement line is unavailable.'; end if;
   snapshot:=public.inv_procurement_item_snapshot(p_tenant,source.item_id);
   if not public.inv_procurement_same_identity(source.item_snapshot,snapshot) then raise exception using errcode='55000',message='Requirement identity changed.'; end if;
   amount:=public.inv_procurement_decimal(line.value->'quantity',(snapshot->>'quantityPrecision')::integer);
   if amount>source.quantity then raise exception using errcode='55000',message='Quoted quantity exceeds the requirement.'; end if;
   insert into public.inv_supplier_quotation_lines(tenant_id,quotation_id,line_no,item_id,quantity,unit_price,item_snapshot,material_request_line_id) values(p_tenant,new_id,line.n,source.item_id,amount,public.inv_procurement_decimal(line.value->'unitPrice',6,true),source.item_snapshot,source.id);
  end loop;
  perform public.inv_procurement_event(p_tenant,p_actor,'material_request',mr.id,'quotationRecorded',null,jsonb_build_object('id',new_id,'reference',number_value));
  return jsonb_build_object('id',new_id,'kind','quotation','version',1,'reference',number_value,'status','recorded');
 end if;

 if p_kind in ('createPurchaseRequest','revisePurchaseRequest','submitPurchaseRequest','reviewPurchaseRequest','reassignPendingReviewer') then
  if p_kind='createPurchaseRequest' then
   perform public.inv_read_object(p_input,array['materialRequestId','quotationId','requestedOn','selectionReason','reviewers','lines']);
   select * into mr from public.inv_material_requests r where r.tenant_id=p_tenant and r.id=(p_input->>'materialRequestId')::uuid for update;
   if not found then raise exception using errcode='P0002',message='Requirement is unavailable.'; end if;
   if exists(select 1 from public.inv_purchase_requests r where r.tenant_id=p_tenant and r.material_request_id=mr.id) or exists(select 1 from public.inv_requisition_issue_slips r where r.tenant_id=p_tenant and r.material_request_id=mr.id) then raise exception using errcode='55000',message='Use a linked additional requirement after progression.'; end if;
   data:=public.inv_prepare_purchase_request(p_tenant,mr.id,p_input);
   select * into quote from public.inv_supplier_quotations q where q.tenant_id=p_tenant and q.id=(data->>'quotationId')::uuid;
   new_id:=gen_random_uuid();number_value:=public.inv_next_document_number(p_tenant,'PR',(data->>'requestedOn')::date);
   insert into public.inv_purchase_requests(id,tenant_id,request_no,material_request_id,quotation_id,status,revision,requested_on,selection_reason,requester_user_id,requester_name,created_by_user_id,workflow_managed,supplier_snapshot)
    values(new_id,p_tenant,number_value,mr.id,quote.id,'draft',1,(data->>'requestedOn')::date,data->>'selectionReason',mr.requester_user_id,mr.requester_name,p_actor,true,quote.supplier_snapshot) returning * into pr;
   perform public.inv_procurement_event(p_tenant,p_actor,'material_request',mr.id,'purchaseRequestCreated',null,jsonb_build_object('id',pr.id,'reference',number_value));
  else
   select r.material_request_id into item_id_value from public.inv_purchase_requests r where r.tenant_id=p_tenant and r.id=p_id;
   if not found then raise exception using errcode='P0002',message='Purchase request is unavailable.'; end if;
   select * into mr from public.inv_material_requests r where r.tenant_id=p_tenant and r.id=item_id_value for update;
   select * into pr from public.inv_purchase_requests r where r.tenant_id=p_tenant and r.id=p_id for update;
   perform public.inv_procurement_version(pr.version,p_version);
   if not pr.workflow_managed then raise exception using errcode='55000',message='Historical approval metadata is incomplete.'; end if;
   if p_kind='revisePurchaseRequest' then
    perform public.inv_read_object(p_input,array['quotationId','requestedOn','selectionReason','reason','reviewers','lines']);reason_value:=public.inv_procurement_text(p_input,'reason',500);
    if pr.status not in ('draft','returned') or exists(select 1 from public.inv_purchase_orders o where o.tenant_id=p_tenant and o.purchase_request_id=pr.id) then raise exception using errcode='55000',message='Purchase request is locked.'; end if;
    data:=public.inv_prepare_purchase_request(p_tenant,mr.id,p_input,pr.id);
    select coalesce(jsonb_agg(s.reviewer_membership_id order by s.stage_order),'[]') into route from public.inv_procurement_review_steps s where s.tenant_id=p_tenant and s.purchase_request_id=pr.id and s.revision=pr.revision;
    select pr.quotation_id=(data->>'quotationId')::uuid and pr.requested_on=(data->>'requestedOn')::date and pr.selection_reason=data->>'selectionReason' and route=data->'reviewerMemberships'
      and (select count(*) from public.inv_purchase_request_lines l where l.tenant_id=p_tenant and l.purchase_request_id=pr.id)=jsonb_array_length(data->'lines')
      and not exists(select 1 from jsonb_array_elements(data->'lines') n left join public.inv_purchase_request_lines l on l.tenant_id=p_tenant and l.purchase_request_id=pr.id and l.quotation_line_id=(n->>'quotationLineId')::uuid where l.id is null or l.quantity<>(n->>'quantity')::numeric or l.line_no<>(n->>'lineNo')::integer) into same_content;
    if same_content then raise exception using errcode='55000',message='Save a real revision before resubmission.'; end if;
    select jsonb_build_object('header',to_jsonb(pr),'lines',coalesce(jsonb_agg(to_jsonb(l) order by l.line_no),'[]')) into before_data from public.inv_purchase_request_lines l where l.tenant_id=p_tenant and l.purchase_request_id=pr.id;
    perform public.inv_procurement_event(p_tenant,p_actor,'purchase_request',pr.id,'purchaseRequestRevision',reason_value,jsonb_build_object('before',before_data));
    delete from public.inv_purchase_request_lines where tenant_id=p_tenant and purchase_request_id=pr.id;
    select * into quote from public.inv_supplier_quotations q where q.tenant_id=p_tenant and q.id=(data->>'quotationId')::uuid;
    update public.inv_purchase_requests set quotation_id=quote.id,requested_on=(data->>'requestedOn')::date,selection_reason=data->>'selectionReason',supplier_snapshot=quote.supplier_snapshot,status='draft',revision=revision+1,version=version+1,approved_by_user_id=null,approved_at=null,approval_reference=null where tenant_id=p_tenant and id=pr.id returning * into pr;
   elsif p_kind='submitPurchaseRequest' then
    perform public.inv_read_object(p_input,array[]::text[]);
    if pr.status<>'draft' then raise exception using errcode='55000',message='Only a revised draft can be submitted.'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('quotationLineId',l.quotation_line_id,'quantity',l.quantity::text) order by l.line_no),'[]') into input_lines from public.inv_purchase_request_lines l where l.tenant_id=p_tenant and l.purchase_request_id=pr.id;
    select coalesce(jsonb_agg(m.user_id order by s.stage_order),'[]') into route from public.inv_procurement_review_steps s join public.tenant_memberships m on m.tenant_id=p_tenant and m.id=s.reviewer_membership_id where s.tenant_id=p_tenant and s.purchase_request_id=pr.id and s.revision=pr.revision;
    data:=public.inv_prepare_purchase_request(p_tenant,mr.id,jsonb_build_object('quotationId',pr.quotation_id,'requestedOn',pr.requested_on,'selectionReason',pr.selection_reason,'reviewers',route,'lines',input_lines),pr.id);
    if exists(select 1 from public.inv_purchase_request_lines l join public.inv_supplier_quotation_lines q on q.tenant_id=p_tenant and q.id=l.quotation_line_id where l.tenant_id=p_tenant and l.purchase_request_id=pr.id and (l.unit_price_snapshot is distinct from q.unit_price or l.item_snapshot is distinct from q.item_snapshot)) then raise exception using errcode='55000',message='Saved prices or identity need revision.'; end if;
    update public.inv_purchase_requests set status='submitted',version=version+1 where tenant_id=p_tenant and id=pr.id returning * into pr;
    return jsonb_build_object('id',pr.id,'kind','purchase_request','version',pr.version,'reference',pr.request_no,'status',pr.status);
   elsif p_kind in ('reviewPurchaseRequest','reassignPendingReviewer') then
    if pr.status<>'submitted' then raise exception using errcode='55000',message='Purchase request is not pending review.'; end if;
    select * into step from public.inv_procurement_review_steps s where s.tenant_id=p_tenant and s.purchase_request_id=pr.id and s.revision=pr.revision and s.decision is null order by s.stage_order limit 1 for update;
    if not found then raise exception using errcode='55000',message='No pending review stage.'; end if;
    if p_kind='reassignPendingReviewer' then
     perform public.inv_read_object(p_input,array['reviewerId','reason']);reason_value:=public.inv_procurement_text(p_input,'reason',500);
     select m.user_id into reviewer_user from public.tenant_memberships m where m.tenant_id=p_tenant and m.id=step.reviewer_membership_id;
     begin perform public.inv_require_procurement_access(p_tenant,reviewer_user,false,true);raise exception using errcode='55000',message='Pending reviewer is still eligible.'; exception when insufficient_privilege then null;end;
     line_id:=public.inv_procurement_reviewer(p_tenant,(p_input->>'reviewerId')::uuid);
     perform public.inv_procurement_event(p_tenant,p_actor,'purchase_request',pr.id,'reviewerReassigned',reason_value,jsonb_build_object('stageOrder',step.stage_order,'oldMembership',step.reviewer_membership_id,'newMembership',line_id));
     update public.inv_procurement_review_steps set reviewer_membership_id=line_id where tenant_id=p_tenant and id=step.id;
     update public.inv_purchase_requests set version=version+1 where tenant_id=p_tenant and id=pr.id returning * into pr;
    else
     perform public.inv_read_object(p_input,array['stageOrder','decision','reason','reference']);reason_value:=public.inv_procurement_text(p_input,'reason',500);
     if (p_input->>'stageOrder')::integer is distinct from step.stage_order then raise exception using errcode='55000',message='Only the pending stage can act.'; end if;
     if not exists(select 1 from public.tenant_memberships m where m.tenant_id=p_tenant and m.id=step.reviewer_membership_id and m.user_id=p_actor and m.status='active') then raise exception using errcode='42501',message='Only the assigned reviewer can act.'; end if;
     if coalesce(p_input->>'decision','') not in ('approved','returned','rejected') then raise exception using errcode='22023',message='Invalid review decision.'; end if;
     update public.inv_procurement_review_steps set decision=p_input->>'decision',reason=reason_value,acted_at=now(),acted_by_user_id=p_actor where tenant_id=p_tenant and id=step.id;
     job_value:=case when p_input->>'decision' in ('returned','rejected') then p_input->>'decision' when not exists(select 1 from public.inv_procurement_review_steps s where s.tenant_id=p_tenant and s.purchase_request_id=pr.id and s.revision=pr.revision and s.decision is distinct from 'approved') then 'approved' else 'submitted' end;
     update public.inv_purchase_requests set status=job_value,version=version+1,approved_by_user_id=case when job_value='approved' then p_actor else null end,approved_at=case when job_value='approved' then now() else null end,approval_reference=case when job_value='approved' then coalesce(public.inv_procurement_text(p_input,'reference',500,false),reason_value) else null end where tenant_id=p_tenant and id=pr.id returning * into pr;
    end if;
    return jsonb_build_object('id',pr.id,'kind','purchase_request','version',pr.version,'reference',pr.request_no,'status',pr.status);
   end if;
  end if;
  -- New PR or saved revision: copy immutable quote prices/identities and a fresh route.
  for line in select value from jsonb_array_elements(data->'lines') loop
   insert into public.inv_purchase_request_lines(tenant_id,purchase_request_id,line_no,item_id,quantity,unit_price_snapshot,item_snapshot,quotation_line_id,material_request_line_id)
    values(p_tenant,pr.id,(line.value->>'lineNo')::integer,(line.value->>'itemId')::uuid,(line.value->>'quantity')::numeric,(line.value->>'unitPrice')::numeric,line.value->'snapshot',(line.value->>'quotationLineId')::uuid,(line.value->>'materialRequestLineId')::uuid);
  end loop;
  insert into public.inv_procurement_review_steps(tenant_id,purchase_request_id,revision,stage_order,reviewer_membership_id) select p_tenant,pr.id,pr.revision,a.ordinality::smallint,(a.value#>>'{}')::uuid from jsonb_array_elements(data->'reviewerMemberships') with ordinality a;
  return jsonb_build_object('id',pr.id,'kind','purchase_request','version',pr.version,'reference',pr.request_no,'status',pr.status);
 end if;

 if p_kind='createPurchaseOrder' then
  perform public.inv_read_object(p_input,array['purchaseRequestId','orderedOn','lines']);
  select r.material_request_id into item_id_value from public.inv_purchase_requests r where r.tenant_id=p_tenant and r.id=(p_input->>'purchaseRequestId')::uuid;
  if not found then raise exception using errcode='P0002',message='Purchase request is unavailable.'; end if;
  select * into mr from public.inv_material_requests r where r.tenant_id=p_tenant and r.id=item_id_value for update;
  select * into pr from public.inv_purchase_requests r where r.tenant_id=p_tenant and r.id=(p_input->>'purchaseRequestId')::uuid for update;
  if not pr.workflow_managed or pr.status<>'approved' or pr.approved_by_user_id is null or (select count(*) from public.inv_procurement_review_steps s where s.tenant_id=p_tenant and s.purchase_request_id=pr.id and s.revision=pr.revision and s.decision='approved')<>4 then raise exception using errcode='55000',message='Completed staged approval is required.'; end if;
  select * into quote from public.inv_supplier_quotations q where q.tenant_id=p_tenant and q.id=pr.quotation_id;
  perform public.inv_procurement_supplier_snapshot(p_tenant,quote.supplier_id);
  document_date:=public.inv_procurement_date(p_input->>'orderedOn');if document_date<pr.requested_on then raise exception using errcode='22023',message='Order date precedes approval request.'; end if;
  if exists(select 1 from public.inv_purchase_orders o join public.inv_purchase_order_lines l on l.tenant_id=p_tenant and l.purchase_order_id=o.id where o.tenant_id=p_tenant and o.purchase_request_id=pr.id and l.purchase_request_line_id is null) then raise exception using errcode='55000',message='Historical order allocation needs reconciliation.'; end if;
  new_id:=gen_random_uuid();number_value:=public.inv_next_document_number(p_tenant,'PO',document_date);
  insert into public.inv_purchase_orders(id,tenant_id,order_no,purchase_request_id,supplier_id,ordered_on,created_by_user_id,workflow_managed,supplier_snapshot) values(new_id,p_tenant,number_value,pr.id,quote.supplier_id,document_date,p_actor,true,pr.supplier_snapshot);
  for line in select * from public.inv_procurement_lines(p_input->'lines',array['purchaseRequestLineId','quantity']) loop
   line_id:=(line.value->>'purchaseRequestLineId')::uuid;if line_id is null or line_id=any(seen) then raise exception using errcode='22023',message='Invalid order line.'; end if;seen:=array_append(seen,line_id);
   select * into source from public.inv_purchase_request_lines l where l.tenant_id=p_tenant and l.id=line_id and l.purchase_request_id=pr.id;
   if not found then raise exception using errcode='P0002',message='Approved line is unavailable.'; end if;
   snapshot:=public.inv_procurement_item_snapshot(p_tenant,source.item_id);
   if source.unit_price_snapshot is null or not public.inv_procurement_same_identity(source.item_snapshot,snapshot) then raise exception using errcode='55000',message='Approved item identity or price needs reconciliation.'; end if;
   amount:=public.inv_procurement_decimal(line.value->'quantity',(snapshot->>'quantityPrecision')::integer);
   select coalesce(sum(l.quantity),0) into reserved from public.inv_purchase_order_lines l join public.inv_purchase_orders o on o.tenant_id=p_tenant and o.id=l.purchase_order_id where l.tenant_id=p_tenant and l.purchase_request_line_id=source.id and o.status<>'cancelled';
   if amount>source.quantity-reserved then raise exception using errcode='55000',message='Order exceeds the remaining approved quantity.'; end if;
   insert into public.inv_purchase_order_lines(tenant_id,purchase_order_id,line_no,item_id,quantity,agreed_price,item_snapshot,purchase_request_line_id) values(p_tenant,new_id,line.n,source.item_id,amount,source.unit_price_snapshot,source.item_snapshot,source.id);
  end loop;
  update public.inv_material_requests set status=case when exists(select 1 from public.inv_purchase_request_lines pl where pl.tenant_id=p_tenant and pl.purchase_request_id=pr.id and pl.quantity>(select coalesce(sum(ol.quantity),0) from public.inv_purchase_order_lines ol join public.inv_purchase_orders o on o.tenant_id=p_tenant and o.id=ol.purchase_order_id and o.status<>'cancelled' where ol.tenant_id=p_tenant and ol.purchase_request_line_id=pl.id)) then 'partially_ordered' else 'ordered' end,version=version+1 where tenant_id=p_tenant and id=mr.id;
  perform public.inv_procurement_event(p_tenant,p_actor,'purchase_request',pr.id,'purchaseOrderCreated',null,jsonb_build_object('id',new_id,'reference',number_value));
  return jsonb_build_object('id',new_id,'kind','purchase_order','version',1,'reference',number_value,'status','draft');
 end if;
 if p_kind='dispatchPurchaseOrder' then
  perform public.inv_read_object(p_input,array['dispatchedOn','method','recipient','reference','reason']);
  select * into po from public.inv_purchase_orders o where o.tenant_id=p_tenant and o.id=p_id;
  if not found then raise exception using errcode='P0002',message='Purchase order is unavailable.'; end if;
  if po.purchase_request_id is not null then
   select r.material_request_id into item_id_value from public.inv_purchase_requests r where r.tenant_id=p_tenant and r.id=po.purchase_request_id;
   perform 1 from public.inv_material_requests r where r.tenant_id=p_tenant and r.id=item_id_value for update;
   perform 1 from public.inv_purchase_requests r where r.tenant_id=p_tenant and r.id=po.purchase_request_id for update;
  end if;
  select * into po from public.inv_purchase_orders o where o.tenant_id=p_tenant and o.id=p_id for update;
  perform public.inv_procurement_version(po.version,p_version);
  if po.status in ('cancelled','closed','completed') or po.dispatched_at is not null or exists(select 1 from public.inv_purchase_order_dispatches d where d.tenant_id=p_tenant and d.purchase_order_id=po.id) then raise exception using errcode='55000',message='Dispatch is already recorded or the order is closed.'; end if;
  document_date:=public.inv_procurement_date(p_input->>'dispatchedOn');if document_date<po.ordered_on then raise exception using errcode='22023',message='Invalid dispatch date.'; end if;
  reference_value:=public.inv_procurement_text(p_input,'reference',500);reason_value:=public.inv_procurement_text(p_input,'reason',500);
  job_value:=public.inv_procurement_text(p_input,'method',100);requester_name_value:=public.inv_procurement_text(p_input,'recipient',500);
  insert into public.inv_purchase_order_dispatches(tenant_id,purchase_order_id,dispatched_at,dispatch_method,recipient,external_reference,actor_user_id) values(p_tenant,po.id,document_date::timestamp at time zone 'Asia/Manila',job_value,requester_name_value,reference_value,p_actor);
  update public.inv_purchase_orders set status='dispatched',dispatched_at=document_date::timestamp at time zone 'Asia/Manila',dispatch_reference=reference_value,dispatch_method=job_value,dispatch_recipient=requester_name_value,dispatch_reason=reason_value,dispatched_by_user_id=p_actor,version=version+1 where tenant_id=p_tenant and id=po.id returning version into new_version;
  return jsonb_build_object('id',po.id,'kind','purchase_order','version',new_version,'reference',po.order_no,'status','dispatched');
 end if;
 raise exception using errcode='22023',message='Unsupported procurement command.';
end $$;

create function public.inv_execute_procurement_command(p_tenant_id uuid,p_actor_user_id uuid,p_kind text,p_document_id uuid,p_expected_version bigint,p_idempotency_key text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare outcome jsonb;
begin
 perform public.inv_require_procurement_access(p_tenant_id,p_actor_user_id,p_kind='reassignPendingReviewer',true);
 if p_kind not in ('createMaterialRequest','editMaterialRequest','approveMaterialRequest','createAdditionalMaterialRequest','createQuotation','createPurchaseRequest','revisePurchaseRequest','submitPurchaseRequest','reviewPurchaseRequest','reassignPendingReviewer','createPurchaseOrder','dispatchPurchaseOrder') then raise exception using errcode='22023',message='Unsupported procurement command.'; end if;
 outcome:=public.inv_begin_procurement_command(p_tenant_id,p_actor_user_id,p_kind,p_idempotency_key,jsonb_build_object('id',p_document_id,'expectedVersion',p_expected_version,'input',p_input));
 if outcome is not null then return outcome; end if;
 -- Serialize short writes within a tenant; row locks below also protect parent allocation.
 perform pg_advisory_xact_lock(hashtextextended('inventory-procurement:'||p_tenant_id::text,0));
 perform public.inv_require_procurement_access(p_tenant_id,p_actor_user_id,p_kind='reassignPendingReviewer',true);
 outcome:=public.inv_document_command(p_tenant_id,p_actor_user_id,p_kind,p_document_id,p_expected_version,p_input);
 outcome:=outcome||jsonb_build_object('replayed',false,'invalidations',jsonb_build_array('dashboard','procurement','inventory','movements','references'));
 perform public.inv_procurement_event(p_tenant_id,p_actor_user_id,outcome->>'kind',(outcome->>'id')::uuid,p_kind,null,jsonb_build_object('input',p_input,'version',outcome->'version'));
 update public.inv_procurement_commands set result=outcome where tenant_id=p_tenant_id and kind=p_kind and idempotency_key=btrim(p_idempotency_key);
 return outcome;
end $$;

-- Keep legacy callers compatible, but close their old requester-override path.
create or replace function public.inv_create_material_request(p_tenant_id uuid,p_actor_user_id uuid,p_requester_personnel_id uuid,p_job text,p_requested_on date,p_lines jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare lines jsonb:='[]';line record;outcome jsonb;
begin
 perform public.inv_require_procurement_access(p_tenant_id,p_actor_user_id,false,true);
 for line in select * from public.inv_procurement_lines(p_lines,array['lineNo','itemId','quantity','specification']) loop
  if (line.value->>'lineNo')::integer is null or (line.value->>'lineNo')::integer<1 then raise exception using errcode='22023',message='Invalid line number.'; end if;
  lines:=lines||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('lineNo',(line.value->>'lineNo')::integer,'itemId',line.value->>'itemId','quantity',line.value->>'quantity','specification',line.value->'specification')));
 end loop;
 outcome:=public.inv_execute_procurement_command(p_tenant_id,p_actor_user_id,'createMaterialRequest',null,null,'legacy-create:'||gen_random_uuid()::text,jsonb_strip_nulls(jsonb_build_object('requesterPersonnelId',p_requester_personnel_id,'job',p_job,'requestedOn',p_requested_on,'lines',lines)));
 insert into public.audit_events(tenant_id,entity_type,entity_id,action,actor_user_id,after_data) values(p_tenant_id,'inv_material_request',(outcome->>'id')::uuid,'create',p_actor_user_id,jsonb_build_object('requestNo',outcome->>'reference','lineCount',jsonb_array_length(lines)));
 return jsonb_build_object('requestId',outcome->'id','requestNo',outcome->'reference','version',outcome->'version','status',outcome->'status');
end $$;

-- Internal stock primitive is callable only from trusted SECURITY DEFINER RPCs.
alter function public.inv_post_stock_movement(uuid,uuid,text,text,text,text,text,jsonb) rename to inv_post_stock_movement_core;
revoke all on function public.inv_post_stock_movement_core(uuid,uuid,text,text,text,text,text,jsonb) from public,anon,authenticated,service_role;
create function public.inv_post_stock_movement(p_tenant_id uuid,p_actor_user_id uuid,p_movement_type text,p_source_type text,p_source_reference text,p_idempotency_key text,p_notes text,p_lines jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.inv_require_procurement_access(p_tenant_id,p_actor_user_id,false,true);
 if lower(btrim(p_source_type)) in ('inventory_procurement','inspection_receipt') or left(lower(btrim(p_idempotency_key)),12)='procurement:' then raise exception using errcode='42501',message='Procurement receipts require an authorized inspection.'; end if;
 return public.inv_post_stock_movement_core(p_tenant_id,p_actor_user_id,p_movement_type,p_source_type,p_source_reference,p_idempotency_key,p_notes,p_lines);
end $$;
revoke all on function public.inv_post_stock_movement(uuid,uuid,text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.inv_post_stock_movement(uuid,uuid,text,text,text,text,text,jsonb) to service_role;

create function public.inv_protect_item_unit() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if new.unit_id is distinct from old.unit_id and (
  exists(select 1 from public.inv_inventory_balances b where b.tenant_id=old.tenant_id and b.item_id=old.id and (b.quantity<>0 or b.inventory_value<>0)) or
  exists(select 1 from public.inv_inventory_assets a where a.tenant_id=old.tenant_id and a.item_id=old.id) or
  exists(select 1 from public.inv_material_request_lines l join public.inv_material_requests r on r.tenant_id=old.tenant_id and r.id=l.material_request_id where l.tenant_id=old.tenant_id and l.item_id=old.id and l.workflow_active and r.status in ('approved','partially_ordered','ordered','closed')) or
  exists(select 1 from public.inv_purchase_order_lines l join public.inv_purchase_orders o on o.tenant_id=old.tenant_id and o.id=l.purchase_order_id where l.tenant_id=old.tenant_id and l.item_id=old.id and o.status<>'cancelled')
 ) then raise exception using errcode='55000',message='Item unit is locked after stock or workflow progression.'; end if;
 return new;
end $$;
revoke all on function public.inv_protect_item_unit() from public,anon,authenticated,service_role;
create trigger inv_item_unit_workflow_guard before update of unit_id on public.inv_inventory_items for each row execute function public.inv_protect_item_unit();

-- Revised current MR lines are soft-archived; historical quote/PR links remain valid.
create or replace function public.inv_document_lines(p_tenant uuid,p_kind text,p_id uuid)
returns table(id uuid,line_no integer,value jsonb) language sql stable set search_path=public,pg_temp as $$
 select l.id,l.line_no,jsonb_build_object('id',l.id,'itemId',l.item_id,'lineNo',l.line_no,'quantity',l.quantity::text,'unitPrice',null,'specification',l.specification,'snapshot',l.item_snapshot) from public.inv_material_request_lines l where p_kind='material_request' and l.tenant_id=p_tenant and l.material_request_id=p_id and l.workflow_active
 union all select l.id,l.line_no,jsonb_build_object('id',l.id,'itemId',l.item_id,'lineNo',l.line_no,'quantity',l.quantity::text,'unitPrice',l.unit_price::text,'specification',l.item_snapshot->>'specification','snapshot',l.item_snapshot,'materialRequestLineId',l.material_request_line_id) from public.inv_supplier_quotation_lines l where p_kind='quotation' and l.tenant_id=p_tenant and l.quotation_id=p_id
 union all select l.id,l.line_no,jsonb_build_object('id',l.id,'itemId',l.item_id,'lineNo',l.line_no,'quantity',l.quantity::text,'unitPrice',l.unit_price_snapshot::text,'specification',l.item_snapshot->>'specification','snapshot',l.item_snapshot,'quotationLineId',l.quotation_line_id,'materialRequestLineId',l.material_request_line_id) from public.inv_purchase_request_lines l where p_kind='purchase_request' and l.tenant_id=p_tenant and l.purchase_request_id=p_id
 union all select l.id,l.line_no,jsonb_build_object('id',l.id,'itemId',l.item_id,'lineNo',l.line_no,'quantity',l.quantity::text,'unitPrice',l.agreed_price::text,'specification',l.item_snapshot->>'specification','snapshot',l.item_snapshot,'purchaseRequestLineId',l.purchase_request_line_id) from public.inv_purchase_order_lines l where p_kind='purchase_order' and l.tenant_id=p_tenant and l.purchase_order_id=p_id
 union all select l.id,ol.line_no,jsonb_build_object('id',l.id,'itemId',ol.item_id,'lineNo',ol.line_no,'orderLineId',ol.id,'quantity',l.delivered_quantity::text,'unitPrice',l.unit_cost::text,'specification',l.item_snapshot->>'specification','snapshot',l.item_snapshot,'acceptedQuantity',l.accepted_quantity::text,'damagedQuantity',l.damaged_quantity::text,'rejectedQuantity',l.rejected_quantity::text,'locationId',l.location_id,'assetTags',l.asset_tags,'replacementOfLineId',l.replacement_of_line_id)
 from public.inv_inspection_report_lines l join public.inv_purchase_order_lines ol on ol.tenant_id=p_tenant and ol.id=l.purchase_order_line_id where p_kind='inspection' and l.tenant_id=p_tenant and l.inspection_report_id=p_id
$$;

revoke all on function public.inv_procurement_text(jsonb,text,integer,boolean),public.inv_procurement_date(text,boolean),public.inv_procurement_decimal(jsonb,integer,boolean),public.inv_procurement_version(bigint,bigint),public.inv_procurement_lines(jsonb,text[]),public.inv_procurement_item_snapshot(uuid,uuid),public.inv_procurement_same_identity(jsonb,jsonb),public.inv_procurement_supplier_snapshot(uuid,uuid),public.inv_procurement_event(uuid,uuid,text,uuid,text,text,jsonb),public.inv_procurement_reviewer(uuid,uuid),public.inv_procurement_requirement_unissued(uuid,uuid,uuid),public.inv_prepare_purchase_request(uuid,uuid,jsonb,uuid),public.inv_document_command(uuid,uuid,text,uuid,bigint,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.inv_execute_procurement_command(uuid,uuid,text,uuid,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.inv_execute_procurement_command(uuid,uuid,text,uuid,bigint,text,jsonb) to service_role;
