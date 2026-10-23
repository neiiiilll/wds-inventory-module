import { getFunctions, httpsCallable } from "firebase/functions"
import { firebaseApp, firebaseAuth } from "./firebase"
import { InventoryApiError, toInventoryCallableError } from "./inventory-http"

export { InventoryApiError } from "./inventory-http"
export type { InventoryApiErrorCode } from "./inventory-http"

export type InventoryRoleKey = "administrator" | "inventory_staff" | "viewer"
export interface ProvisionAccessResponse { status: "active" | "disabled"; firebaseUid: string; email: string; displayName: string; tenantKey: string | null; roleKey: InventoryRoleKey | null }
export interface InventoryItemDto { id: string; itemCode: string; name: string; description: string | null; categoryId: string; categoryName: string; unitId: string; unitName: string; unitSymbol: string | null; supplierId: string | null; minimumQuantity: number; quantity: number; active: boolean; version: number }
export interface ListItemsInput { search?: string; limit?: number; cursor?: string }
export interface ListItemsResponse { items: InventoryItemDto[]; nextCursor: string | null }
export interface UpdateItemInput { id: string; expectedVersion: number; changes: Partial<Pick<InventoryItemDto, "name" | "description" | "categoryId" | "unitId" | "supplierId" | "minimumQuantity" | "active">> }
export interface MaterialRequestLineInput { lineNo: number; itemId: string; quantity: number; specification?: string }
export interface CreateMaterialRequestInput { requesterPersonnelId?: string; job?: string; requestedOn?: string; lines: MaterialRequestLineInput[] }
export interface MaterialRequestDto { requestId: string; requestNo: string; version: number; status: "draft" }
export interface StockMovementLineInput { lineNo: number; itemId: string; locationId: string; signedQuantity: number; unitCost: number; assetId?: string }
export interface PostStockMovementInput { movementType: "receipt" | "issue" | "transfer" | "adjustment" | "return" | "writeoff"; sourceType?: string; sourceReference?: string; idempotencyKey: string; notes?: string; lines: StockMovementLineInput[] }
export interface PostStockMovementResponse { movementId: string; postedAt: string; replayed: boolean }

export type InventoryFunctionName = "provisionInventoryAccess" | "listInventoryItems" | "updateInventoryItem" | "createMaterialRequest" | "postStockMovement" | "getInventoryDashboard" | "listProcurementDocuments" | "getProcurementDocument" | "getProcurementReferenceData" | "listInventoryMovements" | "executeProcurementCommand" | "createProcurementAttachmentUpload" | "finalizeProcurementAttachment" | "getProcurementAttachmentDownload"

export async function callInventoryFunction<I, O>(name: InventoryFunctionName, input: I): Promise<O> {
  if (!firebaseAuth?.currentUser) throw new InventoryApiError("unauthenticated")
  if (!firebaseApp) throw new InventoryApiError("internal")
  try {
    // The Firebase SDK attaches the signed-in user's ID token automatically.
    const invoke = httpsCallable<{ operation: InventoryFunctionName; input: I }, O>(getFunctions(firebaseApp, "asia-southeast1"), "inventory")
    // Preserve the API's JSON contract: omit optional undefined fields while
    // retaining deliberate null changes. Firebase otherwise encodes them as null.
    const envelope = JSON.parse(JSON.stringify({ operation: name, input })) as { operation: InventoryFunctionName; input: I }
    return (await invoke(envelope)).data
  } catch (error) {
    // Only expose our own safe messages, never remote SQL or secret details.
    throw toInventoryCallableError(error)
  }
}

export const provisionInventoryAccess = () => callInventoryFunction<Record<string, never>, ProvisionAccessResponse>("provisionInventoryAccess", {})
export const listInventoryItems = (input: ListItemsInput = {}) => callInventoryFunction<ListItemsInput, ListItemsResponse>("listInventoryItems", input)
export const updateInventoryItem = (input: UpdateItemInput) => callInventoryFunction<UpdateItemInput, InventoryItemDto>("updateInventoryItem", input)
export const createMaterialRequest = (input: CreateMaterialRequestInput) => callInventoryFunction<CreateMaterialRequestInput, MaterialRequestDto>("createMaterialRequest", input)
export const postStockMovement = (input: PostStockMovementInput) => callInventoryFunction<PostStockMovementInput, PostStockMovementResponse>("postStockMovement", input)
