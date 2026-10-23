import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const read = path => readFile(new URL(path, import.meta.url), "utf8")
const root = await read("../README.md")
const database = await read("../supabase/README.md")
const functions = await read("../functions/README.md")
const config = JSON.parse(await read("../firebase.json"))
const pkg = JSON.parse(await read("../package.json"))
const docs = root + database + functions

assert.equal(config.functions.source, "functions")
assert.equal(config.functions.codebase, "inventory")
assert.equal(config.functions.runtime, "nodejs22")
assert.equal(JSON.parse(await read("../functions/package.json")).engines.node, "22")
assert.match(pkg.scripts["deploy:functions"], /--only functions:inventory:inventory$/)
assert.equal(pkg.scripts["deploy:functions:rollback"], undefined)
assert.match(pkg.scripts["deploy:hosting"], /--only hosting:app$/)
assert.match(pkg.scripts.test, /callable-client.test.mjs/)
for (const contract of [
  "INVENTORY_BACKEND", "httpsCallable", "asia-southeast1", "serviceDesk",
  "Firebase ID token", "tenant_memberships", "service role bypasses RLS",
  "supabase db reset", "supabase test db", "forward migration", "UNIQUE (tenant_id, id)",
  "browser", "Node.js 22", "oqsgzdkljtxtpwdzptnw",
]) assert.ok(docs.includes(contract), "Missing deployment contract: " + contract)
for (const name of ["provisionInventoryAccess", "listInventoryItems", "updateInventoryItem", "createMaterialRequest", "postStockMovement"]) {
  assert.ok(functions.includes("### " + name), "Missing operation documentation: " + name)
}
assert.match(root, /Function before Hosting/)
assert.doesNotMatch(root, /firebase functions:delete/)
assert.match(database, /canonical Inventory API.*Firebase/i)
assert.match(await read("../.gitignore"), /^functions\/\.secret\.local$/m)
console.log("Single callable deployment boundaries and documentation passed.")
