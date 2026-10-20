import { cert, getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })

function firebaseAdminAuth() {
  const existing = getApps()[0]
  if (existing) return getAuth(existing)

  const rawServiceAccount = Deno.env.get("FIREBASE_SERVICE_ACCOUNT")
  if (!rawServiceAccount) throw new Error("Firebase service account is not configured.")
  const serviceAccount = JSON.parse(rawServiceAccount)
  return getAuth(initializeApp({ credential: cert(serviceAccount) }))
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405)

  const authorization = request.headers.get("Authorization") ?? ""
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : ""
  if (!token) return json({ error: "Firebase authentication is required." }, 401)

  try {
    const auth = firebaseAdminAuth()
    const decoded = await auth.verifyIdToken(token, true)
    if (decoded.firebase?.sign_in_provider !== "google.com") {
      return json({ error: "Only Google-authenticated users can access this system." }, 403)
    }
    if (decoded.email_verified !== true || !decoded.email) {
      return json({ error: "A verified Google email is required." }, 403)
    }

    const user = await auth.getUser(decoded.uid)
    if (user.customClaims?.role !== "authenticated") {
      await auth.setCustomUserClaims(decoded.uid, {
        ...user.customClaims,
        role: "authenticated",
      })
    }

    return json({ ready: true })
  } catch (error) {
    console.error("Firebase claim bootstrap failed", error)
    return json({ error: "Firebase identity verification failed." }, 401)
  }
})
