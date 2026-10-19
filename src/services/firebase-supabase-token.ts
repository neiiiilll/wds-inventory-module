import { getFunctions, httpsCallable } from "firebase/functions"
import { firebaseApp, firebaseAuth } from "./firebase"

export async function ensureFirebaseSupabaseRole(): Promise<void> {
  const user = firebaseAuth?.currentUser
  if (!firebaseApp || !user) throw new Error("Firebase authentication is required.")

  const currentToken = await user.getIdTokenResult(false)
  if (currentToken.claims.role === "authenticated") return

  const provisionRole = httpsCallable(getFunctions(firebaseApp), "ensureSupabaseRole")
  await provisionRole()
  await user.getIdToken(true)

  const refreshedToken = await user.getIdTokenResult(false)
  if (refreshedToken.claims.role !== "authenticated")
    throw new Error("Your database access token could not be prepared. Please sign out and try again.")
}
