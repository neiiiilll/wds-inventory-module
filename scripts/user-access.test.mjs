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
  'rpc("register_current_app_user")',
  'rpc("set_app_user_access"',
  '.from("app_users")',
  '.from("user_role_history")',
  "firebase_uid",
  "display_name",
  "last_login_at",
  "reason.trim()",
]) assert.ok(source.includes(contract), `Missing user-access contract: ${contract}`)

assert.equal(/registerCurrentUser[\s\S]{0,500}(role|next_role)\s*:/i.test(source), false, "Registration must not send a client-selected role.")
assert.ok(source.includes("Firebase authentication is required"), "Missing Firebase configuration/session error.")
assert.ok(source.includes("Supabase is not configured"), "Missing Supabase configuration error.")

console.log("User access service checks passed.")
