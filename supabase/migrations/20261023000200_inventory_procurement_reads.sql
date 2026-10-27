-- Fixed, tenant-scoped Inventory read RPCs; no Service Desk or shared writes.
create function public.inv_read_object(p_input jsonb,p_keys text[]) returns void
language plpgsql immutable set search_path=public,pg_temp as $$
begin
  if jsonb_typeof(p_input) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_input) k where not(k=any(p_keys))) then
    raise exception using errcode='22023',message='Unsupported read parameters.';
  end if;
end $$;
create function public.inv_read_limit(p_input jsonb) returns integer
language plpgsql immutable set search_path=public,pg_temp as $$
begin
  if not(p_input?'limit') then return 50; end if;
  if jsonb_typeof(p_input->'limit')<>'number' or coalesce(p_input->>'limit','') !~ '^[1-9][0-9]?$|^100$' then
    raise exception using errcode='22023',message='Invalid page limit.';
  end if;
  return (p_input->>'limit')::integer;
end $$;
create function public.inv_read_scope(p_tenant uuid,p_actor uuid,p_operation text,p_input jsonb) returns text
language sql immutable set search_path=public,pg_temp as $$
  select encode(sha256(convert_to(jsonb_build_array(p_tenant,p_actor,p_operation,p_input-'cursor')::text,'UTF8')),'hex')
$$;
-- Cursors are validated seek positions, never authorization tokens.
create function public.inv_encode_page(p_scope text,p_key text,p_id uuid) returns text
language sql immutable set search_path=public,pg_temp as $$
  select translate(replace(encode(convert_to(jsonb_build_object('scope',p_scope,'key',p_key,'id',p_id)::text,'UTF8'),'base64'),E'\n',''),'+/','-_')
$$;
create function public.inv_decode_page(p_scope text,p_cursor text) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare value jsonb;
begin
  if p_cursor is null then return null; end if;
  if length(p_cursor) not between 1 and 2000 or p_cursor !~ '^[A-Za-z0-9_=-]+$' then raise exception 'invalid'; end if;
  value:=convert_from(decode(translate(p_cursor,'-_','+/'),'base64'),'UTF8')::jsonb;
  if jsonb_typeof(value)<>'object' or value->>'scope' is distinct from p_scope or
     jsonb_typeof(value->'key') is distinct from 'string' or length(value->>'key') not between 1 and 200 or
     (select count(*) from jsonb_object_keys(value))<>3 then raise exception 'invalid'; end if;
  perform (value->>'id')::uuid;
  if value->>'id' is null then raise exception 'invalid'; end if;
  return value;
exception when others then raise exception using errcode='22023',message='Invalid page cursor.';
end $$;
create function public.inv_json_page(p_scope text,p_rows jsonb,p_limit integer) returns jsonb
language sql immutable set search_path=public,pg_temp as $$
 select jsonb_build_object('items',coalesce((select jsonb_agg(value->'value' order by n) from jsonb_array_elements(coalesce(p_rows,'[]')) with ordinality a(value,n) where n<=p_limit),'[]'),
 'nextCursor',case when jsonb_array_length(coalesce(p_rows,'[]'))>p_limit then public.inv_encode_page(p_scope,p_rows->(p_limit-1)->>'key',(p_rows->(p_limit-1)->>'id')::uuid) else null end)
$$;
create function public.inv_document_headers(p_tenant uuid)
returns table(id uuid,kind text,reference text,document_date date,status text,version bigint,revision bigint,historical boolean,created_at timestamptz,fields jsonb)
language sql stable set search_path=public,pg_temp as $$
 select d.id,'material_request',d.request_no,d.requested_on,d.status,d.version,d.workflow_revision,not d.workflow_managed,d.created_at,to_jsonb(d)-'tenant_id' from public.inv_material_requests d where d.tenant_id=p_tenant
 union all select d.id,'quotation',d.quotation_no,d.quoted_on,d.status,d.version,null::bigint,not d.workflow_managed,d.created_at,to_jsonb(d)-'tenant_id' from public.inv_supplier_quotations d where d.tenant_id=p_tenant
 union all select d.id,'purchase_request',d.request_no,d.requested_on,d.status,d.version,d.revision::bigint,not d.workflow_managed,d.created_at,to_jsonb(d)-'tenant_id' from public.inv_purchase_requests d where d.tenant_id=p_tenant
 union all select d.id,'purchase_order',d.order_no,d.ordered_on,d.status,d.version,null::bigint,not d.workflow_managed,d.created_at,to_jsonb(d)-'tenant_id' from public.inv_purchase_orders d where d.tenant_id=p_tenant
 union all select d.id,'inspection',coalesce(d.report_no,d.delivery_reference),d.delivered_on,d.status,d.version,null::bigint,not d.workflow_managed,d.created_at,to_jsonb(d)-'tenant_id' from public.inv_inspection_reports d where d.tenant_id=p_tenant
$$;
create function public.inv_document_actions(p_kind text,p_status text,p_historical boolean,p_role text) returns jsonb
language sql immutable set search_path=public,pg_temp as $$
 select case when p_role='viewer' then '[]'::jsonb
 when p_kind='material_request' and p_status in ('draft','approved') then '["editMaterialRequest","approveMaterialRequest","createAdditionalMaterialRequest"]'::jsonb
 when p_historical then '[]'::jsonb
 when p_kind='purchase_request' and p_status in ('draft','returned') then '["revisePurchaseRequest","submitPurchaseRequest"]'::jsonb
 when p_kind='purchase_request' and p_status='submitted' then '["reviewPurchaseRequest"]'::jsonb
 when p_kind='purchase_request' and p_status='approved' then '["createPurchaseOrder"]'::jsonb
 when p_kind='purchase_order' and p_status='draft' then '["dispatchPurchaseOrder"]'::jsonb
 when p_kind='purchase_order' and p_status in ('dispatched','partially_received') then '["recordDelivery"]'::jsonb
 when p_kind='inspection' and p_status='pending' then '["recordInspection"]'::jsonb
 when p_kind='inspection' and p_status='inspected' then '["acceptInspection"]'::jsonb else '[]'::jsonb end
$$;
create function public.inv_document_summary(p_row jsonb,p_role text) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
begin
 if (p_row->>'version')::numeric not between 1 and 9007199254740991 then raise exception using errcode='55000',message='Unsupported document version.'; end if;
 return jsonb_build_object('id',p_row->'id','kind',p_row->'kind','reference',p_row->'reference','date',p_row->'document_date','status',p_row->'status','version',p_row->'version','revision',p_row->'revision','historical',p_row->'historical','availableActions',public.inv_document_actions(p_row->>'kind',p_row->>'status',(p_row->>'historical')::boolean,p_role));
end $$;
create function public.inv_list_procurement_documents(p_tenant_id uuid,p_actor_user_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare role_key text; page_limit integer; scope text; position jsonb; rows jsonb;
begin
 role_key:=public.inv_require_procurement_access(p_tenant_id,p_actor_user_id,false,false);
 perform public.inv_read_object(p_input,array['kind','limit','cursor','search','status']);
 if coalesce(p_input->>'kind','') not in ('material_request','quotation','purchase_request','purchase_order','inspection') then raise exception using errcode='22023',message='Invalid document kind.'; end if;
 page_limit:=public.inv_read_limit(p_input); scope:=public.inv_read_scope(p_tenant_id,p_actor_user_id,'documents',p_input); position:=public.inv_decode_page(scope,p_input->>'cursor');
 select jsonb_agg(jsonb_build_object('key',key,'id',id,'value',value) order by key desc,id desc) into rows from (
   select h.id,to_char(h.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as key,public.inv_document_summary(to_jsonb(h),role_key) as value
   from public.inv_document_headers(p_tenant_id) h where h.kind=p_input->>'kind'
   and (coalesce(p_input->>'search','')='' or strpos(lower(h.reference),lower(p_input->>'search'))>0)
   and (coalesce(p_input->>'status','')='' or h.status=p_input->>'status')
   and (position is null or (to_char(h.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),h.id)<(position->>'key',(position->>'id')::uuid))
   order by key desc,h.id desc limit page_limit+1
 ) page;
 return public.inv_json_page(scope,rows,page_limit);
end $$;

create function public.inv_get_procurement_reference_data(p_tenant_id uuid,p_actor_user_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare scope text; position jsonb; page_limit integer; rows jsonb;
begin
 perform public.inv_require_procurement_access(p_tenant_id,p_actor_user_id,false,false);
 perform public.inv_read_object(p_input,array['kind','limit','cursor','search']);
 if coalesce(p_input->>'kind','') not in ('items','suppliers','locations','requesters','reviewers','warehouses') then raise exception using errcode='22023',message='Invalid selector.'; end if;
 page_limit:=public.inv_read_limit(p_input); scope:=public.inv_read_scope(p_tenant_id,p_actor_user_id,'references',p_input); position:=public.inv_decode_page(scope,p_input->>'cursor');
 with refs as (
   select i.id,i.item_code||' · '||i.name as label,jsonb_build_object('itemCode',i.item_code,'name',i.name,'unitId',i.unit_id,'unitName',u.name,'unitSymbol',u.symbol,'quantityPrecision',u.quantity_precision,'version',i.version,'costMethod',i.cost_method,'trackingMode',tr.mode,'quantity',(select coalesce(sum(b.quantity),0)::text from public.inv_inventory_balances b where b.tenant_id=p_tenant_id and b.item_id=i.id)) as metadata
   from public.inv_inventory_items i join public.inv_units u on u.tenant_id=p_tenant_id and u.id=i.unit_id left join public.inv_item_tracking tr on tr.tenant_id=p_tenant_id and tr.item_id=i.id
   where p_input->>'kind'='items' and i.tenant_id=p_tenant_id and i.active and u.active
   union all select s.id,s.name,jsonb_build_object('code',s.supplier_code,'version',s.version) from public.inv_suppliers s where p_input->>'kind'='suppliers' and s.tenant_id=p_tenant_id and s.active
   union all select l.id,w.name||' · '||l.location_code,jsonb_build_object('warehouseId',w.id,'bin',l.bin,'version',l.version) from public.inv_storage_locations l join public.inv_warehouses w on w.tenant_id=p_tenant_id and w.id=l.warehouse_id where p_input->>'kind'='locations' and l.tenant_id=p_tenant_id and l.active and w.active
   union all select p.id,p.full_name,jsonb_build_object('userId',p.user_id,'employeeCode',p.employee_code) from public.personnel p where p_input->>'kind'='requesters' and p.tenant_id=p_tenant_id and p.active
   union all select u.id,coalesce(nullif(u.display_name,''),'Inventory user'),jsonb_build_object('membershipId',m.id) from public.tenant_memberships m join public.app_users u on u.id=m.user_id and u.active
     where p_input->>'kind'='reviewers' and m.tenant_id=p_tenant_id and m.status='active'
       and (select count(*) from public.tenant_memberships mm where mm.user_id=u.id)=1
       and exists(select 1 from public.membership_roles r join public.app_roles ar on ar.app_key=r.app_key and ar.role_key=r.role_key join public.applications a on a.app_key=r.app_key and a.active where r.membership_id=m.id and r.app_key='inventory' and r.role_key in ('administrator','inventory_staff'))
   union all select w.id,w.name,jsonb_build_object('code',w.code,'version',w.version) from public.inv_warehouses w where p_input->>'kind'='warehouses' and w.tenant_id=p_tenant_id and w.active
 ), page as (
   select id,left(lower(label),160) as key,jsonb_build_object('id',id,'label',label,'metadata',metadata) as value from refs
   where (coalesce(p_input->>'search','')='' or strpos(lower(label),lower(p_input->>'search'))>0)
     and (position is null or (left(lower(label),160),id)>(position->>'key',(position->>'id')::uuid))
   order by key,id limit page_limit+1
 ) select jsonb_agg(jsonb_build_object('key',key,'id',id,'value',value) order by key,id) into rows from page;
 return public.inv_json_page(scope,rows,page_limit);
end $$;

create function public.inv_document_lines(p_tenant uuid,p_kind text,p_id uuid)
returns table(id uuid,line_no integer,value jsonb) language sql stable set search_path=public,pg_temp as $$
 select l.id,l.line_no,jsonb_build_object('id',l.id,'itemId',l.item_id,'lineNo',l.line_no,'quantity',l.quantity::text,'unitPrice',null,'specification',l.specification,'snapshot',l.item_snapshot) from public.inv_material_request_lines l where p_kind='material_request' and l.tenant_id=p_tenant and l.material_request_id=p_id
 union all select l.id,l.line_no,jsonb_build_object('id',l.id,'itemId',l.item_id,'lineNo',l.line_no,'quantity',l.quantity::text,'unitPrice',l.unit_price::text,'specification',null,'snapshot',l.item_snapshot) from public.inv_supplier_quotation_lines l where p_kind='quotation' and l.tenant_id=p_tenant and l.quotation_id=p_id
 union all select l.id,l.line_no,jsonb_build_object('id',l.id,'itemId',l.item_id,'lineNo',l.line_no,'quantity',l.quantity::text,'unitPrice',l.unit_price_snapshot::text,'specification',null,'snapshot',l.item_snapshot) from public.inv_purchase_request_lines l where p_kind='purchase_request' and l.tenant_id=p_tenant and l.purchase_request_id=p_id
 union all select l.id,l.line_no,jsonb_build_object('id',l.id,'itemId',l.item_id,'lineNo',l.line_no,'quantity',l.quantity::text,'unitPrice',l.agreed_price::text,'specification',null,'snapshot',l.item_snapshot) from public.inv_purchase_order_lines l where p_kind='purchase_order' and l.tenant_id=p_tenant and l.purchase_order_id=p_id
 union all select l.id,ol.line_no,jsonb_build_object('id',l.id,'itemId',ol.item_id,'lineNo',ol.line_no,'orderLineId',ol.id,'quantity',l.delivered_quantity::text,'unitPrice',l.unit_cost::text,'specification',null,'snapshot',l.item_snapshot,'acceptedQuantity',l.accepted_quantity::text,'damagedQuantity',l.damaged_quantity::text,'rejectedQuantity',l.rejected_quantity::text,'locationId',l.location_id,'assetTags',l.asset_tags,'replacementOfLineId',l.replacement_of_line_id)
 from public.inv_inspection_report_lines l join public.inv_purchase_order_lines ol on ol.tenant_id=p_tenant and ol.id=l.purchase_order_line_id where p_kind='inspection' and l.tenant_id=p_tenant and l.inspection_report_id=p_id
$$;
create function public.inv_get_procurement_document(p_tenant_id uuid,p_actor_user_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare role_key text; header record; page_limit integer; section text; scope text; position jsonb;
 lines_scope text; history_scope text; related_scope text; line_rows jsonb; history_rows jsonb; related_rows jsonb; lines_page jsonb; history_page jsonb; related_page jsonb; route jsonb; attachments jsonb;
begin
 role_key:=public.inv_require_procurement_access(p_tenant_id,p_actor_user_id,false,false);
 perform public.inv_read_object(p_input,array['kind','id','section','limit','cursor']); page_limit:=public.inv_read_limit(p_input);
 if coalesce(p_input->>'kind','') not in ('material_request','quotation','purchase_request','purchase_order','inspection') then raise exception using errcode='22023',message='Invalid document kind.'; end if;
 section:=coalesce(p_input->>'section','lines'); if section not in ('lines','history','related') then raise exception using errcode='22023',message='Invalid detail section.'; end if;
 p_input:=p_input||jsonb_build_object('section',section);
 select * into header from public.inv_document_headers(p_tenant_id) h where h.kind=p_input->>'kind' and h.id=(p_input->>'id')::uuid;
 if not found then raise exception using errcode='P0002',message='Inventory record is unavailable.'; end if;
 scope:=public.inv_read_scope(p_tenant_id,p_actor_user_id,'detail',p_input); position:=public.inv_decode_page(scope,p_input->>'cursor');
 lines_scope:=public.inv_read_scope(p_tenant_id,p_actor_user_id,'detail',(p_input-'cursor')||jsonb_build_object('section','lines'));
 history_scope:=public.inv_read_scope(p_tenant_id,p_actor_user_id,'detail',(p_input-'cursor')||jsonb_build_object('section','history'));
 related_scope:=public.inv_read_scope(p_tenant_id,p_actor_user_id,'detail',(p_input-'cursor')||jsonb_build_object('section','related'));
 select jsonb_agg(jsonb_build_object('id',id,'key',key,'value',value) order by key,id) into line_rows from (
   select l.id,lpad(l.line_no::text,12,'0') as key,l.value from public.inv_document_lines(p_tenant_id,header.kind,header.id) l
   where section<>'lines' or position is null or (lpad(l.line_no::text,12,'0'),l.id)>(position->>'key',(position->>'id')::uuid)
   order by l.line_no,l.id limit page_limit+1
 ) page;
 select jsonb_agg(jsonb_build_object('id',id,'key',key,'value',value) order by key desc,id desc) into history_rows from (
   select e.id,to_char(e.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as key,
   jsonb_build_object('id',e.id,'action',e.action,'occurredAt',e.occurred_at,'actorName',u.display_name,'reason',e.reason,'details',e.details) as value
   from public.inv_procurement_events e left join public.tenant_memberships m on m.tenant_id=p_tenant_id and m.user_id=e.actor_user_id left join public.app_users u on u.id=m.user_id
   where e.tenant_id=p_tenant_id and e.document_kind=header.kind and e.document_id=header.id
     and (section<>'history' or position is null or (to_char(e.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),e.id)<(position->>'key',(position->>'id')::uuid))
   order by key desc,e.id desc limit page_limit+1
 ) page;
 select jsonb_agg(jsonb_build_object('id',id,'key',key,'value',value) order by key desc,id desc) into related_rows from (
   select h.id,to_char(h.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as key,jsonb_build_object('id',h.id,'kind',h.kind,'reference',h.reference) as value
   from public.inv_document_headers(p_tenant_id) h where h.id<>header.id and (
     h.fields->>'material_request_id'=header.id::text or h.fields->>'quotation_id'=header.id::text or h.fields->>'purchase_request_id'=header.id::text or h.fields->>'purchase_order_id'=header.id::text or h.fields->>'parent_request_id'=header.id::text or h.fields->>'replacement_of_report_id'=header.id::text or
     h.id::text in (header.fields->>'material_request_id',header.fields->>'quotation_id',header.fields->>'purchase_request_id',header.fields->>'purchase_order_id',header.fields->>'parent_request_id',header.fields->>'replacement_of_report_id'))
     and (section<>'related' or position is null or (to_char(h.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),h.id)<(position->>'key',(position->>'id')::uuid))
   order by key desc,h.id desc limit page_limit+1
 ) page;
 lines_page:=public.inv_json_page(lines_scope,line_rows,page_limit); history_page:=public.inv_json_page(history_scope,history_rows,page_limit); related_page:=public.inv_json_page(related_scope,related_rows,page_limit);
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'stageOrder',s.stage_order,'reviewerId',m.user_id,'reviewerName',u.display_name,'decision',s.decision,'reason',s.reason,'actedAt',s.acted_at) order by s.stage_order),'[]') into route
 from public.inv_procurement_review_steps s join public.tenant_memberships m on m.tenant_id=p_tenant_id and m.id=s.reviewer_membership_id join public.app_users u on u.id=m.user_id
 where s.tenant_id=p_tenant_id and header.kind='purchase_request' and s.purchase_request_id=header.id and s.revision=header.revision;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.file_name,'contentType',a.mime_type,'size',a.byte_size) order by a.created_at,a.id),'[]') into attachments
 from public.inv_procurement_attachments a where a.tenant_id=p_tenant_id and a.document_kind=header.kind and a.document_id=header.id and a.state='ready';
 return public.inv_document_summary(to_jsonb(header),role_key)||jsonb_build_object('fields',header.fields,'lines',lines_page->'items','history',history_page->'items','related',related_page->'items','linesNextCursor',lines_page->'nextCursor','historyNextCursor',history_page->'nextCursor','relatedNextCursor',related_page->'nextCursor','reviewSteps',route,'attachments',attachments);
end $$;

create function public.inv_list_inventory_movements(p_tenant_id uuid,p_actor_user_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare scope text; position jsonb; page_limit integer; rows jsonb;
begin
 perform public.inv_require_procurement_access(p_tenant_id,p_actor_user_id,false,false);
 perform public.inv_read_object(p_input,array['limit','cursor','search','itemId','locationId','movementType','dateFrom','dateTo']);
 page_limit:=public.inv_read_limit(p_input); scope:=public.inv_read_scope(p_tenant_id,p_actor_user_id,'movements',p_input); position:=public.inv_decode_page(scope,p_input->>'cursor');
 if p_input?'movementType' and p_input->>'movementType' not in ('receipt','issue','transfer','adjustment','return','writeoff') then raise exception using errcode='22023',message='Invalid movement type.'; end if;
 select jsonb_agg(jsonb_build_object('id',id,'key',key,'value',value) order by key desc,id desc) into rows from (
   select l.id,to_char(m.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as key,
   jsonb_build_object('id',l.id,'movementId',m.id,'itemId',l.item_id,'itemCode',i.item_code,'itemName',i.name,'locationId',l.location_id,'occurredAt',m.occurred_at,'movementType',m.movement_type,'sourceReference',m.source_reference,'quantity',l.signed_quantity::text,'unitCost',l.unit_cost::text,'valueDelta',l.value_delta::text,'balanceAfter',l.balance_after::text,'actorName',u.display_name) as value
   from public.inv_stock_movement_lines l join public.inv_stock_movements m on m.tenant_id=p_tenant_id and m.id=l.movement_id
   join public.inv_inventory_items i on i.tenant_id=p_tenant_id and i.id=l.item_id
   left join public.tenant_memberships am on am.tenant_id=p_tenant_id and am.user_id=m.actor_user_id left join public.app_users u on u.id=am.user_id
   where l.tenant_id=p_tenant_id and m.posted_at is not null
     and (not(p_input?'itemId') or l.item_id=(p_input->>'itemId')::uuid)
     and (not(p_input?'locationId') or l.location_id=(p_input->>'locationId')::uuid)
     and (not(p_input?'movementType') or m.movement_type=p_input->>'movementType')
     and (not(p_input?'dateFrom') or m.occurred_at>=((p_input->>'dateFrom')::date::timestamp at time zone 'Asia/Manila'))
     and (not(p_input?'dateTo') or m.occurred_at<(((p_input->>'dateTo')::date+1)::timestamp at time zone 'Asia/Manila'))
     and (coalesce(p_input->>'search','')='' or strpos(lower(i.item_code||' '||i.name||' '||coalesce(m.source_reference,'')),lower(p_input->>'search'))>0)
     and (position is null or (to_char(m.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),l.id)<(position->>'key',(position->>'id')::uuid))
   order by key desc,l.id desc limit page_limit+1
 ) page;
 return public.inv_json_page(scope,rows,page_limit);
end $$;

create function public.inv_get_inventory_dashboard(p_tenant_id uuid,p_actor_user_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare active_count bigint; stock numeric; low_count bigint; out_count bigint; critical jsonb; issued numeric; cost_unknown boolean;
begin
 perform public.inv_require_procurement_access(p_tenant_id,p_actor_user_id,false,false);
 with items as (
   select i.id,i.item_code,i.name,i.minimum_quantity,u.name as unit,coalesce(sum(b.quantity),0) as quantity from public.inv_inventory_items i
   join public.inv_units u on u.tenant_id=p_tenant_id and u.id=i.unit_id left join public.inv_inventory_balances b on b.tenant_id=p_tenant_id and b.item_id=i.id
   where i.tenant_id=p_tenant_id and i.active group by i.id,u.name
 ) select count(*),coalesce(sum(quantity),0),count(*) filter(where quantity>0 and quantity<=minimum_quantity),count(*) filter(where quantity=0),
   (select coalesce(jsonb_agg(jsonb_build_object('id',id,'itemCode',item_code,'name',name,'quantity',quantity::text,'minimum',minimum_quantity::text,'unit',unit) order by quantity,item_code,id),'[]') from (select * from items where quantity<=minimum_quantity order by quantity,item_code,id limit 5)c)
 into active_count,stock,low_count,out_count,critical from items;
 select coalesce(sum(r.quantity*r.unit_cost) filter(where m.posted_at is not null),0),coalesce(bool_or(m.posted_at is null),false) into issued,cost_unknown
 from public.inv_ris_releases r left join public.inv_stock_movement_lines ml on ml.tenant_id=p_tenant_id and ml.id=r.movement_line_id left join public.inv_stock_movements m on m.tenant_id=p_tenant_id and m.id=ml.movement_id where r.tenant_id=p_tenant_id;
 issued:=issued-coalesce((select sum(r.credit) from public.inv_material_returns r join public.inv_stock_movements m on m.tenant_id=p_tenant_id and m.id=r.movement_id and m.posted_at is not null where r.tenant_id=p_tenant_id and r.accepted),0);
 return jsonb_build_object('activeItems',active_count,'stockQuantity',stock::text,'lowStockItems',low_count,'outOfStockItems',out_count,'criticalItems',critical,
  'recentMovements',public.inv_list_inventory_movements(p_tenant_id,p_actor_user_id,'{"limit":6}')->'items',
  'workflow',jsonb_build_object('openMaterialRequests',(select count(*) from public.inv_material_requests where tenant_id=p_tenant_id and status not in ('closed','cancelled')),
    'openPurchaseOrders',(select count(*) from public.inv_purchase_orders where tenant_id=p_tenant_id and status not in ('closed','completed','cancelled')),
    'pendingInspections',(select count(*) from public.inv_inspection_reports where tenant_id=p_tenant_id and inspected_at is null),
    'pendingReceipts',(select count(*) from public.inv_inspection_reports r where r.tenant_id=p_tenant_id and r.receipt_movement_id is null and (r.accepted_by_user_id is not null or r.status='accepted') and exists(select 1 from public.inv_inspection_report_lines l where l.tenant_id=p_tenant_id and l.inspection_report_id=r.id and l.accepted_quantity>0)),
    'issuedNetCost',case when cost_unknown then null else issued::text end));
end $$;

revoke all on function public.inv_read_object(jsonb,text[]),public.inv_read_limit(jsonb),public.inv_read_scope(uuid,uuid,text,jsonb),public.inv_encode_page(text,text,uuid),public.inv_decode_page(text,text),public.inv_json_page(text,jsonb,integer),public.inv_document_headers(uuid),public.inv_document_actions(text,text,boolean,text),public.inv_document_summary(jsonb,text),public.inv_document_lines(uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.inv_list_procurement_documents(uuid,uuid,jsonb),public.inv_get_procurement_reference_data(uuid,uuid,jsonb),public.inv_get_procurement_document(uuid,uuid,jsonb),public.inv_list_inventory_movements(uuid,uuid,jsonb),public.inv_get_inventory_dashboard(uuid,uuid) from public,anon,authenticated;
grant execute on function public.inv_list_procurement_documents(uuid,uuid,jsonb),public.inv_get_procurement_reference_data(uuid,uuid,jsonb),public.inv_get_procurement_document(uuid,uuid,jsonb),public.inv_list_inventory_movements(uuid,uuid,jsonb),public.inv_get_inventory_dashboard(uuid,uuid) to service_role;
