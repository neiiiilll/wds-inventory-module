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
  "register_current_app_user",
  "set_app_user_access",
  "app_users",
  "user_role_history",
  "ensureFirebaseSupabaseRole",
  "reason.trim()",
]) assert.ok(source.includes(contract), `Missing user-access contract: ${contract}`)

assert.ok(source.includes("export async function registerCurrentUser(): Promise<AppUser>"), "Registration must not accept a client-selected role.")
assert.ok(source.includes("Firebase authentication is required"), "Missing Firebase configuration/session error.")
assert.ok(source.includes("Supabase is not configured"), "Missing Supabase configuration error.")
assert.equal(source.includes("localStorage"), false, "Roles must not fall back to browser-local authorization.")
assert.ok(source.includes("supabase"), "User access must use the Supabase backend.")

console.log("User access service checks passed.")
