import assert from 'node:assert/strict'
import {before,after,test} from 'node:test'
import {randomUUID} from 'node:crypto'
import {createTestDatabase} from './runtime.mjs'
import {catalog,commands,approvedPurchaseRequest,tenant,foreignTenant,admin,staff,viewer} from './procurement-fixture.mjs'
let db,cmd
before(async()=>{db=await createTestDatabase();cmd=commands(db)})
after(async()=>{if(db)await db.close()})
test('only Administrators can maintain tenant Inventory setup',async()=>{
 for(const actor of [staff,viewer])await assert.rejects(commands(db,tenant,actor)('saveSupplier',{code:'DENIED',name:'Denied'}),error=>error.code==='42501')
 const supplier=await cmd('saveSupplier',{code:'SUP-'+randomUUID(),name:'Live supplier',contactName:'Contact'})
 assert.equal(supplier.kind,'suppliers');assert.equal(supplier.version,1)
})
test('supplier warehouse and location setup is tenant scoped and versioned',async()=>{
 const code=randomUUID(),supplier=await cmd('saveSupplier',{code,name:'Supplier A'})
 await assert.rejects(cmd('saveSupplier',{code,name:'Duplicate'}),error=>error.code==='23505')
 const changed=await cmd('saveSupplier',{code,name:'Supplier renamed',active:true},supplier.id,supplier.version)
 assert.equal(changed.version,2)
 const warehouse=await cmd('saveWarehouse',{code:'WH-'+randomUUID(),name:'Warehouse'})
 const foreign=(await catalog(db,foreignTenant)).warehouse
 await assert.rejects(cmd('saveStorageLocation',{warehouseId:foreign,code:'FOREIGN'}),error=>error.code==='P0002')
 await cmd('saveWarehouse',{code:'WH-'+randomUUID(),name:'Disabled',active:false},warehouse.id,warehouse.version)
 await assert.rejects(cmd('saveStorageLocation',{warehouseId:warehouse.id,code:'MAIN'}),error=>error.code==='P0002')
})
test('tracking requires an explicit mode reason and compatible existing stock',async()=>{
 const refs=await catalog(db)
 const configured=await cmd('configureItemTracking',{mode:'quantity_only',reason:'Bulk consumable'},refs.item,0)
 assert.equal(configured.version,1)
 await db.client.query('insert into inv_inventory_balances(tenant_id,item_id,location_id,quantity,inventory_value) values($1,$2,$3,2,20)',[tenant,refs.item,refs.location])
 await assert.rejects(cmd('configureItemTracking',{mode:'individually_tagged',reason:'Unsafe conversion'},refs.item,configured.version),error=>error.code==='55000')
 assert.equal((await db.client.query('select mode from inv_item_tracking where tenant_id=$1 and item_id=$2',[tenant,refs.item])).rows[0].mode,'quantity_only')
})
test('print fields are display only and catalog edits cannot rewrite approved snapshots',async()=>{
 const refs=await catalog(db),f=await approvedPurchaseRequest(db,refs)
 await assert.rejects(cmd('saveDocumentPrintFields',{kind:'purchase_request',fields:{approvedBy:'Forged approver'}},f.pr.id,f.pr.version),error=>error.code==='22023')
 const saved=await cmd('saveDocumentPrintFields',{kind:'purchase_request',fields:{organizationName:'WDS',footer:'Controlled copy'}},f.pr.id,f.pr.version)
 assert.equal(saved.version,f.pr.version+1)
 const before=(await db.client.query('select supplier_snapshot,item_snapshot from inv_purchase_requests p join inv_purchase_request_lines l on l.tenant_id=p.tenant_id and l.purchase_request_id=p.id where p.tenant_id=$1 and p.id=$2',[tenant,f.pr.id])).rows[0]
 await db.client.query("update inv_suppliers set name='Changed catalog' where tenant_id=$1 and id=$2",[tenant,refs.supplier])
 await db.client.query("update inv_inventory_items set name='Changed item' where tenant_id=$1 and id=$2",[tenant,refs.item])
 const after=(await db.client.query('select supplier_snapshot,item_snapshot from inv_purchase_requests p join inv_purchase_request_lines l on l.tenant_id=p.tenant_id and l.purchase_request_id=p.id where p.tenant_id=$1 and p.id=$2',[tenant,f.pr.id])).rows[0]
 assert.deepEqual(after,before)
})
