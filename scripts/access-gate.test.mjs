import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8")
const access = await readFile(new URL("../src/services/user-access.ts", import.meta.url), "utf8")
let gate = ""
try {
  gate = await readFile(new URL("../src/components/AccessGate.tsx", import.meta.url), "utf8")
} catch (error) {
  if (error?.code !== "ENOENT") throw error
}

assert.ok(gate.includes("provisionCurrentUser"), "The gate must provision through the verified callable API.")
assert.ok(access.includes("getIdToken(true)"), "Changed tenant claims must force a Firebase token refresh.")
assert.ok(access.includes("refreshToken"), "Provisioning must honor the server refresh flag.")
assert.ok(gate.includes("Your access has been disabled"), "Inactive accounts need a clear blocked state.")
assert.ok(gate.includes("Access could not be verified"), "Retryable access failures need a clear error state.")
assert.ok(gate.includes('window.addEventListener("focus"'), "Access must refresh when the browser regains focus.")
assert.ok(gate.includes("window.setInterval"), "Long-lived sessions must periodically refresh authorization.")
assert.ok(app.includes("<AccessGate"), "The authenticated shell must pass through AccessGate.")
assert.ok(app.includes("appUser.role"), "InventoryApp must use the assigned database role.")
assert.equal(app.includes('useState<Role>("Inventory Staff")'), false, "The client-controlled role state must be removed.")
assert.ok(app.includes("Role"), "The interface must display the assigned database role.")
assert.equal(app.includes("onChange={(e) => setRole"), false, "Users must not change their own role.")

console.log("Access gate checks passed.")
