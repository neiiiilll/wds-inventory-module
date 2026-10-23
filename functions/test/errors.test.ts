import assert from "node:assert/strict"
import test from "node:test"
import { HttpsError } from "firebase-functions/v2/https"
import { ConflictError, InputError, toHttpsError } from "../src/errors"

test("invalid input maps to invalid-argument", () => {
  const result = toHttpsError(new InputError("Item ID is required."), "request-1")
  assert.equal(result.code, "invalid-argument")
  assert.equal(result.message, "Item ID is required.")
})

test("optimistic conflicts map to aborted", () => {
  assert.equal(toHttpsError(new ConflictError("The record changed."), "request-2").code, "aborted")
})

test("expected callable errors preserve code and details", () => {
  const original = new HttpsError("permission-denied", "Inventory access is required.")
  assert.equal(toHttpsError(original, "request-3"), original)
})

test("unexpected errors hide infrastructure details behind a correlation reference", () => {
  for (const thrown of [new Error("postgres://secret@host/db SELECT password"), { message: "SUPABASE_SECRET_KEY=secret" }, null]) {
    const result = toHttpsError(thrown, "request-4")
    assert.equal(result.code, "internal")
    assert.equal(result.message, "The request could not be completed. Reference: request-4.")
    assert.doesNotMatch(JSON.stringify(result), /postgres|secret|SELECT|SUPABASE/)
  }
})
