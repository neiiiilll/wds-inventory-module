import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app"
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth"
import { getFunctions, type Functions } from "firebase/functions"

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

const requiredConfig = Object.values(config)
export const isFirebaseConfigured = requiredConfig.every(Boolean)

export const firebaseApp: FirebaseApp | null = isFirebaseConfigured
  ? getApps().length > 0
    ? getApp()
    : initializeApp(config as Record<string, string>)
  : null

export const firebaseAuth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null
const functionsRegion = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "asia-southeast1"
export const firebaseFunctions: Functions | null = firebaseApp ? getFunctions(firebaseApp, functionsRegion) : null
export const googleProvider = new GoogleAuthProvider()

