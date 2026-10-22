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
assert.equal(module.canManageUsers?.("Administrator"), true)
assert.equal(module.canManageUsers?.("Inventory Staff"), false)
assert.equal(module.canMutateWorkflow?.("Inventory Staff"), true)
assert.equal(module.canMutateWorkflow?.("Viewer"), false)
assert.equal(module.canChangeRequester?.("Administrator"), true)
assert.equal(module.canChangeRequester?.("Inventory Staff"), false)
assert.equal(module.canPrint?.("Viewer"), true)

console.log("Access control checks passed.")
