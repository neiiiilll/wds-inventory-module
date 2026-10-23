import assert from "node:assert/strict"
import {before,after,test} from "node:test"
import {createTestDatabase} from "./runtime.mjs"
import {catalog,commands,approvedRequirement,quotedRequirement,draftPurchaseRequest,approvedPurchaseRequest,tenant,foreignTenant,admin,staff,viewer,foreignAdmin} from "./procurement-fixture.mjs"
let db,refs,foreign,cmd
before(async()=>{db=await createTestDatabase();refs=await catalog(db);foreign=await catalog(db,foreignTenant);cmd=commands(db)})
after(async()=>{if(db)await db.close()})
test("authenticated procurement transaction entrypoint exists",async()=>{
 const {rows}=await db.client.query("select to_regprocedure('inv_execute_procurement_command(uuid,uuid,text,uuid,bigint,text,jsonb)') is not null as installed")
 assert.equal(rows[0].installed,true,'An atomic procurement command entrypoint is required')
})
test("complete approved request quotation staged review PO and dispatch persist authoritative prices",async()=>{
 const f=await approvedPurchaseRequest(db,refs)
 assert.equal(f.pr.status,'approved');assert.equal(f.pr.version,6)
 const po=await cmd('createPurchaseOrder',{purchaseRequestId:f.pr.id,orderedOn:'2026-10-23',lines:[{purchaseRequestLineId:f.prLineId,quantity:'10'}]})
 const sent=await cmd('dispatchPurchaseOrder',{dispatchedOn:'2026-10-23',method:'email',recipient:'Fixture supplier',reference:'Dispatch fixture',reason:'Fixture dispatch'},po.id,po.version)
 assert.equal(sent.status,'dispatched')
 const {rows}=await db.client.query('select agreed_price::text,item_snapshot is not null as snapshot from inv_purchase_order_lines where tenant_id=$1 and purchase_order_id=$2',[tenant,po.id])
 assert.deepEqual(rows,[{agreed_price:'12.50',snapshot:true}])
 const decisions=await db.client.query('select decision,acted_by_user_id from inv_procurement_review_steps where tenant_id=$1 and purchase_request_id=$2 order by stage_order',[tenant,f.pr.id])
 assert.deepEqual(decisions.rows.map(row=>row.decision),['approved','approved','approved','approved']);assert.ok(decisions.rows.every(row=>row.acted_by_user_id===admin))
})
test("Viewer and foreign actors cannot mutate even with malformed command data",async()=>{
 for(const actor of [viewer,foreignAdmin])await assert.rejects(commands(db,tenant,actor)('createMaterialRequest',{}),error=>error.code==='42501')
 await assert.rejects(cmd('createMaterialRequest',{requestedOn:'2026-10-23',job:'Foreign item',lines:[{itemId:foreign.item,quantity:'1',specification:'x'}]}),error=>error.code==='P0002')
})
test("Staff cannot choose someone else's requester and free-text approval identities are rejected",async()=>{
 const personnel=(await db.client.query("insert into personnel(tenant_id,employee_code,full_name,user_id) values($1,'FIXTURE-ADMIN','Administrator',$2) returning id",[tenant,admin])).rows[0].id
 await assert.rejects(commands(db,tenant,staff)('createMaterialRequest',{requesterPersonnelId:personnel,requestedOn:'2026-10-23',job:'Override',lines:[{itemId:refs.item,quantity:'1',specification:'x'}]}),error=>error.code==='42501')
 const mr=await approvedRequirement(db,refs)
 await assert.rejects(cmd('approveMaterialRequest',{reference:'x',person:'Other reviewer'},mr.id,mr.version),error=>error.code==='22023')
})
test("MR edits reset approval and stale quotes cannot be selected",async()=>{
 const f=await quotedRequirement(db,refs)
 const edited=await cmd('editMaterialRequest',{job:'Revised job',reason:'Fixture revision',lines:[{itemId:refs.item,quantity:'10',specification:'New specification'}]},f.mr.id,f.mr.version)
 assert.equal(edited.status,'draft')
 await cmd('approveMaterialRequest',{reference:'Reapproval'},edited.id,edited.version)
 await assert.rejects(cmd('createPurchaseRequest',{materialRequestId:f.mr.id,quotationId:f.quote.id,requestedOn:'2026-10-23',selectionReason:'Stale',reviewers:[admin,admin,admin,admin],lines:[{quotationLineId:f.quoteLineId,quantity:'1'}]}),error=>error.code==='55000')
})
test("foreign supplier, reviewer and source line references cannot enter a purchase request",async()=>{
 const f=await quotedRequirement(db,refs)
 const input={materialRequestId:f.mr.id,quotationId:f.quote.id,requestedOn:'2026-10-23',selectionReason:'Fixture',reviewers:[admin,admin,admin,admin],lines:[{quotationLineId:f.quoteLineId,quantity:'1'}]}
 await assert.rejects(cmd('createQuotation',{materialRequestId:f.mr.id,supplierId:foreign.supplier,reference:'Foreign supplier',quotedOn:'2026-10-23',lines:[{materialRequestLineId:f.mr.lineId,quantity:'1',unitPrice:'1'}]}),error=>error.code==='P0002')
 await assert.rejects(cmd('createPurchaseRequest',{...input,reviewers:[foreignAdmin,admin,admin,admin]}),error=>error.code==='42501')
 await assert.rejects(cmd('createPurchaseRequest',{...input,lines:[{quotationLineId:foreign.item,quantity:'1'}]}),error=>error.code==='P0002')
 assert.equal((await db.client.query('select count(*)::int as n from inv_purchase_requests where tenant_id=$1 and material_request_id=$2',[tenant,f.mr.id])).rows[0].n,0)
})
test("expired quotations and excessive or fractional quantities fail without partial documents",async()=>{
 const f=await quotedRequirement(db,refs)
 const input={materialRequestId:f.mr.id,quotationId:f.quote.id,requestedOn:'2026-10-23',selectionReason:'Fixture',reviewers:[admin,admin,admin,admin],lines:[{quotationLineId:f.quoteLineId,quantity:'11'}]}
 await assert.rejects(cmd('createPurchaseRequest',input),error=>error.code==='55000')
 await assert.rejects(cmd('createPurchaseRequest',{...input,lines:[{quotationLineId:f.quoteLineId,quantity:'1.5'}]}),error=>error.code==='22023')
 await db.client.query("update inv_supplier_quotations set valid_until='2026-10-22' where tenant_id=$1 and id=$2",[tenant,f.quote.id])
 await assert.rejects(cmd('createPurchaseRequest',{...input,lines:[{quotationLineId:f.quoteLineId,quantity:'1'}]}),error=>error.code==='55000')
 assert.equal((await db.client.query('select count(*)::int as n from inv_purchase_requests where tenant_id=$1 and material_request_id=$2',[tenant,f.mr.id])).rows[0].n,0)
})
test("only the pending assigned reviewer may act and return requires a saved revision",async()=>{
 const f=await draftPurchaseRequest(db,refs),submitted=await cmd('submitPurchaseRequest',{},f.pr.id,f.pr.version)
 await assert.rejects(commands(db,tenant,staff)('reviewPurchaseRequest',{stageOrder:1,decision:'approved',reason:'Impersonation'},submitted.id,submitted.version),error=>error.code==='42501')
 await assert.rejects(cmd('reviewPurchaseRequest',{stageOrder:2,decision:'approved',reason:'Skipped stage'},submitted.id,submitted.version),error=>error.code==='55000')
 const returned=await cmd('reviewPurchaseRequest',{stageOrder:1,decision:'returned',reason:'Needs revision'},submitted.id,submitted.version)
 await assert.rejects(cmd('submitPurchaseRequest',{},returned.id,returned.version),error=>error.code==='55000')
 const revised=await cmd('revisePurchaseRequest',{quotationId:f.quote.id,requestedOn:'2026-10-23',selectionReason:'Revised selection',reason:'Saved requested revision',reviewers:[admin,admin,admin,admin],lines:[{quotationLineId:f.quoteLineId,quantity:'9'}]},returned.id,returned.version)
 assert.equal(revised.status,'draft')
 const again=await cmd('submitPurchaseRequest',{},revised.id,revised.version)
 const {rows}=await db.client.query('select revision,decision from inv_procurement_review_steps where tenant_id=$1 and purchase_request_id=$2 order by revision,stage_order',[tenant,again.id])
 assert.equal(rows.length,8);assert.equal(rows[0].decision,'returned');assert.equal(rows[4].decision,null)
})
test("rejected PR cannot be revised and a progressed MR requires a linked additional request",async()=>{
 const f=await draftPurchaseRequest(db,refs),submitted=await cmd('submitPurchaseRequest',{},f.pr.id,f.pr.version)
 const rejected=await cmd('reviewPurchaseRequest',{stageOrder:1,decision:'rejected',reason:'Rejected requirement'},submitted.id,submitted.version)
 await assert.rejects(cmd('revisePurchaseRequest',{reason:'Forbidden'},rejected.id,rejected.version),error=>error.code==='55000')
 await assert.rejects(cmd('editMaterialRequest',{job:'Bad change',reason:'Forbidden',lines:[{itemId:refs.item,quantity:'1',specification:'x'}]},f.mr.id,f.mr.version),error=>error.code==='55000')
 const additional=await cmd('createAdditionalMaterialRequest',{requestedOn:'2026-10-23',job:'Fixture job',lines:[{itemId:refs.item,quantity:'2',specification:'Extra'}]},f.mr.id,f.mr.version)
 assert.equal(additional.kind,'material_request')
 await assert.rejects(cmd('createAdditionalMaterialRequest',{requestedOn:'2026-10-23',job:'Different job',lines:[{itemId:refs.item,quantity:'2',specification:'x'}]},f.mr.id,additional.parentVersion),error=>error.code==='55000')
})
test("idempotent create returns the same document without burning another number or accepting another payload",async()=>{
 const input={requestedOn:'2026-10-23',job:'Replay fixture',lines:[{itemId:refs.item,quantity:'2',specification:'Same request'}]}
 const first=await cmd('createMaterialRequest',input,null,null,'same-create')
 const replay=await cmd('createMaterialRequest',input,null,null,'same-create')
 assert.equal(first.id,replay.id);assert.equal(replay.replayed,true)
 await assert.rejects(cmd('createMaterialRequest',{...input,job:'Changed'},null,null,'same-create'),error=>error.code==='40001')
 await assert.rejects(commands(db,tenant,staff)('createMaterialRequest',input,null,null,'same-create'),error=>error.code==='40001')
})
test("legacy material-request RPC cannot bypass Staff requester restrictions",async()=>{
 await db.client.query('begin')
 try {
  const personnel=(await db.client.query("insert into personnel(tenant_id,employee_code,full_name,user_id) values($1,'LEGACY-OVERRIDE','Other requester',$2) returning id",[tenant,admin])).rows[0].id
  await assert.rejects(db.client.query('select inv_create_material_request($1,$2,$3,$4,$5,$6::jsonb)',[tenant,staff,personnel,'Legacy override','2026-10-23',JSON.stringify([{lineNo:1,itemId:refs.item,quantity:1}])]),error=>error.code==='42501')
 } finally {await db.client.query('rollback')}
})
test("legacy stock RPC cannot forge the reserved procurement receipt namespace",async()=>{
 await db.client.query('begin')
 try {
  await assert.rejects(db.client.query('select inv_post_stock_movement($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[tenant,admin,'receipt','inventory_procurement','forged','procurement:forged',null,JSON.stringify([{lineNo:1,itemId:refs.item,locationId:refs.location,signedQuantity:1,unitCost:1}])]),error=>error.code==='42501')
 } finally {await db.client.query('rollback')}
})
test("unit changes are blocked once stock exists instead of reinterpreting a balance",async()=>{
 await db.client.query('begin')
 try {
  const unit=(await db.client.query("insert into inv_units(tenant_id,code,name) values($1,'OTHER-UNIT','Other unit') returning id",[tenant])).rows[0].id
  await db.client.query("insert into inv_inventory_balances(tenant_id,item_id,location_id,quantity,inventory_value) values($1,$2,$3,1,1)",[tenant,refs.item,refs.location])
  await assert.rejects(db.client.query('update inv_inventory_items set unit_id=$1 where tenant_id=$2 and id=$3',[unit,tenant,refs.item]),error=>error.code==='55000')
 }finally{await db.client.query('rollback')}
})
test("Administrator can repair only an ineligible pending reviewer without inventing a decision",async()=>{
 const f=await draftPurchaseRequest(db,refs),submitted=await cmd('submitPurchaseRequest',{},f.pr.id,f.pr.version)
 await assert.rejects(cmd('reassignPendingReviewer',{reviewerId:staff,reason:'Not actually ineligible'},submitted.id,submitted.version),error=>error.code==='55000')
 await db.client.query('begin')
 try {
  await db.client.query("update inv_procurement_review_steps set reviewer_membership_id='30000000-0000-4000-8000-000000000005' where tenant_id=$1 and purchase_request_id=$2 and stage_order=1",[tenant,submitted.id])
  await db.client.query('savepoint denied_reassignment')
  await assert.rejects(commands(db,tenant,staff)('reassignPendingReviewer',{reviewerId:staff,reason:'Not an administrator'},submitted.id,submitted.version),error=>error.code==='42501')
  await db.client.query('rollback to savepoint denied_reassignment')
  const fixed=await cmd('reassignPendingReviewer',{reviewerId:staff,reason:'Reviewer no longer active'},submitted.id,submitted.version)
  const {rows}=await db.client.query('select decision,acted_by_user_id from inv_procurement_review_steps where tenant_id=$1 and purchase_request_id=$2 and stage_order=1',[tenant,f.pr.id])
  assert.deepEqual(rows,[{decision:null,acted_by_user_id:null}]);assert.equal(fixed.status,'submitted')
 }finally{await db.client.query('rollback')}
})
