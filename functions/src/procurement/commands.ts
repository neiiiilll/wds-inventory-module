import type { SupabaseClient } from "@supabase/supabase-js"
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https"
import { requireAccess, type AccessLookup } from "../access"
import { InputError } from "../errors"
import { inputObject, allowOnly, uuid } from "../material-requests"
import type { CommandInput, CommandResult } from "./contracts"
import { procurementError } from "./reads"

export const DOCUMENT_COMMANDS=["createMaterialRequest","editMaterialRequest","approveMaterialRequest","createAdditionalMaterialRequest","createQuotation","createPurchaseRequest","revisePurchaseRequest","submitPurchaseRequest","reviewPurchaseRequest","reassignPendingReviewer","createPurchaseOrder","dispatchPurchaseOrder","recordDelivery","recordInspection","acceptInspection","postAcceptedReceipt","recordSupplierReturn","reconcileHistoricalReceipt"] as const
const FIELDS:Record<string,readonly string[]>={
 createMaterialRequest:["requestedOn","job","requesterPersonnelId","lines"],editMaterialRequest:["job","requesterPersonnelId","lines","reason"],approveMaterialRequest:["reference"],createAdditionalMaterialRequest:["requestedOn","job","requesterPersonnelId","lines"],
 createQuotation:["materialRequestId","supplierId","reference","quotedOn","validUntil","terms","lines"],createPurchaseRequest:["materialRequestId","quotationId","requestedOn","selectionReason","reviewers","lines"],revisePurchaseRequest:["quotationId","requestedOn","selectionReason","reason","reviewers","lines"],submitPurchaseRequest:[],reviewPurchaseRequest:["stageOrder","decision","reason","reference"],reassignPendingReviewer:["reviewerId","reason"],createPurchaseOrder:["purchaseRequestId","orderedOn","lines"],dispatchPurchaseOrder:["dispatchedOn","method","recipient","reference","reason"],
 recordDelivery:["deliveredOn","reference","replacementOfReportId","lines"],recordInspection:["inspectedOn","findings","lines"],acceptInspection:["acceptedOn","reference"],postAcceptedReceipt:[],recordSupplierReturn:["inspectionLineId","quantity","returnedOn","reference","reason"],reconcileHistoricalReceipt:["mode","movementId","reason","evidence"],
}
const UPDATES=new Set(["editMaterialRequest","approveMaterialRequest","createAdditionalMaterialRequest","revisePurchaseRequest","submitPurchaseRequest","reviewPurchaseRequest","reassignPendingReviewer","dispatchPurchaseOrder","recordDelivery","recordInspection","acceptInspection","postAcceptedReceipt","recordSupplierReturn","reconcileHistoricalReceipt"])
function text(value:unknown,field:string,max=1000):string {
 if(typeof value!=="string"||!value.trim()||value.trim().length>max)throw new InputError(`${field} is required and must be bounded text.`)
 return value.trim()
}
function date(value:unknown):string {
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new InputError("A valid date is required.")
 const parsed=new Date(value+"T00:00:00Z")
 if(!Number.isFinite(parsed.valueOf())||parsed.toISOString().slice(0,10)!==value)throw new InputError("A valid date is required.")
 return value
}
function decimal(value:unknown,positive:boolean):string {
 if(typeof value!=="string"||value.length>32||!/^\d+(\.\d{1,6})?$/.test(value)||(positive&&!/[1-9]/.test(value)))throw new InputError("Use a valid decimal string for quantities and prices.")
 return value
}
export function normalizeProcurementCommand(value:unknown):CommandInput {
 const raw=inputObject(value,"Expected procurement command.")
 allowOnly(raw,new Set(["kind","id","expectedVersion","idempotencyKey","input"]))
 if(typeof raw.kind!=="string"||!(DOCUMENT_COMMANDS as readonly string[]).includes(raw.kind))throw new InputError("Unsupported procurement command.")
 const kind=raw.kind as CommandInput["kind"],input={...inputObject(raw.input,"Expected command input.")}
 allowOnly(input,new Set(FIELDS[kind]))
 const result:CommandInput={kind,idempotencyKey:text(raw.idempotencyKey,"idempotencyKey",200),input}
 if(UPDATES.has(kind)) {
   result.id=uuid(raw.id,"id")
   if(typeof raw.expectedVersion!=="number"||!Number.isSafeInteger(raw.expectedVersion)||raw.expectedVersion<1)throw new InputError("A current version is required.")
   result.expectedVersion=raw.expectedVersion
 } else if(raw.id!==undefined||raw.expectedVersion!==undefined)throw new InputError("Creation does not accept a target ID or version.")
 for(const field of ["job","reference","selectionReason","reason","terms","recipient","method","findings","evidence"])if(input[field]!==undefined&&input[field]!==null)input[field]=text(input[field],field,field==="terms"||field==="evidence"?2000:500)
 for(const field of ["materialRequestId","supplierId","quotationId","purchaseRequestId","requesterPersonnelId","reviewerId","replacementOfReportId","inspectionLineId","movementId"])if(input[field]!==undefined)input[field]=uuid(input[field],field)
 for(const field of ["requestedOn","quotedOn","validUntil","orderedOn","dispatchedOn","deliveredOn","inspectedOn","acceptedOn","returnedOn"])if(input[field]!==undefined&&input[field]!==null)input[field]=date(input[field])
 if(kind==="approveMaterialRequest")input.reference=text(input.reference,"reference",500)
 if(["editMaterialRequest","revisePurchaseRequest","reviewPurchaseRequest","reassignPendingReviewer","dispatchPurchaseOrder"].includes(kind))input.reason=text(input.reason,"reason",500)
 if(["createPurchaseRequest","revisePurchaseRequest"].includes(kind)) {
   if(!Array.isArray(input.reviewers)||input.reviewers.length!==4)throw new InputError("Assign the four required reviewers.")
   input.reviewers=input.reviewers.map(id=>uuid(id,"reviewer"))
   input.selectionReason=text(input.selectionReason,"selectionReason",500)
 }
 if(kind==="reviewPurchaseRequest") {
   if(typeof input.stageOrder!=="number"||!Number.isInteger(input.stageOrder)||input.stageOrder<1||input.stageOrder>4||!["approved","returned","rejected"].includes(input.decision as string))throw new InputError("Invalid review decision.")
 }
 if(kind==="reconcileHistoricalReceipt"&&!['linkExistingMovement','confirmUnposted'].includes(input.mode as string))throw new InputError('Invalid reconciliation mode.')
 if(kind==="reconcileHistoricalReceipt"&&input.mode==='linkExistingMovement'&&!input.movementId)throw new InputError('An existing movement is required.')
 if(kind==="recordSupplierReturn")input.quantity=decimal(input.quantity,true)
 if(FIELDS[kind].includes("lines")&&!['recordDelivery','recordInspection'].includes(kind)) {
   if(!Array.isArray(input.lines)||input.lines.length<1||input.lines.length>200)throw new InputError("Use between 1 and 200 document lines.")
   const mr=["createMaterialRequest","editMaterialRequest","createAdditionalMaterialRequest"].includes(kind)
   const quote=kind==="createQuotation",po=kind==="createPurchaseOrder"
   const identity=mr?"itemId":quote?"materialRequestLineId":po?"purchaseRequestLineId":"quotationLineId"
   const ids=new Set<string>()
   input.lines=input.lines.map(value=>{
     const line={...inputObject(value,"Expected a document line.")}
     allowOnly(line,new Set([identity,"quantity",...(mr?["specification"]:[]),...(quote?["unitPrice"]:[])]))
     line[identity]=uuid(line[identity],identity)
     if(ids.has(line[identity] as string))throw new InputError("Duplicate document line.")
     ids.add(line[identity] as string);line.quantity=decimal(line.quantity,true)
     if(quote)line.unitPrice=decimal(line.unitPrice,false)
     if(mr&&line.specification!==undefined&&line.specification!==null)line.specification=text(line.specification,"specification",1000)
     return line
   })
 }
 if(kind==="recordDelivery") {
   if(!Array.isArray(input.lines)||input.lines.length<1||input.lines.length>200)throw new InputError('Use between 1 and 200 delivery lines.')
   input.lines=(input.lines as unknown[]).map(value=>{const line={...inputObject(value,'Expected a delivery line.')};allowOnly(line,new Set(['purchaseOrderLineId','quantity','replacementOfLineId']));line.purchaseOrderLineId=uuid(line.purchaseOrderLineId,'purchaseOrderLineId');line.quantity=decimal(line.quantity,true);if(line.replacementOfLineId!==undefined)line.replacementOfLineId=uuid(line.replacementOfLineId,'replacementOfLineId');return line})
 }
 if(kind==="recordInspection") {
   if(!Array.isArray(input.lines)||input.lines.length<1||input.lines.length>200)throw new InputError('Use between 1 and 200 inspection lines.')
   input.lines=(input.lines as unknown[]).map(value=>{const line={...inputObject(value,'Expected an inspection line.')};allowOnly(line,new Set(['inspectionLineId','acceptedQuantity','damagedQuantity','rejectedQuantity','locationId','assetTags']));for(const field of ['inspectionLineId','locationId'])line[field]=uuid(line[field],field);for(const field of ['acceptedQuantity','damagedQuantity','rejectedQuantity'])line[field]=decimal(line[field],false);if(line.assetTags!==undefined){if(!Array.isArray(line.assetTags)||line.assetTags.length>200)throw new InputError('Invalid asset tags.');const normalizedTags=line.assetTags.map(tag=>text(tag,'assetTag',100));if(new Set(normalizedTags).size!==normalizedTags.length)throw new InputError('Duplicate asset tag.');line.assetTags=normalizedTags}return line})
 }
 return result
}
export interface ProcurementCommandRepository {execute(tenantId:string,actorId:string,input:CommandInput):Promise<CommandResult>}
export function createProcurementCommandRepository(client:SupabaseClient):ProcurementCommandRepository {
 return {async execute(tenantId,actorId,input){
  const {data,error}=await client.rpc("inv_execute_procurement_command",{p_tenant_id:tenantId,p_actor_user_id:actorId,p_kind:input.kind,p_document_id:input.id??null,p_expected_version:input.expectedVersion??null,p_idempotency_key:input.idempotencyKey,p_input:input.input})
  if(error)throw procurementError(error)
  if(!data||typeof data!=="object")throw new Error("Invalid procurement command response.")
  return data as unknown as CommandResult
 }}
}
/** Performs only explicit, role-authorized Inventory transactions for the caller's tenant. */
export async function executeProcurementCommandHandler(request:CallableRequest<unknown>,deps:{accessLookup:AccessLookup;repository:ProcurementCommandRepository}) {
 const access=await requireAccess(request,"inventory",["administrator","inventory_staff"],deps.accessLookup)
 const raw=request.data
 if(raw&&typeof raw==="object"&&!Array.isArray(raw)&&["reassignPendingReviewer","reconcileHistoricalReceipt"].includes((raw as Record<string,unknown>).kind as string)&&access.roleKey!=="administrator")throw new HttpsError("permission-denied","Administrator access is required.")
 return deps.repository.execute(access.tenantId,access.userId,normalizeProcurementCommand(raw))
}
