import assert from "node:assert/strict"
import test from "node:test"
import { parseInventoryBackendConfig } from "../src/config"

const valid = {
  url: "https://oqsgzdkljtxtpwdzptnw.supabase.co",
  secretKey: "sb_secret_inventory_test_value",
  firebaseProjectId: "apps-workspace-b61a9",
  appKey: "inventory",
}

test("accepts the approved Inventory backend JSON configuration", () => {
  const config = parseInventoryBackendConfig(valid)
  assert.deepEqual(config, valid)
  assert.equal(Object.isFrozen(config), true)
})

for (const [name, value] of Object.entries({
  null: null,
  array: [],
  missingUrl: { ...valid, url: undefined },
  wrongUrl: { ...valid, url: "https://another-project.supabase.co" },
  malformedUrl: { ...valid, url: "not-a-url" },
  missingKey: { ...valid, secretKey: "" },
  publishableKey: { ...valid, secretKey: "sb_publishable_not_allowed" },
  whitespaceKey: { ...valid, secretKey: "sb_secret_ \t" },
  embeddedWhitespaceKey: { ...valid, secretKey: "sb_secret_invalid value" },
  wrongFirebaseProject: { ...valid, firebaseProjectId: "other-project" },
  wrongApplication: { ...valid, appKey: "service_desk" },
  extraField: { ...valid, serviceDesk: true },
})) {
  test(`rejects invalid Inventory backend configuration: ${name}`, () => {
    assert.throws(
      () => parseInventoryBackendConfig(value),
      (error: Error) => error.message === "Inventory backend configuration is invalid."
        && !error.message.includes(valid.secretKey),
    )
  })
}
