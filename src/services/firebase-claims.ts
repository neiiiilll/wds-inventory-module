import { firebaseAuth } from "./firebase"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined

export async function ensureFirebaseSupabaseRole(): Promise<void> {
  const user = firebaseAuth?.currentUser
  if (!user) throw new Error("Firebase authentication is required.")

  const currentToken = await user.getIdTokenResult(false)
  if (currentToken.claims.role === "authenticated") return
  if (!supabaseUrl) throw new Error("Supabase is not configured.")

  const response = await fetch(`${supabaseUrl}/functions/v1/firebase-auth-bridge`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${currentToken.token}`,
      "Content-Type": "application/json",
    },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error || "Firebase identity could not be prepared for Supabase.")
  }

  const refreshedToken = await user.getIdTokenResult(true)
  if (refreshedToken.claims.role !== "authenticated") {
    throw new Error("Firebase could not issue a Supabase-compatible session.")
  }
}
