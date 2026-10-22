import assert from "node:assert/strict"
import test from "node:test"

import { InventoryApiError, invokeInventoryEdge } from "../../../src/services/inventory-http.ts"

test("invokeInventoryEdge sends the Firebase token, publishable key, and action envelope", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const data = await invokeInventoryEdge<{ limit: number }, { items: string[] }>({
    endpoint: "https://project.supabase.co/functions/v1/inventory-api",
    publishableKey: "sb_publishable_test",
    async getIdToken() { return "firebase-token" },
    async fetchImpl(url, init) {
      calls.push({ url: String(url), init })
      return Response.json({ data: { items: ["item-1"] } })
    },
  }, "listInventoryItems", { limit: 5 })

  assert.deepEqual(data, { items: ["item-1"] })
  assert.equal(calls[0].url, "https://project.supabase.co/functions/v1/inventory-api")
  const headers = new Headers(calls[0].init?.headers)
  assert.equal(headers.get("authorization"), "Bearer firebase-token")
  assert.equal(headers.get("apikey"), "sb_publishable_test")
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { action: "listInventoryItems", data: { limit: 5 } })
})

test("invokeInventoryEdge maps server errors to safe client messages", async () => {
  await assert.rejects(invokeInventoryEdge({
    endpoint: "https://project.supabase.co/functions/v1/inventory-api",
    publishableKey: "sb_publishable_test",
    async getIdToken() { return "firebase-token" },
    async fetchImpl() {
      return Response.json({ error: { code: "aborted", message: "SQL secret", requestId: "request-1", details: "hidden" } }, { status: 409 })
    },
  }, "updateInventoryItem", {}), (error: unknown) => {
    assert.ok(error instanceof InventoryApiError)
    assert.equal(error.code, "aborted")
    assert.equal(error.message, "This record changed. Refresh it and try again.")
    assert.equal(error.message.includes("SQL"), false)
    return true
  })
})

test("invokeInventoryEdge rejects missing configuration and authentication before fetch", async () => {
  let fetched = false
  await assert.rejects(invokeInventoryEdge({
    endpoint: "", publishableKey: "", async getIdToken() { return null },
    async fetchImpl() { fetched = true; return Response.json({ data: {} }) },
  }, "listInventoryItems", {}), (error: unknown) => error instanceof InventoryApiError && error.code === "internal")
  await assert.rejects(invokeInventoryEdge({
    endpoint: "https://project.supabase.co/functions/v1/inventory-api", publishableKey: "public", async getIdToken() { return null },
    async fetchImpl() { fetched = true; return Response.json({ data: {} }) },
  }, "listInventoryItems", {}), (error: unknown) => error instanceof InventoryApiError && error.code === "unauthenticated")
  assert.equal(fetched, false)
})
