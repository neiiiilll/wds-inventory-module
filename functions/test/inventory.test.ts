import assert from "node:assert/strict"
import test from "node:test"
import type { CallableRequest } from "firebase-functions/v2/https"
import { logger } from "firebase-functions"
import { listInventoryItemsHandler, updateInventoryItemHandler, createInventoryRepository } from "../src/inventory"
import { inventory } from "../src/index"
import { request, lookup, rejectsCode, tenantId, itemId } from "./helpers"

const row = { id: itemId, item_code: "PUMP-001", name: "Pump", description: null, category_id: itemId, unit_id: itemId, supplier_id: null, minimum_quantity: "2", active: true, version: 3, category: { name: "Motors" }, unit: [{ name: "Each", symbol: "ea" }] }

function fixture(role = "viewer", updated: unknown = { id: itemId }) {
  const lists: unknown[][] = [], updates: unknown[][] = []
  return { lists, updates, deps: { accessLookup: lookup(role), repository: {
    async list(...args: unknown[]) { lists.push(args); return { items: [], nextCursor: null } },
    async update(...args: unknown[]) { updates.push(args); return updated as never },
  } } }
}

for (const role of ["administrator", "inventory_staff", "viewer"]) {
  test(`${role} can list the authorized tenant`, async () => {
    const f = fixture(role)
    assert.deepEqual(await listInventoryItemsHandler(request({ limit: 25 }), f.deps), { items: [], nextCursor: null })
    assert.deepEqual(f.lists, [[tenantId, { limit: 25, search: null, cursor: null }]])
  })
}
test("list clamps pagination and normalizes search", async () => {
  const f = fixture()
  await listInventoryItemsHandler(request({ limit: 0, search: "  PUMP  Motor " }), f.deps)
  await listInventoryItemsHandler(request({ limit: 1000 }), f.deps)
  assert.deepEqual(f.lists, [[tenantId, { limit: 1, search: "pump motor", cursor: null }], [tenantId, { limit: 100, search: null, cursor: null }]])
})
for (const data of [null, [], { limit: 1.2 }, { limit: "10" }, { search: 5 }, { search: "x".repeat(101) }, { cursor: "" }, { cursor: 42 }, { tenant_id: tenantId }]) {
  test(`list rejects malformed payload ${JSON.stringify(data)}`, async () => {
    const f = fixture()
    await rejectsCode(listInventoryItemsHandler(request(data), f.deps), "invalid-argument")
    assert.deepEqual(f.lists, [])
  })
}
test("viewer mutation denial precedes payload validation", async () => {
  const f = fixture()
  await rejectsCode(updateInventoryItemHandler(request(null), f.deps), "permission-denied")
  assert.deepEqual(f.updates, [])
})
for (const role of ["administrator", "inventory_staff"]) {
  test(`${role} updates whitelisted changes with the database tenant`, async () => {
    const f = fixture(role)
    await updateInventoryItemHandler(request({ id: itemId, expectedVersion: 3, changes: { name: " Pump ", description: " ", supplierId: null, minimumQuantity: 4, active: false, categoryId: itemId, unitId: itemId } }), f.deps)
    assert.deepEqual(f.updates, [[tenantId, itemId, 3, { name: "Pump", description: null, supplier_id: null, minimum_quantity: 4, active: false, category_id: itemId, unit_id: itemId }]])
  })
}
for (const field of ["tenantId", "tenant_id", "actorUserId", "role", "status", "documentNo", "version"]) {
  test(`update rejects client ${field} at both levels`, async () => {
    const f = fixture("administrator")
    const data = { id: itemId, expectedVersion: 3, changes: { name: "Pump" } }
    await rejectsCode(updateInventoryItemHandler(request({ ...data, [field]: "forged" }), f.deps), "invalid-argument")
    await rejectsCode(updateInventoryItemHandler(request({ ...data, changes: { ...data.changes, [field]: "forged" } }), f.deps), "invalid-argument")
    assert.deepEqual(f.updates, [])
  })
}
test("stale or cross-tenant missing update has the same safe conflict", async () => {
  const f = fixture("administrator", null)
  await rejectsCode(updateInventoryItemHandler(request({ id: itemId, expectedVersion: 3, changes: { active: false } }), f.deps), "aborted", "The item changed or is no longer available. Reload and try again.")
})

function database(itemRows: unknown = [row, { ...row, id: "80000000-0000-0000-0000-000000000002", item_code: "PUMP-002" }]) {
  const queries: Array<{ table: string; calls: unknown[][] }> = []
  const client = { from(table: string) {
    assert.ok(["inv_inventory_items", "inv_inventory_balances"].includes(table))
    const q = { table, calls: [] as unknown[][] }; queries.push(q)
    const result = () => ({ data: table === "inv_inventory_balances" ? [{ item_id: itemId, quantity: "3" }, { item_id: itemId, quantity: 5 }] : itemRows, error: null })
    const builder: any = { then(resolve: any) { return Promise.resolve(result()).then(resolve) }, maybeSingle() { return Promise.resolve(result()) } }
    for (const method of ["select", "eq", "in", "order", "limit", "or", "update"]) builder[method] = (...args: unknown[]) => { q.calls.push([method, ...args]); return builder }
    return builder
  } }
  return { queries, repository: createInventoryRepository(client as never) }
}
test("repository scopes list/balances, joins DTO data, orders stably, and resumes opaque cursor", async () => {
  const f = database()
  const page = await f.repository.list(tenantId, { limit: 1, search: "pump%", cursor: null })
  assert.equal(page.items[0].quantity, 8)
  assert.equal(page.items[0].categoryName, "Motors")
  assert.equal(page.items[0].unitSymbol, "ea")
  assert.equal(page.items[0].minimumQuantity, 2)
  assert.ok(page.nextCursor && !page.nextCursor.includes("PUMP"))
  await f.repository.list(tenantId, { limit: 1, search: null, cursor: page.nextCursor })
  for (const query of f.queries) assert.ok(query.calls.some((c) => JSON.stringify(c) === JSON.stringify(["eq", "tenant_id", tenantId])))
  assert.deepEqual(f.queries[0].calls.filter((c) => c[0] === "order"), [["order", "item_code", { ascending: true }], ["order", "id", { ascending: true }]])
  assert.ok(f.queries[0].calls.some((c) => c[0] === "limit" && c[1] === 2))
  assert.ok(f.queries[0].calls.some((c) => c[0] === "select" && String(c[1]).includes("inv_categories") && String(c[1]).includes("inv_units")))
  assert.ok(f.queries[2].calls.some((c) => c[0] === "or" && String(c[1]).includes("id.gt.")))
  await rejectsCode(f.repository.list(tenantId, { limit: 1, search: null, cursor: "not-a-cursor" }), "invalid-argument")
})
test("update repository predicates tenant, id and expected version, with server version increment", async () => {
  const f = database(row)
  const result = await f.repository.update(tenantId, itemId, 3, { name: "Updated" })
  assert.equal(result?.quantity, 8)
  assert.deepEqual(f.queries[0].calls.filter((c) => c[0] === "eq" || c[0] === "update"), [["update", { name: "Updated", version: 4 }], ["eq", "tenant_id", tenantId], ["eq", "id", itemId], ["eq", "version", 3]])
  assert.ok(f.queries[1].calls.some((c) => JSON.stringify(c) === JSON.stringify(["eq", "tenant_id", tenantId])))
  assert.equal(await database(null).repository.update(tenantId, itemId, 3, { active: false }), null)
})
test("catalog joins use live relationships without environment-specific constraint names", async () => {
  const f = database()
  await f.repository.list(tenantId, { limit: 10, search: null, cursor: null })
  const select = f.queries[0].calls.find(call => call[0] === "select")
  assert.ok(select)
  assert.ok(String(select[1]).includes("category:inv_categories(name)"))
  assert.ok(String(select[1]).includes("unit:inv_units(name,symbol)"))
  assert.equal(String(select[1]).includes("!inv_inventory_items_"), false)
})
test("single inventory callable rejects missing auth and unverified email before secrets", async (t) => {
  t.mock.method(logger, "error", () => {})
  await assert.rejects(inventory.run({ data: null } as CallableRequest<unknown>), { code: "unauthenticated" })
  const req = request(null); req.auth!.token.email_verified = false
  await assert.rejects(inventory.run(req), { code: "permission-denied" })
})
