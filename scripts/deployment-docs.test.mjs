import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const root = await readFile(new URL("../README.md", import.meta.url), "utf8")
const database = await readFile(new URL("../supabase/README.md", import.meta.url), "utf8")
const functions = await readFile(new URL("../functions/README.md", import.meta.url), "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error })
const firebase = JSON.parse(await readFile(new URL("../firebase.json", import.meta.url), "utf8"))
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))
const functionPkg = JSON.parse(await readFile(new URL("../functions/package.json", import.meta.url), "utf8"))
const browserEnv = await readFile(new URL("../.env.example", import.meta.url), "utf8")
const gitignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8")
const docs = `${root}\n${database}\n${functions}`

for (const contract of [
  "supabase db reset", "supabase db push", "supabase test db", "Automatic role assignment is disabled",
  "Edge before Hosting", "Firebase ID token", "service role bypasses RLS", "service desk",
  "UNIQUE (tenant_id, id)", "Security checklist", "forward migration", "Node.js 22",
  "oqsgzdkljtxtpwdzptnw", "inventory-api", "--no-verify-jwt", "VITE_SUPABASE_PUBLISHABLE_KEY",
  "npm run test:edge", "npm run test:functions", "npm run build:functions", "npm run deploy:edge",
  "npm run deploy:hosting", "cross-tenant", "rollback window", "tenant_memberships", "serviceDesk",
]) assert.ok(docs.includes(contract), `Missing deployment documentation contract: ${contract}`)
for (const name of ["provisionInventoryAccess", "listInventoryItems", "updateInventoryItem", "createMaterialRequest", "postStockMovement"])
  assert.ok(functions.includes(`### ${name}`), `Missing callable documentation: ${name}`)
assert.equal(firebase.functions.source, "functions")
assert.equal(firebase.functions.runtime, "nodejs22")
assert.equal(firebase.functions.codebase, "inventory")
assert.equal(firebase.emulators.functions.port, 5001)
assert.equal(functionPkg.engines.node, "22")
assert.match(pkg.scripts["test:edge"], /deno test.*supabase\/functions\/tests/)
assert.match(pkg.scripts["deploy:edge"], /functions deploy inventory-api --project-ref oqsgzdkljtxtpwdzptnw --no-verify-jwt$/)
assert.equal(pkg.scripts["test:functions"], "npm --prefix functions test")
assert.equal(pkg.scripts["build:functions"], "npm --prefix functions run build")
assert.equal(pkg.scripts["deploy:functions"], undefined)
assert.match(pkg.scripts["deploy:functions:rollback"], /npm run build:functions && firebase deploy --project apps-workspace-b61a9 --only functions:inventory$/)
assert.match(pkg.scripts["emulators:rollback"], /firebase emulators:start.*--only auth,functions,hosting/)
assert.match(pkg.scripts.test, /npm run test:functions/)
assert.match(pkg.scripts.test, /npm run test:edge/)
assert.match(browserEnv, /VITE_SUPABASE_URL=https:\/\/oqsgzdkljtxtpwdzptnw\.supabase\.co/)
assert.match(browserEnv, /VITE_SUPABASE_PUBLISHABLE_KEY=/)
assert.doesNotMatch(browserEnv, /SERVICE_ROLE|SECRET_KEY|FIREBASE_FUNCTIONS_REGION/)
assert.doesNotMatch(docs, /INVENTORY_BOOTSTRAP_TENANT_KEY/)
assert.doesNotMatch(docs, /tehynsbnasihzktzvyzy/)
assert.doesNotMatch(docs, /refreshToken/)
assert.match(database, /canonical Inventory API/i)
assert.match(root, /firebase functions:delete provisionInventoryAccess listInventoryItems updateInventoryItem createMaterialRequest postStockMovement/)
assert.match(gitignore, /^functions\/\.secret\.local$/m, "The documented local Functions secret file must be ignored.")
console.log("Edge deployment documentation and staged rollback configuration checks passed.")
