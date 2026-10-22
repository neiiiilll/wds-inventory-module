import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose"

import { ApiError } from "./errors.ts"

export interface FirebaseIdentity {
  uid: string
  email: string
  emailVerified: boolean
  displayName: string
}

const firebaseKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
)

function unauthenticated(): never {
  throw new ApiError("unauthenticated", "Firebase authentication is required.")
}

export function extractBearerToken(value: string | null): string {
  const match = value?.match(/^Bearer\s+(\S+)$/i)
  if (!match) unauthenticated()
  return match[1]
}

export async function verifyFirebaseIdToken(
  token: string,
  projectId: string,
  keySet: JWTVerifyGetKey = firebaseKeys,
): Promise<FirebaseIdentity> {
  try {
    const { payload } = await jwtVerify(token, keySet, {
      algorithms: ["RS256"],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
    })
    const now = Math.floor(Date.now() / 1000)
    if (typeof payload.sub !== "string" || payload.sub.length === 0 || payload.sub.length > 128) unauthenticated()
    if (typeof payload.iat !== "number" || payload.iat > now + 60) unauthenticated()
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : ""
    return {
      uid: payload.sub,
      email,
      emailVerified: payload.email_verified === true,
      displayName: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : email,
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    unauthenticated()
  }
}
