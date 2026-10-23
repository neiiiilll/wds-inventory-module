import { randomUUID } from "node:crypto"
import { logger } from "firebase-functions"
import { onCall, type CallableRequest } from "firebase-functions/v2/https"
import { createSupabaseAccessLookup, type AccessLookup } from "./access"
import { callableOptions, INVENTORY_BACKEND, parseInventoryBackendConfig } from "./config"
import { dispatchInventory, type GatewayDependencies } from "./gateway"
import { toHttpsError } from "./errors"
import { createProvisionRepository, provisionInventoryAccessHandler } from "./provision"
import { getSupabaseClient } from "./supabase"
import { createInventoryRepository, listInventoryItemsHandler, updateInventoryItemHandler } from "./inventory"
import { createMaterialRequestRepository, createMaterialRequestHandler } from "./material-requests"
import { createStockRepository, postStockMovementHandler } from "./stock"

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

const actions: GatewayDependencies["actions"] = {
  // Session validation only; never assigns access or changes Firebase claims.
  provisionInventoryAccess: request => provisionInventoryAccessHandler(request, {
    repository: { resolve: uid => createProvisionRepository(getSupabaseClient()).resolve(uid) },
  }),
  listInventoryItems: request => listInventoryItemsHandler(request, inventoryDependencies),
  updateInventoryItem: request => updateInventoryItemHandler(request, inventoryDependencies),
  createMaterialRequest: request => createMaterialRequestHandler(request, {
    accessLookup,
    repository: { createMaterialRequest: args => createMaterialRequestRepository(getSupabaseClient()).createMaterialRequest(args) },
  }),
  postStockMovement: request => postStockMovementHandler(request, {
    accessLookup,
    repository: { postStockMovement: args => createStockRepository(getSupabaseClient()).postStockMovement(args) },
  }),
}

/** Connects Firebase-authenticated Inventory operations to tenant-scoped Supabase data. */
export const inventory = onCall(callableOptions, async (request: CallableRequest<unknown>) => {
  const reference = randomUUID()
  try {
    return await dispatchInventory(request, {
      getConfig: () => parseInventoryBackendConfig(INVENTORY_BACKEND.value()),
      actions,
    })
  } catch (error) {
    const safeError = toHttpsError(error, reference)
    logger.error("Inventory request failed.", { reference, code: safeError.code })
    throw safeError
  }
})
