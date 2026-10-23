import assert from "node:assert/strict"
import test from "node:test"
import {request,lookup,rejectsCode,tenantId} from "./helpers"
let handle:any
try{handle=require('../src/procurement/commands').executeProcurementCommandHandler}catch(error:any){if(error.code!=='MODULE_NOT_FOUND')throw error}
test("procurement commands authorize Viewer before any malformed payload validation",async()=>{
 assert.equal(typeof handle,'function','A role-enforced procurement command handler is required')
 for(const input of [null,[],{},'invalid'])await rejectsCode(handle(request(input),{accessLookup:lookup('viewer'),repository:{}}),'permission-denied')
})
test("procurement command transport derives actor and tenant and rejects authority fields",async()=>{
 assert.equal(typeof handle,'function')
 const calls:unknown[]=[];const result={id:'document',kind:'material_request',version:1,replayed:false,invalidations:['dashboard']}
 const deps={accessLookup:lookup(),repository:{async execute(...args:unknown[]){calls.push(args);return result}}}
 const input={kind:'createMaterialRequest',idempotencyKey:'fixture-key',input:{requestedOn:'2026-10-23',job:'Fixture',lines:[{itemId:'80000000-0000-4000-8000-000000000001',quantity:'2',specification:'Fixture'}]}}
 assert.deepEqual(await handle(request(input),deps),result)
 assert.deepEqual(calls,[[tenantId,'user-1',input]])
 for(const field of ['tenant_id','actorUserId','role','status','history'])await rejectsCode(handle(request({...input,[field]:'forged'}),deps),'invalid-argument')
 await rejectsCode(handle(request({...input,input:{...input.input,person:'Other user'}}),deps),'invalid-argument')
})
