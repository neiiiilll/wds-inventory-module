import assert from "node:assert/strict"
import test from "node:test"
import type { CallableRequest } from "firebase-functions/v2/https"
import path from "node:path"
import { updateInventoryItemHandler } from "../src/inventory"
import { createMaterialRequestHandler } from "../src/material-requests"
import { postStockMovementHandler } from "../src/stock"
import { lookup } from "./helpers"
import { dispatchInventory, INVENTORY_OPERATIONS, type GatewayDependencies } from "../src/gateway"

function request(data: unknown = { operation: "listInventoryItems", input: {} }): CallableRequest<unknown> {
  return { data, auth: { uid: "firebase-user", token: { aud: "apps-workspace-b61a9", email_verified: true } } } as CallableRequest<unknown>
}

function fixture() {
  const calls: unknown[] = []
  let secretReads = 0
  const deps: GatewayDependencies = {
    getConfig() { secretReads++; return { firebaseProjectId: "apps-workspace-b61a9" } },
    actions: Object.fromEntries(INVENTORY_OPERATIONS.map(operation => [operation, async (req: CallableRequest<unknown>) => {
      calls.push({ operation, uid: req.auth?.uid, input: req.data })
      return { operation }
    }])) as GatewayDependencies["actions"],
  }
  return { deps, calls, get secretReads() { return secretReads } }
}

test("gateway authenticates and requires verified email before reading its secret", async () => {
  const f = fixture()
  await assert.rejects(dispatchInventory({ data: {} } as CallableRequest<unknown>, f.deps), { code: "unauthenticated" })
  const req = request(); req.auth!.token.email_verified = false
  await assert.rejects(dispatchInventory(req, f.deps), { code: "permission-denied" })
  assert.equal(f.secretReads, 0)
  assert.deepEqual(f.calls, [])
})

test("gateway rejects a wrong Firebase audience before dispatch", async () => {
  const f = fixture(); const req = request(); req.auth!.token.aud = "another-project"
  await assert.rejects(dispatchInventory(req, f.deps), { code: "permission-denied" })
  assert.deepEqual(f.calls, [])
})

for (const data of [null, [], {}, { operation: "toString", input: {} }, { operation: "__proto__", input: {} }, { operation: "unknown", input: {} }, { operation: "listInventoryItems" }, { operation: "listInventoryItems", input: {}, tenant_id: "forged" }]) {
  test(`gateway rejects malformed or unknown envelopes ${JSON.stringify(data)}`, async () => {
    const f = fixture()
    await assert.rejects(dispatchInventory(request(data), f.deps), { code: "invalid-argument" })
    assert.equal(f.secretReads, 0)
    assert.deepEqual(f.calls, [])
  })
}

test("gateway rejects prototype-bearing envelope and nested input after actual Firebase decoding", async () => {
  const { decode } = require(path.resolve(path.dirname(require.resolve("firebase-functions")), "../common/providers/https.js"))
  for (const json of [
    '{"__proto__":{"operation":"listInventoryItems","input":{}}}',
    '{"operation":"listInventoryItems","input":{"__proto__":{"limit":100}}}',
    '{"operation":"updateInventoryItem","input":{"changes":{"__proto__":{"active":false}}}}',
  ]) {
    const f = fixture()
    await assert.rejects(dispatchInventory(request(decode(JSON.parse(json))), f.deps), { code: "invalid-argument" })
    assert.deepEqual(f.calls, [])
  }
})

test("gateway preserves domain Viewer denial before malformed mutation input validation", async () => {
  const f = fixture()
  const accessLookup = lookup("viewer")
  f.deps.actions.updateInventoryItem = req => updateInventoryItemHandler(req, { accessLookup, repository: {} as never })
  f.deps.actions.createMaterialRequest = req => createMaterialRequestHandler(req, { accessLookup, repository: {} as never })
  f.deps.actions.postStockMovement = req => postStockMovementHandler(req, { accessLookup, repository: {} as never })
  for (const operation of ["updateInventoryItem", "createMaterialRequest", "postStockMovement"]) {
    for (const input of [null, [], "invalid", 42]) {
      await assert.rejects(dispatchInventory(request({ operation, input }), f.deps), { code: "permission-denied" })
    }
  }
})

test("gateway dispatches only approved operations with verified identity and original input", async () => {
  assert.deepEqual(INVENTORY_OPERATIONS, ["provisionInventoryAccess", "listInventoryItems", "updateInventoryItem", "createMaterialRequest", "postStockMovement", "getInventoryDashboard", "listProcurementDocuments", "getProcurementDocument", "getProcurementReferenceData", "listInventoryMovements", "executeProcurementCommand", "createProcurementAttachmentUpload", "finalizeProcurementAttachment", "getProcurementAttachmentDownload"])
  const f = fixture()
  for (const operation of INVENTORY_OPERATIONS) {
    assert.deepEqual(await dispatchInventory(request({ operation, input: { marker: operation } }), f.deps), { operation })
  }
  assert.deepEqual(f.calls, INVENTORY_OPERATIONS.map(operation => ({ operation, uid: "firebase-user", input: { marker: operation } })))
})
