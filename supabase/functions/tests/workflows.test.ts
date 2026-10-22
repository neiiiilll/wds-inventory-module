import assert from "node:assert/strict"
import test from "node:test"

import type { AccessLookup } from "../_shared/access.ts"
import type { CreateMaterialRequestInput, InventoryRole, MaterialRequestDto, PostStockMovementInput, PostStockMovementResponse } from "../_shared/contracts.ts"
import { ApiError, MissingRecordError, PreconditionError } from "../_shared/errors.ts"
import type { FirebaseIdentity } from "../_shared/firebase-auth.ts"
import { createMaterialRequest, postStockMovement, type CreateMaterialRequestRpcArgs, type PostStockMovementRpcArgs, type WorkflowDependencies, type WorkflowRepository } from "../_shared/workflows.ts"

const identity: FirebaseIdentity = { uid: "firebase-1", email: "user@example.test", emailVerified: true, displayName: "User" }
const ITEM_ID = "80000000-0000-0000-0000-000000000001"
const LOCATION_ID = "70000000-0000-0000-0000-000000000001"
const PERSONNEL_ID = "30000000-0000-0000-0000-000000000001"
const requestResult: MaterialRequestDto = { requestId: "90000000-0000-0000-0000-000000000001", requestNo: "MR-202610-000001", version: 1, status: "draft" }
const movementResult: PostStockMovementResponse = { movementId: "90000000-0000-0000-0000-000000000002", postedAt: "2026-10-22T10:00:00.000Z", replayed: false }

function lookup(roleKey: InventoryRole): AccessLookup {
  return {
    async findUser() { return { id: "user-1", active: true } },
    async listMemberships() { return [{ id: "membership-1", tenantId: "tenant-1", status: "active" }] },
    async findTenant() { return { id: "tenant-1", tenantKey: "inventory-test", active: true } },
    async listRoles() { return [{ roleKey, applicationActive: true, roleExists: true }] },
  }
}

function dependencies(roleKey: InventoryRole, movement: PostStockMovementResponse | Error = movementResult) {
  const requestCalls: CreateMaterialRequestRpcArgs[] = []
  const movementCalls: PostStockMovementRpcArgs[] = []
  const repository: WorkflowRepository = {
    async createMaterialRequest(args) { requestCalls.push(args); return requestResult },
    async postStockMovement(args) { movementCalls.push(args); if (movement instanceof Error) throw movement; return movement },
  }
  return { deps: { accessLookup: lookup(roleKey), repository } satisfies WorkflowDependencies, requestCalls, movementCalls }
}

const validRequest: CreateMaterialRequestInput = {
  requesterPersonnelId: PERSONNEL_ID, job: "  Generator repair  ", requestedOn: "2026-10-22",
  lines: [{ lineNo: 1, itemId: ITEM_ID, quantity: 2, specification: "  220V  " }],
}
const validMovement: PostStockMovementInput = {
  movementType: "issue", sourceType: "ris", sourceReference: " RIS-001 ", idempotencyKey: " issue:ris-001:v1 ", notes: " Issued to maintenance ",
  lines: [{ lineNo: 1, itemId: ITEM_ID, locationId: LOCATION_ID, signedQuantity: -2, unitCost: 12.5 }],
}

for (const role of ["administrator", "inventory_staff"] as const) {
  test(`${role} creates a request with the authorized tenant and actor`, async () => {
    const { deps, requestCalls } = dependencies(role)
    assert.deepEqual(await createMaterialRequest(identity, validRequest, deps), requestResult)
    assert.deepEqual(requestCalls[0], {
      p_tenant_id: "tenant-1", p_actor_user_id: "user-1", p_requester_personnel_id: PERSONNEL_ID,
      p_job: "Generator repair", p_requested_on: "2026-10-22",
      p_lines: [{ lineNo: 1, itemId: ITEM_ID, quantity: 2, specification: "220V" }],
    })
  })
  test(`${role} posts stock with the authorized tenant and actor`, async () => {
    const { deps, movementCalls } = dependencies(role)
    assert.deepEqual(await postStockMovement(identity, validMovement, deps), movementResult)
    assert.deepEqual(movementCalls[0], {
      p_tenant_id: "tenant-1", p_actor_user_id: "user-1", p_movement_type: "issue", p_source_type: "ris",
      p_source_reference: "RIS-001", p_idempotency_key: "issue:ris-001:v1", p_notes: "Issued to maintenance",
      p_lines: [{ lineNo: 1, itemId: ITEM_ID, locationId: LOCATION_ID, signedQuantity: -2, unitCost: 12.5 }],
    })
  })
}

test("viewer cannot create requests or post stock", async () => {
  const { deps, requestCalls, movementCalls } = dependencies("viewer")
  await assert.rejects(createMaterialRequest(identity, validRequest, deps), (error: unknown) => error instanceof ApiError && error.code === "permission-denied")
  await assert.rejects(postStockMovement(identity, validMovement, deps), (error: unknown) => error instanceof ApiError && error.code === "permission-denied")
  assert.equal(requestCalls.length + movementCalls.length, 0)
})

test("workflow inputs reject caller ownership, invalid lines, and duplicate line numbers", async () => {
  const { deps, requestCalls, movementCalls } = dependencies("administrator")
  await assert.rejects(createMaterialRequest(identity, { ...validRequest, tenantId: "other", status: "approved" } as never, deps), (error: unknown) => error instanceof ApiError && error.code === "invalid-argument")
  await assert.rejects(createMaterialRequest(identity, { lines: [] }, deps), (error: unknown) => error instanceof ApiError && error.code === "invalid-argument")
  await assert.rejects(postStockMovement(identity, { ...validMovement, actorUserId: "other" } as never, deps), (error: unknown) => error instanceof ApiError && error.code === "invalid-argument")
  await assert.rejects(postStockMovement(identity, { ...validMovement, lines: [validMovement.lines[0], { ...validMovement.lines[0], signedQuantity: -1 }] }, deps), (error: unknown) => error instanceof ApiError && error.code === "invalid-argument")
  assert.equal(requestCalls.length + movementCalls.length, 0)
})

test("stock posting preserves idempotent replay responses", async () => {
  const replay = { ...movementResult, replayed: true }
  assert.deepEqual(await postStockMovement(identity, validMovement, dependencies("inventory_staff", replay).deps), replay)
})

test("stock domain failures retain safe codes without infrastructure details", async () => {
  await assert.rejects(postStockMovement(identity, validMovement, dependencies("inventory_staff", new PreconditionError("Insufficient stock for this movement.")).deps), (error: unknown) => error instanceof ApiError && error.code === "failed-precondition" && !error.message.includes("location"))
  await assert.rejects(postStockMovement(identity, validMovement, dependencies("inventory_staff", new MissingRecordError("One or more inventory references were not found.")).deps), (error: unknown) => error instanceof ApiError && error.code === "not-found" && !error.message.includes("tenant-1"))
})
