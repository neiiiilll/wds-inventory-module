import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const firebase = await readFile(new URL("../src/services/firebase.ts", import.meta.url), "utf8")
const api = await readFile(new URL("../src/services/inventory-api.ts", import.meta.url), "utf8").catch(error => {
  if (error?.code === "ENOENT") return ""
  throw error
})
const transport = await readFile(new URL("../src/services/inventory-http.ts", import.meta.url), "utf8")
const client = `${api}\n${transport}`
const env = await readFile(new URL("../.env.example", import.meta.url), "utf8")

assert.equal(firebase.includes('from "firebase/functions"'), false, "The browser must not initialize Firebase Functions.")
assert.equal(firebase.includes("getFunctions"), false, "Firebase remains authentication-only in the browser.")

for (const contract of [
  "invokeInventoryEdge",
  "callInventoryFunction",
  "provisionInventoryAccess",
  "listInventoryItems",
  "updateInventoryItem",
  "createMaterialRequest",
  "postStockMovement",
  "InventoryApiError",
  "permission-denied",
  "aborted",
  "internal",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "getIdToken",
]) assert.ok(client.includes(contract), `Missing Edge client contract: ${contract}`)

assert.equal(client.includes("details"), false, "Edge error details must not reach the UI.")
assert.equal(client.includes("tenantId"), false, "The browser must never submit a tenant ID.")
assert.equal(client.includes("@supabase/supabase-js"), false, "The browser client must not import Supabase.")
assert.ok(env.includes("VITE_SUPABASE_URL="), "The public Supabase URL must be documented.")
assert.ok(env.includes("VITE_SUPABASE_PUBLISHABLE_KEY="), "The public Supabase key must be documented.")
assert.equal(env.includes("SERVICE_ROLE"), false, "The service-role key must never be exposed to Vite.")

console.log("Firebase-authenticated Edge client checks passed.")
