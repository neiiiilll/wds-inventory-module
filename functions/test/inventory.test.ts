import assert from "node:assert/strict"
import test from "node:test"
import type { CallableRequest } from "firebase-functions/v2/https"

import type { AccessLookup, RoleRecord } from "../src/access"
import type { InventoryItemDto, InventoryRole } from "../src/contracts"
import { toHttpsError } from "../src/errors"
import {
  listInventoryItemsHandler,
  updateInventoryItemHandler,
  type InventoryDependencies,
  type InventoryRepository,
  type ListQuery,
  type UpdateItemChanges,
} from "../src/inventory"

const item: InventoryItemDto = {
  id: "80000000-0000-0000-0000-000000000001",
  itemCode: "PUMP-001",
  name: "Pump Motor",
  description: null,
  categoryId: "40000000-0000-0000-0000-000000000001",
  categoryName: "Motors",
  unitId: "50000000-0000-0000-0000-000000000001",
  unitName: "Each",
  unitSymbol: "ea",
  supplierId: null,
  minimumQuantity: 2,
  quantity: 8,
  active: true,
  version: 3,
}

function request<T>(data: T): CallableRequest<T> {
  return {
    data,
    auth: { uid: "firebase-1", token: { tenant_key: "inventory-test" } },
  } as CallableRequest<T>
}

function accessLookup(roleKey: InventoryRole): AccessLookup {
  return {
    async findUser() { return { id: "user-1", active: true } },
    async listMemberships() { return [{ id: "membership-1", tenantId: "tenant-1", status: "active" }] },
    async findTenant() { return { id: "tenant-1", tenantKey: "inventory-test", active: true } },
    async listRoles() {
      return [{ roleKey, applicationActive: true, roleExists: true } satisfies RoleRecord]
    },
  }
}

function dependencies(roleKey: InventoryRole, updateResult: InventoryItemDto | null = item) {
  const calls: {
    lists: Array<{ tenantId: string; query: ListQuery }>
    updates: Array<{ tenantId: string; id: string; expectedVersion: number; changes: UpdateItemChanges }>
  } = { lists: [], updates: [] }
  const repository: InventoryRepository = {
    async list(tenantId, query) {
      calls.lists.push({ tenantId, query })
      return { items: [item], nextCursor: "next-cursor" }
    },
    async update(tenantId, id, expectedVersion, changes) {
      calls.updates.push({ tenantId, id, expectedVersion, changes })
      return updateResult
    },
  }
  return { deps: { accessLookup: accessLookup(roleKey), repository } satisfies InventoryDependencies, calls }
}

for (const role of ["administrator", "inventory_staff", "viewer"] as const) {
  test(`${role} can list tenant inventory with a stable DTO`, async () => {
    const { deps, calls } = dependencies(role)
    const response = await listInventoryItemsHandler(request({ limit: 25 }), deps)

    assert.deepEqual(response, { items: [item], nextCursor: "next-cursor" })
    assert.equal(calls.lists[0].tenantId, "tenant-1")
    assert.equal(calls.lists[0].query.limit, 25)
  })
}

test("list input clamps limits and normalizes search", async () => {
  const low = dependencies("viewer")
  await listInventoryItemsHandler(request({ limit: 0, search: "  Pump   MOTOR  " }), low.deps)
  assert.deepEqual(low.calls.lists[0].query, { limit: 1, search: "pump motor", cursor: null })

  const high = dependencies("viewer")
  await listInventoryItemsHandler(request({ limit: 1000 }), high.deps)
  assert.equal(high.calls.lists[0].query.limit, 100)
})

test("list input rejects a client-selected tenant", async () => {
  const { deps } = dependencies("viewer")
  await assert.rejects(
    listInventoryItemsHandler(request({ tenantId: "other" } as never), deps),
    (error) => toHttpsError(error, "request").code === "invalid-argument",
  )
})

test("authentication is checked before inventory payload validation", async () => {
  const { deps } = dependencies("viewer")
  await assert.rejects(
    listInventoryItemsHandler({ data: { tenantId: "other" } } as CallableRequest<never>, deps),
    (error: { code?: string }) => error.code === "unauthenticated",
  )
})

test("viewer cannot update inventory", async () => {
  const { deps, calls } = dependencies("viewer")
  await assert.rejects(
    updateInventoryItemHandler(request({
      id: item.id,
      expectedVersion: 3,
      changes: { name: "Updated" },
    }), deps),
    (error: { code?: string }) => error.code === "permission-denied",
  )
  assert.deepEqual(calls.updates, [])
})

test("staff update uses the authorized tenant and whitelisted field mapping", async () => {
  const { deps, calls } = dependencies("inventory_staff")
  const response = await updateInventoryItemHandler(request({
    id: item.id,
    expectedVersion: 3,
    changes: {
      name: " Updated Pump ",
      categoryId: "40000000-0000-0000-0000-000000000001",
      minimumQuantity: 4,
    },
  }), deps)

  assert.deepEqual(response, item)
  assert.deepEqual(calls.updates[0], {
    tenantId: "tenant-1",
    id: item.id,
    expectedVersion: 3,
    changes: {
      name: "Updated Pump",
      category_id: "40000000-0000-0000-0000-000000000001",
      minimum_quantity: 4,
    },
  })
})

test("unknown update fields cannot override tenant, status, or version", async () => {
  const { deps, calls } = dependencies("administrator")
  await assert.rejects(
    updateInventoryItemHandler(request({
      id: item.id,
      expectedVersion: 3,
      changes: { tenantId: "other", version: 99, status: "deleted" },
    } as never), deps),
    (error) => toHttpsError(error, "request").code === "invalid-argument",
  )
  assert.deepEqual(calls.updates, [])
})

test("zero-row optimistic update becomes aborted without revealing cross-tenant existence", async () => {
  const { deps } = dependencies("administrator", null)
  await assert.rejects(
    updateInventoryItemHandler(request({
      id: "90000000-0000-0000-0000-000000000099",
      expectedVersion: 3,
      changes: { active: false },
    }), deps),
    (error) => {
      const callableError = toHttpsError(error, "request")
      assert.equal(callableError.code, "aborted")
      assert.equal(callableError.message, "The item changed or is no longer available. Reload and try again.")
      return true
    },
  )
})
