import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"

const migrationsUrl = new URL("../supabase/migrations/", import.meta.url)
const migrationNames = (await readdir(migrationsUrl))
  .filter((name) => name.endsWith(".sql"))
  .sort()

assert.deepEqual(migrationNames, [
  "20261022000100_inventory_shared_prerequisites.sql",
  "20261022000200_inventory_catalog_stock.sql",
])

const [prerequisites, catalog] = await Promise.all(
  migrationNames.map((name) => readFile(new URL(name, migrationsUrl), "utf8")),
)
const allInventorySql = `${prerequisites}\n${catalog}`

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

console.log("Canonical inventory prerequisite and catalog migrations passed.")
