import assert from "node:assert/strict"
import test from "node:test"
import type { Auth, UserRecord } from "firebase-admin/auth"
import type { CallableRequest } from "firebase-functions/v2/https"
import { logger } from "firebase-functions"
import { createProvisionRepository, provisionInventoryAccessHandler, type ProvisionDependencies, type ProvisionRecord } from "../src/provision"
import { provisionInventoryAccess } from "../src/index"

const tenantId = "11111111-1111-4111-8111-111111111111"
const active: ProvisionRecord = {
  firebaseUid: "firebase-1", email: "user@example.test", displayName: "Inventory User",
  userActive: true, tenantId, tenantKey: "inventory-test", tenantActive: true,
  membershipCount: 1, membershipId: "membership-1", membershipStatus: "active", roleKeys: ["viewer"],
}

function request(data: unknown = {}, token: Record<string, unknown> = {}): CallableRequest<unknown> {
  return { data, auth: { uid: "firebase-1", token: { email: "user@example.test", email_verified: true, ...token } } } as CallableRequest<unknown>
}

function dependencies(record: ProvisionRecord | null = active, claims: Record<string, unknown> = {}) {
  const writes: Array<{ uid: string; claims: Record<string, unknown> }> = []
  let resolutions = 0
  const deps: ProvisionDependencies = {
    repository: { async resolve(uid) { assert.equal(uid, "firebase-1"); resolutions++; return record } },
    auth: {
      async getUser(uid) { assert.equal(uid, "firebase-1"); return { customClaims: claims } as UserRecord },
      async setCustomUserClaims(uid, customClaims) { writes.push({ uid, claims: customClaims }) },
    } as Pick<Auth, "getUser" | "setCustomUserClaims">,
  }
  return { deps, writes, get resolutions() { return resolutions } }
}

test("callable rejects missing auth before requiring database secrets", async (t) => {
  t.mock.method(logger, "error", () => {})
  await assert.rejects(provisionInventoryAccess.run({ data: {} } as CallableRequest<unknown>), { code: "unauthenticated" })
})

test("callable rejects unverified email before requiring database secrets", async (t) => {
  t.mock.method(logger, "error", () => {})
  await assert.rejects(provisionInventoryAccess.run(request({}, { email_verified: false })), { code: "permission-denied" })
})

test("requires authentication", async () => {
  await assert.rejects(provisionInventoryAccessHandler({ data: {} } as CallableRequest<unknown>, dependencies().deps), { code: "unauthenticated" })
})

for (const token of [{ email_verified: false }, { email: undefined }, { email_verified: "true" }]) {
  test(`requires verified email: ${JSON.stringify(token)}`, async () => {
    const fixture = dependencies()
    await assert.rejects(provisionInventoryAccessHandler(request({}, token), fixture.deps), { code: "permission-denied" })
    assert.equal(fixture.resolutions, 0)
    assert.deepEqual(fixture.writes, [])
  })
}

for (const field of ["tenantId", "tenant_id", "tenantKey", "tenant_key", "tenant", "role", "roleKey", "role_key", "roles"]) {
  test(`rejects client-controlled ${field}`, async () => {
    const fixture = dependencies()
    await assert.rejects(provisionInventoryAccessHandler(request({ [field]: "forged" }), fixture.deps), { code: "invalid-argument" })
    assert.equal(fixture.resolutions, 0)
    assert.deepEqual(fixture.writes, [])
  })
}

test("missing users cannot enroll and missing explicit roles cannot be repaired", async () => {
  for (const record of [null, { ...active, roleKeys: [] }, { ...active, membershipCount: 0 }, { ...active, membershipCount: 2 }, { ...active, membershipStatus: "suspended" }, { ...active, tenantActive: false }, { ...active, roleKeys: ["viewer", "viewer"] }, { ...active, roleKeys: ["invented"] }, { ...active, tenantId: "not-a-uuid" }]) {
    const fixture = dependencies(record)
    await assert.rejects(provisionInventoryAccessHandler(request(), fixture.deps), { code: "permission-denied" })
    assert.deepEqual(fixture.writes, [])
  }
})

test("inactive users retain the disabled DTO without claiming access", async () => {
  const fixture = dependencies({ ...active, userActive: false })
  const response = await provisionInventoryAccessHandler(request(), fixture.deps)
  assert.deepEqual(response, { status: "disabled", firebaseUid: "firebase-1", email: "user@example.test", displayName: "Inventory User", tenantKey: null, roleKey: null, refreshToken: false })
  assert.deepEqual(fixture.writes, [])
})

test("sets the database tenant UUID and preserves unrelated custom claims", async () => {
  const fixture = dependencies(active, { support: true, feature_flag: "on" })
  const response = await provisionInventoryAccessHandler(request(), fixture.deps)
  assert.deepEqual(fixture.writes, [{ uid: "firebase-1", claims: { support: true, feature_flag: "on", tenant_id: tenantId } }])
  assert.deepEqual(response, { status: "active", firebaseUid: "firebase-1", email: "user@example.test", displayName: "Inventory User", tenantKey: "inventory-test", roleKey: "viewer", refreshToken: true })
})

test("replaces stale Admin claims even when the request token is current", async () => {
  const fixture = dependencies(active, { tenant_id: "22222222-2222-4222-8222-222222222222", support: true })
  const response = await provisionInventoryAccessHandler(request({}, { tenant_id: tenantId }), fixture.deps)
  assert.deepEqual(fixture.writes, [{ uid: "firebase-1", claims: { tenant_id: tenantId, support: true } }])
  assert.equal(response.refreshToken, true)
})

test("stale request tokens request refresh without rewriting current Admin claims", async () => {
  const fixture = dependencies(active, { tenant_id: tenantId })
  assert.equal((await provisionInventoryAccessHandler(request(), fixture.deps)).refreshToken, true)
  assert.deepEqual(fixture.writes, [])
})

test("current Admin and request claims need neither write nor refresh", async () => {
  const fixture = dependencies(active, { tenant_id: tenantId })
  assert.equal((await provisionInventoryAccessHandler(request({}, { tenant_id: tenantId }), fixture.deps)).refreshToken, false)
  assert.deepEqual(fixture.writes, [])
})

test("provision repository resolves explicit shared-table access using reads alone", async () => {
  const queried: string[] = []
  const filters: Record<string, unknown[][]> = {}
  const rows: Record<string, unknown> = {
    app_users: { id: "user-1", firebase_uid: "firebase-1", email: "user@example.test", display_name: "Inventory User", active: true },
    tenant_memberships: [{ id: "membership-1", tenant_id: tenantId, status: "active" }],
    tenants: { id: tenantId, tenant_key: "inventory-test", active: true },
    applications: { app_key: "inventory", active: true },
    membership_roles: [{ role_key: "viewer" }],
    app_roles: [{ role_key: "viewer" }],
  }
  const client = {
    from(table: string) {
      assert.ok(Object.hasOwn(rows, table), `unauthorized table ${table}`)
      queried.push(table)
      filters[table] = []
      const builder = {
        select() { return builder },
        eq(...args: unknown[]) { filters[table].push(args); return builder },
        in(...args: unknown[]) { filters[table].push(args); return builder },
        limit() { return builder },
        maybeSingle() { return Promise.resolve({ data: rows[table], error: null }) },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: rows[table], error: null }).then(resolve) },
      }
      return builder
    },
  }
  const repository = createProvisionRepository(client as never)
  assert.deepEqual(await repository.resolve("firebase-1"), active)
  assert.deepEqual(queried.sort(), ["app_roles", "app_users", "applications", "membership_roles", "tenant_memberships", "tenants"])
  assert.deepEqual(filters.app_users, [["firebase_uid", "firebase-1"]])
  assert.deepEqual(filters.tenant_memberships, [["user_id", "user-1"]])
  assert.deepEqual(filters.tenants, [["id", tenantId]])
  assert.deepEqual(filters.membership_roles, [["membership_id", "membership-1"], ["app_key", "inventory"]])
  rows.applications = { app_key: "inventory", active: false }
  assert.deepEqual((await repository.resolve("firebase-1"))?.roleKeys, [])
  rows.applications = { app_key: "inventory", active: true }
  rows.app_roles = []
  assert.deepEqual((await repository.resolve("firebase-1"))?.roleKeys, [])
  rows.app_users = null
  assert.equal(await repository.resolve("firebase-1"), null)
})
