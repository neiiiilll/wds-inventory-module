import assert from "node:assert/strict"
import test from "node:test"

import type { FirebaseIdentity } from "../_shared/firebase-auth.ts"
import { ApiError } from "../_shared/errors.ts"
import { provisionInventoryAccess, type ProvisionDependencies, type ProvisionRecord, type ProvisionRepository } from "../_shared/provision.ts"

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

function dependencies(options: { existing?: ProvisionRecord | null } = {}) {
  const calls: { identities: string[] } = { identities: [] }
  const repository: ProvisionRepository = {
    async resolve(uid) { calls.identities.push(uid); return options.existing === undefined ? activeRecord : options.existing },
  }
  const deps: ProvisionDependencies = { repository }
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
  assert.deepEqual(calls.identities, [identity.uid])
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
  assert.deepEqual(calls.identities, [identity.uid])
})

test("provisionInventoryAccess never reactivates suspended or removed memberships", async () => {
  for (const membershipStatus of ["suspended", "removed"]) {
    const { deps, calls } = dependencies({ existing: { ...activeRecord, membershipStatus } })
    await assert.rejects(provisionInventoryAccess(identity, {}, deps), (error: unknown) => error instanceof ApiError && error.code === "permission-denied")
    assert.deepEqual(calls.identities, [identity.uid])
  }
})

test("provisionInventoryAccess denies ambiguous memberships and unknown users", async () => {
  await assert.rejects(provisionInventoryAccess(identity, {}, dependencies({ existing: { ...activeRecord, membershipCount: 2 } }).deps), (error: unknown) => error instanceof ApiError && error.code === "permission-denied")
  await assert.rejects(provisionInventoryAccess(identity, {}, dependencies({ existing: null }).deps), (error: unknown) => error instanceof ApiError && error.code === "permission-denied")
})

test("provisionInventoryAccess denies new users without creating a default role", async () => {
  const { deps, calls } = dependencies({ existing: null })
  await assert.rejects(provisionInventoryAccess(identity, {}, deps), (error: unknown) => error instanceof ApiError && error.code === "permission-denied")
  assert.deepEqual(calls.identities, [identity.uid])
})

test("provisionInventoryAccess denies unassigned roles and missing memberships without enrollment", async () => {
  const noRole = dependencies({ existing: { ...activeRecord, roleKeys: [] } })
  await assert.rejects(provisionInventoryAccess(identity, {}, noRole.deps), (error: unknown) => error instanceof ApiError && error.code === "permission-denied")
  assert.deepEqual(noRole.calls.identities, [identity.uid])

  const noMembership = dependencies({ existing: { ...activeRecord, membershipCount: 0, membershipId: null, membershipStatus: null, tenantId: null, tenantKey: null, tenantActive: false, roleKeys: [] } })
  await assert.rejects(provisionInventoryAccess(identity, {}, noMembership.deps), (error: unknown) => error instanceof ApiError && error.code === "permission-denied")
  assert.deepEqual(noMembership.calls.identities, [identity.uid])
})

test("provisionInventoryAccess preserves assigned Administrator access on repeat login", async () => {
  const { deps, calls } = dependencies({ existing: { ...activeRecord, roleKeys: ["viewer", "administrator"] } })
  assert.equal((await provisionInventoryAccess(identity, {}, deps)).roleKey, "administrator")
  assert.equal((await provisionInventoryAccess(identity, {}, deps)).roleKey, "administrator")
  assert.deepEqual(calls.identities, [identity.uid, identity.uid])
})

test("provisionInventoryAccess rejects unverified email and client tenant or role fields", async () => {
  const { deps, calls } = dependencies()
  await assert.rejects(provisionInventoryAccess({ ...identity, emailVerified: false }, {}, deps), (error: unknown) => error instanceof ApiError && error.code === "permission-denied")
  await assert.rejects(provisionInventoryAccess(identity, { tenantKey: "other", roleKey: "administrator" }, deps), (error: unknown) => error instanceof ApiError && error.code === "invalid-argument")
  assert.deepEqual(calls.identities, [])
})
