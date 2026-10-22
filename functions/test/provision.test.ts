import assert from "node:assert/strict"
import test from "node:test"
import type { Auth, UserRecord } from "firebase-admin/auth"
import type { CallableRequest } from "firebase-functions/v2/https"

import {
  provisionInventoryAccessHandler,
  type ProvisionDependencies,
  type ProvisionIdentity,
  type ProvisionRecord,
  type ProvisionRepository,
} from "../src/provision"

const activeRecord: ProvisionRecord = {
  firebaseUid: "firebase-1",
  email: "user@example.test",
  displayName: "Inventory User",
  userActive: true,
  tenantId: "tenant-1",
  tenantKey: "inventory-test",
  tenantActive: true,
  membershipCount: 1,
  membershipId: "membership-1",
  membershipStatus: "active",
  roleKeys: ["viewer"],
}

function callable(data: unknown = {}, tokenOverrides: Record<string, unknown> = {}): CallableRequest<unknown> {
  return {
    data,
    auth: {
      uid: "firebase-1",
      token: {
        email: "user@example.test",
        email_verified: true,
        name: "Inventory User",
        ...tokenOverrides,
      },
    },
  } as CallableRequest<unknown>
}

function dependencies(options: {
  existing?: ProvisionRecord | null
  ensured?: ProvisionRecord
  bootstrapTenantKey?: string
  customClaims?: Record<string, unknown>
} = {}) {
  const calls: { identities: ProvisionIdentity[]; tenantKeys: string[]; claims: Array<Record<string, unknown>> } = {
    identities: [],
    tenantKeys: [],
    claims: [],
  }
  const repository: ProvisionRepository = {
    async resolve() { return options.existing === undefined ? activeRecord : options.existing },
    async ensureViewer(identity, tenantKey) {
      calls.identities.push(identity)
      calls.tenantKeys.push(tenantKey)
      return options.ensured ?? activeRecord
    },
  }
  const auth = {
    async getUser() {
      return { customClaims: options.customClaims ?? {} } as UserRecord
    },
    async setCustomUserClaims(_uid: string, claims: Record<string, unknown>) {
      calls.claims.push(claims)
    },
  } as Pick<Auth, "getUser" | "setCustomUserClaims">
  const deps: ProvisionDependencies = {
    repository,
    auth,
    bootstrapTenantKey: options.bootstrapTenantKey ?? "inventory-test",
  }
  return { deps, calls }
}

test("requires Firebase authentication", async () => {
  const { deps } = dependencies()
  await assert.rejects(
    provisionInventoryAccessHandler({ data: {} } as CallableRequest<unknown>, deps),
    (error: { code?: string }) => error.code === "unauthenticated",
  )
})

test("returns existing valid access without rewriting an identical claim", async () => {
  const { deps, calls } = dependencies()
  const response = await provisionInventoryAccessHandler(
    callable({}, { tenant_key: "inventory-test" }),
    deps,
  )

  assert.equal(response.status, "active")
  assert.equal(response.roleKey, "viewer")
  assert.equal(response.refreshToken, false)
  assert.deepEqual(calls.claims, [])
})

test("returns a disabled state without reactivating an inactive user", async () => {
  const { deps, calls } = dependencies({ existing: { ...activeRecord, userActive: false } })
  const response = await provisionInventoryAccessHandler(callable(), deps)

  assert.deepEqual(response, {
    status: "disabled",
    firebaseUid: "firebase-1",
    email: "user@example.test",
    displayName: "Inventory User",
    tenantKey: null,
    roleKey: null,
    refreshToken: false,
  })
  assert.deepEqual(calls.identities, [])
  assert.deepEqual(calls.claims, [])
})

test("does not reactivate a suspended or removed membership", async () => {
  for (const membershipStatus of ["suspended", "removed"]) {
    const { deps, calls } = dependencies({ existing: { ...activeRecord, membershipStatus } })
    await assert.rejects(
      provisionInventoryAccessHandler(callable(), deps),
      (error: { code?: string }) => error.code === "permission-denied",
    )
    assert.deepEqual(calls.identities, [])
    assert.deepEqual(calls.claims, [])
  }
})

test("denies a new user when test bootstrap is disabled", async () => {
  const { deps } = dependencies({ existing: null, bootstrapTenantKey: "" })
  await assert.rejects(
    provisionInventoryAccessHandler(callable(), deps),
    (error: { code?: string }) => error.code === "permission-denied",
  )
})

test("idempotently provisions only viewer access in the configured test tenant", async () => {
  const { deps, calls } = dependencies({ existing: null, customClaims: { support: true } })
  const response = await provisionInventoryAccessHandler(callable(), deps)

  assert.equal(response.roleKey, "viewer")
  assert.equal(response.refreshToken, true)
  assert.equal(calls.tenantKeys[0], "inventory-test")
  assert.deepEqual(calls.identities[0], {
    firebaseUid: "firebase-1",
    email: "user@example.test",
    displayName: "Inventory User",
  })
  assert.deepEqual(calls.claims[0], { support: true, tenant_key: "inventory-test" })
  assert.equal("role" in calls.claims[0], false)
})

test("a retry completes a partial membership using its existing tenant", async () => {
  const partial = { ...activeRecord, roleKeys: [] }
  const { deps, calls } = dependencies({ existing: partial })
  const response = await provisionInventoryAccessHandler(callable(), deps)

  assert.equal(response.roleKey, "viewer")
  assert.deepEqual(calls.tenantKeys, ["inventory-test"])
})

test("a retry can complete a bootstrap user created before its membership", async () => {
  const partial = {
    ...activeRecord,
    membershipCount: 0,
    membershipId: null,
    membershipStatus: null,
    tenantId: null,
    tenantKey: null,
    tenantActive: false,
    roleKeys: [],
  }
  const { deps, calls } = dependencies({ existing: partial })
  const response = await provisionInventoryAccessHandler(callable(), deps)

  assert.equal(response.roleKey, "viewer")
  assert.deepEqual(calls.tenantKeys, ["inventory-test"])
})

test("client tenant and role fields are rejected", async () => {
  const { deps, calls } = dependencies()
  await assert.rejects(
    provisionInventoryAccessHandler(callable({ tenantKey: "other", roleKey: "administrator" }), deps),
    (error: { code?: string }) => error.code === "invalid-argument",
  )
  assert.deepEqual(calls.identities, [])
})

test("a corrected database tenant replaces the stale claim and requests refresh", async () => {
  const { deps, calls } = dependencies({ customClaims: { feature_flag: "on", tenant_key: "old" } })
  const response = await provisionInventoryAccessHandler(callable({}, { tenant_key: "old" }), deps)

  assert.equal(response.refreshToken, true)
  assert.deepEqual(calls.claims[0], { feature_flag: "on", tenant_key: "inventory-test" })
})
