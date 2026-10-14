import { useState } from "react"
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth"
import { firebaseAuth, googleProvider, isFirebaseConfigured } from "../services/firebase"

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const signInWithGoogle = async () => {
    if (!isFirebaseConfigured || !firebaseAuth) {
      setError("Firebase Google sign-in is not configured. Add the Firebase web app values to .env.local.")
      return
    }
    setLoading(true)
    setError("")
    try {
      await signInWithPopup(firebaseAuth, googleProvider ?? new GoogleAuthProvider())
    } catch (signInError) {
      const message = signInError instanceof Error ? signInError.message : "Google sign-in could not be completed."
      setError(message)
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brandmark">W</div>
        <p className="login-eyebrow">WDS INVENTORY</p>
        <h1 id="login-title">Welcome back</h1>
        <p className="login-subtitle">
          Sign in to manage inventory, procurement, receiving, and stock
          issuance.
        </p>
        <button
          className="google-login-button"
          type="button"
          onClick={signInWithGoogle}
          disabled={loading}
        >
          <span className="google-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path fill="#4285F4" d="M21.35 12.23c0-.71-.06-1.4-.18-2.05H12v3.88h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.7 2.91-4.2 2.91-7.22Z" />
              <path fill="#34A853" d="M12 21.7c2.63 0 4.84-.87 6.45-2.35l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.7Z" />
              <path fill="#FBBC05" d="M6.54 13.79A5.85 5.85 0 0 1 6.23 12c0-.62.11-1.22.31-1.79V7.68H3.3A9.77 9.77 0 0 0 2.25 12c0 1.57.38 3.05 1.05 4.32l3.24-2.53Z" />
              <path fill="#EA4335" d="M12 6.18c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.27 14.63 2.3 12 2.3a9.74 9.74 0 0 0-8.7 5.38l3.24 2.53C7.31 7.9 9.46 6.18 12 6.18Z" />
            </svg>
          </span>
          {loading ? "Opening Google…" : "Continue with Google"}
        </button>
        {error && <p className="login-error" role="alert">{error}</p>}
        <p className="login-footnote">
          Access is managed through your organization’s Google account.
        </p>
      </section>
    </main>
  )
}
