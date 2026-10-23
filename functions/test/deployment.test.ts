import assert from "node:assert/strict"
import test from "node:test"
import {
  createMaterialRequest,
  listInventoryItems,
  postStockMovement,
  provisionInventoryAccess,
  updateInventoryItem,
} from "../src/index"

const callables = {
  createMaterialRequest,
  listInventoryItems,
  postStockMovement,
  provisionInventoryAccess,
  updateInventoryItem,
}

test("all Inventory callables register the approved regional resource limits and secrets", () => {
  for (const [name, callable] of Object.entries(callables)) {
    const endpoint = callable.__endpoint
    assert.deepEqual(endpoint.region, ["asia-southeast1"], `${name} region`)
    assert.equal(endpoint.maxInstances, 5, `${name} max instances`)
    assert.equal(endpoint.timeoutSeconds, 60, `${name} timeout`)
    assert.deepEqual(
      endpoint.secretEnvironmentVariables?.map(({ key }) => key),
      ["INVENTORY_BACKEND"],
      `${name} secrets`,
    )
  }
})
