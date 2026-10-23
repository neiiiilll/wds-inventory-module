import type { SupabaseClient } from "@supabase/supabase-js"
import type { CallableRequest } from "firebase-functions/v2/https"
import { requireAccess, type AccessLookup } from "./access"
import { STOCK_MOVEMENT_TYPES, type PostStockMovementResponse } from "./contracts"
import { InputError } from "./errors"
import { inputObject, allowOnly, uuid, optionalText, mapRpcError } from "./material-requests"

const MOVEMENT_KEYS = new Set(["movementType", "sourceType", "sourceReference", "idempotencyKey", "notes", "lines"])
const MOVEMENT_LINE_KEYS = new Set(["lineNo", "itemId", "locationId", "signedQuantity", "unitCost", "assetId"])


export interface PostStockMovementRpcArgs {
  p_tenant_id: string; p_actor_user_id: string; p_movement_type: string; p_source_type: string | null; p_source_reference: string | null
  p_idempotency_key: string; p_notes: string | null
  p_lines: Array<{ lineNo: number; itemId: string; locationId: string; signedQuantity: number; unitCost: number; assetId?: string }>
}

export interface StockRepository { postStockMovement(args: PostStockMovementRpcArgs): Promise<PostStockMovementResponse> }
export interface StockDependencies { accessLookup: AccessLookup; repository: StockRepository }
export function createStockRepository(client: SupabaseClient): StockRepository {
  return {
    async postStockMovement(args) {
      const { data, error } = await client.rpc("inv_post_stock_movement", args)
      if (error) throw mapRpcError(error.message)
      if (!data || typeof data !== "object") throw new Error("Stock movement RPC returned no result.")
      return data as unknown as PostStockMovementResponse
    },
  }
}
function normalizeMovement(value: unknown): Omit<PostStockMovementRpcArgs, "p_tenant_id" | "p_actor_user_id"> {
  const input = inputObject(value, "Stock movement input must be an object.")
  allowOnly(input, MOVEMENT_KEYS)
  if (typeof input.movementType !== "string" || !STOCK_MOVEMENT_TYPES.includes(input.movementType as never)) throw new InputError("movementType is invalid.")
  if (typeof input.idempotencyKey !== "string") throw new InputError("idempotencyKey is required.")
  const idempotencyKey = input.idempotencyKey.trim()
  if (!idempotencyKey || idempotencyKey.length > 200) throw new InputError("idempotencyKey must be between 1 and 200 characters.")
  if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > 500) throw new InputError("lines must contain between 1 and 500 entries.")
  const numbers = new Set<number>()
  const lines = input.lines.map((entry, index) => {
    const line = inputObject(entry, `lines[${index}] must be an object.`)
    allowOnly(line, MOVEMENT_LINE_KEYS)
    if (typeof line.lineNo !== "number" || !Number.isInteger(line.lineNo) || line.lineNo < 1) throw new InputError("Each lineNo must be a positive integer.")
    if (numbers.has(line.lineNo)) throw new InputError("lineNo values must be unique.")
    numbers.add(line.lineNo)
    if (typeof line.signedQuantity !== "number" || !Number.isFinite(line.signedQuantity) || line.signedQuantity === 0) throw new InputError("Each signedQuantity must be a non-zero number.")
    if (typeof line.unitCost !== "number" || !Number.isFinite(line.unitCost) || line.unitCost < 0) throw new InputError("Each unitCost must be a non-negative number.")
    return {
      lineNo: line.lineNo, itemId: uuid(line.itemId, "itemId"), locationId: uuid(line.locationId, "locationId"),
      signedQuantity: line.signedQuantity, unitCost: line.unitCost,
      ...(line.assetId === undefined || line.assetId === null ? {} : { assetId: uuid(line.assetId, "assetId") }),
    }
  })
  return {
    p_movement_type: input.movementType,
    p_source_type: optionalText(input.sourceType, "sourceType", 100),
    p_source_reference: optionalText(input.sourceReference, "sourceReference", 200),
    p_idempotency_key: idempotencyKey,
    p_notes: optionalText(input.notes, "notes", 2000),
    p_lines: lines,
  }
}

export async function postStockMovementHandler(request: CallableRequest<unknown>, dependencies: StockDependencies): Promise<PostStockMovementResponse> {
  const access = await requireAccess(request, "inventory", ["administrator", "inventory_staff"], dependencies.accessLookup)
  return dependencies.repository.postStockMovement({ p_tenant_id: access.tenantId, p_actor_user_id: access.userId, ...normalizeMovement(request.data) })
}
