import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import ts from "typescript"
import { initializeApp, deleteApp } from "firebase/app"
import { getFunctions, httpsCallable } from "firebase/functions"

function evaluate(source, modules = {}) {
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const module = { exports: {} }
  new Function("module", "exports", "require", compiled)(module, module.exports, name => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected dependency ${name}`)
    return modules[name]
  })
  return module.exports
}

const http = evaluate(await readFile(new URL("../src/services/inventory-http.ts", import.meta.url), "utf8"))
const source = await readFile(new URL("../src/services/inventory-api.ts", import.meta.url), "utf8")
assert.match(source, /httpsCallable/, "React must use the Firebase callable SDK.")
const requests = []
let failure = null
const firebase = { firebaseApp: { name: "inventory-app" }, firebaseAuth: { currentUser: { uid: "user" } } }
const api = evaluate(source, {
  "./firebase": firebase,
  "./inventory-http": http,
  "firebase/functions": {
    getFunctions(app, region) { assert.equal(app, firebase.firebaseApp); assert.equal(region, "asia-southeast1"); return { region } },
    httpsCallable(functions, name) {
      assert.equal(name, "inventory")
      return async envelope => {
        if (failure) throw failure
        requests.push(envelope)
        return { data: { marker: envelope.operation } }
      }
    },
  },
})

for (const operation of ["provisionInventoryAccess", "listInventoryItems", "updateInventoryItem", "createMaterialRequest", "postStockMovement"]) {
  const input = { fixture: operation }
  assert.deepEqual(await api[operation](input), { marker: operation })
  assert.deepEqual(requests.at(-1), { operation, input: operation === "provisionInventoryAccess" ? {} : input })
}

// Exercise the real Firebase SDK encoder: unlike JSON.stringify, it maps an
// undefined object property to null. This previously broke the empty search UI.
const sdkApp = initializeApp({ projectId: "inventory-payload-test", apiKey: "test-browser-key" }, "inventory-payload-test")
const savedFetch = globalThis.fetch
const wireRequests = []
globalThis.fetch = async (url, options) => {
  assert.equal(String(url), "https://asia-southeast1-inventory-payload-test.cloudfunctions.net/inventory")
  wireRequests.push(JSON.parse(options.body))
  return Response.json({ data: { items: [], nextCursor: null } })
}
try {
  const sdkApi = evaluate(source, {
    "./firebase": { firebaseApp: sdkApp, firebaseAuth: { currentUser: { uid: "test-user" } } },
    "./inventory-http": http,
    "firebase/functions": { getFunctions, httpsCallable },
  })
  await sdkApi.listInventoryItems({ search: undefined, limit: 100 })
  assert.deepEqual(wireRequests.at(-1).data, { operation: "listInventoryItems", input: { limit: 100 } }, "Absent search must remain absent on the real callable wire.")
  await sdkApi.updateInventoryItem({ id: "test-item", expectedVersion: 1, changes: { description: null, supplierId: undefined } })
  assert.deepEqual(wireRequests.at(-1).data.input.changes, { description: null }, "Keep intentional null changes but omit undefined fields.")
} finally {
  globalThis.fetch = savedFetch
  await deleteApp(sdkApp)
}
for (const [code, expected] of [["functions/aborted", "aborted"], ["functions/permission-denied", "permission-denied"], ["functions/unavailable", "internal"], ["functions/toString", "internal"]]) {
  failure = { code, message: "SQL credential leak", details: { secret: "hidden" } }
  await assert.rejects(api.listInventoryItems(), error => error instanceof http.InventoryApiError && error.code === expected && !error.message.includes("SQL"))
}
failure = null
firebase.firebaseAuth.currentUser = null
await assert.rejects(api.listInventoryItems(), error => error.code === "unauthenticated")
assert.doesNotMatch(source, /invokeInventoryEdge|VITE_SUPABASE|\/functions\/v1\/inventory-api/)
console.log("Single Inventory callable client routing and safe error mapping passed.")
