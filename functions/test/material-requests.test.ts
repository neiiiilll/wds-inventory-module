import assert from "node:assert/strict"
import test from "node:test"
import type { CallableRequest } from "firebase-functions/v2/https"

import type { AccessLookup } from "../src/access"
import type { CreateMaterialRequestInput, InventoryRole, MaterialRequestDto } from "../src/contracts"
import { toHttpsError } from "../src/errors"
import {
  createMaterialRequestHandler,
  type CreateMaterialRequestRpcArgs,
  type WorkflowDependencies,
  type WorkflowRepository,
} from "../src/material-requests"

const ITEM_ID = "80000000-0000-0000-0000-000000000001"
const PERSONNEL_ID = "30000000-0000-0000-0000-000000000001"
const result: MaterialRequestDto = {
  requestId: "90000000-0000-0000-0000-000000000001",
  requestNo: "MR-202610-000001",
  version: 1,
  status: "draft",
}

function callable(data: CreateMaterialRequestInput): CallableRequest<CreateMaterialRequestInput> {
  return {
    data,
    auth: { uid: "firebase-1", token: { tenant_key: "inventory-test" } },
  } as CallableRequest<CreateMaterialRequestInput>
}

function lookup(roleKey: InventoryRole): AccessLookup {
  return {
    async findUser() { return { id: "user-1", active: true } },
    async listMemberships() { return [{ id: "membership-1", tenantId: "tenant-1", status: "active" }] },
    async findTenant() { return { id: "tenant-1", tenantKey: "inventory-test", active: true } },
    async listRoles() { return [{ roleKey, applicationActive: true, roleExists: true }] },
  }
}

function dependencies(roleKey: InventoryRole) {
  const calls: CreateMaterialRequestRpcArgs[] = []
  const repository: WorkflowRepository = {
    async createMaterialRequest(args) { calls.push(args); return result },
    async postStockMovement() { throw new Error("not used") },
  }
  return { deps: { accessLookup: lookup(roleKey), repository } satisfies WorkflowDependencies, calls }
}

const valid: CreateMaterialRequestInput = {
  requesterPersonnelId: PERSONNEL_ID,
  job: "  Generator repair  ",
  requestedOn: "2026-10-22",
  lines: [
    { lineNo: 1, itemId: ITEM_ID, quantity: 2, specification: "  220V  " },
  ],
}

for (const role of ["administrator", "inventory_staff"] as const) {
  test(`${role} creates a material request using authorized tenant and actor`, async () => {
    const { deps, calls } = dependencies(role)
    assert.deepEqual(await createMaterialRequestHandler(callable(valid), deps), result)
    assert.deepEqual(calls[0], {
      p_tenant_id: "tenant-1",
      p_actor_user_id: "user-1",
      p_requester_personnel_id: PERSONNEL_ID,
      p_job: "Generator repair",
      p_requested_on: "2026-10-22",
      p_lines: [{ lineNo: 1, itemId: ITEM_ID, quantity: 2, specification: "220V" }],
    })
  })
}

test("viewer cannot create a material request", async () => {
  const { deps, calls } = dependencies("viewer")
  await assert.rejects(createMaterialRequestHandler(callable(valid), deps), (error: { code?: string }) => error.code === "permission-denied")
  assert.equal(calls.length, 0)
})

test("material request rejects caller-controlled ownership and workflow fields", async () => {
  const { deps, calls } = dependencies("administrator")
  await assert.rejects(
    createMaterialRequestHandler(callable({ ...valid, tenantId: "other", status: "approved", version: 4 } as never), deps),
    (error) => toHttpsError(error, "request").code === "invalid-argument",
  )
  assert.equal(calls.length, 0)
})

test("material request validates lines and duplicate line numbers", async () => {
  const { deps } = dependencies("inventory_staff")
  await assert.rejects(
    createMaterialRequestHandler(callable({ lines: [] }), deps),
    (error) => toHttpsError(error, "request").code === "invalid-argument",
  )
  await assert.rejects(
    createMaterialRequestHandler(callable({ lines: [
      { lineNo: 1, itemId: ITEM_ID, quantity: 1 },
      { lineNo: 1, itemId: ITEM_ID, quantity: 2 },
    ] }), deps),
    (error) => toHttpsError(error, "request").code === "invalid-argument",
  )
  await assert.rejects(
    createMaterialRequestHandler(callable({ lines: [{ lineNo: 1, itemId: ITEM_ID, quantity: 0 }] }), deps),
    (error) => toHttpsError(error, "request").code === "invalid-argument",
  )
})
