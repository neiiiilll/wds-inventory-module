import { randomUUID } from "node:crypto"
import { getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { logger } from "firebase-functions"
import { onCall } from "firebase-functions/v2/https"
import { callableOptions } from "./config"
import { toHttpsError } from "./errors"
import { createProvisionRepository, provisionInventoryAccessHandler } from "./provision"
import { getSupabaseClient } from "./supabase"

if (getApps().length === 0) initializeApp()

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
