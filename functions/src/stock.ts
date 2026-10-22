import type { CallableRequest } from "firebase-functions/v2/https"

import { requireAccess } from "./access"
import {
  STOCK_MOVEMENT_TYPES,
  type PostStockMovementInput,
  type PostStockMovementResponse,
} from "./contracts"
import { InputError } from "./errors"
import {
  allowOnly,
  inputObject,
  optionalText,
  uuid,
  type PostStockMovementRpcArgs,
  type WorkflowDependencies,
} from "./material-requests"

export type { PostStockMovementRpcArgs }

const INPUT_KEYS = new Set([
  "movementType",
  "sourceType",
  "sourceReference",
  "idempotencyKey",
  "notes",
  "lines",
])
const LINE_KEYS = new Set(["lineNo", "itemId", "locationId", "signedQuantity", "unitCost", "assetId"])

function normalizeInput(value: unknown): Omit<PostStockMovementRpcArgs, "p_tenant_id" | "p_actor_user_id"> {
  const input = inputObject(value, "Stock movement input must be an object.")
  allowOnly(input, INPUT_KEYS)
  if (typeof input.movementType !== "string" || !STOCK_MOVEMENT_TYPES.includes(input.movementType as never)) {
    throw new InputError("movementType is invalid.")
  }
  if (typeof input.idempotencyKey !== "string") throw new InputError("idempotencyKey is required.")
  const idempotencyKey = input.idempotencyKey.trim()
  if (!idempotencyKey || idempotencyKey.length > 200) {
    throw new InputError("idempotencyKey must be between 1 and 200 characters.")
  }
  if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > 500) {
    throw new InputError("lines must contain between 1 and 500 entries.")
  }
  const lineNumbers = new Set<number>()
  const lines = input.lines.map((value, index) => {
    const line = inputObject(value, `lines[${index}] must be an object.`)
    allowOnly(line, LINE_KEYS)
    if (typeof line.lineNo !== "number" || !Number.isInteger(line.lineNo) || line.lineNo < 1) {
      throw new InputError("Each lineNo must be a positive integer.")
    }
    if (lineNumbers.has(line.lineNo)) throw new InputError("lineNo values must be unique.")
    lineNumbers.add(line.lineNo)
    if (typeof line.signedQuantity !== "number" || !Number.isFinite(line.signedQuantity) || line.signedQuantity === 0) {
      throw new InputError("Each signedQuantity must be a non-zero number.")
    }
    if (typeof line.unitCost !== "number" || !Number.isFinite(line.unitCost) || line.unitCost < 0) {
      throw new InputError("Each unitCost must be a non-negative number.")
    }
    return {
      lineNo: line.lineNo,
      itemId: uuid(line.itemId, "itemId"),
      locationId: uuid(line.locationId, "locationId"),
      signedQuantity: line.signedQuantity,
      unitCost: line.unitCost,
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

export async function postStockMovementHandler(
  request: CallableRequest<PostStockMovementInput>,
  dependencies: WorkflowDependencies,
): Promise<PostStockMovementResponse> {
  const input = normalizeInput(request.data)
  const access = await requireAccess(
    request,
    "inventory",
    ["administrator", "inventory_staff"],
    dependencies.accessLookup,
  )
  return dependencies.repository.postStockMovement({
    p_tenant_id: access.tenantId,
    p_actor_user_id: access.userId,
    ...input,
  })
}
