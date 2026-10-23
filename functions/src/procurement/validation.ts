import { InputError } from "../errors"
import { inputObject, allowOnly, uuid, optionalText } from "../material-requests"
import type { DocumentKind, ReferenceKind } from "./contracts"
export const DOCUMENT_KINDS: readonly DocumentKind[] = ["material_request","quotation","purchase_request","purchase_order","inspection"]
export const REFERENCE_KINDS: readonly ReferenceKind[] = ["items","suppliers","locations","requesters","reviewers","warehouses"]
export function readInput(operation: string, value: unknown): Record<string, unknown> {
  const input=inputObject(value,"Expected read parameters.")
  if(operation==="getInventoryDashboard") { allowOnly(input,new Set()); return {} }
  const detail=operation==="getProcurementDocument"
  const fields=operation==="listInventoryMovements"?["limit","cursor","search","itemId","locationId","movementType","dateFrom","dateTo"]:
    detail?["kind","id","section","limit","cursor"]:["kind","limit","cursor","search",...(operation==="listProcurementDocuments"?["status"]:[])]
  allowOnly(input,new Set(fields))
  const result:Record<string,unknown>={}
  if(operation!=="listInventoryMovements") {
    const kinds=operation==="getProcurementReferenceData"?REFERENCE_KINDS:DOCUMENT_KINDS
    if(typeof input.kind!=="string"||!(kinds as readonly string[]).includes(input.kind)) throw new InputError("Unsupported Inventory document or selector.")
    result.kind=input.kind
  }
  if(detail) {
    result.id=uuid(input.id,"id")
    if(input.section!==undefined) {
      if(!["lines","history","related"].includes(input.section as string))throw new InputError("Invalid detail section.")
      result.section=input.section
    }
  }
  const limit=input.limit===undefined?50:input.limit
  if(typeof limit!=="number"||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new InputError("limit must be from 1 to 100.")
  result.limit=limit
  if(input.cursor!==undefined) {
    if(typeof input.cursor!=="string"||input.cursor.length>2000||!input.cursor.length||!/^[A-Za-z0-9_=-]+$/.test(input.cursor))throw new InputError("Invalid page cursor.")
    result.cursor=input.cursor
  }
  for(const field of ["search","status"])if(input[field]!==undefined) {
    const text=optionalText(input[field],field,100)
    if(text)result[field]=text
  }
  for(const field of ["itemId","locationId"])if(input[field]!==undefined)result[field]=uuid(input[field],field)
  if(input.movementType!==undefined) {
    if(!["receipt","issue","transfer","adjustment","return","writeoff"].includes(input.movementType as string))throw new InputError("Invalid movement type.")
    result.movementType=input.movementType
  }
  for(const field of ["dateFrom","dateTo"])if(input[field]!==undefined) {
    const date=input[field]
    const parsed=typeof date==="string"?new Date(date+"T00:00:00Z"):null
    if(typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!parsed||!Number.isFinite(parsed.valueOf())||parsed.toISOString().slice(0,10)!==date)throw new InputError("Invalid date filter.")
    result[field]=date
  }
  if(result.dateFrom&&result.dateTo&&String(result.dateFrom)>String(result.dateTo))throw new InputError("Invalid date range.")
  return result
}
