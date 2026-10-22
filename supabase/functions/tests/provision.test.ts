import assert from "node:assert/strict"
import test from "node:test"

import type { FirebaseIdentity } from "../_shared/firebase-auth.ts"
import { ApiError } from "../_shared/errors.ts"
import { provisionInventoryAccess, type ProvisionDependencies, type ProvisionIdentity, type ProvisionRecord, type ProvisionRepository } from "../_shared/provision.ts"

const identity: FirebaseIdentity = { uid: "firebase-1", email: "user@example.test", emailVerified: true, displayName: "Inventory User" }
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

function dependencies(options: { existing?: ProvisionRecord | null; ensured?: ProvisionRecord; bootstrapTenantKey?: string } = {}) {
  const calls: { identities: ProvisionIdentity[]; tenantKeys: string[] } = { identities: [], tenantKeys: [] }
  const repository: ProvisionRepository = {
    async resolve() { return options.existing === undefined ? activeRecord : options.existing },
    async ensureViewer(provisionIdentity, tenantKey) {
      calls.identities.push(provisionIdentity)
      calls.tenantKeys.push(tenantKey)
      return options.ensured ?? activeRecord
    },
  }
  const deps: ProvisionDependencies = { repository, bootstrapTenantKey: options.bootstrapTenantKey ?? "inventory-test" }
  return { deps, calls }
}

test("provisionInventoryAccess returns existing access without custom-claim work", async () => {
  const { deps, calls } = dependencies()
  const response = await provisionInventoryAccess(identity, {}, deps)
  assert.deepEqual(response, {
    status: "active",
    firebaseUid: "firebase-1",
    email: "user@example.test",
    displayName: "Inventory User",
    tenantKey: "inventory-test",
    roleKey: "viewer",
  })
  assert.deepEqual(calls.identities, [])
})

test("provisionInventoryAccess returns disabled without reactivating an inactive user", async () => {
  const { deps, calls } = dependencies({ existing: { ...activeRecord, userActive: false } })
  assert.deepEqual(await provisionInventoryAccess(identity, {}, deps), {
    status: "disabled",
    firebaseUid: "firebase-1",
    email: "user@example.test",
    displayName: "Inventory User",
    tenantKey: null,
    roleKey: null,
  })
  assert.deepEqual(calls.identities, [])
})

test("provisionInventoryAccess never reactivates suspended or removed memberships", async () => {
  for (const membershipStatus of ["suspended", "removed"]) {
    const { deps, calls } = dependencies({ existing: { ...activeRecord, membershipStatus } })
    await assert.rejects(provisionInventoryAccess(identity, {}, deps), (error: unknown) => error instanceof ApiError && error.code === "permission-denied")
    assert.deepEqual(calls.identities, [])
  }
})

test("provisionInventoryAccess denies ambiguous memberships and disabled bootstrap", async () => {
  await assert.rejects(provisionInventoryAccess(identity, {}, dependencies({ existing: { ...activeRecord, membershipCount: 2 } }).deps), (error: unknown) => error instanceof ApiError && error.code === "permission-denied")
  await assert.rejects(provisionInventoryAccess(identity, {}, dependencies({ existing: null, bootstrapTenantKey: "" }).deps), (error: unknown) => error instanceof ApiError && error.code === "permission-denied")
})

test("provisionInventoryAccess idempotently provisions only viewer access in the configured tenant", async () => {
  const { deps, calls } = dependencies({ existing: null })
  const response = await provisionInventoryAccess(identity, {}, deps)
  assert.equal(response.roleKey, "viewer")
  assert.deepEqual(calls.tenantKeys, ["inventory-test"])
  assert.deepEqual(calls.identities, [{ firebaseUid: "firebase-1", email: "user@example.test", displayName: "Inventory User" }])
})

test("provisionInventoryAccess completes partial bootstrap records without choosing a client tenant", async () => {
  const noRole = dependencies({ existing: { ...activeRecord, roleKeys: [] } })
  assert.equal((await provisionInventoryAccess(identity, {}, noRole.deps)).roleKey, "viewer")
  assert.deepEqual(noRole.calls.tenantKeys, ["inventory-test"])

  const noMembership = dependencies({ existing: { ...activeRecord, membershipCount: 0, membershipId: null, membershipStatus: null, tenantId: null, tenantKey: null, tenantActive: false, roleKeys: [] } })
  assert.equal((await provisionInventoryAccess(identity, {}, noMembership.deps)).roleKey, "viewer")
  assert.deepEqual(noMembership.calls.tenantKeys, ["inventory-test"])
})

test("provisionInventoryAccess rejects unverified email and client tenant or role fields", async () => {
  const { deps, calls } = dependencies()
  await assert.rejects(provisionInventoryAccess({ ...identity, emailVerified: false }, {}, deps), (error: unknown) => error instanceof ApiError && error.code === "permission-denied")
  await assert.rejects(provisionInventoryAccess(identity, { tenantKey: "other", roleKey: "administrator" }, deps), (error: unknown) => error instanceof ApiError && error.code === "invalid-argument")
  assert.deepEqual(calls.identities, [])
})
