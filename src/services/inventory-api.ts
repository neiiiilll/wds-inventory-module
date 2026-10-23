import { httpsCallable } from "firebase/functions"
import { firebaseAuth, firebaseFunctions } from "./firebase"

export type InventoryApiErrorCode =
  | "unauthenticated"
  | "permission-denied"
  | "invalid-argument"
  | "not-found"
  | "already-exists"
  | "failed-precondition"
  | "aborted"
  | "internal"

const SAFE_MESSAGES: Record<InventoryApiErrorCode, string> = {
  unauthenticated: "Sign in again to continue.",
  "permission-denied": "You do not have permission to perform this action.",
  "invalid-argument": "Check the entered information and try again.",
  "not-found": "The requested inventory record was not found.",
  "already-exists": "That inventory record already exists.",
  "failed-precondition": "The inventory operation cannot be completed in its current state.",
  aborted: "This record changed. Refresh it and try again.",
  internal: "The inventory service could not complete the request. Try again.",
}

export class InventoryApiError extends Error {
  constructor(readonly code: InventoryApiErrorCode, message = SAFE_MESSAGES[code]) {
    super(message)
    this.name = "InventoryApiError"
  }
}

export type InventoryRoleKey = "administrator" | "inventory_staff" | "viewer"
export interface ProvisionAccessResponse { status: "active" | "disabled"; firebaseUid: string; email: string; displayName: string; tenantKey: string | null; roleKey: InventoryRoleKey | null; refreshToken: boolean }
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
  if (!firebaseAuth?.currentUser) throw new InventoryApiError("unauthenticated")
  if (!firebaseFunctions) throw new InventoryApiError("internal")
  try {
    const response = await httpsCallable<I, O>(firebaseFunctions, name)(input)
    return response.data
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined
    const shortCode = typeof code === "string" && code.startsWith("functions/") ? code.slice("functions/".length) : "internal"
    throw new InventoryApiError(Object.prototype.hasOwnProperty.call(SAFE_MESSAGES, shortCode) ? shortCode as InventoryApiErrorCode : "internal")
  }
}

export const provisionInventoryAccess = () => callInventoryFunction<Record<string, never>, ProvisionAccessResponse>("provisionInventoryAccess", {})
export const listInventoryItems = (input: ListItemsInput = {}) => callInventoryFunction<ListItemsInput, ListItemsResponse>("listInventoryItems", input)
export const updateInventoryItem = (input: UpdateItemInput) => callInventoryFunction<UpdateItemInput, InventoryItemDto>("updateInventoryItem", input)
export const createMaterialRequest = (input: CreateMaterialRequestInput) => callInventoryFunction<CreateMaterialRequestInput, MaterialRequestDto>("createMaterialRequest", input)
export const postStockMovement = (input: PostStockMovementInput) => callInventoryFunction<PostStockMovementInput, PostStockMovementResponse>("postStockMovement", input)
