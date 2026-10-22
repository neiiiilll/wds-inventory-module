import assert from "node:assert/strict"
import test from "node:test"

import { ApiError } from "../_shared/errors.ts"
import type { FirebaseIdentity } from "../_shared/firebase-auth.ts"
import { handleInventoryHttpRequest, type HttpDependencies } from "../_shared/http.ts"

const allowedOrigin = "https://app-invb61a9.web.app"
const identity: FirebaseIdentity = { uid: "firebase-1", email: "user@example.test", emailVerified: true, displayName: "User" }

function dependencies(options: { verifierError?: Error; actionError?: Error } = {}) {
  const calls = { verifiedTokens: [] as string[], actions: [] as Array<{ action: string; data: unknown }> }
  const action = (name: string) => async (_identity: FirebaseIdentity, data: unknown) => {
    calls.actions.push({ action: name, data })
    if (options.actionError) throw options.actionError
    return { action: name }
  }
  const deps: HttpDependencies = {
    projectId: "apps-workspace-b61a9",
    allowedOrigins: new Set([allowedOrigin]),
    async verifyToken(token) {
      calls.verifiedTokens.push(token)
      if (options.verifierError) throw options.verifierError
      return identity
    },
    actions: {
      provisionInventoryAccess: action("provisionInventoryAccess"),
      listInventoryItems: action("listInventoryItems"),
      updateInventoryItem: action("updateInventoryItem"),
      createMaterialRequest: action("createMaterialRequest"),
      postStockMovement: action("postStockMovement"),
    },
  }
  return { deps, calls }
}

function request(body: unknown, options: { origin?: string; authorization?: string; method?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json" })
  if (options.origin) headers.set("origin", options.origin)
  if (options.authorization !== undefined) headers.set("authorization", options.authorization)
  return new Request("https://example.supabase.co/functions/v1/inventory-api", {
    method: options.method ?? "POST",
    headers,
    body: (options.method ?? "POST") === "POST" ? JSON.stringify(body) : undefined,
  })
}

test("allowed preflight returns only the approved CORS surface", async () => {
  const { deps, calls } = dependencies()
  const response = await handleInventoryHttpRequest(request(null, { method: "OPTIONS", origin: allowedOrigin }), deps)
  assert.equal(response.status, 204)
  assert.equal(response.headers.get("access-control-allow-origin"), allowedOrigin)
  assert.equal(response.headers.get("access-control-allow-methods"), "POST")
  assert.equal(response.headers.get("access-control-allow-headers"), "authorization, apikey, content-type")
  assert.deepEqual(calls.verifiedTokens, [])
})

test("unapproved browser origin is rejected before token verification", async () => {
  const { deps, calls } = dependencies()
  const response = await handleInventoryHttpRequest(request({ action: "listInventoryItems", data: {} }, { origin: "https://evil.example", authorization: "Bearer token" }), deps)
  assert.equal(response.status, 403)
  assert.equal(response.headers.get("access-control-allow-origin"), null)
  assert.deepEqual(calls.verifiedTokens, [])
})

test("originless requests still require a Firebase bearer token", async () => {
  const { deps, calls } = dependencies()
  const response = await handleInventoryHttpRequest(request({ action: "listInventoryItems", data: {} }), deps)
  assert.equal(response.status, 401)
  assert.equal((await response.json()).error.code, "unauthenticated")
  assert.deepEqual(calls.actions, [])
})

test("valid requests verify the token before dispatch and return the success envelope", async () => {
  const { deps, calls } = dependencies()
  const response = await handleInventoryHttpRequest(request({ action: "listInventoryItems", data: { limit: 5 } }, { origin: allowedOrigin, authorization: "Bearer firebase-token" }), deps)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("access-control-allow-origin"), allowedOrigin)
  assert.deepEqual(await response.json(), { data: { action: "listInventoryItems" } })
  assert.deepEqual(calls.verifiedTokens, ["firebase-token"])
  assert.deepEqual(calls.actions, [{ action: "listInventoryItems", data: { limit: 5 } }])
})

test("failed token verification prevents action dispatch", async () => {
  const { deps, calls } = dependencies({ verifierError: new ApiError("unauthenticated", "Firebase authentication is required.") })
  const response = await handleInventoryHttpRequest(request({ action: "listInventoryItems", data: {} }, { authorization: "Bearer bad" }), deps)
  assert.equal(response.status, 401)
  assert.deepEqual(calls.actions, [])
})

test("malformed and unknown actions return safe invalid-argument errors", async () => {
  const { deps, calls } = dependencies()
  for (const body of [null, [], { data: {} }, { action: "unknown", data: {} }, { action: "listInventoryItems", data: {}, tenantId: "other" }]) {
    const response = await handleInventoryHttpRequest(request(body, { authorization: "Bearer token" }), deps)
    assert.equal(response.status, 400)
    assert.equal((await response.json()).error.code, "invalid-argument")
  }
  assert.deepEqual(calls.actions, [])
})

test("unexpected action failures are redacted and correlated", async () => {
  const { deps } = dependencies({ actionError: new Error("database password leaked") })
  const response = await handleInventoryHttpRequest(request({ action: "listInventoryItems", data: {} }, { authorization: "Bearer token" }), deps)
  assert.equal(response.status, 500)
  const body = await response.json()
  assert.equal(body.error.code, "internal")
  assert.match(body.error.requestId, /^[0-9a-f-]{36}$/)
  assert.equal(JSON.stringify(body).includes("password"), false)
})
