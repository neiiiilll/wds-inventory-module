import { useCallback, useEffect, useState, type ReactNode } from "react"
import type { User } from "firebase/auth"
import { signOut } from "firebase/auth"
import { firebaseAuth } from "../services/firebase"
import type { AppUser } from "../services/access-control"
import { loadCurrentUser, registerCurrentUser } from "../services/user-access"

export default function AccessGate({ session, children }: {
  session: User
  children: (appUser: AppUser) => ReactNode
}) {
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const register = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      setAppUser(await registerCurrentUser())
    } catch (accessError) {
      setAppUser(null)
      setError(accessError instanceof Error ? accessError.message : "Access could not be verified.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void register() }, [register, session.uid])

  useEffect(() => {
    const refreshAccess = () => {
      void loadCurrentUser().then(setAppUser).catch((accessError: Error) => setError(accessError.message))
    }
    window.addEventListener("focus", refreshAccess)
    return () => window.removeEventListener("focus", refreshAccess)
  }, [])

  const logout = () => { if (firebaseAuth) void signOut(firebaseAuth) }

  if (loading) return <main className="login-page"><div className="login-loading">Checking your access…</div></main>
  if (error || !appUser) return <main className="login-page"><section className="login-card" aria-labelledby="access-error-title"><div className="login-brandmark">W</div><h1 id="access-error-title">Access could not be verified</h1><p className="login-subtitle">{error || "Your account record could not be loaded."}</p><button className="google-login-button" type="button" onClick={() => void register()}>Retry</button><button className="btn btn-ghost" type="button" onClick={logout}>Log out</button></section></main>
  if (!appUser.active) return <main className="login-page"><section className="login-card" aria-labelledby="access-disabled-title"><div className="login-brandmark">W</div><h1 id="access-disabled-title">Your access has been disabled</h1><p className="login-subtitle">Contact an Administrator if you need access restored for {appUser.email}.</p><button className="google-login-button" type="button" onClick={logout}>Log out</button></section></main>
  return children(appUser)
}
