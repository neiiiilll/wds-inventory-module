import assert from "node:assert/strict"
import test from "node:test"
import * as endpoints from "../src/index"

test("only inventory is exported with the approved limits and independent JSON secret", () => {
  assert.deepEqual(Object.keys(endpoints), ["inventory"])
  for (const [name, callable] of Object.entries(endpoints)) {
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
