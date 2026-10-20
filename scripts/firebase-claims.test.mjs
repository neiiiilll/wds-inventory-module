import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const gate = await readFile(new URL("../src/components/AccessGate.tsx", import.meta.url), "utf8")
const config = await readFile(new URL("../firebase.json", import.meta.url), "utf8")

assert.equal(gate.includes("ensureFirebaseSupabaseRole"), false, "Free demo mode must not call a Firebase Function.")
assert.equal(JSON.parse(config).functions, undefined, "Hosting deployment must not include paid Firebase Functions.")
assert.ok(JSON.parse(config).hosting, "Firebase Hosting must remain configured.")

console.log("Free Firebase Hosting demo checks passed.")
