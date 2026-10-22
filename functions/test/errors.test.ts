import assert from "node:assert/strict"
import test from "node:test"
import { HttpsError } from "firebase-functions/v2/https"

import { ConflictError, InputError, toHttpsError } from "../src/errors"

test("invalid input becomes an invalid-argument callable error", () => {
  const result = toHttpsError(new InputError("Item ID is required."), "request-1")

  assert.equal(result.code, "invalid-argument")
  assert.equal(result.message, "Item ID is required.")
})

test("optimistic locking conflicts become aborted callable errors", () => {
  const result = toHttpsError(new ConflictError("The record changed."), "request-2")

  assert.equal(result.code, "aborted")
  assert.equal(result.message, "The record changed.")
})

test("known callable errors pass through unchanged", () => {
  const original = new HttpsError("permission-denied", "Inventory access is required.")

  assert.equal(toHttpsError(original, "request-3"), original)
})

test("unknown errors hide infrastructure details and include a reference", () => {
  const result = toHttpsError(new Error("postgres://secret@host/database"), "request-4")

  assert.equal(result.code, "internal")
  assert.equal(result.message, "The request could not be completed. Reference: request-4.")
  assert.doesNotMatch(result.message, /postgres|secret|database/i)
})
