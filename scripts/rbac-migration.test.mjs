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
assert.ok(/current_app_role\(\)\s+is distinct from\s+'Administrator'/i.test(sql), "Inactive and unregistered callers must fail the Administrator RPC guard when their role is NULL.")
assert.equal(/on conflict \(firebase_uid\)[\s\S]+role\s*=\s*case/i.test(sql), false, "Signing in again must not silently restore a bootstrap user's Administrator role.")
assert.ok(sql.includes("protect_material_request_requester"), "Database validation must protect Material Request requester changes.")
assert.ok(sql.includes("protect_snapshot_requesters"), "Database validation must protect requester fields inside workflow snapshots.")
assert.ok(/new\.requester_name\s+is distinct from\s+old\.requester_name/i.test(sql), "Inventory Staff must not change requester_name through the API.")
assert.ok(/new_request\s*->>\s*'person'[\s\S]+current_app_display_name\(\)/i.test(sql), "New snapshot requests created by Inventory Staff must use their assigned display name.")
assert.ok(/tg_op\s*=\s*'INSERT'[\s\S]+from public\.workflow_snapshots[\s\S]+where id = new\.id/i.test(sql), "Snapshot upserts must compare against the stored requesters before the ON CONFLICT update path.")
assert.ok(/count\(\*\)[\s\S]+count\(distinct value ->> 'id'\)/i.test(sql), "Requester protection must reject duplicate Material Request IDs.")
assert.ok(/new_request is null[\s\S]+Only an Administrator can remove a Material Request/i.test(sql), "Inventory Staff must not remove and recreate requests to bypass requester protection.")
assert.ok(/old_value\.value\s*->>\s*'id'\s*=\s*new_value\.value\s*->>\s*'id'/i.test(sql), "New-request validation must correlate old and new request IDs explicitly.")

console.log("RBAC migration checks passed.")
