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
