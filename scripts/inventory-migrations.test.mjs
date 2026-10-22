import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"

const migrationsUrl = new URL("../supabase/migrations/", import.meta.url)
const migrationNames = (await readdir(migrationsUrl))
  .filter((name) => name.endsWith(".sql"))
  .sort()

assert.deepEqual(migrationNames, [
  "20261022000100_inventory_shared_prerequisites.sql",
  "20261022000200_inventory_catalog_stock.sql",
  "20261022000300_inventory_workflows.sql",
  "20261022000400_inventory_integrity_rls.sql",
])

const [prerequisites, catalog, workflows, integrity] = await Promise.all(
  migrationNames.map((name) => readFile(new URL(name, migrationsUrl), "utf8")),
)
const allInventorySql = `${prerequisites}\n${catalog}\n${workflows}\n${integrity}`

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
  assert.doesNotMatch(
    prerequisites,
    new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+public\\.${table}\\b`, "i"),
    `Shared table ${table} must not be created by inventory migrations.`,
  )
}

for (const [indexName, table, columns] of [
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

console.log("Canonical inventory schema, integrity, and RLS migrations passed.")
