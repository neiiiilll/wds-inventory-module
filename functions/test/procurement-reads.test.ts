import assert from "node:assert/strict"
import test from "node:test"
import { request,lookup,rejectsCode,tenantId } from "./helpers"
// Missing read handlers must fail this test before any implementation is added.
let handle: any
try { handle=require("../src/procurement/reads").handleProcurementRead } catch(error:any) { if(error.code!=="MODULE_NOT_FOUND")throw error }
test("live read handlers derive tenant/actor and reject client authority",async()=>{
  assert.equal(typeof handle,"function","A live procurement read handler is required")
  const calls:unknown[]=[]
  const deps={accessLookup:lookup("viewer"),repository:{async read(...args:unknown[]){calls.push(args);return {activeItems:0}}}}
  assert.deepEqual(await handle("getInventoryDashboard",request({}),deps),{activeItems:0})
  assert.deepEqual(calls,[["getInventoryDashboard",tenantId,"user-1",{}]])
  await rejectsCode(handle("getInventoryDashboard",request({tenant_id:tenantId}),deps),"invalid-argument")
  await rejectsCode(handle("getInventoryDashboard",{data:{}} as never,deps),"unauthenticated")
})
test("live read validation bounds pages and rejects malformed filter scopes",async()=>{
  assert.equal(typeof handle,"function")
  const deps={accessLookup:lookup(),repository:{async read(_operation:unknown,_tenant:unknown,_actor:unknown,input:unknown){return input}}}
  for(const input of [{kind:"items",limit:101},{kind:"items",limit:0},{kind:"svc_tickets"},{kind:"items",role:"administrator"},{kind:"items",cursor:"bad cursor"}])await rejectsCode(handle("getProcurementReferenceData",request(input),deps),"invalid-argument")
  assert.deepEqual(await handle("getProcurementReferenceData",request({kind:"items",search:"  meter  "}),deps),{kind:"items",limit:50,search:"meter"})
  for(const dateFrom of ["2026-99-99","2026-02-30","wrong"])await rejectsCode(handle("listInventoryMovements",request({dateFrom}),deps),"invalid-argument")
})
test("an explicit null page limit is not treated as an absent optional field",async()=>{
  const deps={accessLookup:lookup(),repository:{async read(){return {}}}}
  await rejectsCode(handle("getProcurementReferenceData",request({kind:"items",limit:null}),deps),"invalid-argument")
})
