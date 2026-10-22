import { createClient } from "@supabase/supabase-js"

import { createSupabaseAccessLookup } from "../_shared/access.ts"
import { handleInventoryHttpRequest } from "../_shared/http.ts"
import { createInventoryRepository, listInventoryItems, updateInventoryItem } from "../_shared/inventory.ts"
import { createProvisionRepository, provisionInventoryAccess } from "../_shared/provision.ts"
import { verifyFirebaseIdToken } from "../_shared/firebase-auth.ts"
import { createMaterialRequest, createWorkflowRepository, postStockMovement } from "../_shared/workflows.ts"

function required(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`Missing required Edge environment value: ${name}`)
  return value
}

const projectId = required("FIREBASE_PROJECT_ID")
const bootstrapTenantKey = Deno.env.get("INVENTORY_BOOTSTRAP_TENANT_KEY")?.trim() ?? ""
const allowedOrigins = new Set(required("INVENTORY_ALLOWED_ORIGINS").split(",").map((value) => value.trim()).filter(Boolean))
const client = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
})
const accessLookup = createSupabaseAccessLookup(client)
const inventoryRepository = createInventoryRepository(client)
const workflowRepository = createWorkflowRepository(client)
const provisionRepository = createProvisionRepository(client)

Deno.serve((request) => handleInventoryHttpRequest(request, {
  projectId,
  allowedOrigins,
  verifyToken: verifyFirebaseIdToken,
  actions: {
    provisionInventoryAccess: (identity, data) => provisionInventoryAccess(identity, data, { repository: provisionRepository, bootstrapTenantKey }),
    listInventoryItems: (identity, data) => listInventoryItems(identity, data, { accessLookup, repository: inventoryRepository }),
    updateInventoryItem: (identity, data) => updateInventoryItem(identity, data, { accessLookup, repository: inventoryRepository }),
    createMaterialRequest: (identity, data) => createMaterialRequest(identity, data, { accessLookup, repository: workflowRepository }),
    postStockMovement: (identity, data) => postStockMovement(identity, data, { accessLookup, repository: workflowRepository }),
  },
  logFailure: (metadata) => console.error("Inventory Edge request failed", metadata),
}))
