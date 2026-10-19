import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const client = await readFile(new URL("../src/services/firebase-supabase-token.ts", import.meta.url), "utf8").catch(() => "")
const fn = await readFile(new URL("../functions/index.js", import.meta.url), "utf8").catch(() => "")
const config = await readFile(new URL("../firebase.json", import.meta.url), "utf8")
const functionPackage = JSON.parse(await readFile(new URL("../functions/package.json", import.meta.url), "utf8"))

assert.ok(client.includes('claims.role === "authenticated"'), "The client must reuse valid Firebase tokens.")
assert.ok(client.includes("httpsCallable"), "The client must request trusted claim provisioning when needed.")
assert.ok(client.includes("getIdToken(true)"), "The client must refresh its ID token after claims change.")
assert.ok(fn.includes('role: "authenticated"'), "The trusted function must assign the Supabase Postgres role claim.")
assert.ok(fn.includes('sign_in_provider') && fn.includes('google.com'), "Claim provisioning must accept Google-authenticated users only.")
assert.ok(fn.includes("setCustomUserClaims"), "Claims must be assigned through the Firebase Admin SDK.")
assert.ok(JSON.parse(config).functions?.source === "functions", "Firebase must deploy the claim function from the functions directory.")
assert.equal(functionPackage.engines.node, "22", "The claim function must use a supported Firebase runtime.")

console.log("Firebase-to-Supabase claim checks passed.")
