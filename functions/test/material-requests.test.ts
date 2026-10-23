import assert from "node:assert/strict"
import test from "node:test"
import { logger } from "firebase-functions"
import type { CallableRequest } from "firebase-functions/v2/https"
import { createMaterialRequestHandler, createMaterialRequestRepository } from "../src/material-requests"
import { inventory } from "../src/index"
import { request, lookup, rejectsCode, tenantId, itemId } from "./helpers"

const result = { requestId: itemId, requestNo: "MR-202610-000001", version: 1, status: "draft" as const }
const valid = { requesterPersonnelId: itemId, job: " Repair ", requestedOn: "2026-10-22", lines: [{ lineNo: 1, itemId, quantity: 2, specification: " 220V " }] }
function fixture(role = "inventory_staff") {
  const calls: unknown[] = []
  return { calls, deps: { accessLookup: lookup(role), repository: { async createMaterialRequest(args: unknown) { calls.push(args); return result } } } }
}
for (const role of ["administrator", "inventory_staff"]) test(`${role} derives material request RPC actor and tenant`, async () => {
  const f = fixture(role)
  assert.deepEqual(await createMaterialRequestHandler(request(valid), f.deps), result)
  assert.deepEqual(f.calls, [{ p_tenant_id: tenantId, p_actor_user_id: "user-1", p_requester_personnel_id: itemId, p_job: "Repair", p_requested_on: "2026-10-22", p_lines: [{ lineNo: 1, itemId, quantity: 2, specification: "220V" }] }])
})
test("viewer request denial precedes input validation", async () => {
  const f = fixture("viewer")
  await rejectsCode(createMaterialRequestHandler(request(null), f.deps), "permission-denied")
  assert.deepEqual(f.calls, [])
})
for (const data of [null, { lines: [] }, { ...valid, requestedOn: "2026-02-30" }, { ...valid, requesterPersonnelId: "wrong" }, { ...valid, lines: [...valid.lines, ...valid.lines] }, { ...valid, lines: [{ ...valid.lines[0], quantity: 0 }] }, { ...valid, lines: [{ ...valid.lines[0], tenantId }] }, ...["tenantId", "tenant_id", "actorUserId", "role", "status", "requestNo", "version"].map((field) => ({ ...valid, [field]: "forged" }))]) {
  test(`request rejects malformed or privileged payload ${JSON.stringify(data)}`, async () => {
    const f = fixture()
    await rejectsCode(createMaterialRequestHandler(request(data), f.deps), "invalid-argument")
    assert.deepEqual(f.calls, [])
  })
}
test("request repository uses the atomic RPC and maps cross-tenant references safely", async () => {
  const calls: unknown[] = []
  let error: unknown = null
  const repo = createMaterialRequestRepository({ async rpc(...args: unknown[]) { calls.push(args); return { data: result, error } } } as never)
  const args = { p_tenant_id: tenantId, p_actor_user_id: "user-1", p_requester_personnel_id: null, p_job: null, p_requested_on: null, p_lines: [{ lineNo: 1, itemId, quantity: 2 }] }
  assert.deepEqual(await repo.createMaterialRequest(args), result)
  assert.deepEqual(calls, [["inv_create_material_request", args]])
  for (const message of ["Item belongs outside authorized tenant: secret", "Item was not found: secret"]) {
    error = { message }
    await rejectsCode(repo.createMaterialRequest(args), "not-found", "One or more inventory references were not found.")
  }
  error = { message: "SQL password secret" }
  await rejectsCode(repo.createMaterialRequest(args), "internal", "The request could not be completed. Reference: test-reference.")
})
test("registered request callable authenticates before secrets", async (t) => {
  t.mock.method(logger, "error", () => {})
  await assert.rejects(inventory.run({ data: { operation: "createMaterialRequest", input: {} } } as CallableRequest<unknown>), { code: "unauthenticated" })
})
