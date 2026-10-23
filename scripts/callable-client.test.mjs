import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import ts from "typescript"

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
for (const [code, expected] of [["functions/aborted", "aborted"], ["functions/permission-denied", "permission-denied"], ["functions/unavailable", "internal"], ["functions/toString", "internal"]]) {
  failure = { code, message: "SQL credential leak", details: { secret: "hidden" } }
  await assert.rejects(api.listInventoryItems(), error => error instanceof http.InventoryApiError && error.code === expected && !error.message.includes("SQL"))
}
failure = null
firebase.firebaseAuth.currentUser = null
await assert.rejects(api.listInventoryItems(), error => error.code === "unauthenticated")
assert.doesNotMatch(source, /invokeInventoryEdge|VITE_SUPABASE|\/functions\/v1\/inventory-api/)
console.log("Single Inventory callable client routing and safe error mapping passed.")
