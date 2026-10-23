import type { SupabaseClient } from "@supabase/supabase-js"
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https"
import { requireAccess, type AccessLookup } from "../access"
import { ConflictError, InputError } from "../errors"
import { readInput } from "./validation"
export const READ_OPERATIONS=["getInventoryDashboard","listProcurementDocuments","getProcurementDocument","getProcurementReferenceData","listInventoryMovements"] as const
export type ReadOperation=typeof READ_OPERATIONS[number]
export interface ProcurementReadRepository { read(operation:ReadOperation,tenantId:string,actorId:string,input:Record<string,unknown>):Promise<unknown> }
export function procurementError(error:{code?:string}):Error {
  if(error.code==="42501")return new HttpsError("permission-denied","Inventory access is not permitted.")
  if(error.code==="22023"||error.code==="22P02"||error.code==="22007"||error.code==="22008")return new InputError("Check the request parameters and try again.")
  if(error.code==="P0002")return new HttpsError("not-found","The Inventory record is unavailable.")
  if(error.code==="40001"||error.code==="23505")return new ConflictError("This record or request changed. Refresh and try again.")
  if(error.code==="55000")return new HttpsError("failed-precondition","This action requires Inventory configuration or reconciliation.")
  return new Error("Inventory database operation failed.")
}
const RPC:Record<ReadOperation,string>={getInventoryDashboard:"inv_get_inventory_dashboard",listProcurementDocuments:"inv_list_procurement_documents",getProcurementDocument:"inv_get_procurement_document",getProcurementReferenceData:"inv_get_procurement_reference_data",listInventoryMovements:"inv_list_inventory_movements"}
export function createProcurementReadRepository(client:SupabaseClient):ProcurementReadRepository {
  return {async read(operation,tenantId,actorId,input){
    const args={p_tenant_id:tenantId,p_actor_user_id:actorId,...(operation==="getInventoryDashboard"?{}:{p_input:input})}
    const {data,error}=await client.rpc(RPC[operation],args)
    if(error)throw procurementError(error)
    if(!data||typeof data!=="object")throw new Error("Invalid Inventory read response.")
    return data
  }}
}
/** Reads only the authenticated user's current database-authorized Inventory tenant. */
export async function handleProcurementRead(operation:ReadOperation,request:CallableRequest<unknown>,deps:{accessLookup:AccessLookup;repository:ProcurementReadRepository}) {
  const access=await requireAccess(request,"inventory",["administrator","inventory_staff","viewer"],deps.accessLookup)
  return deps.repository.read(operation,access.tenantId,access.userId,readInput(operation,request.data))
}
