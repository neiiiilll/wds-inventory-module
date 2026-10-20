import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8")
let gate = ""
try {
  gate = await readFile(new URL("../src/components/AccessGate.tsx", import.meta.url), "utf8")
} catch (error) {
  if (error?.code !== "ENOENT") throw error
}

assert.ok(gate.includes("registerCurrentUser"), "The gate must register the verified Firebase user.")
assert.ok(gate.includes("Your access has been disabled"), "Inactive accounts need a clear blocked state.")
assert.ok(gate.includes('window.addEventListener("focus"'), "Access must refresh when the browser regains focus.")
assert.ok(gate.includes('window.addEventListener("wds-access-invalidated"'), "Denied data requests must immediately refresh authorization.")
assert.ok(gate.includes("window.setInterval"), "Long-lived sessions must periodically refresh authorization.")
assert.ok(app.includes("<AccessGate"), "The authenticated shell must pass through AccessGate.")
assert.ok(app.includes("appUser.role"), "InventoryApp must use the assigned database role.")
assert.equal(app.includes('useState<Role>("Inventory Staff")'), false, "The client-controlled role state must be removed.")
assert.ok(app.includes("Role"), "The interface must display the assigned database role.")
assert.equal(app.includes("onChange={(e) => setRole"), false, "Users must not change their own role.")
assert.ok(app.includes("loadRemoteWorkflow"), "Inventory must hydrate from the shared Supabase snapshot.")
assert.ok(app.includes("saveRemoteWorkflow"), "Inventory mutations must sync to Supabase.")

console.log("Access gate checks passed.")
