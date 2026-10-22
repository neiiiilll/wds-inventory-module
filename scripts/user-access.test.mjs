import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const sourceUrl = new URL("../src/services/user-access.ts", import.meta.url)
let source = ""
try {
  source = await readFile(sourceUrl, "utf8")
} catch (error) {
  if (error?.code !== "ENOENT") throw error
}

for (const contract of [
  "provisionCurrentUser",
  "loadCurrentUser",
  "provisionInventoryAccess",
  "getIdToken(true)",
  "toAppRole",
]) assert.ok(source.includes(contract), `Missing user-access contract: ${contract}`)

assert.equal(source.includes("localStorage"), false, "Roles must not fall back to browser-local authorization.")
assert.equal(source.includes("supabase"), false, "The browser must not query Supabase directly.")
assert.equal(source.includes("bootstrap"), false, "Email bootstrap authorization must be removed.")

console.log("User access service checks passed.")
