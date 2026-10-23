import assert from 'node:assert/strict'
import {before,after,test} from 'node:test'
import {randomUUID} from 'node:crypto'
import {createTestDatabase} from './runtime.mjs'
import {catalog,commands,inspectedReport,tracking,tenant,admin,staff} from './procurement-fixture.mjs'
let db,cmd
before(async()=>{db=await createTestDatabase();cmd=commands(db)})
after(async()=>{if(db)await db.close()})
async function historical(){const refs=await catalog(db);await tracking(db,refs);const f=await inspectedReport(db,refs)
 await db.client.query("update inv_inspection_reports set workflow_managed=false,status='accepted',accepted_by_user_id=$1,accepted_at=now(),receipt_movement_id=null where tenant_id=$2 and id=$3",[admin,tenant,f.report.id]);return {refs,...f}}
async function existing(f){return (await db.client.query("select inv_post_stock_movement_core($1,$2,'receipt','inventory_procurement',$3,$4,null,$5::jsonb) as result",[tenant,admin,f.report.id,randomUUID(),JSON.stringify([{lineNo:1,itemId:f.refs.item,locationId:f.refs.location,signedQuantity:'10',unitCost:'12.50'}])])).rows[0].result.movementId}
test('historical accepted reports never assume an absent link means unposted',async()=>{
 const f=await historical()
 await assert.rejects(cmd('postAcceptedReceipt',{},f.report.id,f.report.version),error=>error.code==='55000')
 await assert.rejects(commands(db,tenant,staff)('reconcileHistoricalReceipt',{mode:'confirmUnposted',reason:'No authority',evidence:'Fixture'},f.report.id,f.report.version),error=>error.code==='42501')
 assert.equal((await db.client.query('select count(*)::int as n from inv_inventory_balances where tenant_id=$1 and item_id=$2',[tenant,f.refs.item])).rows[0].n,0)
})
test('proven exact existing movement linkage changes no balance',async()=>{
 const f=await historical(),movementId=await existing(f)
 const before=(await db.client.query('select quantity::text,inventory_value::text,version from inv_inventory_balances where tenant_id=$1 and item_id=$2',[tenant,f.refs.item])).rows
 await cmd('reconcileHistoricalReceipt',{mode:'linkExistingMovement',movementId,reason:'Proven existing posting',evidence:'Fixture ledger and source documents verified'},f.report.id,f.report.version)
 const after=(await db.client.query('select quantity::text,inventory_value::text,version from inv_inventory_balances where tenant_id=$1 and item_id=$2',[tenant,f.refs.item])).rows
 assert.deepEqual(after,before)
 assert.equal((await db.client.query('select receipt_movement_id from inv_inspection_reports where tenant_id=$1 and id=$2',[tenant,f.report.id])).rows[0].receipt_movement_id,movementId)
})
test('ambiguous historical postings cannot be linked by a matching total',async()=>{
 const f=await historical(),movementId=await existing(f);await existing(f)
 await assert.rejects(cmd('reconcileHistoricalReceipt',{mode:'linkExistingMovement',movementId,reason:'Ambiguous',evidence:'Two competing source postings'},f.report.id,f.report.version),error=>error.code==='55000')
 assert.equal((await db.client.query('select receipt_movement_id from inv_inspection_reports where tenant_id=$1 and id=$2',[tenant,f.report.id])).rows[0].receipt_movement_id,null)
})
test('documented confirmed-unposted reconciliation posts once without inventing old approvals',async()=>{
 const f=await historical(),key=randomUUID(),input={mode:'confirmUnposted',reason:'Owner checked external ledger',evidence:'Fixture evidence confirms no prior posting'}
 const first=await cmd('reconcileHistoricalReceipt',input,f.report.id,f.report.version,key)
 const replay=await cmd('reconcileHistoricalReceipt',input,f.report.id,f.report.version,key)
 assert.equal(replay.replayed,true);assert.equal(first.id,replay.id)
 assert.equal((await db.client.query('select quantity::text from inv_inventory_balances where tenant_id=$1 and item_id=$2',[tenant,f.refs.item])).rows[0].quantity,'10')
 assert.equal((await db.client.query('select workflow_managed,accepted_by_user_id from inv_inspection_reports where tenant_id=$1 and id=$2',[tenant,f.report.id])).rows[0].workflow_managed,false)
})
