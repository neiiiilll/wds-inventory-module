import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"

const migrationsUrl = new URL("../supabase/migrations/", import.meta.url)
const migrationNames = (await readdir(migrationsUrl))
  .filter((name) => name.endsWith(".sql"))
  .sort()

const canonicalNames = [
  "20261014000000_inventory_schema.sql",
  "20261019000000_role_based_access.sql",
  "20261022000100_inventory_shared_prerequisites.sql",
  "20261022000200_inventory_catalog_stock.sql",
  "20261022000300_inventory_workflows.sql",
  "20261022000400_inventory_integrity_rls.sql",
  "20261022000500_inventory_rpcs.sql",
  "20261022000600_inventory_legacy_compatibility.sql",
]
const procurementNames = migrationNames.filter(name => /^20261023\d+_inventory_procurement_[a-z_]+\.sql$/.test(name))
assert.deepEqual(migrationNames, [...canonicalNames, ...procurementNames])
assert.deepEqual(procurementNames, [
  "20261023000100_inventory_procurement_foundation.sql",
  "20261023000200_inventory_procurement_reads.sql",
  "20261023000300_inventory_procurement_documents.sql",
  "20261023000400_inventory_procurement_receiving.sql",
  "20261023000500_inventory_procurement_setup.sql",
  "20261023000600_inventory_procurement_attachments.sql",
  "20261023000700_inventory_procurement_ui.sql",
])

const [legacySchema, legacyAccess, prerequisites, catalog, workflows, integrity, rpcs, legacyCompatibility] = await Promise.all(
  canonicalNames.map((name) => readFile(new URL(name, migrationsUrl), "utf8")),
)
assert.match(legacySchema, /Historical migration marker/)
assert.match(legacyAccess, /Historical migration marker/)
assert.doesNotMatch(`${legacySchema}\n${legacyAccess}`, /create\s+table|alter\s+table|drop\s+table/i)
const allInventorySql = `${prerequisites}\n${catalog}\n${workflows}\n${integrity}\n${rpcs}`

assert.doesNotMatch(allInventorySql, /\bsvc_[a-z0-9_]+\b/i)
assert.match(prerequisites, /'inventory'\s*,\s*'Inventory'/)
assert.match(prerequisites, /'administrator'.*'inventory_staff'.*'viewer'/s)
assert.match(prerequisites, /'inventory-test'\s*,\s*'Inventory Test Tenant'/)

const sharedTables = [
  "app_users",
  "tenants",
  "applications",
  "app_roles",
  "tenant_memberships",
  "membership_roles",
  "departments",
  "personnel",
  "attachments",
  "audit_events",
  "user_role_history",
]
assert.match(prerequisites, /to_regclass\('public\.'\s*\|\|\s*required_table\)/i)
for (const table of sharedTables) {
  assert.match(
    prerequisites,
    new RegExp(`'${table}'`, "i"),
    `Shared prerequisite ${table} must be included in the catalog-check list.`,
  )
  assert.match(
    prerequisites,
    new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}\\b`, "i"),
    `Missing safe shared prerequisite creation for ${table}.`,
  )
}

for (const [indexName, table, columns] of [
  ["app_roles_app_key_role_key_uidx", "app_roles", "app_key, role_key"],
  ["tenant_memberships_tenant_id_id_uidx", "tenant_memberships", "tenant_id, id"],
  ["departments_tenant_id_id_uidx", "departments", "tenant_id, id"],
  ["personnel_tenant_id_id_uidx", "personnel", "tenant_id, id"],
  ["tenant_memberships_user_id_uidx", "tenant_memberships", "user_id"],
]) {
  assert.match(
    prerequisites,
    new RegExp(
      `create\\s+unique\\s+index\\s+if\\s+not\\s+exists\\s+${indexName}\\s+on\\s+public\\.${table}\\s*\\(${columns}\\)`,
      "i",
    ),
  )
}

const expectedCatalogTables = [
  "inv_suppliers",
  "inv_categories",
  "inv_units",
  "inv_warehouses",
  "inv_storage_locations",
  "inv_inventory_items",
  "inv_inventory_assets",
  "inv_inventory_balances",
  "inv_stock_movements",
  "inv_stock_movement_lines",
]
for (const table of expectedCatalogTables) {
  assert.match(catalog, new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}\\b`, "i"))
}

assert.match(catalog, /foreign key\s*\(tenant_id,\s*item_id\)/i)
assert.doesNotMatch(catalog, /foreign key\s*\(item_id\)[\s\S]*foreign key\s*\(tenant_id\)/i)
assert.match(catalog, /unique\s*\(tenant_id,\s*idempotency_key\)/i)
assert.match(catalog, /unique\s*\(tenant_id,\s*item_code\)/i)
assert.match(catalog, /unique\s*\(tenant_id,\s*asset_tag\)/i)

const expectedWorkflowTables = [
  "inv_material_requests",
  "inv_material_request_lines",
  "inv_supplier_quotations",
  "inv_supplier_quotation_lines",
  "inv_purchase_requests",
  "inv_purchase_request_lines",
  "inv_purchase_request_approvals",
  "inv_purchase_orders",
  "inv_purchase_order_lines",
  "inv_purchase_order_dispatches",
  "inv_inspection_reports",
  "inv_inspection_report_lines",
  "inv_supplier_returns",
  "inv_requisition_issue_slips",
  "inv_requisition_issue_slip_lines",
  "inv_ris_releases",
  "inv_material_returns",
  "inv_stock_counts",
  "inv_stock_count_lines",
  "inv_document_counters",
]
for (const table of expectedWorkflowTables) {
  assert.match(workflows, new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}\\b`, "i"))
}

const workflowCompositeReferences = [
  ["material_request_id", "inv_material_requests"],
  ["quotation_id", "inv_supplier_quotations"],
  ["purchase_request_id", "inv_purchase_requests"],
  ["purchase_order_id", "inv_purchase_orders"],
  ["inspection_report_id", "inv_inspection_reports"],
  ["purchase_order_line_id", "inv_purchase_order_lines"],
  ["inspection_line_id", "inv_inspection_report_lines"],
  ["ris_id", "inv_requisition_issue_slips"],
  ["ris_line_id", "inv_requisition_issue_slip_lines"],
  ["movement_line_id", "inv_stock_movement_lines"],
  ["release_id", "inv_ris_releases"],
  ["stock_count_id", "inv_stock_counts"],
  ["adjustment_movement_id", "inv_stock_movements"],
]
for (const [column, parent] of workflowCompositeReferences) {
  assert.match(
    workflows,
    new RegExp(`foreign\\s+key\\s*\\(tenant_id,\\s*${column}\\)\\s*references\\s+public\\.${parent}\\s*\\(tenant_id,\\s*id\\)`, "i"),
  )
}

for (const numberColumn of ["request_no", "quotation_no", "order_no", "ris_no", "return_reference"]) {
  assert.match(workflows, new RegExp(`unique\\s*\\(tenant_id,\\s*${numberColumn}\\)`, "i"))
}
for (const parentColumn of [
  "material_request_id",
  "quotation_id",
  "purchase_request_id",
  "purchase_order_id",
  "ris_id",
]) {
  assert.match(workflows, new RegExp(`unique\\s*\\(tenant_id,\\s*${parentColumn},\\s*line_no\\)`, "i"))
}

assert.match(integrity, /create or replace function public\.inv_set_updated_at\(\)/i)
assert.match(integrity, /tablename\s+like\s+'inv\\_%'\s+escape\s+'\\'/i)
assert.match(integrity, /alter table public\.%I enable row level security/i)
assert.match(integrity, /revoke all on table public\.%I from anon, authenticated/i)
assert.doesNotMatch(integrity, /create\s+policy/i)
assert.match(integrity, /create index if not exists inv_stock_movement_lines_tenant_item_idx/i)
assert.match(integrity, /column_name in \('tenant_id', 'id'\)/i)
assert.match(integrity, /inventory_parent \|\| '_tenant_id_id_uidx'/i)
assert.match(integrity, /create unique index if not exists %I on public\.%I \(tenant_id, id\)/i)

for (const signature of [
  /inv_next_document_number\s*\(\s*p_tenant_id uuid,\s*p_document_type text,\s*p_document_date date default current_date\s*\)\s*returns text/is,
  /inv_create_material_request\s*\(\s*p_tenant_id uuid,\s*p_actor_user_id uuid,\s*p_requester_personnel_id uuid,\s*p_job text,\s*p_requested_on date,\s*p_lines jsonb\s*\)\s*returns jsonb/is,
  /inv_post_stock_movement\s*\(\s*p_tenant_id uuid,\s*p_actor_user_id uuid,\s*p_movement_type text,\s*p_source_type text,\s*p_source_reference text,\s*p_idempotency_key text,\s*p_notes text,\s*p_lines jsonb\s*\)\s*returns jsonb/is,
]) {
  assert.match(rpcs, signature)
}
assert.equal((rpcs.match(/security definer/gi) ?? []).length, 3)
assert.equal((rpcs.match(/set search_path = public, pg_temp/gi) ?? []).length, 3)
for (const documentType of ["MR", "SQ", "PR", "PO", "IR", "RIS", "SR", "SC", "SM"]) {
  assert.match(rpcs, new RegExp(`'${documentType}'`))
}
assert.match(rpcs, /on conflict\s*\(tenant_id,\s*document_type,\s*period_month\)\s*do update/is)
assert.match(rpcs, /where\s+tenant_id\s*=\s*p_tenant_id[\s\S]*idempotency_key\s*=\s*btrim\(p_idempotency_key\)/i)
assert.match(rpcs, /order by\s+item_id,\s*location_id/i)
assert.match(rpcs, /insufficient stock/i)
assert.match(rpcs, /insert into public\.audit_events/i)
assert.equal((rpcs.match(/revoke all on function public\.inv_/gi) ?? []).length, 3)
assert.equal((rpcs.match(/grant execute on function public\.inv_[\s\S]*?to service_role/gi) ?? []).length, 3)

assert.match(legacyCompatibility, /information_schema\.columns/i)
assert.match(legacyCompatibility, /table_name\s*=\s*'app_users'/i)
assert.match(legacyCompatibility, /column_name\s*=\s*'role'/i)
assert.match(legacyCompatibility, /alter table public\.app_users alter column role set default 'Viewer'/i)
assert.doesNotMatch(legacyCompatibility, /\bsvc_[a-z0-9_]+\b/i)

const [procurementReads, procurementUi] = await Promise.all([
  readFile(new URL(procurementNames[1], migrationsUrl), "utf8"),
  readFile(new URL(procurementNames[6], migrationsUrl), "utf8"),
])
assert.doesNotMatch(procurementReads, /trackingVersion/)
assert.match(procurementUi, /create or replace function public\.inv_get_procurement_reference_data/i)
assert.match(procurementUi, /'trackingVersion',tr\.version/i)
assert.doesNotMatch(procurementUi, /\bsvc_[a-z0-9_]+\b|serviceDesk|SERVICE_DESK_BACKEND/i)
const releaseCheck = await readFile(new URL("inventory-release-check.mjs", import.meta.url), "utf8")
assert.match(releaseCheck, /pg_get_functiondef/)
assert.match(releaseCheck, /trackingVersion/)

console.log("Canonical inventory migrations and RPC contracts passed.")
