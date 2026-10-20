import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const sourceUrl = new URL("../src/services/user-access.ts", import.meta.url)
let source = ""
try {
  source = await readFile(sourceUrl, "utf8")
} catch (error) {
  if (error?.code !== "ENOENT") throw error
}

for (const contract of [
  "registerCurrentUser",
  "loadCurrentUser",
  "listAppUsers",
  "setAppUserAccess",
  "listUserRoleHistory",
  "wds-inventory-demo-users-v1",
  "wds-inventory-demo-role-history-v1",
  "isBootstrapAdministrator",
  "localStorage",
  "reason.trim()",
]) assert.ok(source.includes(contract), `Missing user-access contract: ${contract}`)

assert.ok(source.includes("export async function registerCurrentUser(): Promise<AppUser>"), "Registration must not accept a client-selected role.")
assert.ok(source.includes("Firebase authentication is required"), "Missing Firebase configuration/session error.")
assert.ok(source.includes('current.role !== "Administrator"'), "Only the current demo Administrator may update access.")
assert.equal(source.includes("supabase"), false, "Demo access must not require Supabase or a paid backend.")

console.log("User access service checks passed.")
