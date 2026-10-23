import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const root = await readFile(new URL("../README.md", import.meta.url), "utf8")
const database = await readFile(new URL("../supabase/README.md", import.meta.url), "utf8")
const functions = await readFile(new URL("../functions/README.md", import.meta.url), "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error })
const firebase = JSON.parse(await readFile(new URL("../firebase.json", import.meta.url), "utf8"))
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))
const functionPkg = JSON.parse(await readFile(new URL("../functions/package.json", import.meta.url), "utf8"))
const browserEnv = await readFile(new URL("../.env.example", import.meta.url), "utf8")
const docs = `${root}\n${database}\n${functions}`

for (const contract of [
  "supabase db reset", "supabase db push", "supabase test db", "Automatic role assignment is disabled",
  "Functions before Hosting", "Firebase ID token", "service role bypasses RLS", "service desk",
  "UNIQUE (tenant_id, id)", "Security checklist", "forward migration", "Blaze", "Node.js 22",
  "asia-southeast1", "firebase functions:secrets:set SUPABASE_URL", "firebase functions:secrets:set SUPABASE_SERVICE_ROLE_KEY",
  "npm run test:functions", "npm run build:functions", "npm run emulators", "npm run deploy:functions",
  "npm run deploy:hosting", "cross-tenant", "rollback window", "tenant_id", "refreshToken",
]) assert.ok(docs.includes(contract), `Missing deployment documentation contract: ${contract}`)
for (const name of ["provisionInventoryAccess", "listInventoryItems", "updateInventoryItem", "createMaterialRequest", "postStockMovement"])
  assert.ok(functions.includes(`### ${name}`), `Missing callable documentation: ${name}`)
assert.equal(firebase.functions.source, "functions")
assert.equal(firebase.functions.runtime, "nodejs22")
assert.equal(firebase.emulators.functions.port, 5001)
assert.equal(functionPkg.engines.node, "22")
assert.equal(pkg.scripts["test:edge"], undefined)
assert.equal(pkg.scripts["deploy:edge"], undefined)
assert.equal(pkg.scripts["test:functions"], "npm --prefix functions test")
assert.equal(pkg.scripts["build:functions"], "npm --prefix functions run build")
assert.match(pkg.scripts["deploy:functions"], /npm run build:functions && firebase deploy --project apps-workspace-b61a9 --only functions$/)
assert.match(pkg.scripts.emulators, /firebase emulators:start.*--only auth,functions,hosting/)
assert.match(pkg.scripts.test, /npm run test:functions/)
assert.doesNotMatch(browserEnv, /SUPABASE|SERVICE_ROLE/)
assert.match(browserEnv, /VITE_FIREBASE_FUNCTIONS_REGION=asia-southeast1/)
assert.doesNotMatch(docs, /INVENTORY_BOOTSTRAP_TENANT_KEY/)
assert.match(database, /rollback-only/)
console.log("Callable deployment documentation and configuration checks passed.")
