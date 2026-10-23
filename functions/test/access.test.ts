import assert from "node:assert/strict"
import test from "node:test"
import type { CallableRequest } from "firebase-functions/v2/https"
import { createSupabaseAccessLookup, requireAccess, type AccessLookup, type AppUserRecord, type MembershipRecord, type RoleRecord, type TenantRecord } from "../src/access"

const tenantId = "11111111-1111-4111-8111-111111111111"
const otherTenantId = "22222222-2222-4222-8222-222222222222"
const user: AppUserRecord = { id: "user-1", active: true }
const membership: MembershipRecord = { id: "membership-1", tenantId, status: "active" }
const tenant: TenantRecord = { id: tenantId, tenantKey: "inventory-test", active: true }
const viewer: RoleRecord = { roleKey: "viewer", applicationActive: true, roleExists: true }

function request(claim: unknown = tenantId): CallableRequest<unknown> {
  return { auth: { uid: "firebase-1", token: { email_verified: true, tenant_id: claim } }, data: {} } as CallableRequest<unknown>
}

function lookup(overrides: Partial<{ user: AppUserRecord | null; memberships: MembershipRecord[]; tenant: TenantRecord | null; roles: RoleRecord[] }> = {}): AccessLookup {
  return {
    async findUser() { return overrides.user === undefined ? user : overrides.user },
    async listMemberships() { return overrides.memberships ?? [membership] },
    async findTenant() { return overrides.tenant === undefined ? tenant : overrides.tenant },
    async listRoles() { return overrides.roles ?? [viewer] },
  }
}

test("requires Firebase authentication", async () => {
  await assert.rejects(requireAccess({ data: {} } as CallableRequest<unknown>, "inventory", ["viewer"], lookup()), { code: "unauthenticated" })
})

test("rejects an unverified Firebase identity before database access", async () => {
  const req = request()
  req.auth!.token.email_verified = false
  const inaccessibleLookup: AccessLookup = {
    async findUser() { throw new Error("database must not be reached") },
    async listMemberships() { throw new Error("database must not be reached") },
    async findTenant() { throw new Error("database must not be reached") },
    async listRoles() { throw new Error("database must not be reached") },
  }
  await assert.rejects(requireAccess(req, "inventory", ["viewer"], inaccessibleLookup), { code: "permission-denied" })
})

test("returns immutable database context with allowed-role priority", async () => {
  const context = await requireAccess(request(), "inventory", ["administrator", "viewer"], lookup({ roles: [viewer, { ...viewer, roleKey: "administrator" }] }))
  assert.deepEqual(context, { userId: "user-1", membershipId: "membership-1", tenantId, tenantKey: "inventory-test", roleKey: "administrator" })
  assert.equal(Object.isFrozen(context), true)
})

for (const claim of [undefined, null, "", "inventory-test", 12, {}, [tenantId], "11111111-1111-1111-1111-11111111111z", otherTenantId]) {
  test(`tenant claims cannot override database authority: ${JSON.stringify(claim)}`, async () => {
    const req = request(null)
    req.auth!.token.tenant_id = claim
    assert.equal((await requireAccess(req, "inventory", ["viewer"], lookup())).tenantId, tenantId)
  })
}

test("database tenancy does not depend on either Firebase tenant claim", async () => {
  const req = request(null)
  delete req.auth!.token.tenant_id
  req.auth!.token.tenant_key = "inventory-test"
  assert.equal((await requireAccess(req, "inventory", ["viewer"], lookup())).tenantId, tenantId)
})

const deniedLookups = {
  "missing user": { user: null },
  "inactive user": { user: { ...user, active: false } },
  "missing membership": { memberships: [] },
  "multiple memberships": { memberships: [membership, { ...membership, id: "membership-2" }] },
  "inactive membership": { memberships: [{ ...membership, status: "suspended" }] },
  "missing tenant": { tenant: null },
  "inactive tenant": { tenant: { ...tenant, active: false } },
  "membership tenant mismatch": { tenant: { ...tenant, id: otherTenantId } },
  "missing role": { roles: [] },
  "inactive application": { roles: [{ ...viewer, applicationActive: false }] },
  "unknown role": { roles: [{ ...viewer, roleKey: "invented", roleExists: false }] },
  "duplicate role": { roles: [viewer, viewer] },
}
for (const [name, overrides] of Object.entries(deniedLookups)) {
  test(`denies ${name}`, async () => {
    await assert.rejects(requireAccess(request(), "inventory", ["viewer"], lookup(overrides)), { code: "permission-denied" })
  })
}

test("roles outside the callable allowlist are denied", async () => {
  await assert.rejects(requireAccess(request(), "inventory", ["administrator"], lookup()), { code: "permission-denied" })
})

test("the database lookup uses only scoped shared authorization reads", async () => {
  const queries: Array<{ table: string; filters: unknown[][] }> = []
  const rows: Record<string, unknown> = {
    app_users: { id: "user-1", active: true },
    tenant_memberships: [{ id: "membership-1", tenant_id: tenantId, status: "active" }],
    tenants: { id: tenantId, tenant_key: "inventory-test", active: true },
    applications: { app_key: "inventory", active: true },
    membership_roles: [{ role_key: "viewer" }],
    app_roles: [{ role_key: "viewer" }],
  }
  const client = {
    from(table: string) {
      assert.ok(Object.hasOwn(rows, table), `unauthorized table ${table}`)
      const query = { table, filters: [] as unknown[][] }
      queries.push(query)
      const builder = {
        select() { return builder },
        eq(...args: unknown[]) { query.filters.push(args); return builder },
        in(...args: unknown[]) { query.filters.push(args); return builder },
        limit() { return builder },
        maybeSingle() { return Promise.resolve({ data: rows[table], error: null }) },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: rows[table], error: null }).then(resolve) },
      }
      return builder
    },
  }
  const result = await requireAccess(request(), "inventory", ["viewer"], createSupabaseAccessLookup(client as never))
  assert.equal(result.tenantId, tenantId)
  for (const [table, filter] of [
    ["app_users", ["firebase_uid", "firebase-1"]],
    ["tenant_memberships", ["user_id", "user-1"]],
    ["tenants", ["id", tenantId]],
    ["applications", ["app_key", "inventory"]],
    ["membership_roles", ["membership_id", "membership-1"]],
    ["app_roles", ["app_key", "inventory"]],
  ] as const) {
    assert.ok(queries.find((query) => query.table === table)?.filters.some((value) => JSON.stringify(value) === JSON.stringify(filter)))
  }
})
