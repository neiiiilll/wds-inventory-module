import assert from "node:assert/strict"
import { before, after, test } from "node:test"
import { createTestDatabase } from "./runtime.mjs"
let db
const tenant = "10000000-0000-4000-8000-000000000001", foreignTenant = "10000000-0000-4000-8000-000000000002"
const actor = "20000000-0000-4000-8000-000000000001", viewer = "20000000-0000-4000-8000-000000000003", foreignActor = "20000000-0000-4000-8000-000000000004"
let item, location, foreignItem
before(async () => {
  db = await createTestDatabase()
  // Production uses UTC; never let the Windows host timezone mask date bugs.
  await db.client.query("set timezone='UTC'")
  for (const [t,prefix] of [[tenant,"A"],[foreignTenant,"B"]]) {
    const category = (await db.client.query("insert into inv_categories(tenant_id,code,name) values($1,'CAT','Fixture category') returning id",[t])).rows[0].id
    const unit = (await db.client.query("insert into inv_units(tenant_id,code,name,symbol) values($1,'PCS','Pieces','pcs') returning id",[t])).rows[0].id
    const warehouse = (await db.client.query("insert into inv_warehouses(tenant_id,code,name) values($1,'WH','Fixture warehouse') returning id",[t])).rows[0].id
    const locations = (await db.client.query("insert into inv_storage_locations(tenant_id,warehouse_id,location_code) values($1,$2,'L1'),($1,$2,'L2') returning id",[t,warehouse])).rows
    const items = (await db.client.query("insert into inv_inventory_items(tenant_id,item_code,name,category_id,unit_id,minimum_quantity,active) select $1,$4||'-'||lpad(n::text,3,'0'),'Fixture '||n,$2,$3,5,n<=103 from generate_series(1,$5::integer) n returning id,item_code",[t,category,unit,prefix,t===tenant?105:1])).rows
    if(t===tenant) {
      item=items[0].id;location=locations[0].id
      await db.client.query("insert into inv_inventory_balances(tenant_id,item_id,location_id,quantity) select $1,id,$2,case item_code when 'A-001' then 3 when 'A-002' then 0 when 'A-003' then 2 when 'A-104' then 999 else 10 end from inv_inventory_items where tenant_id=$1",[t,location])
      await db.client.query("insert into inv_inventory_balances(tenant_id,item_id,location_id,quantity) values($1,$2,$3,4)",[t,item,locations[1].id])
      const movement=(await db.client.query("insert into inv_stock_movements(tenant_id,movement_type,idempotency_key,posted_at,actor_user_id,occurred_at) values($1,'receipt','posted',now(),$2,'2026-10-22T17:00:00Z') returning id",[t,actor])).rows[0].id
      await db.client.query("insert into inv_stock_movement_lines(tenant_id,movement_id,line_no,item_id,location_id,signed_quantity,unit_cost,value_delta,balance_after) select $1,$2,n,$3,$4,1,1.25,1.25,n from generate_series(1,7)n",[t,movement,item,location])
      const draft=(await db.client.query("insert into inv_stock_movements(tenant_id,movement_type,idempotency_key) values($1,'receipt','unposted') returning id",[t])).rows[0].id
      await db.client.query("insert into inv_stock_movement_lines(tenant_id,movement_id,line_no,item_id,location_id,signed_quantity) values($1,$2,1,$3,$4,900)",[t,draft,item,location])
    } else foreignItem=items[0].id
  }
  await db.client.query("insert into inv_material_request_lines(tenant_id,material_request_id,line_no,item_id,quantity,specification) values($1,'40000000-0000-4000-8000-000000000001',1,$2,1,'First'),($1,'40000000-0000-4000-8000-000000000001',2,$2,2,'Second')",[tenant,item])
})
after(async () => { if(db) await db.close() })
async function rpc(name, input, user=actor, t=tenant) {
  const args=input===undefined?[t,user]:[t,user,input]
  return (await db.client.query(`select ${name}(${args.map((_,n)=>'$'+(n+1)).join(',')}) as result`,args)).rows[0].result
}
test("dashboard aggregates all active items and location balances rather than the first page", async () => {
  const installed=await db.client.query("select to_regprocedure('inv_get_inventory_dashboard(uuid,uuid)') is not null as installed")
  assert.equal(installed.rows[0].installed,true,"The live Dashboard SQL operation is required")
  const result=await rpc('inv_get_inventory_dashboard')
  assert.equal(result.activeItems,103);assert.equal(result.stockQuantity,'1009')
  assert.equal(result.lowStockItems,1);assert.equal(result.outOfStockItems,1)
  assert.deepEqual(result.criticalItems.map(row=>row.itemCode),['A-002','A-003'])
  assert.equal(result.recentMovements.length,6)
  assert.ok(result.recentMovements.every(row=>row.quantity==='1'&&row.unitCost==='1.25'))
})
test("Viewer Dashboard is tenant-scoped and another tenant has independent counts", async () => {
  assert.equal((await rpc('inv_get_inventory_dashboard',undefined,viewer)).activeItems,103)
  const other=await rpc('inv_get_inventory_dashboard',undefined,foreignActor,foreignTenant)
  assert.equal(other.activeItems,1);assert.equal(other.stockQuantity,'0');assert.equal(other.outOfStockItems,1)
  await assert.rejects(rpc('inv_get_inventory_dashboard',undefined,foreignActor),error=>error.code==='42501')
})
test("selectors paginate with scoped cursors and never expose another tenant's items",async()=>{
  const first=await rpc('inv_get_procurement_reference_data',{kind:'items',limit:100})
  assert.equal(first.items.length,100);assert.ok(first.nextCursor)
  const second=await rpc('inv_get_procurement_reference_data',{kind:'items',limit:100,cursor:first.nextCursor})
  assert.equal(second.items.length,3);assert.equal(second.nextCursor,null)
  assert.ok([...first.items,...second.items].every(row=>row.id!==foreignItem))
  await assert.rejects(rpc('inv_get_procurement_reference_data',{kind:'items',limit:100,search:'different',cursor:first.nextCursor}),error=>error.code==='22023')
  await assert.rejects(rpc('inv_get_procurement_reference_data',{kind:'svc_tickets',limit:100}),error=>error.code==='22023')
})
test("historical detail preserves existing status and marks missing snapshots without inventions",async()=>{
  const doc=await rpc('inv_get_procurement_document',{kind:'material_request',id:'40000000-0000-4000-8000-000000000001'})
  assert.equal(doc.status,'approved');assert.equal(doc.historical,true);assert.equal(doc.fields.approved_by_user_id,null)
  assert.equal(doc.lines[0].snapshot,null);assert.equal(doc.lines[0].quantity,'1')
  await assert.rejects(rpc('inv_get_procurement_document',{kind:'material_request',id:'40000000-0000-4000-8000-000000000001'},foreignActor,foreignTenant),error=>error.code==='P0002')
  const list=await rpc('inv_list_procurement_documents',{kind:'material_request',limit:20})
  assert.equal(list.items.length,1);assert.equal(list.items[0].reference,'HISTORICAL-MR')
  assert.deepEqual((await rpc('inv_list_procurement_documents',{kind:'material_request',limit:20},foreignActor,foreignTenant)).items,[])
})
test("unknown historical states stay readable but expose no guessed workflow actions",async()=>{
  const {rows}=await db.client.query("insert into inv_purchase_requests(tenant_id,request_no,status) values($1,'UNKNOWN-HISTORICAL','legacy-awaiting-external-review') returning id",[tenant])
  const doc=await rpc('inv_get_procurement_document',{kind:'purchase_request',id:rows[0].id})
  assert.equal(doc.status,'legacy-awaiting-external-review');assert.equal(doc.historical,true);assert.deepEqual(doc.availableActions,[])
})
test("public read entrypoints work under service_role but not browser database roles",async()=>{
  const service=await db.connect()
  try { await service.query('set role service_role');assert.equal((await service.query('select inv_get_inventory_dashboard($1,$2) as result',[tenant,viewer])).rows[0].result.activeItems,103) }
  finally { await service.end() }
  const browser=await db.connect()
  try { await browser.query('set role authenticated');await assert.rejects(browser.query('select inv_get_inventory_dashboard($1,$2)',[tenant,actor]),error=>error.code==='42501') }
  finally { await browser.end() }
  const reviewers=await rpc('inv_get_procurement_reference_data',{kind:'reviewers',limit:100})
  assert.equal(reviewers.items.length,2);assert.ok(reviewers.items.every(row=>row.id!==viewer&&row.id!==foreignActor))
})
test("movement pages contain posted lines only and reject cross-filter cursors",async()=>{
  const first=await rpc('inv_list_inventory_movements',{limit:5})
  assert.equal(first.items.length,5);assert.ok(first.nextCursor)
  const second=await rpc('inv_list_inventory_movements',{limit:5,cursor:first.nextCursor})
  assert.equal(second.items.length,2);assert.equal(second.nextCursor,null)
  await assert.rejects(rpc('inv_list_inventory_movements',{limit:5,itemId:foreignItem,cursor:first.nextCursor}),error=>error.code==='22023')
  assert.equal((await rpc('inv_list_inventory_movements',{itemId:foreignItem})).items.length,0)
})
test("document line cursors work with the omitted default section and cannot cross documents",async()=>{
  const input={kind:'material_request',id:'40000000-0000-4000-8000-000000000001',limit:1}
  const first=await rpc('inv_get_procurement_document',input)
  assert.equal(first.lines[0].quantity,'1');assert.ok(first.linesNextCursor)
  const next=await rpc('inv_get_procurement_document',{...input,cursor:first.linesNextCursor})
  assert.equal(next.lines[0].quantity,'2');assert.equal(next.linesNextCursor,null)
  await assert.rejects(rpc('inv_get_procurement_document',{...input,section:'history',cursor:first.linesNextCursor}),error=>error.code==='22023')
})
test("movement date filters use the application's Asia Manila calendar day",async()=>{
  const page=await rpc('inv_list_inventory_movements',{dateFrom:'2026-10-23',dateTo:'2026-10-23',limit:100})
  assert.equal(page.items.length,7)
})
test("long historical selector labels still paginate without invalid emitted cursors",async()=>{
  await db.client.query("insert into inv_suppliers(tenant_id,supplier_code,name) values($1,'LONG-A',repeat('x',250)||'A'),($1,'LONG-B',repeat('x',250)||'B')",[tenant])
  const first=await rpc('inv_get_procurement_reference_data',{kind:'suppliers',limit:1})
  assert.equal(first.items.length,1);assert.ok(first.nextCursor)
  const second=await rpc('inv_get_procurement_reference_data',{kind:'suppliers',limit:1,cursor:first.nextCursor})
  assert.equal(second.items.length,1);assert.equal(second.nextCursor,null);assert.notEqual(first.items[0].id,second.items[0].id)
})
test("unresolved historical release posting returns an unknown cost rather than a guessed zero",async()=>{
  const ris=(await db.client.query("insert into inv_requisition_issue_slips(tenant_id,ris_no) values($1,'LEGACY-UNRESOLVED') returning id",[tenant])).rows[0].id
  const line=(await db.client.query("insert into inv_requisition_issue_slip_lines(tenant_id,ris_id,line_no,item_id,requested_quantity) values($1,$2,1,$3,1) returning id",[tenant,ris,item])).rows[0].id
  const movementLine=(await db.client.query("select l.id from inv_stock_movement_lines l join inv_stock_movements m on m.tenant_id=$1 and m.id=l.movement_id where l.tenant_id=$1 and m.idempotency_key='unposted'",[tenant])).rows[0].id
  await db.client.query("insert into inv_ris_releases(tenant_id,ris_line_id,movement_line_id,quantity,unit_cost,recipient_name) values($1,$2,$3,1,0,'Historical recipient')",[tenant,line,movementLine])
  assert.equal((await rpc('inv_get_inventory_dashboard')).workflow.issuedNetCost,null)
})
