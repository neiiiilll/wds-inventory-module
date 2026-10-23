import { HttpsError, type CallableRequest } from "firebase-functions/v2/https"

export const INVENTORY_OPERATIONS = [
  "provisionInventoryAccess",
  "listInventoryItems",
  "updateInventoryItem",
  "createMaterialRequest",
  "postStockMovement",
  "getInventoryDashboard",
  "listProcurementDocuments",
  "getProcurementDocument",
  "getProcurementReferenceData",
  "listInventoryMovements",
  "executeProcurementCommand",
] as const
export type InventoryOperation = typeof INVENTORY_OPERATIONS[number]
type Action = (request: CallableRequest<unknown>) => Promise<unknown>

export interface GatewayDependencies {
  getConfig(): { firebaseProjectId: string }
  actions: Record<InventoryOperation, Action>
}

// Callable decoding must not turn JSON properties into inherited authority.
function rejectPrototypeFields(value: unknown, depth = 0): void {
  if (!value || typeof value !== "object") return
  if (depth > 30) throw new HttpsError("invalid-argument", "Input nesting is too deep.")
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== (Array.isArray(value) ? Array.prototype : Object.prototype) && prototype !== null) {
    throw new HttpsError("invalid-argument", "Inherited request fields are not permitted.")
  }
  for (const [key, child] of Object.entries(value)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) throw new HttpsError("invalid-argument", "Unsupported request field.")
    rejectPrototypeFields(child, depth + 1)
  }
}

/** Routes an authenticated Inventory operation without accepting client authority. */
export async function dispatchInventory(request: CallableRequest<unknown>, deps: GatewayDependencies): Promise<unknown> {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to continue.")
  if (request.auth.token.email_verified !== true) throw new HttpsError("permission-denied", "A verified email is required.")
  const raw = request.data
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpsError("invalid-argument", "Expected an operation and input.")
  rejectPrototypeFields(raw)
  const envelope = raw as Record<string, unknown>
  if (!Object.hasOwn(envelope, "operation") || !Object.hasOwn(envelope, "input") ||
      Object.keys(envelope).some(key => key !== "operation" && key !== "input") ||
      typeof envelope.operation !== "string" || !INVENTORY_OPERATIONS.includes(envelope.operation as InventoryOperation)) {
    throw new HttpsError("invalid-argument", "Unsupported operation or input.")
  }
  const config = deps.getConfig()
  if (request.auth.token.aud !== config.firebaseProjectId) throw new HttpsError("permission-denied", "Wrong Firebase project.")
  // Domain handlers authorize the role before validating operation-specific input.
  return deps.actions[envelope.operation as InventoryOperation]({ ...request, data: envelope.input })
}
