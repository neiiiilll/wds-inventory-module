import assert from 'node:assert/strict'
import {before,after,test} from 'node:test'
import {randomUUID} from 'node:crypto'
import {createTestDatabase} from './runtime.mjs'
import {catalog,commands,approvedRequirement,tenant,foreignTenant,admin,staff,viewer} from './procurement-fixture.mjs'
let db,doc
before(async()=>{db=await createTestDatabase();const refs=await catalog(db);doc=await approvedRequirement(db,refs)})
after(async()=>{if(db)await db.close()})
const reserve=(actor=admin,id=doc.id,name='file.pdf',type='application/pdf',size=100)=>db.client.query('select inv_reserve_procurement_attachment($1,$2,$3,$4,$5,$6,$7) result',[tenant,actor,'material_request',id,name,type,size]).then(r=>r.rows[0].result)
test('pending attachment reservations enforce parent tenancy role size type and ten-file cap',async()=>{
 await assert.rejects(reserve(viewer),error=>error.code==='42501')
 await assert.rejects(reserve(admin,randomUUID()),error=>error.code==='P0002')
 await assert.rejects(reserve(admin,doc.id,'huge.pdf','application/pdf',5242881),error=>error.code==='22023')
 await assert.rejects(reserve(admin,doc.id,'script.svg','image/svg+xml',100),error=>error.code==='22023')
 const paths=[];for(let i=0;i<10;i++)paths.push((await reserve(i%2?staff:admin,doc.id,`file-${i}.pdf`)).path)
 assert.equal(new Set(paths).size,10);assert.ok(paths.every(path=>path.startsWith(`${tenant}/material_request/${doc.id}/`)))
 await assert.rejects(reserve(),error=>error.code==='55000')
})
test('finalization and reads recheck current tenant access without client paths',async()=>{
 const other=(await db.client.query("insert into inv_material_requests(tenant_id,request_no,requester_personnel_id,job,status) values($1,'FOREIGN-DOC',null,'Foreign','draft') returning id",[foreignTenant])).rows[0].id
 await assert.rejects(reserve(admin,other),error=>error.code==='P0002')
 const attachment=await db.client.query('select id,byte_size,mime_type from inv_procurement_attachments where tenant_id=$1 and document_id=$2 limit 1',[tenant,doc.id]).then(r=>r.rows[0])
 await db.client.query('select inv_finalize_procurement_attachment($1,$2,$3,$4,$5,$6)',[tenant,admin,attachment.id,attachment.byte_size,attachment.mime_type,'a'.repeat(64)])
 const ready=await db.client.query('select inv_get_procurement_attachment($1,$2,$3,$4) result',[tenant,viewer,attachment.id,false]).then(r=>r.rows[0].result)
 assert.equal(ready.state,'ready');assert.equal(ready.storagePath.includes('..'),false)
 await db.client.query("update app_users set active=false where id=$1",[viewer])
 await assert.rejects(db.client.query('select inv_get_procurement_attachment($1,$2,$3,$4)',[tenant,viewer,attachment.id,false]),error=>error.code==='42501')
})
