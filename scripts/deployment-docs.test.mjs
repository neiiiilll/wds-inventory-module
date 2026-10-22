import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const root = await readFile(new URL("../README.md", import.meta.url), "utf8")
const database = await readFile(new URL("../supabase/README.md", import.meta.url), "utf8")
const functionsEnv = await readFile(new URL("../functions/.env.example", import.meta.url), "utf8").catch(error => {
  if (error?.code === "ENOENT") return ""
  throw error
})
const docs = `${root}\n${database}`

for (const contract of [
  "supabase db reset",
  "supabase db push",
  "supabase test db",
  "firebase functions:secrets:set SUPABASE_URL",
  "firebase functions:secrets:set SUPABASE_SERVICE_ROLE_KEY",
  "INVENTORY_BOOTSTRAP_TENANT_KEY",
  "non-production",
  "firebase emulators:start --only auth,functions,hosting",
  "asia-southeast1",
  "Functions before Hosting",
  "service role bypasses RLS",
  "service desk",
  "UNIQUE (tenant_id, id)",
  "Security checklist",
  "forward migration",
]) assert.ok(docs.includes(contract), `Missing deployment documentation contract: ${contract}`)

assert.ok(functionsEnv.includes("SUPABASE_URL="), "Functions local environment must name SUPABASE_URL.")
assert.ok(functionsEnv.includes("SUPABASE_SERVICE_ROLE_KEY="), "Functions local environment must name the service-role secret.")
assert.ok(functionsEnv.includes("INVENTORY_BOOTSTRAP_TENANT_KEY="), "Functions local environment must name the bootstrap parameter.")
assert.equal(/eyJ[A-Za-z0-9_-]{20,}/.test(functionsEnv), false, "Functions example must not contain a real JWT-like secret.")

console.log("Deployment documentation checks passed.")
