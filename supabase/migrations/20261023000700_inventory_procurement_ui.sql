-- Forward-only Inventory UI metadata. This migration does not alter Service Desk objects.
create or replace function public.inv_get_procurement_reference_data(p_tenant_id uuid,p_actor_user_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare scope text; position jsonb; page_limit integer; rows jsonb;
begin
 perform public.inv_require_procurement_access(p_tenant_id,p_actor_user_id,false,false);
 perform public.inv_read_object(p_input,array['kind','limit','cursor','search']);
 if coalesce(p_input->>'kind','') not in ('items','suppliers','locations','requesters','reviewers','warehouses') then raise exception using errcode='22023',message='Invalid selector.'; end if;
 page_limit:=public.inv_read_limit(p_input); scope:=public.inv_read_scope(p_tenant_id,p_actor_user_id,'references',p_input); position:=public.inv_decode_page(scope,p_input->>'cursor');
 with refs as (
   select i.id,i.item_code||' · '||i.name as label,jsonb_build_object('itemCode',i.item_code,'name',i.name,'unitId',i.unit_id,'unitName',u.name,'unitSymbol',u.symbol,'quantityPrecision',u.quantity_precision,'version',i.version,'costMethod',i.cost_method,'trackingMode',tr.mode,'trackingVersion',tr.version,'quantity',(select coalesce(sum(b.quantity),0)::text from public.inv_inventory_balances b where b.tenant_id=p_tenant_id and b.item_id=i.id)) as metadata
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

revoke all on function public.inv_get_procurement_reference_data(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.inv_get_procurement_reference_data(uuid,uuid,jsonb) to service_role;
