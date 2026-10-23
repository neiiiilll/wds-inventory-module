import test from 'node:test'
import assert from 'node:assert/strict'
import {executeProcurementCommandHandler,normalizeProcurementCommand} from '../src/procurement/commands'
import {request,lookup,rejectsCode} from './helpers'
test('setup commands require Administrator before payload validation',async()=>{
 await rejectsCode(executeProcurementCommandHandler(request({kind:'saveSupplier'}),{accessLookup:lookup('inventory_staff'),repository:{} as never}),'permission-denied')
})
test('print metadata accepts bounded display fields but rejects authority',()=>{
 const id='80000000-0000-4000-8000-000000000001'
 const valid={kind:'saveDocumentPrintFields',id,expectedVersion:1,idempotencyKey:'print',input:{kind:'purchase_order',fields:{organizationName:'WDS',footer:'Controlled'}}}
 assert.deepEqual(normalizeProcurementCommand(valid),valid)
 assert.throws(()=>normalizeProcurementCommand({...valid,input:{...valid.input,fields:{approvedBy:'Forged'}}}))
})
