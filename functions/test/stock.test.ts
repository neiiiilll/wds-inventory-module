import assert from "node:assert/strict"
import test from "node:test"
import { logger } from "firebase-functions"
import type { CallableRequest } from "firebase-functions/v2/https"
import { postStockMovementHandler, createStockRepository } from "../src/stock"
import { postStockMovement } from "../src/index"
import { request, lookup, rejectsCode, tenantId, itemId } from "./helpers"

const result = { movementId: itemId, postedAt: "2026-10-22T10:00:00.000Z", replayed: false }
const valid = { movementType: "issue", sourceType: " ris ", sourceReference: " RIS-001 ", idempotencyKey: " issue:ris-001:v1 ", notes: " Issued ", lines: [{ lineNo: 1, itemId, locationId: itemId, signedQuantity: -2, unitCost: 12.5, assetId: itemId }] }
function fixture(role = "inventory_staff") {
  const calls: unknown[] = []
  return { calls, deps: { accessLookup: lookup(role), repository: { async postStockMovement(args: unknown) { calls.push(args); return result } } } }
}
for (const role of ["administrator", "inventory_staff"]) test(`${role} derives stock RPC actor, tenant, and idempotency key`, async () => {
  const f = fixture(role)
  assert.deepEqual(await postStockMovementHandler(request(valid), f.deps), result)
  assert.deepEqual(f.calls, [{ p_tenant_id: tenantId, p_actor_user_id: "user-1", p_movement_type: "issue", p_source_type: "ris", p_source_reference: "RIS-001", p_idempotency_key: "issue:ris-001:v1", p_notes: "Issued", p_lines: valid.lines }])
})
test("viewer stock denial precedes input validation", async () => {
  const f = fixture("viewer")
  await rejectsCode(postStockMovementHandler(request(null), f.deps), "permission-denied")
  assert.deepEqual(f.calls, [])
})
for (const data of [null, { ...valid, lines: [] }, { ...valid, movementType: "unknown" }, { ...valid, idempotencyKey: undefined }, { ...valid, idempotencyKey: " " }, { ...valid, idempotencyKey: "x".repeat(201) }, { ...valid, lines: [...valid.lines, ...valid.lines] }, ...[{ signedQuantity: 0 }, { signedQuantity: Infinity }, { unitCost: -1 }, { locationId: "bad" }, { tenantId }].map((line) => ({ ...valid, lines: [{ ...valid.lines[0], ...line }] })), ...["tenantId", "tenant_id", "actorUserId", "role", "status", "documentNo", "version"].map((field) => ({ ...valid, [field]: "forged" }))]) {
  test(`stock rejects malformed or privileged payload ${JSON.stringify(data)}`, async () => {
    const f = fixture()
    await rejectsCode(postStockMovementHandler(request(data), f.deps), "invalid-argument")
    assert.deepEqual(f.calls, [])
  })
}
test("stock repository preserves atomic idempotent replay and safe domain errors", async () => {
  const calls: unknown[] = []
  let error: unknown = null, count = 0
  const repo = createStockRepository({ async rpc(...args: unknown[]) { calls.push(args); return { data: { ...result, replayed: count++ > 0 }, error } } } as never)
  const args = { p_tenant_id: tenantId, p_actor_user_id: "user-1", p_movement_type: "issue", p_source_type: null, p_source_reference: null, p_idempotency_key: "same-key", p_notes: null, p_lines: valid.lines }
  assert.deepEqual(await repo.postStockMovement(args), result)
  assert.deepEqual(await repo.postStockMovement(args), { ...result, replayed: true })
  assert.deepEqual(calls, [["inv_post_stock_movement", args], ["inv_post_stock_movement", args]])
  for (const message of ["insufficient stock: secret location", "negative inventory value: secret SQL"]) {
    error = { message }
    await rejectsCode(repo.postStockMovement(args), "failed-precondition", "Insufficient stock for this movement.")
  }
  for (const message of ["outside authorized tenant: secret", "location was not found: secret"]) {
    error = { message }
    await rejectsCode(repo.postStockMovement(args), "not-found", "One or more inventory references were not found.")
  }
  error = { message: "database connection secret" }
  await rejectsCode(repo.postStockMovement(args), "internal", "The request could not be completed. Reference: test-reference.")
})
test("registered stock callable authenticates before secrets", async (t) => {
  t.mock.method(logger, "error", () => {})
  await assert.rejects(postStockMovement.run({ data: null } as CallableRequest<unknown>), { code: "unauthenticated" })
})
