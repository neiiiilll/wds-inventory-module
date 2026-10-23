import { randomUUID } from "node:crypto"
export const tenant="10000000-0000-4000-8000-000000000001", foreignTenant="10000000-0000-4000-8000-000000000002"
export const admin="20000000-0000-4000-8000-000000000001", staff="20000000-0000-4000-8000-000000000002", viewer="20000000-0000-4000-8000-000000000003", foreignAdmin="20000000-0000-4000-8000-000000000004"
export async function catalog(db,t=tenant) {
 const q=(sql,args)=>db.client.query(sql,args).then(result=>result.rows[0].id)
 const category=await q("insert into inv_categories(tenant_id,code,name) values($1,$2,'Fixture category') returning id",[t,randomUUID()])
 const unit=await q("insert into inv_units(tenant_id,code,name,symbol) values($1,$2,'Pieces','pcs') returning id",[t,randomUUID()])
 const item=await q("insert into inv_inventory_items(tenant_id,item_code,name,category_id,unit_id) values($1,$2,'Fixture material',$3,$4) returning id",[t,randomUUID(),category,unit])
 const supplier=await q("insert into inv_suppliers(tenant_id,supplier_code,name) values($1,$2,'Fixture supplier') returning id",[t,randomUUID()])
 const warehouse=await q("insert into inv_warehouses(tenant_id,code,name) values($1,$2,'Fixture warehouse') returning id",[t,randomUUID()])
 const location=await q("insert into inv_storage_locations(tenant_id,warehouse_id,location_code) values($1,$2,'MAIN') returning id",[t,warehouse])
 return {item,supplier,location,warehouse,unit,category}
}
export function commands(db,t=tenant,actor=admin,client=db.client) {
 return async (kind,input={},id=null,expectedVersion=null,key=randomUUID())=>{
   const {rows}=await client.query("select inv_execute_procurement_command($1,$2,$3,$4,$5,$6,$7::jsonb) as result",[t,actor,kind,id,expectedVersion,key,input])
   return rows[0].result
 }
}
export async function approvedRequirement(db,refs,quantity="10") {
 const cmd=commands(db)
 const mr=await cmd('createMaterialRequest',{requestedOn:'2026-10-23',job:'Fixture job',lines:[{itemId:refs.item,quantity,specification:'Fixture specification'}]})
 const approved=await cmd('approveMaterialRequest',{reference:'Fixture approval'},mr.id,mr.version)
 const lines=(await db.client.query('select id from inv_material_request_lines where tenant_id=$1 and material_request_id=$2',[tenant,mr.id])).rows
 return {...approved,lineId:lines[0].id}
}
export async function quotedRequirement(db,refs,quantity="10") {
 const mr=await approvedRequirement(db,refs,quantity),cmd=commands(db)
 const quote=await cmd('createQuotation',{materialRequestId:mr.id,supplierId:refs.supplier,reference:randomUUID(),quotedOn:'2026-10-23',lines:[{materialRequestLineId:mr.lineId,quantity,unitPrice:'12.50'}]})
 const line=(await db.client.query('select id from inv_supplier_quotation_lines where tenant_id=$1 and quotation_id=$2',[tenant,quote.id])).rows[0].id
 return {mr,quote,quoteLineId:line}
}
export async function draftPurchaseRequest(db,refs,quantity="10") {
 const q=await quotedRequirement(db,refs,quantity)
 const pr=await commands(db)('createPurchaseRequest',{materialRequestId:q.mr.id,quotationId:q.quote.id,requestedOn:'2026-10-23',selectionReason:'Fixture selection',reviewers:[admin,admin,admin,admin],lines:[{quotationLineId:q.quoteLineId,quantity}]})
 return {...q,pr}
}
export async function approvedPurchaseRequest(db,refs,quantity="10") {
 const f=await draftPurchaseRequest(db,refs,quantity),cmd=commands(db)
 let pr=await cmd('submitPurchaseRequest',{},f.pr.id,f.pr.version)
 for(let stageOrder=1;stageOrder<=4;stageOrder++)pr=await cmd('reviewPurchaseRequest',{stageOrder,decision:'approved',reason:'Fixture review'},pr.id,pr.version)
 const prLineId=(await db.client.query('select id from inv_purchase_request_lines where tenant_id=$1 and purchase_request_id=$2',[tenant,pr.id])).rows[0].id
 return {...f,pr,prLineId}
}
