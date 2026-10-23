import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import ts from "typescript"

const sourceUrl = new URL("../src/services/access-control.ts", import.meta.url)
let source = ""
try {
  source = await readFile(sourceUrl, "utf8")
} catch (error) {
  if (error?.code !== "ENOENT") throw error
}
const module = source
  ? await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText).toString("base64")}`)
  : {}

assert.deepEqual(module.APP_ROLES, ["Administrator", "Inventory Staff", "Viewer"])
assert.equal(module.toAppRole?.("administrator"), "Administrator")
assert.equal(module.toAppRole?.("inventory_staff"), "Inventory Staff")
assert.equal(module.toAppRole?.("viewer"), "Viewer")
assert.equal(module.toAppRole?.("owner"), null)
assert.equal(module.isBootstrapAdministrator, undefined, "Email allowlists must not grant access.")
assert.equal(module.normalizeDemoAccess, undefined, "Browser demo overrides must not grant access.")
assert.equal(module.canManageUsers, undefined, "User administration is outside the Inventory client API.")
assert.equal(module.canMutateWorkflow?.("Inventory Staff"), true)
assert.equal(module.canMutateWorkflow?.("Viewer"), false)
assert.equal(module.canChangeRequester?.("Administrator"), true)
assert.equal(module.canChangeRequester?.("Inventory Staff"), false)
assert.equal(module.canPrint?.("Viewer"), true)

const expectedCapabilities = {
  Administrator: [
    "inventory.read", "inventory.update", "workflow.read", "workflow.mutate",
    "stock.post", "requester.change", "reports.read", "documents.print",
    "settings.read",
  ],
  "Inventory Staff": [
    "inventory.read", "inventory.update", "workflow.read", "workflow.mutate",
    "stock.post", "reports.read", "documents.print", "settings.read",
  ],
  Viewer: [
    "inventory.read", "workflow.read", "reports.read", "documents.print",
    "settings.read",
  ],
}

for (const [role, capabilities] of Object.entries(expectedCapabilities)) {
  assert.deepEqual(module.capabilitiesFor?.(role), capabilities)
  for (const capability of capabilities) assert.equal(module.hasCapability?.(role, capability), true)
}
assert.equal(module.hasCapability?.("Viewer", "inventory.update"), false)
assert.equal(module.hasCapability?.("Viewer", "workflow.mutate"), false)
assert.equal(module.hasCapability?.("Inventory Staff", "requester.change"), false)
assert.equal(module.isReadOnlyRole?.("Viewer"), true)
assert.equal(module.isReadOnlyRole?.("Inventory Staff"), false)
assert.equal(module.isReadOnlyRole?.("Administrator"), false)

for (const page of [
  "dashboard", "inventory", "requests", "purchase-requests", "procurement",
  "inspection", "stock-in", "stock-out", "charges", "reconciliation",
  "transactions", "trail", "reports", "settings",
]) {
  assert.equal(module.canAccessPage?.("Viewer", page), true, `Viewer should read ${page}`)
}
assert.equal(module.APP_PAGES?.includes("user-access"), false, "The client must not advertise unsupported user administration.")

console.log("Access control checks passed.")
