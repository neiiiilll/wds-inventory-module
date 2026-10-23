import assert from 'node:assert/strict'
import {before,after,test} from 'node:test'
import {randomUUID} from 'node:crypto'
import {createTestDatabase} from './runtime.mjs'
import {catalog,commands,dispatchedOrder,deliveredReport,inspectedReport,tracking,tenant,foreignTenant,admin,staff,viewer} from './procurement-fixture.mjs'
let db,cmd
before(async()=>{db=await createTestDatabase();cmd=commands(db)})
after(async()=>{if(db)await db.close()})
test('receiving commands are installed as an atomic transaction',async()=>{
 const refs=await catalog(db),f=await deliveredReport(db,refs)
 assert.equal(f.report.kind,'inspection');assert.equal(f.report.status,'pending')
})
test('partial acceptance posts exact decimal value once and rejected quantities never enter stock',async()=>{
 const refs=await catalog(db);await tracking(db,refs)
 const f=await inspectedReport(db,refs,{accepted:'6',damaged:'2',rejected:'2'})
 const key=randomUUID(),input={acceptedOn:'2026-10-23',reference:'Fixture acceptance'}
 const accepted=await cmd('acceptInspection',input,f.report.id,f.report.version,key)
 const replay=await cmd('acceptInspection',input,f.report.id,f.report.version,key)
 assert.equal(accepted.status,'accepted');assert.equal(replay.replayed,true)
 const balance=(await db.client.query('select quantity::text,inventory_value::text from inv_inventory_balances where tenant_id=$1 and item_id=$2',[tenant,refs.item])).rows[0]
 assert.deepEqual(balance,{quantity:'6',inventory_value:'75.00'})
 const report=(await db.client.query('select receipt_movement_id,accepted_by_user_id from inv_inspection_reports where tenant_id=$1 and id=$2',[tenant,f.report.id])).rows[0]
 assert.ok(report.receipt_movement_id);assert.equal(report.accepted_by_user_id,admin)
 assert.equal((await db.client.query('select count(*)::int as n from inv_stock_movements where tenant_id=$1 and source_reference=$2',[tenant,f.report.id])).rows[0].n,1)
})
test('all-rejected inspection can be acknowledged without stock or tracking inference',async()=>{
 const refs=await catalog(db),f=await inspectedReport(db,refs,{accepted:'0',rejected:'10'})
 await cmd('acceptInspection',{acceptedOn:'2026-10-23',reference:'All rejected'},f.report.id,f.report.version)
 assert.equal((await db.client.query('select receipt_movement_id from inv_inspection_reports where tenant_id=$1 and id=$2',[tenant,f.report.id])).rows[0].receipt_movement_id,null)
 assert.equal((await db.client.query('select count(*)::int as n from inv_inventory_balances where tenant_id=$1 and item_id=$2',[tenant,refs.item])).rows[0].n,0)
})
test('unknown tracking and unsupported valuation fail without accepting or posting',async()=>{
 for(const mode of ['unknown','fifo','standard']){
  const refs=await catalog(db),f=await inspectedReport(db,refs)
  if(mode!=='unknown'){await tracking(db,refs);await db.client.query('update inv_inventory_items set cost_method=$1 where tenant_id=$2 and id=$3',[mode,tenant,refs.item])}
  await assert.rejects(cmd('acceptInspection',{acceptedOn:'2026-10-23',reference:'Must block'},f.report.id,f.report.version),error=>error.code==='55000')
  assert.equal((await db.client.query('select accepted_by_user_id from inv_inspection_reports where tenant_id=$1 and id=$2',[tenant,f.report.id])).rows[0].accepted_by_user_id,null)
  assert.equal((await db.client.query('select count(*)::int as n from inv_inventory_balances where tenant_id=$1 and item_id=$2',[tenant,refs.item])).rows[0].n,0)
 }
})
test('tagged receipt creates one asset per accepted unit and duplicate tags roll back',async()=>{
 const refs=await catalog(db);await tracking(db,refs,'individually_tagged')
 const f=await inspectedReport(db,refs,{quantity:'2',tags:['TAG-A','TAG-B']})
 await cmd('acceptInspection',{acceptedOn:'2026-10-23',reference:'Tagged'},f.report.id,f.report.version)
 assert.equal((await db.client.query('select count(*)::int as n from inv_inventory_assets where tenant_id=$1 and item_id=$2',[tenant,refs.item])).rows[0].n,2)
 const duplicate=await inspectedReport(db,refs,{quantity:'2',tags:['TAG-C','TAG-A']})
 await assert.rejects(cmd('acceptInspection',{acceptedOn:'2026-10-23',reference:'Duplicate'},duplicate.report.id,duplicate.report.version),error=>['55000','23505'].includes(error.code))
 assert.equal((await db.client.query("select count(*)::int as n from inv_inventory_assets where tenant_id=$1 and asset_tag='TAG-C'",[tenant])).rows[0].n,0)
 assert.equal((await db.client.query('select quantity::text from inv_inventory_balances where tenant_id=$1 and item_id=$2',[tenant,refs.item])).rows[0].quantity,'2')
})
test('dispatch chronology, stale versions, foreign lines and foreign locations fail closed',async()=>{
 const refs=await catalog(db),foreign=await catalog(db,foreignTenant),f=await dispatchedOrder(db,refs)
 await assert.rejects(cmd('recordDelivery',{deliveredOn:'2026-10-22',reference:'Too early',lines:[{purchaseOrderLineId:f.orderLineId,quantity:'1'}]},f.po.id,f.po.version),error=>error.code==='22023')
 await assert.rejects(cmd('recordDelivery',{deliveredOn:'2026-10-23',reference:'Foreign line',lines:[{purchaseOrderLineId:foreign.item,quantity:'1'}]},f.po.id,f.po.version),error=>error.code==='P0002')
 await assert.rejects(cmd('recordDelivery',{deliveredOn:'2026-10-23',reference:'Stale',lines:[{purchaseOrderLineId:f.orderLineId,quantity:'1'}]},f.po.id,1),error=>error.code==='40001')
 const delivered=await deliveredReport(db,refs)
 await assert.rejects(cmd('recordInspection',{inspectedOn:'2026-10-23',findings:'Foreign location',lines:[{inspectionLineId:delivered.inspectionLineId,acceptedQuantity:'10',damagedQuantity:'0',rejectedQuantity:'0',locationId:foreign.location}]},delivered.report.id,delivered.report.version),error=>error.code==='P0002')
 await assert.rejects(commands(db,tenant,viewer)('recordDelivery',{},f.po.id,f.po.version),error=>error.code==='42501')
})
test('supplier returns and linked replacements cannot exceed inspected rejection capacity',async()=>{
 const refs=await catalog(db),f=await inspectedReport(db,refs,{accepted:'6',rejected:'4'})
 let report=await cmd('recordSupplierReturn',{inspectionLineId:f.inspectionLineId,quantity:'3',returnedOn:'2026-10-23',reference:'Return-'+randomUUID(),reason:'Rejected'},f.report.id,f.report.version)
 await assert.rejects(cmd('recordSupplierReturn',{inspectionLineId:f.inspectionLineId,quantity:'2',returnedOn:'2026-10-23',reference:'Return-'+randomUUID(),reason:'Excess'},report.id,report.version),error=>error.code==='55000')
 const po=(await db.client.query('select version::int from inv_purchase_orders where tenant_id=$1 and id=$2',[tenant,f.po.id])).rows[0]
 const replacement=await cmd('recordDelivery',{deliveredOn:'2026-10-23',reference:'Replacement-'+randomUUID(),replacementOfReportId:f.report.id,lines:[{purchaseOrderLineId:f.orderLineId,quantity:'3',replacementOfLineId:f.inspectionLineId}]},f.po.id,po.version)
 await assert.rejects(cmd('recordDelivery',{deliveredOn:'2026-10-23',reference:'Excess-'+randomUUID(),replacementOfReportId:f.report.id,lines:[{purchaseOrderLineId:f.orderLineId,quantity:'2',replacementOfLineId:f.inspectionLineId}]},f.po.id,replacement.parentVersion),error=>error.code==='55000')
})
test('concurrent deliveries returns and replacements cannot allocate the same capacity',async()=>{
 for(const scenario of ['delivery','return','replacement']){
  const refs=await catalog(db),f=scenario==='delivery'?await dispatchedOrder(db,refs):await inspectedReport(db,refs,{accepted:'0',rejected:'10'})
  const a=await db.connect(),b=await db.connect()
  try{
   const invoke=(actor,client)=>{const c=commands(db,tenant,actor,client)
    if(scenario==='return')return c('recordSupplierReturn',{inspectionLineId:f.inspectionLineId,quantity:'6',returnedOn:'2026-10-23',reference:randomUUID(),reason:'Fixture'},f.report.id,f.report.version)
    const poVersion=scenario==='delivery'?f.po.version:f.report.parentVersion
    return c('recordDelivery',{deliveredOn:'2026-10-23',reference:randomUUID(),...(scenario==='replacement'?{replacementOfReportId:f.report.id}:{}),lines:[{purchaseOrderLineId:f.orderLineId,quantity:'6',...(scenario==='replacement'?{replacementOfLineId:f.inspectionLineId}:{})}]},f.po.id,poVersion)
   }
   const result=await Promise.allSettled([invoke(admin,a),invoke(staff,b)])
   assert.equal(result.filter(r=>r.status==='fulfilled').length,1,scenario)
   assert.ok(['40001','55000'].includes(result.find(r=>r.status==='rejected').reason.code))
  }finally{await a.end();await b.end()}
 }
})
