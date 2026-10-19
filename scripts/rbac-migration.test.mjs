import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const migrationUrl = new URL("../supabase/migrations/20261019000000_role_based_access.sql", import.meta.url)
let sql = ""
try {
  sql = await readFile(migrationUrl, "utf8")
} catch (error) {
  if (error?.code !== "ENOENT") throw error
}

const required = [
  "create table if not exists public.app_users",
  "create table if not exists public.user_role_history",
  "register_current_app_user",
  "set_app_user_access",
  "neilchristiand17@gmail.com",
  "ojt@likhainternet.com",
  "'Viewer'",
  "cannot change your own administrator access",
  "change reason is required",
  "drop policy if exists \"demo snapshot read\"",
  "drop policy if exists \"demo snapshot write\"",
  "current_app_role",
  "current_app_user_active",
  "revoke all on function",
]
for (const text of required) assert.ok(sql.toLowerCase().includes(text.toLowerCase()), `Missing SQL contract: ${text}`)

assert.equal(/create policy[^;]+for all to authenticated using \(true\)/is.test(sql), false, "RBAC migration must not add broad authenticated write policies.")
assert.ok(/workflow_snapshots[\s\S]+for select[\s\S]+current_app_user_active/is.test(sql), "Assigned active users need snapshot read access.")
assert.ok(/workflow_snapshots[\s\S]+for (insert|update)[\s\S]+current_app_role\(\) in \('Administrator', 'Inventory Staff'\)/is.test(sql), "Only operational roles may write snapshots.")

console.log("RBAC migration checks passed.")
