import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const component = await readFile(new URL("../src/components/InventoryItemsPage.tsx", import.meta.url), "utf8").catch(error => {
  if (error?.code === "ENOENT") return ""
  throw error
})
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8")

for (const contract of [
  "listInventoryItems",
  "updateInventoryItem",
  "Loading inventory…",
  "No inventory items found",
  "Retry",
  "requestSequence",
  "setTimeout",
  "refreshing",
  "savingId",
  'error.code === "aborted"',
  "Reload the latest item",
  "categoryName",
  "unitName",
  "quantity",
  "version",
]) assert.ok(component.includes(contract), `Missing callable inventory UI contract: ${contract}`)

assert.ok(app.includes("<InventoryItemsPage"), "The inventory route must render the callable-backed page.")
for (const forbidden of ["workflow-repository", "services/supabase", "isSupabaseConfigured", "loadRemoteWorkflow", "saveRemoteWorkflow"])
  assert.equal(app.includes(forbidden), false, `App must not retain direct backend contract: ${forbidden}`)

console.log("Callable inventory page checks passed.")
