import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const firebase = await readFile(new URL("../src/services/firebase.ts", import.meta.url), "utf8")
const api = await readFile(new URL("../src/services/inventory-api.ts", import.meta.url), "utf8").catch(error => {
  if (error?.code === "ENOENT") return ""
  throw error
})
const env = await readFile(new URL("../.env.example", import.meta.url), "utf8")

assert.ok(firebase.includes('from "firebase/functions"'), "Firebase Functions SDK must be initialized in the shared client.")
assert.ok(firebase.includes("getFunctions(firebaseApp"), "Functions must use the configured Firebase app.")
assert.ok(firebase.includes('"asia-southeast1"'), "Functions must default to the deployed region.")
assert.ok(firebase.includes("firebaseFunctions"), "The regional Functions client must be exported.")

for (const contract of [
  "httpsCallable",
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
]) assert.ok(api.includes(contract), `Missing callable client contract: ${contract}`)

assert.equal(api.includes("details"), false, "Callable error details must not reach the UI.")
assert.equal(api.includes("tenantId"), false, "The browser must never submit a tenant ID.")
assert.equal(api.includes("@supabase/supabase-js"), false, "The browser callable client must not import Supabase.")
assert.ok(env.includes("VITE_FIREBASE_FUNCTIONS_REGION=asia-southeast1"), "The Functions region must be documented.")
assert.equal(env.includes("VITE_SUPABASE_"), false, "Supabase credentials must not be exposed to Vite.")

console.log("Firebase callable client checks passed.")
