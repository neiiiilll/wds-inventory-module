const { initializeApp } = require("firebase-admin/app")
const { getAuth } = require("firebase-admin/auth")
const { HttpsError, onCall } = require("firebase-functions/v2/https")

initializeApp()

exports.ensureSupabaseRole = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Google sign-in is required.")

  const provider = request.auth.token.firebase?.sign_in_provider
  if (provider !== "google.com")
    throw new HttpsError("permission-denied", "Only Google-authenticated users can access this system.")

  const user = await getAuth().getUser(request.auth.uid)
  await getAuth().setCustomUserClaims(request.auth.uid, {
    ...user.customClaims,
    role: "authenticated",
  })

  return { ready: true }
})
