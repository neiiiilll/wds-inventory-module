import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("../.env.local", import.meta.url), "utf8")
const environment = Object.fromEntries(source
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line && !line.startsWith("#"))
  .map(line => {
    const separator = line.indexOf("=")
    return [line.slice(0, separator), line.slice(separator + 1)]
  }))

assert.equal(
  environment.VITE_FIREBASE_PROJECT_ID,
  "apps-workspace-b61a9",
  "Production Hosting must call the approved Firebase Inventory project.",
)
for (const name of ["VITE_FIREBASE_API_KEY", "VITE_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_APP_ID", "VITE_FIREBASE_MESSAGING_SENDER_ID", "VITE_FIREBASE_STORAGE_BUCKET"]) {
  assert.ok(environment[name], `Missing browser Firebase configuration: ${name}`)
}
assert.equal(environment.VITE_FIREBASE_AUTH_DOMAIN, "apps-workspace-b61a9.firebaseapp.com")
const apiSource = await readFile(new URL("../src/services/inventory-api.ts", import.meta.url), "utf8")
assert.match(apiSource, /getFunctions\(firebaseApp, "asia-southeast1"\)/)
assert.match(apiSource, /"inventory"/)
assert.doesNotMatch(apiSource, /VITE_SUPABASE|invokeInventoryEdge/)
for (const [name, value] of Object.entries(environment)) {
  if (name.startsWith("VITE_")) assert.doesNotMatch(value, /sb_secret_|BEGIN (?:RSA |EC )?PRIVATE KEY|"type"\s*:\s*"service_account"/)
}
console.log("Production browser configuration targets the Firebase inventory callable.")
