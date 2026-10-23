import assert from "node:assert/strict"
import { before, after, test } from "node:test"
import { createTestDatabase } from "./runtime.mjs"
let db
const tenant = "10000000-0000-4000-8000-000000000001"
const user = n => `20000000-0000-4000-8000-${String(n).padStart(12,"0")}`
before(async () => { db = await createTestDatabase() })
after(async () => { if (db) await db.close() })
test("new SQL authorization exists and rechecks the database actor", async () => {
  const exists = await db.client.query("select to_regprocedure('public.inv_require_procurement_access(uuid,uuid,boolean,boolean)') is not null as installed")
  assert.equal(exists.rows[0].installed, true, "The transaction must have a database authorization guard")
  const role = await db.client.query("select inv_require_procurement_access($1,$2,false,true) as role", [tenant,user(1)])
  assert.equal(role.rows[0].role, "administrator")
})
test("viewer inactive and foreign-tenant actors cannot authorize a write", async () => {
  for (const n of [3,4,5]) await assert.rejects(db.client.query("select inv_require_procurement_access($1,$2,false,true)",[tenant,user(n)]), error => error.code === "42501")
})
test("anonymous and browser roles cannot execute the authorization helper", async () => {
  for (const role of ["anon","authenticated"]) {
    const client = await db.connect()
    try { await client.query(`set role ${role}`); await assert.rejects(client.query("select inv_require_procurement_access($1,$2,false,true)",[tenant,user(1)]), error => error.code === "42501") }
    finally { await client.end() }
  }
})
test("one active plus another inactive membership still fails closed", async () => {
  await db.client.query("begin")
  try {
    await db.client.query("drop index tenant_memberships_user_id_uidx")
    await db.client.query("insert into tenant_memberships(tenant_id,user_id,status) values($1,$2,'removed')",["10000000-0000-4000-8000-000000000002",user(1)])
    await assert.rejects(db.client.query("select inv_require_procurement_access($1,$2,false,true)",[tenant,user(1)]),error => error.code === "42501")
  } finally { await db.client.query("rollback") }
})
test("additive schema does not invent historical approval metadata", async () => {
  const {rows} = await db.client.query("select status,job,version,approved_by_user_id from inv_material_requests where request_no='HISTORICAL-MR'")
  assert.deepEqual(rows,[{status:"approved",job:"Unchanged historical job",version:"1",approved_by_user_id:null}])
})
test("default service-role grants cannot expose internal guards or writable audit tables", async () => {
  const {rows} = await db.client.query("select has_function_privilege('service_role','inv_begin_procurement_command(uuid,uuid,text,text,jsonb)','execute') as internal,has_table_privilege('service_role','inv_procurement_events','update') as audit_update")
  assert.deepEqual(rows,[{internal:false,audit_update:false}])
})
test("idempotency is tied to tenant command actor and canonical payload", async () => {
  const args = [tenant,user(1),"example","fixture-replay",{a:1,b:2}]
  await db.client.query("begin")
  try {
    const first = await db.client.query("select inv_begin_procurement_command($1,$2,$3,$4,$5::jsonb) as result",args)
    assert.equal(first.rows[0].result,null)
    await db.client.query("update inv_procurement_commands set result=$1::jsonb where tenant_id=$2",[JSON.stringify({id:"stored"}),tenant])
    const replay = await db.client.query("select inv_begin_procurement_command($1,$2,$3,$4,$5::jsonb) as result",[...args.slice(0,4),{b:2,a:1}])
    assert.deepEqual(replay.rows[0].result,{id:"stored",replayed:true})
  } finally { await db.client.query("rollback") }
  for (const changed of [{actor:user(2),input:{a:1,b:2}},{actor:user(1),input:{a:9}}]) {
    await db.client.query("begin")
    try {
      await db.client.query("select inv_begin_procurement_command($1,$2,$3,$4,$5::jsonb)",args)
      await assert.rejects(db.client.query("select inv_begin_procurement_command($1,$2,$3,$4,$5::jsonb)",[tenant,changed.actor,"example","fixture-replay",changed.input]),error => error.code === "40001")
    } finally { await db.client.query("rollback") }
  }
})
