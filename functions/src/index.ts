import { randomUUID } from "node:crypto"
import { getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { logger } from "firebase-functions"
import { onCall } from "firebase-functions/v2/https"

import {
  FUNCTION_REGION,
  INVENTORY_BOOTSTRAP_TENANT_KEY,
  SUPABASE_SECRETS,
} from "./config"
import { toHttpsError } from "./errors"
import {
  createProvisionRepository,
  provisionInventoryAccessHandler,
} from "./provision"
import { createSupabaseAccessLookup } from "./access"
import {
  createInventoryRepository,
  listInventoryItemsHandler,
  updateInventoryItemHandler,
} from "./inventory"
import { getSupabaseAdmin } from "./supabase"

if (getApps().length === 0) initializeApp()

export const provisionInventoryAccess = onCall(
  { region: FUNCTION_REGION, secrets: [...SUPABASE_SECRETS] },
  async (request) => {
    const requestId = randomUUID()
    try {
      return await provisionInventoryAccessHandler(request, {
        repository: createProvisionRepository(),
        auth: getAuth(),
        bootstrapTenantKey: INVENTORY_BOOTSTRAP_TENANT_KEY.value(),
      })
    } catch (error) {
      logger.error("Inventory provisioning failed", {
        requestId,
        uid: request.auth?.uid ?? null,
        failureType: error instanceof Error ? error.name : "UnknownError",
      })
      throw toHttpsError(error, requestId)
    }
  },
)

function inventoryDependencies() {
  const client = getSupabaseAdmin()
  return {
    accessLookup: createSupabaseAccessLookup(client),
    repository: createInventoryRepository(client),
  }
}

export const listInventoryItems = onCall(
  { region: FUNCTION_REGION, secrets: [...SUPABASE_SECRETS] },
  async (request) => {
    const requestId = randomUUID()
    try {
      return await listInventoryItemsHandler(request, inventoryDependencies())
    } catch (error) {
      logger.error("Inventory item listing failed", {
        requestId,
        uid: request.auth?.uid ?? null,
        failureType: error instanceof Error ? error.name : "UnknownError",
      })
      throw toHttpsError(error, requestId)
    }
  },
)

export const updateInventoryItem = onCall(
  { region: FUNCTION_REGION, secrets: [...SUPABASE_SECRETS] },
  async (request) => {
    const requestId = randomUUID()
    try {
      return await updateInventoryItemHandler(request, inventoryDependencies())
    } catch (error) {
      logger.error("Inventory item update failed", {
        requestId,
        uid: request.auth?.uid ?? null,
        failureType: error instanceof Error ? error.name : "UnknownError",
      })
      throw toHttpsError(error, requestId)
    }
  },
)
