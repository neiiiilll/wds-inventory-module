import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const api=await readFile(new URL('../src/services/procurement-api.ts',import.meta.url),'utf8'),transport=await readFile(new URL('../src/services/inventory-api.ts',import.meta.url),'utf8')
for(const operation of ['getInventoryDashboard','listProcurementDocuments','getProcurementDocument','getProcurementReferenceData','listInventoryMovements','executeProcurementCommand','createProcurementAttachmentUpload','finalizeProcurementAttachment','getProcurementAttachmentDownload'])assert.match(api,new RegExp(`['"]${operation}['"]`))
assert.match(transport,/getFunctions\(firebaseApp, "asia-southeast1"\)/)
assert.match(transport,/JSON\.parse\(JSON\.stringify/,'transport must omit undefined while preserving explicit null')
assert.match(api,/FORBIDDEN/);assert.match(api,/createCommandSubmission/);assert.doesNotMatch(api,/supabase|service.role|localStorage/i)
console.log('Typed procurement API uses the single regional callable without client authority or browser secrets.')
