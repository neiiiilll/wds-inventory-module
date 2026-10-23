import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import ts from "typescript"

const read = path => readFile(new URL(path, import.meta.url), "utf8")
const firebase = await read("../src/services/firebase.ts")
const httpSource = await read("../src/services/inventory-http.ts")
const apiSource = await read("../src/services/inventory-api.ts")
const userAccess = await read("../src/services/user-access.ts")
const accessControl = await read("../src/services/access-control.ts")
const envExample = await read("../.env.example")
const envTypes = await read("../src/vite-env.d.ts")

function evaluate(source, modules = {}, env = {}) {
  const compiled = ts.transpileModule(source.replaceAll("import.meta.env", "__env"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  new Function("module", "exports", "require", "__env", compiled)(module, module.exports, name => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`)
    return modules[name]
  }, env)
  return module.exports
}

const http = evaluate(httpSource)
const requests = []
const transport = overrides => ({
  endpoint: "https://oqsgzdkljtxtpwdzptnw.supabase.co/functions/v1/inventory-api",
  publishableKey: "sb_publishable_test",
  async getIdToken() { return "firebase-token" },
  async fetchImpl(url, init) {
    requests.push({ url: String(url), init })
    return Response.json({ data: { ok: true } })
  },
  ...overrides,
})

assert.deepEqual(await http.invokeInventoryEdge(transport(), "listInventoryItems", { limit: 5 }), { ok: true })
assert.equal(requests[0].url, "https://oqsgzdkljtxtpwdzptnw.supabase.co/functions/v1/inventory-api")
const headers = new Headers(requests[0].init.headers)
assert.equal(headers.get("authorization"), "Bearer firebase-token")
assert.equal(headers.get("apikey"), "sb_publishable_test")
assert.equal(headers.get("content-type"), "application/json")
assert.deepEqual(JSON.parse(String(requests[0].init.body)), { action: "listInventoryItems", data: { limit: 5 } })

const safeMessages = {
  unauthenticated: "Sign in again to continue.",
  "permission-denied": "You do not have permission to perform this action.",
  "invalid-argument": "Check the entered information and try again.",
  "not-found": "The requested inventory record was not found.",
  "already-exists": "That inventory record already exists.",
  "failed-precondition": "The inventory operation cannot be completed in its current state.",
  aborted: "This record changed. Refresh it and try again.",
  internal: "The inventory service could not complete the request. Try again.",
}

for (const [serverCode, expectedCode] of [["aborted", "aborted"], ["toString", "internal"], ["unknown", "internal"]]) {
  await assert.rejects(http.invokeInventoryEdge(transport({
    async fetchImpl() {
      return Response.json({ error: { code: serverCode, message: "SQL password secret", details: { credential: "hidden" } } }, { status: 409 })
    },
  }), "updateInventoryItem", {}), error => {
    assert.ok(error instanceof http.InventoryApiError)
    assert.equal(error.code, expectedCode)
    assert.equal(error.message, safeMessages[expectedCode])
    assert.equal(JSON.stringify(error).includes("password"), false)
    return true
  })
}

for (const fetchImpl of [
  async () => new Response("not-json", { status: 502 }),
  async () => { throw new Error("network credential leak") },
]) {
  await assert.rejects(http.invokeInventoryEdge(transport({ fetchImpl }), "listInventoryItems", {}), error => (
    error instanceof http.InventoryApiError && error.code === "internal" && error.message === safeMessages.internal
  ))
}

let fetched = false
await assert.rejects(http.invokeInventoryEdge(transport({ endpoint: "", publishableKey: "", async fetchImpl() { fetched = true } }), "listInventoryItems", {}), error => error.code === "internal")
await assert.rejects(http.invokeInventoryEdge(transport({ async getIdToken() { return null }, async fetchImpl() { fetched = true } }), "listInventoryItems", {}), error => error.code === "unauthenticated")
await assert.rejects(http.invokeInventoryEdge(transport({ async getIdToken() { throw new Error("expired credential") }, async fetchImpl() { fetched = true } }), "listInventoryItems", {}), error => error.code === "unauthenticated")
assert.equal(fetched, false)

const apiRequests = []
const api = evaluate(apiSource, {
  "./firebase": { firebaseAuth: { currentUser: { getIdToken: async () => "token" } } },
  "./inventory-http": {
    InventoryApiError: http.InventoryApiError,
    invokeInventoryEdge: async (receivedTransport, action, input) => {
      apiRequests.push({ receivedTransport, action, input })
      return { marker: action }
    },
  },
}, {
  VITE_SUPABASE_URL: "https://oqsgzdkljtxtpwdzptnw.supabase.co/",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
})
for (const name of ["provisionInventoryAccess", "listInventoryItems", "updateInventoryItem", "createMaterialRequest", "postStockMovement"]) {
  const input = { fixture: name }
  assert.deepEqual(await api[name](input), { marker: name })
  assert.equal(apiRequests.at(-1).action, name)
  assert.deepEqual(apiRequests.at(-1).input, name === "provisionInventoryAccess" ? {} : input)
  assert.equal(apiRequests.at(-1).receivedTransport.endpoint, "https://oqsgzdkljtxtpwdzptnw.supabase.co/functions/v1/inventory-api")
}

const roles = evaluate(accessControl)
const events = []
const service = evaluate(userAccess, {
  "./inventory-api": {
    InventoryApiError: http.InventoryApiError,
    async provisionInventoryAccess() {
      events.push("provision")
      return { status: "active", firebaseUid: "user", email: "user@example.test", displayName: "User", tenantKey: "tenant-a", roleKey: "viewer" }
    },
  },
  "./access-control": roles,
})
assert.equal((await service.provisionCurrentUser()).role, "Viewer")
assert.deepEqual(events, ["provision"])

assert.doesNotMatch(firebase, /firebase\/functions|getFunctions|firebaseFunctions/)
assert.doesNotMatch(apiSource, /firebase\/functions|httpsCallable|tenantId|tenant_id/)
assert.doesNotMatch(userAccess, /refreshToken|getIdToken|\.\/firebase/)
assert.match(envExample, /VITE_SUPABASE_URL=https:\/\/oqsgzdkljtxtpwdzptnw\.supabase\.co/)
assert.match(envExample, /VITE_SUPABASE_PUBLISHABLE_KEY=/)
assert.doesNotMatch(envExample, /SERVICE_ROLE|SECRET_KEY|FIREBASE_FUNCTIONS_REGION/)
assert.match(envTypes, /VITE_SUPABASE_URL/)
assert.match(envTypes, /VITE_SUPABASE_PUBLISHABLE_KEY/)
for (const source of [firebase, httpSource, apiSource, userAccess, envExample, envTypes]) {
  assert.doesNotMatch(source, /SUPABASE_(?:SERVICE_ROLE|SECRET)_KEY/)
}
await access(new URL("../src/services/inventory-http.ts", import.meta.url))

console.log("Supabase Edge client transport, safe errors, and database-authority access checks passed.")
