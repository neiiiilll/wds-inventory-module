import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"

const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8")
assert.match(config, /\[functions\.inventory-api\]/)
assert.match(config, /verify_jwt\s*=\s*false/)

const sharedUrl = new URL("../supabase/functions/_shared/", import.meta.url)
const functionUrl = new URL("../supabase/functions/inventory-api/", import.meta.url)
const sources = []
for (const directory of [sharedUrl, functionUrl]) {
  for (const name of await readdir(directory)) {
    if (name.endsWith(".ts")) sources.push(await readFile(new URL(name, directory), "utf8"))
  }
}
const source = sources.join("\n")
assert.doesNotMatch(source, /\bsvc_[a-z0-9_]+\b/i)
assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/)
assert.match(source, /FIREBASE_PROJECT_ID/)
assert.match(source, /INVENTORY_ALLOWED_ORIGINS/)
assert.match(source, /INVENTORY_BOOTSTRAP_TENANT_KEY/)
assert.doesNotMatch(source, /setCustomUserClaims|tenant_key.*claim/i)

console.log("Supabase Edge Function source and configuration checks passed.")
