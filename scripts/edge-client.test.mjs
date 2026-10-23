import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import ts from "typescript"

const read = path => readFile(new URL(path, import.meta.url), "utf8")
const firebase = await read("../src/services/firebase.ts")
const apiSource = await read("../src/services/inventory-api.ts")
const userAccess = await read("../src/services/user-access.ts")
const accessControl = await read("../src/services/access-control.ts")
const env = await read("../.env.example")
const envTypes = await read("../src/vite-env.d.ts")

// Execute production TypeScript, replacing only network/SDK boundaries.
function evaluate(source, modules, env = {}) {
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

assert.match(firebase, /from "firebase\/functions"/, "Initialize regional Firebase Functions.")
for (const region of [undefined, "europe-west1"]) {
  const app = {}
  const settings = Object.fromEntries(["API_KEY", "AUTH_DOMAIN", "PROJECT_ID", "STORAGE_BUCKET", "MESSAGING_SENDER_ID", "APP_ID"].map(key => [`VITE_FIREBASE_${key}`, "configured"]))
  if (region) settings.VITE_FIREBASE_FUNCTIONS_REGION = region
  const configured = evaluate(firebase, {
    "firebase/app": { getApps: () => [], initializeApp: () => app },
    "firebase/auth": { getAuth: () => ({}), GoogleAuthProvider: class {} },
    "firebase/functions": { getFunctions: (receivedApp, receivedRegion) => ({ app: receivedApp, region: receivedRegion }) },
  }, settings)
  assert.equal(configured.firebaseFunctions.app, app)
  assert.equal(configured.firebaseFunctions.region, region ?? "asia-southeast1")
}

const requests = []
const auth = { currentUser: {} }
let rejection
const api = evaluate(apiSource, {
  "./firebase": { firebaseAuth: auth, firebaseFunctions: {} },
  "firebase/functions": { httpsCallable: (_functions, name) => async input => {
    requests.push({ name, input })
    if (rejection) throw rejection
    return { data: { marker: name } }
  } },
})
for (const name of ["provisionInventoryAccess", "listInventoryItems", "updateInventoryItem", "createMaterialRequest", "postStockMovement"]) {
  const input = { fixture: name }
  assert.deepEqual(await api[name](input), { marker: name })
  assert.deepEqual(requests.at(-1), { name, input: name === "provisionInventoryAccess" ? {} : input })
}
await api.listInventoryItems()
assert.deepEqual(requests.at(-1), { name: "listInventoryItems", input: {} })
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
for (const [code, message] of Object.entries(safeMessages)) {
  rejection = { code: `functions/${code}`, message: "SQL secret", details: { secret: "database" } }
  await assert.rejects(api.listInventoryItems(), error => error instanceof api.InventoryApiError && error.code === code && error.message === message && !("details" in error))
}
for (const code of ["functions/unavailable", "functions/toString", "permission-denied", undefined]) {
  rejection = { code, message: "SQL secret" }
  await assert.rejects(api.listInventoryItems(), error => error.code === "internal" && error.message === safeMessages.internal)
}
rejection = undefined
auth.currentUser = null
const before = requests.length
await assert.rejects(api.listInventoryItems(), error => error.code === "unauthenticated")
assert.equal(requests.length, before, "Missing auth must stop before the callable boundary.")
const unconfiguredApi = evaluate(apiSource, {
  "./firebase": { firebaseAuth: { currentUser: {} }, firebaseFunctions: null },
  "firebase/functions": { httpsCallable: () => { throw new Error("SDK must not run without config") } },
})
await assert.rejects(unconfiguredApi.listInventoryItems(), error => error.code === "internal")

const active = { status: "active", firebaseUid: "user", email: "user@example.test", displayName: "User", tenantKey: "tenant-a", roleKey: "viewer", refreshToken: false }
const roles = evaluate(accessControl, {})
async function provisionScenario(responses, currentUser = {}) {
  const events = []
  const firebaseAuth = { currentUser: currentUser && { ...currentUser, getIdToken: async force => { events.push(["refresh", force]); return "fresh-token" } } }
  const service = evaluate(userAccess, {
    "./inventory-api": { InventoryApiError: api.InventoryApiError, provisionInventoryAccess: async () => { events.push(["provision"]); return responses.shift() } },
    "./access-control": roles,
    "./firebase": { firebaseAuth },
  })
  return { run: () => service.provisionCurrentUser(), events }
}
let scenario = await provisionScenario([{ ...active }])
assert.equal((await scenario.run()).role, "Viewer")
assert.deepEqual(scenario.events, [["provision"]], "Stable claims must not force refresh.")
scenario = await provisionScenario([{ ...active, refreshToken: true }, { ...active, displayName: "Fresh access", roleKey: "administrator" }])
assert.equal((await scenario.run()).displayName, "Fresh access")
assert.deepEqual(scenario.events, [["provision"], ["refresh", true], ["provision"]])
scenario = await provisionScenario([{ ...active, refreshToken: true }, { ...active, refreshToken: true }])
await assert.rejects(scenario.run(), error => error.code === "permission-denied")
assert.equal(scenario.events.length, 3, "A second refresh response must fail closed without looping.")
scenario = await provisionScenario([{ ...active, refreshToken: true }], null)
await assert.rejects(scenario.run(), error => error.code === "unauthenticated")
scenario = await provisionScenario([{ ...active, status: "disabled", roleKey: null }])
assert.equal((await scenario.run()).active, false)

await assert.rejects(access(new URL("../src/services/inventory-http.ts", import.meta.url)), { code: "ENOENT" })
for (const source of [apiSource, firebase, env, envTypes]) {
  assert.doesNotMatch(source, /VITE_SUPABASE|@supabase|SUPABASE_(?:SERVICE_ROLE|SECRET)_KEY|functions\/v1|publishableKey/)
}
assert.doesNotMatch(apiSource, /tenantId|tenant_id|fetch\(/)
assert.match(env, /VITE_FIREBASE_FUNCTIONS_REGION=asia-southeast1/)
assert.match(envTypes, /VITE_FIREBASE_FUNCTIONS_REGION/)
console.log("Regional callable client, safe errors, and bounded claim refresh checks passed.")
