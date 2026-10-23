import assert from "node:assert/strict"
import test from "node:test"

import type { AccessLookup } from "../_shared/access.ts"
import type { InventoryItemDto, InventoryRole } from "../_shared/contracts.ts"
import { ApiError } from "../_shared/errors.ts"
import type { FirebaseIdentity } from "../_shared/firebase-auth.ts"
import { INVENTORY_ITEM_SELECT, listInventoryItems, updateInventoryItem, type InventoryDependencies, type InventoryRepository, type ListQuery, type UpdateItemChanges } from "../_shared/inventory.ts"

const identity: FirebaseIdentity = { uid: "firebase-1", email: "user@example.test", emailVerified: true, displayName: "User" }
const item: InventoryItemDto = {
  id: "80000000-0000-0000-0000-000000000001", itemCode: "PUMP-001", name: "Pump Motor", description: null,
  categoryId: "40000000-0000-0000-0000-000000000001", categoryName: "Motors",
  unitId: "50000000-0000-0000-0000-000000000001", unitName: "Each", unitSymbol: "ea",
  supplierId: null, minimumQuantity: 2, quantity: 8, active: true, version: 3,
}

test("inventory item relationships do not depend on environment-specific constraint names", () => {
  assert.match(INVENTORY_ITEM_SELECT, /category:inv_categories\(name\)/)
  assert.match(INVENTORY_ITEM_SELECT, /unit:inv_units\(name,symbol\)/)
  assert.doesNotMatch(INVENTORY_ITEM_SELECT, /!inv_inventory_items_(category|unit)_fk/)
})

function accessLookup(roleKey: InventoryRole): AccessLookup {
  return {
    async findUser() { return { id: "user-1", active: true } },
    async listMemberships() { return [{ id: "membership-1", tenantId: "tenant-1", status: "active" }] },
    async findTenant() { return { id: "tenant-1", tenantKey: "inventory-test", active: true } },
    async listRoles() { return [{ roleKey, applicationActive: true, roleExists: true }] },
  }
}

function dependencies(roleKey: InventoryRole, updateResult: InventoryItemDto | null = item) {
  const calls: { lists: Array<{ tenantId: string; query: ListQuery }>; updates: Array<{ tenantId: string; id: string; expectedVersion: number; changes: UpdateItemChanges }> } = { lists: [], updates: [] }
  const repository: InventoryRepository = {
    async list(tenantId, query) { calls.lists.push({ tenantId, query }); return { items: [item], nextCursor: "next-cursor" } },
    async update(tenantId, id, expectedVersion, changes) { calls.updates.push({ tenantId, id, expectedVersion, changes }); return updateResult },
  }
  return { deps: { accessLookup: accessLookup(roleKey), repository } satisfies InventoryDependencies, calls }
}

for (const role of ["administrator", "inventory_staff", "viewer"] as const) {
  test(`${role} lists only the database-derived tenant inventory`, async () => {
    const { deps, calls } = dependencies(role)
    assert.deepEqual(await listInventoryItems(identity, { limit: 25 }, deps), { items: [item], nextCursor: "next-cursor" })
    assert.deepEqual(calls.lists[0], { tenantId: "tenant-1", query: { limit: 25, search: null, cursor: null } })
  })
}

test("list input clamps limits, normalizes search, and rejects client tenancy", async () => {
  const low = dependencies("viewer")
  await listInventoryItems(identity, { limit: 0, search: "  Pump   MOTOR  " }, low.deps)
  assert.deepEqual(low.calls.lists[0].query, { limit: 1, search: "pump motor", cursor: null })
  const high = dependencies("viewer")
  await listInventoryItems(identity, { limit: 1000 }, high.deps)
  assert.equal(high.calls.lists[0].query.limit, 100)
  await assert.rejects(listInventoryItems(identity, { tenantId: "other" } as never, high.deps), (error: unknown) => error instanceof ApiError && error.code === "invalid-argument")
})

test("viewer cannot update inventory even with malformed input", async () => {
  const { deps, calls } = dependencies("viewer")
  await assert.rejects(updateInventoryItem(identity, { tenantId: "other" } as never, deps), (error: unknown) => error instanceof ApiError && error.code === "permission-denied")
  assert.deepEqual(calls.updates, [])
})

test("staff update uses the authorized tenant and whitelisted field mapping", async () => {
  const { deps, calls } = dependencies("inventory_staff")
  assert.deepEqual(await updateInventoryItem(identity, {
    id: item.id, expectedVersion: 3,
    changes: { name: " Updated Pump ", categoryId: "40000000-0000-0000-0000-000000000001", minimumQuantity: 4 },
  }, deps), item)
  assert.deepEqual(calls.updates[0], {
    tenantId: "tenant-1", id: item.id, expectedVersion: 3,
    changes: { name: "Updated Pump", category_id: "40000000-0000-0000-0000-000000000001", minimum_quantity: 4 },
  })
})

test("update rejects ownership/version replacement and maps a zero-row conflict safely", async () => {
  const validDeps = dependencies("administrator")
  await assert.rejects(updateInventoryItem(identity, { id: item.id, expectedVersion: 3, changes: { tenantId: "other", version: 99 } } as never, validDeps.deps), (error: unknown) => error instanceof ApiError && error.code === "invalid-argument")
  assert.deepEqual(validDeps.calls.updates, [])
  const missing = dependencies("administrator", null)
  await assert.rejects(updateInventoryItem(identity, { id: item.id, expectedVersion: 3, changes: { active: false } }, missing.deps), (error: unknown) => error instanceof ApiError && error.code === "aborted" && error.message === "The item changed or is no longer available. Reload and try again.")
})
