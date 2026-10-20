import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const gate = await readFile(new URL("../src/components/AccessGate.tsx", import.meta.url), "utf8")
const edgeFunction = await readFile(new URL("../supabase/functions/firebase-auth-bridge/index.ts", import.meta.url), "utf8").catch(error => {
  if (error?.code === "ENOENT") return ""
  throw error
})
const supabaseConfig = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8").catch(error => {
  if (error?.code === "ENOENT") return ""
  throw error
})
let claims = ""
try {
  claims = await readFile(new URL("../src/services/firebase-claims.ts", import.meta.url), "utf8")
} catch (error) {
  if (error?.code !== "ENOENT") throw error
}
const config = await readFile(new URL("../firebase.json", import.meta.url), "utf8")

assert.ok(gate.includes("registerCurrentUser"), "The access gate must register users through the secured adapter.")
assert.ok(claims.includes("ensureFirebaseSupabaseRole"), "Missing Firebase-to-Supabase claim helper.")
assert.ok(claims.includes("firebase-auth-bridge"), "The Supabase claim bootstrap function must be invoked.")
assert.equal(claims.includes("firebase/functions"), false, "The browser must not depend on Firebase Functions.")
assert.ok(claims.includes("getIdTokenResult(true)"), "The Firebase ID token must be force-refreshed after the claim changes.")
assert.equal(JSON.parse(config).functions, undefined, "Firebase Hosting must not require a Blaze-only Functions deployment.")
assert.ok(JSON.parse(config).hosting, "Firebase Hosting must remain configured.")
assert.ok(edgeFunction.includes("verifyIdToken"), "The Edge Function must verify the Firebase identity token.")
assert.ok(edgeFunction.includes('sign_in_provider !== "google.com"'), "Only Google Firebase sessions may be bootstrapped.")
assert.ok(edgeFunction.includes("email_verified"), "The Edge Function must require a verified Google email.")
assert.ok(edgeFunction.includes("setCustomUserClaims"), "The Edge Function must add the Supabase technical role claim.")
assert.ok(edgeFunction.includes("...user.customClaims"), "Existing Firebase custom claims must be preserved.")
assert.ok(edgeFunction.includes('role: "authenticated"'), "The Edge Function must set only the technical authenticated role.")
assert.match(supabaseConfig, /\[functions\.firebase-auth-bridge\][\s\S]*verify_jwt\s*=\s*false/, "Firebase tokens must be verified inside the Edge Function.")

console.log("Firebase-to-Supabase Edge Function checks passed.")
