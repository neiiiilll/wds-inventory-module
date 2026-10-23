import { randomUUID } from "node:crypto"
import { getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { logger } from "firebase-functions"
import { onCall, type CallableRequest } from "firebase-functions/v2/https"
import { createSupabaseAccessLookup, type AccessLookup } from "./access"
import { callableOptions } from "./config"
import { toHttpsError } from "./errors"
import { createProvisionRepository, provisionInventoryAccessHandler } from "./provision"
import { getSupabaseClient } from "./supabase"
import { createInventoryRepository, listInventoryItemsHandler, updateInventoryItemHandler } from "./inventory"
import { createMaterialRequestRepository, createMaterialRequestHandler } from "./material-requests"
import { createStockRepository, postStockMovementHandler } from "./stock"

if (getApps().length === 0) initializeApp()

// Keep secret access behind the first authorized database lookup.
const accessLookup: AccessLookup = {
  findUser: (uid) => createSupabaseAccessLookup(getSupabaseClient()).findUser(uid),
  listMemberships: (userId) => createSupabaseAccessLookup(getSupabaseClient()).listMemberships(userId),
  findTenant: (tenantId) => createSupabaseAccessLookup(getSupabaseClient()).findTenant(tenantId),
  listRoles: (membershipId, appKey) => createSupabaseAccessLookup(getSupabaseClient()).listRoles(membershipId, appKey),
}
const inventoryDependencies = {
  accessLookup,
  repository: {
    list: (...args: Parameters<ReturnType<typeof createInventoryRepository>["list"]>) => createInventoryRepository(getSupabaseClient()).list(...args),
    update: (...args: Parameters<ReturnType<typeof createInventoryRepository>["update"]>) => createInventoryRepository(getSupabaseClient()).update(...args),
  },
}

function businessCallable<T>(handler: (request: CallableRequest<unknown>) => Promise<T>) {
  return onCall(callableOptions, async (request) => {
    const reference = randomUUID()
    try {
      const result = await handler(request)
      logger.info("Inventory request completed.", { reference })
      return result
    } catch (error) {
      const safeError = toHttpsError(error, reference)
      logger.error("Inventory request failed.", { reference, code: safeError.code })
      throw safeError
    }
  })
}

/** Lists a bounded page of the authorized tenant's inventory and balances. */
export const listInventoryItems = businessCallable((request) => listInventoryItemsHandler(request, inventoryDependencies))

/** Updates allowed inventory fields with a tenant-scoped optimistic version check. */
export const updateInventoryItem = businessCallable((request) => updateInventoryItemHandler(request, inventoryDependencies))

/** Creates a draft material request with the authorized tenant and actor. */
export const createMaterialRequest = businessCallable((request) => createMaterialRequestHandler(request, {
  accessLookup,
  repository: { createMaterialRequest: (args) => createMaterialRequestRepository(getSupabaseClient()).createMaterialRequest(args) },
}))

/** Posts an atomic stock movement using the required idempotency key. */
export const postStockMovement = businessCallable((request) => postStockMovementHandler(request, {
  accessLookup,
  repository: { postStockMovement: (args) => createStockRepository(getSupabaseClient()).postStockMovement(args) },
}))

/** Resolves explicit Inventory access and synchronizes the Firebase tenant UUID claim. */
export const provisionInventoryAccess = onCall(callableOptions, async (request) => {
  const reference = randomUUID()
  try {
    return await provisionInventoryAccessHandler(request, {
      repository: {
        resolve: (uid) => createProvisionRepository(getSupabaseClient()).resolve(uid),
      },
      auth: getAuth(),
    })
  } catch (error) {
    const safeError = toHttpsError(error, reference)
    logger.error("Inventory access request failed.", { reference, code: safeError.code })
    throw safeError
  }
})
