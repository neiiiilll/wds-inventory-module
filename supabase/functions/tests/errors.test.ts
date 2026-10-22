import assert from "node:assert/strict"
import { test } from "node:test"

import { ApiError, toErrorResponse } from "../_shared/errors.ts"

test("toErrorResponse preserves a safe domain error", async () => {
  const response = toErrorResponse(new ApiError("invalid-argument", "Check the request."), "request-1")
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), {
    error: { code: "invalid-argument", message: "Check the request.", requestId: "request-1" },
  })
})

test("toErrorResponse redacts unexpected internal details", async () => {
  const response = toErrorResponse(new Error("postgres password=do-not-leak"), "request-2")
  assert.equal(response.status, 500)
  const body = await response.json()
  assert.deepEqual(body, {
    error: {
      code: "internal",
      message: "The request could not be completed. Reference: request-2.",
      requestId: "request-2",
    },
  })
  assert.equal(JSON.stringify(body).includes("do-not-leak"), false)
})
