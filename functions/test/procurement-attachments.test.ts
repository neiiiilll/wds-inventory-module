import assert from 'node:assert/strict'
import test from 'node:test'
import {createAttachmentUploadHandler,finalizeAttachmentHandler,getAttachmentDownloadHandler} from '../src/procurement/attachments'
import {request,lookup,rejectsCode,tenantId} from './helpers'
const id='80000000-0000-4000-8000-000000000001'
function deps(role='inventory_staff',bytes=new Uint8Array([0x25,0x50,0x44,0x46,0x2d])) {
 const calls:unknown[]=[]
 return {calls,deps:{
  accessLookup:lookup(role),
  repository:{
   async reserve(...a:unknown[]){calls.push(['reserve',...a]);return {id,path:`${tenantId}/material_request/${id}/random.pdf`}},
   async pending(){return {id,path:`${tenantId}/material_request/${id}/random.pdf`,name:'file.pdf',contentType:'application/pdf',size:bytes.length}},
   async finalize(...a:unknown[]){calls.push(['finalize',...a]);return {attachmentId:id}},
   async ready(){return {id,path:`${tenantId}/material_request/${id}/random.pdf`,name:'file.pdf'}},
  },
  storage:{
   async assertPrivateBucket(){calls.push(['bucket'])},
   async createUpload(path:string){return {path,token:'token',signedUrl:'https://signed.invalid/upload'}},
   async download(){return {bytes,contentType:'application/pdf'}},
   async createDownload(){return 'https://signed.invalid/download'},
  },
 }}
}
test('upload reservation validates size MIME and writer role before signed storage access',async()=>{
 await rejectsCode(createAttachmentUploadHandler(request({kind:'material_request',id,name:'x.pdf',contentType:'application/pdf',size:1}),deps('viewer').deps),'permission-denied')
 for(const input of [{kind:'material_request',id,name:'x.pdf',contentType:'application/pdf',size:5242881},{kind:'material_request',id,name:'x.svg',contentType:'image/svg+xml',size:10}])await rejectsCode(createAttachmentUploadHandler(request(input),deps().deps),'invalid-argument')
 const f=deps();const result=await createAttachmentUploadHandler(request({kind:'material_request',id,name:'x.pdf',contentType:'application/pdf',size:5}),f.deps);assert.equal(result.expiresInSeconds,7200);assert.equal(f.calls[0][0],'reserve')
})
test('finalize rejects replaced size, spoofed PDF and active content before metadata becomes ready',async()=>{
 await rejectsCode(finalizeAttachmentHandler(request({attachmentId:id}),deps('inventory_staff',new Uint8Array([0x3c,0x73,0x76,0x67,0x3e])).deps),'failed-precondition')
 const mismatched=deps('inventory_staff',new Uint8Array([0x25,0x50,0x44,0x46]));mismatched.deps.repository.pending=async()=>({id,path:`${tenantId}/material_request/${id}/random.pdf`,name:'file.pdf',contentType:'application/pdf',size:9});await rejectsCode(finalizeAttachmentHandler(request({attachmentId:id}),mismatched.deps),'failed-precondition')
 const valid=deps();await finalizeAttachmentHandler(request({attachmentId:id}),valid.deps);assert.ok(valid.calls.some(call=>call[0]==='finalize'))
})
test('download rechecks Viewer access and returns a five-minute private URL',async()=>{
 const f=deps('viewer');const result=await getAttachmentDownloadHandler(request({attachmentId:id}),f.deps);assert.deepEqual(result,{url:'https://signed.invalid/download',expiresInSeconds:300,name:'file.pdf'})
})
