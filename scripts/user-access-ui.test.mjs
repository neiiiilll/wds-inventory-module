import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8")
const accessControl = await readFile(new URL("../src/services/access-control.ts", import.meta.url), "utf8")
let component = ""
try {
  component = await readFile(new URL("../src/components/UserAccess.tsx", import.meta.url), "utf8")
} catch (error) {
  if (error?.code !== "ENOENT") throw error
}

for (const text of [
  "User Access",
  "Display name",
  "Email",
  "Role",
  "Status",
  "Registered",
  "Last login",
  "Reason for change",
  "Access history",
  "listAppUsers",
  "setAppUserAccess",
  "listUserRoleHistory",
]) assert.ok(component.includes(text), `Missing Administrator UI contract: ${text}`)

for (const role of ["Administrator", "Inventory Staff", "Viewer"])
  assert.ok(accessControl.includes(role), `Missing shared role option: ${role}`)

assert.ok(component.includes("currentUser.firebaseUid"), "The signed-in Administrator row must be protected from self-editing.")
assert.ok(app.includes('page === "user-access"'), "The application must route to the User Access page.")
assert.ok(app.includes("canManageUsers(role)"), "User Access navigation must be Administrator-only.")

console.log("User access UI checks passed.")
