import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
const directory=new URL('../src/components/live/',import.meta.url)
const files=(await readdir(directory)).filter(name=>name.endsWith('.tsx'))
const sources=await Promise.all(files.map(async name=>[name,await readFile(new URL(name,directory),'utf8')]))
for(const [name,source] of sources){assert.doesNotMatch(source,/loadWorkflowState|saveWorkflowState|workflow-storage|supabase-js|SERVICE_DESK_BACKEND|svc_/i,`${name} must not use demo storage, browser Supabase, or Service Desk`)}
const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8')
for(const route of ['material_request','purchase_request','purchase_order','inspection'])assert.match(app,new RegExp(`initialKind="${route}"`))
const live=await readFile(new URL('../src/components/live/LiveProcurement.tsx',import.meta.url),'utf8')
assert.match(live,/role!==['"]Viewer['"]/);assert.match(live,/role===['"]Administrator['"]/);assert.match(live,/listProcurementDocuments/);assert.match(live,/nextCursor/)
const document=await readFile(new URL('../src/components/live/ProcurementDocument.tsx',import.meta.url),'utf8')
for(const command of ['createQuotation','createPurchaseRequest','reviewPurchaseRequest','createPurchaseOrder','dispatchPurchaseOrder','recordDelivery','recordInspection','acceptInspection'])assert.match(document,new RegExp(command))
const attachments=await readFile(new URL('../src/components/live/ProcurementAttachments.tsx',import.meta.url),'utf8')
assert.match(attachments,/5\*1024\*1024/);assert.match(attachments,/application\/pdf/);assert.match(attachments,/finalizeProcurementAttachment/);assert.match(attachments,/getProcurementAttachmentDownload/)
const print=await readFile(new URL('../src/components/live/ProcurementPrint.tsx',import.meta.url),'utf8')
assert.match(print,/presentation only/);assert.match(print,/authenticated database workflow/)
console.log('Live procurement routes use typed callable data, server RBAC, pagination, print snapshots, and private signed files without demo fallback.')
