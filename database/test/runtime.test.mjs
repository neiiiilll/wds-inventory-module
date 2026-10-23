import assert from "node:assert/strict"
import test from "node:test"

// A missing guard or acceptance of any production/non-loopback URL is a break.
const runtime = await import("./runtime.mjs").catch(error => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return {}
  throw error
})
test("database test runner refuses non-loopback and non-disposable databases before connecting", () => {
  assert.equal(typeof runtime.assertTestDatabaseUrl, "function", "A production-safe database guard is required")
  for (const value of ["postgres://user:secret@oqsgzdkljtxtpwdzptnw.supabase.co/inventory_test_a", "postgres://user@127.0.0.1/postgres", "postgres://user@example.com/inventory_test_a", "postgres://user@localhost/inventory_test_a?host=example.com"]) {
    assert.throws(() => runtime.assertTestDatabaseUrl(value), /disposable loopback/)
  }
  assert.equal(runtime.assertTestDatabaseUrl("postgres://codex_test@127.0.0.1:54399/inventory_test_abc"), "postgres://codex_test@127.0.0.1:54399/inventory_test_abc")
})
