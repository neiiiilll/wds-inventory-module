import assert from "node:assert/strict"
import test from "node:test"
import type { CallableRequest } from "firebase-functions/v2/https"

import type { AccessLookup } from "../src/access"
import type { InventoryRole, PostStockMovementInput, PostStockMovementResponse } from "../src/contracts"
import { MissingRecordError, PreconditionError, toHttpsError } from "../src/errors"
import type { WorkflowDependencies, WorkflowRepository } from "../src/material-requests"
import { postStockMovementHandler, type PostStockMovementRpcArgs } from "../src/stock"

const ITEM_ID = "80000000-0000-0000-0000-000000000001"
const LOCATION_ID = "70000000-0000-0000-0000-000000000001"
const response: PostStockMovementResponse = {
  movementId: "90000000-0000-0000-0000-000000000002",
  postedAt: "2026-10-22T10:00:00.000Z",
  replayed: false,
}

function callable(data: PostStockMovementInput): CallableRequest<PostStockMovementInput> {
  return {
    data,
    auth: { uid: "firebase-1", token: { tenant_key: "inventory-test" } },
  } as CallableRequest<PostStockMovementInput>
}

function lookup(roleKey: InventoryRole): AccessLookup {
  return {
    async findUser() { return { id: "user-1", active: true } },
    async listMemberships() { return [{ id: "membership-1", tenantId: "tenant-1", status: "active" }] },
    async findTenant() { return { id: "tenant-1", tenantKey: "inventory-test", active: true } },
    async listRoles() { return [{ roleKey, applicationActive: true, roleExists: true }] },
  }
}

function dependencies(roleKey: InventoryRole, result: PostStockMovementResponse | Error = response) {
  const calls: PostStockMovementRpcArgs[] = []
  const repository: WorkflowRepository = {
    async createMaterialRequest() { throw new Error("not used") },
    async postStockMovement(args) {
      calls.push(args)
      if (result instanceof Error) throw result
      return result
    },
  }
  return { deps: { accessLookup: lookup(roleKey), repository } satisfies WorkflowDependencies, calls }
}

const valid: PostStockMovementInput = {
  movementType: "issue",
  sourceType: "ris",
  sourceReference: " RIS-001 ",
  idempotencyKey: " issue:ris-001:v1 ",
  notes: " Issued to maintenance ",
  lines: [{ lineNo: 1, itemId: ITEM_ID, locationId: LOCATION_ID, signedQuantity: -2, unitCost: 12.5 }],
}

for (const role of ["administrator", "inventory_staff"] as const) {
  test(`${role} posts stock using authorized tenant and actor`, async () => {
    const { deps, calls } = dependencies(role)
    assert.deepEqual(await postStockMovementHandler(callable(valid), deps), response)
    assert.deepEqual(calls[0], {
      p_tenant_id: "tenant-1",
      p_actor_user_id: "user-1",
      p_movement_type: "issue",
      p_source_type: "ris",
      p_source_reference: "RIS-001",
      p_idempotency_key: "issue:ris-001:v1",
      p_notes: "Issued to maintenance",
      p_lines: [{ lineNo: 1, itemId: ITEM_ID, locationId: LOCATION_ID, signedQuantity: -2, unitCost: 12.5 }],
    })
  })
}

test("stock posting preserves an idempotent replay response", async () => {
  const replay = { ...response, replayed: true }
  const { deps } = dependencies("inventory_staff", replay)
  assert.deepEqual(await postStockMovementHandler(callable(valid), deps), replay)
})

test("viewer cannot post stock", async () => {
  const { deps, calls } = dependencies("viewer")
  await assert.rejects(postStockMovementHandler(callable(valid), deps), (error: { code?: string }) => error.code === "permission-denied")
  assert.equal(calls.length, 0)
})

test("stock posting rejects caller-controlled tenant and actor", async () => {
  const { deps, calls } = dependencies("administrator")
  await assert.rejects(
    postStockMovementHandler(callable({ ...valid, tenantId: "other", actorUserId: "other" } as never), deps),
    (error) => toHttpsError(error, "request").code === "invalid-argument",
  )
  assert.equal(calls.length, 0)
})

test("stock posting validates type, idempotency key, and unique non-zero lines", async () => {
  const { deps } = dependencies("inventory_staff")
  for (const input of [
    { ...valid, movementType: "sale" },
    { ...valid, idempotencyKey: " " },
    { ...valid, lines: [] },
    { ...valid, lines: [{ ...valid.lines[0], signedQuantity: 0 }] },
    { ...valid, lines: [valid.lines[0], { ...valid.lines[0], signedQuantity: -1 }] },
  ]) {
    await assert.rejects(
      postStockMovementHandler(callable(input as PostStockMovementInput), deps),
      (error) => toHttpsError(error, "request").code === "invalid-argument",
    )
  }
})

test("stock domain failures map without leaking SQL details", async () => {
  const insufficient = dependencies("inventory_staff", new PreconditionError("Insufficient stock for this movement."))
  await assert.rejects(postStockMovementHandler(callable(valid), insufficient.deps), (error) => {
    const callableError = toHttpsError(error, "request")
    return callableError.code === "failed-precondition" && !callableError.message.includes("location 700")
  })

  const missing = dependencies("inventory_staff", new MissingRecordError("One or more stock references were not found."))
  await assert.rejects(postStockMovementHandler(callable(valid), missing.deps), (error) => {
    const callableError = toHttpsError(error, "request")
    return callableError.code === "not-found" && !callableError.message.includes("tenant-1")
  })
})
