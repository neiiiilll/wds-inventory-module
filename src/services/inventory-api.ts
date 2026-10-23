import { firebaseAuth } from "./firebase"
import { InventoryApiError, invokeInventoryEdge } from "./inventory-http"

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

type InventoryFunctionName = "provisionInventoryAccess" | "listInventoryItems" | "updateInventoryItem" | "createMaterialRequest" | "postStockMovement"

export async function callInventoryFunction<I, O>(name: InventoryFunctionName, input: I): Promise<O> {
  const user = firebaseAuth?.currentUser
  if (!user) throw new InventoryApiError("unauthenticated")
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "") ?? ""
  return invokeInventoryEdge<I, O>({
    endpoint: supabaseUrl ? `${supabaseUrl}/functions/v1/inventory-api` : "",
    publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
    getIdToken: () => user.getIdToken(),
  }, name, input)
}

export const provisionInventoryAccess = () => callInventoryFunction<Record<string, never>, ProvisionAccessResponse>("provisionInventoryAccess", {})
export const listInventoryItems = (input: ListItemsInput = {}) => callInventoryFunction<ListItemsInput, ListItemsResponse>("listInventoryItems", input)
export const updateInventoryItem = (input: UpdateItemInput) => callInventoryFunction<UpdateItemInput, InventoryItemDto>("updateInventoryItem", input)
export const createMaterialRequest = (input: CreateMaterialRequestInput) => callInventoryFunction<CreateMaterialRequestInput, MaterialRequestDto>("createMaterialRequest", input)
export const postStockMovement = (input: PostStockMovementInput) => callInventoryFunction<PostStockMovementInput, PostStockMovementResponse>("postStockMovement", input)
