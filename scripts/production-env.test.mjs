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
  environment.VITE_SUPABASE_URL,
  "https://oqsgzdkljtxtpwdzptnw.supabase.co",
  "Production Hosting must call the Apps Core Supabase project.",
)
assert.ok(environment.VITE_SUPABASE_PUBLISHABLE_KEY, "The browser-safe Apps Core publishable key is required.")
assert.doesNotMatch(environment.VITE_SUPABASE_PUBLISHABLE_KEY, /service_role|secret/i)

const response = await fetch(`${environment.VITE_SUPABASE_URL}/auth/v1/settings`, {
  headers: { apikey: environment.VITE_SUPABASE_PUBLISHABLE_KEY },
})
assert.equal(response.ok, true, "The configured publishable key must be accepted by Apps Core.")

console.log("Production browser configuration targets Apps Core with a valid publishable key.")
