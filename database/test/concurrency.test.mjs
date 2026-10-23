import assert from "node:assert/strict"
import {before,after,test} from "node:test"
import {createTestDatabase} from "./runtime.mjs"
import {catalog,commands,draftPurchaseRequest,approvedPurchaseRequest,tenant,admin,staff} from "./procurement-fixture.mjs"
let db,refs
before(async()=>{db=await createTestDatabase();refs=await catalog(db)})
after(async()=>{if(db)await db.close()})
test("concurrent document creates receive unique server numbers",async()=>{
 const a=await db.connect(),b=await db.connect()
 try {
  const result=await Promise.all([commands(db,tenant,admin,a)('createMaterialRequest',{job:'Concurrent A',requestedOn:'2026-10-23',lines:[{itemId:refs.item,quantity:'1',specification:'A'}]}),commands(db,tenant,staff,b)('createMaterialRequest',{job:'Concurrent B',requestedOn:'2026-10-23',lines:[{itemId:refs.item,quantity:'1',specification:'B'}]})])
  assert.notEqual(result[0].id,result[1].id);assert.notEqual(result[0].reference,result[1].reference)
 } finally {await a.end();await b.end()}
})
test("two simultaneous submissions cannot reserve the same PR twice",async()=>{
 const f=await draftPurchaseRequest(db,refs),a=await db.connect(),b=await db.connect()
 try {
  const result=await Promise.allSettled([commands(db,tenant,admin,a)('submitPurchaseRequest',{},f.pr.id,f.pr.version),commands(db,tenant,staff,b)('submitPurchaseRequest',{},f.pr.id,f.pr.version)])
  assert.equal(result.filter(row=>row.status==='fulfilled').length,1)
  assert.equal(result.find(row=>row.status==='rejected').reason.code,'40001')
  assert.equal((await db.client.query("select count(*)::integer as count from inv_procurement_events where tenant_id=$1 and document_id=$2 and action='submitPurchaseRequest'",[tenant,f.pr.id])).rows[0].count,1)
 } finally {await a.end();await b.end()}
})
test("two simultaneous POs cannot over-allocate their approved PR",async()=>{
 const f=await approvedPurchaseRequest(db,refs),a=await db.connect(),b=await db.connect()
 try {
  const input={purchaseRequestId:f.pr.id,orderedOn:'2026-10-23',lines:[{purchaseRequestLineId:f.prLineId,quantity:'6'}]}
  const result=await Promise.allSettled([commands(db,tenant,admin,a)('createPurchaseOrder',input),commands(db,tenant,staff,b)('createPurchaseOrder',input)])
  assert.equal(result.filter(row=>row.status==='fulfilled').length,1)
  assert.equal(result.find(row=>row.status==='rejected').reason.code,'55000')
  const {rows}=await db.client.query('select sum(l.quantity)::text as quantity from inv_purchase_order_lines l join inv_purchase_orders o on o.tenant_id=$1 and o.id=l.purchase_order_id where l.tenant_id=$1 and o.purchase_request_id=$2',[tenant,f.pr.id])
  assert.equal(rows[0].quantity,'6')
 } finally {await a.end();await b.end()}
})
