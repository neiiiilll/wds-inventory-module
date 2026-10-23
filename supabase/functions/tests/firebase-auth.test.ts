import assert from "node:assert/strict"
import { before, test } from "node:test"
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTVerifyGetKey,
} from "jose"

import { ApiError } from "../_shared/errors.ts"
import { extractBearerToken, verifyFirebaseIdToken } from "../_shared/firebase-auth.ts"

const projectId = "apps-workspace-b61a9"
const issuer = `https://securetoken.google.com/${projectId}`
type SigningKey = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"]
let privateKey: SigningKey
let otherPrivateKey: SigningKey
let keySet: JWTVerifyGetKey

before(async () => {
  const primary = await generateKeyPair("RS256")
  const other = await generateKeyPair("RS256")
  privateKey = primary.privateKey
  otherPrivateKey = other.privateKey
  keySet = createLocalJWKSet({
    keys: [{ ...(await exportJWK(primary.publicKey)), kid: "primary", alg: "RS256", use: "sig" }],
  })
})

async function token(overrides: {
  audience?: string
  issuer?: string
  subject?: string
  expiresIn?: string
  issuedAt?: number
  signingKey?: SigningKey
  claims?: Record<string, unknown>
} = {}) {
  return new SignJWT({ email: "viewer@example.com", email_verified: true, name: "Viewer", ...overrides.claims })
    .setProtectedHeader({ alg: "RS256", kid: "primary" })
    .setIssuer(overrides.issuer ?? issuer)
    .setAudience(overrides.audience ?? projectId)
    .setSubject(overrides.subject ?? "firebase-uid-1")
    .setIssuedAt(overrides.issuedAt ?? Math.floor(Date.now() / 1000))
    .setExpirationTime(overrides.expiresIn ?? "5m")
    .sign(overrides.signingKey ?? privateKey)
}

test("extractBearerToken rejects missing and malformed authorization values", () => {
  for (const value of [null, "", "Basic abc", "Bearer", "Bearer  "]) {
    assert.throws(
      () => extractBearerToken(value),
      (error: unknown) => error instanceof ApiError && error.code === "unauthenticated",
    )
  }
})

test("verifyFirebaseIdToken returns the verified Firebase identity", async () => {
  const identity = await verifyFirebaseIdToken(await token(), projectId, keySet)
  assert.deepEqual(identity, {
    uid: "firebase-uid-1",
    email: "viewer@example.com",
    emailVerified: true,
    displayName: "Viewer",
  })
})

test("verifyFirebaseIdToken does not promote Firebase tenant claims into Inventory authority", async () => {
  const identity = await verifyFirebaseIdToken(await token({
    claims: { tenant_id: "22222222-2222-4222-8222-222222222222", role: "administrator" },
  }), projectId, keySet)
  assert.deepEqual(identity, {
    uid: "firebase-uid-1",
    email: "viewer@example.com",
    emailVerified: true,
    displayName: "Viewer",
  })
  assert.equal("tenantId" in identity, false)
  assert.equal("role" in identity, false)
})

for (const [name, createToken] of [
  ["wrong signature", () => token({ signingKey: otherPrivateKey })],
  ["wrong issuer", () => token({ issuer: "https://securetoken.google.com/other-project" })],
  ["wrong audience", () => token({ audience: "other-project" })],
  ["expired token", () => token({ expiresIn: "-1m" })],
  ["future issued-at", () => token({ issuedAt: Math.floor(Date.now() / 1000) + 300 })],
  ["empty uid", () => token({ subject: "" })],
] as const) {
  test(`verifyFirebaseIdToken rejects ${name}`, async () => {
    await assert.rejects(
      verifyFirebaseIdToken(await createToken(), projectId, keySet),
      (error: unknown) => error instanceof ApiError && error.code === "unauthenticated",
    )
  })
}
