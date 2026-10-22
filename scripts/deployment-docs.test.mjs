import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"

const root = await readFile(new URL("../README.md", import.meta.url), "utf8")
const database = await readFile(new URL("../supabase/README.md", import.meta.url), "utf8")
const firebase = JSON.parse(await readFile(new URL("../firebase.json", import.meta.url), "utf8"))
const browserEnv = await readFile(new URL("../.env.example", import.meta.url), "utf8")
const docs = `${root}\n${database}`

for (const contract of [
  "supabase db reset",
  "supabase db push",
  "supabase test db",
  "supabase functions serve inventory-api --no-verify-jwt",
  "supabase functions deploy inventory-api",
  "supabase secrets set",
  "FIREBASE_PROJECT_ID",
  "INVENTORY_ALLOWED_ORIGINS",
  "Automatic role assignment is disabled",
  "Edge before Hosting",
  "Firebase ID token",
  "service role bypasses RLS",
  "service desk",
  "UNIQUE (tenant_id, id)",
  "Security checklist",
  "forward migration",
]) assert.ok(docs.includes(contract), `Missing deployment documentation contract: ${contract}`)
assert.equal(docs.includes("INVENTORY_BOOTSTRAP_TENANT_KEY"), false, "Docs must not advertise automatic Viewer enrollment.")

await assert.rejects(access(new URL("../functions/", import.meta.url)), { code: "ENOENT" })
assert.equal("functions" in firebase, false, "Firebase must be static Hosting-only.")
assert.equal("functions" in (firebase.emulators ?? {}), false, "Firebase Functions emulator config must be removed.")
assert.ok(browserEnv.includes("VITE_SUPABASE_URL="), "The browser environment must name the public Supabase URL.")
assert.ok(browserEnv.includes("VITE_SUPABASE_PUBLISHABLE_KEY="), "The browser environment must name the public publishable key.")
assert.equal(browserEnv.includes("SERVICE_ROLE"), false, "The browser environment must not name a service-role key.")
assert.equal(/firebase\s+(functions:|deploy[^\n]*functions)/i.test(docs), false, "Docs must not advertise Firebase Functions deployment.")
assert.equal(docs.includes("Blaze"), false, "Blaze guidance is obsolete after the Edge migration.")

console.log("Deployment documentation checks passed.")
