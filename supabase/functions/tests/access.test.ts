import assert from "node:assert/strict"
import test from "node:test"

import { requireAccess, type AccessLookup, type AppUserRecord, type MembershipRecord, type RoleRecord, type TenantRecord } from "../_shared/access.ts"
import { ApiError } from "../_shared/errors.ts"
import type { FirebaseIdentity } from "../_shared/firebase-auth.ts"

const identity: FirebaseIdentity = { uid: "firebase-1", email: "viewer@example.com", emailVerified: true, displayName: "Viewer" }
const user: AppUserRecord = { id: "user-1", active: true }
const membership: MembershipRecord = { id: "membership-1", tenantId: "tenant-1", status: "active" }
const tenant: TenantRecord = { id: "tenant-1", tenantKey: "inventory-test", active: true }
const viewerRole: RoleRecord = { roleKey: "viewer", applicationActive: true, roleExists: true }

function lookup(overrides: Partial<{
  user: AppUserRecord | null
  memberships: MembershipRecord[]
  tenant: TenantRecord | null
  roles: RoleRecord[]
}> = {}): AccessLookup {
  return {
    async findUser() { return overrides.user === undefined ? user : overrides.user },
    async listMemberships() { return overrides.memberships ?? [membership] },
    async findTenant() { return overrides.tenant === undefined ? tenant : overrides.tenant },
    async listRoles() { return overrides.roles ?? [viewerRole] },
  }
}

async function permissionDenied(promise: Promise<unknown>) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.code, "permission-denied")
    assert.equal(error.message, "Inventory access is not permitted.")
    return true
  })
}

test("requireAccess derives and freezes the tenant context without a custom claim", async () => {
  const context = await requireAccess(identity, "inventory", ["administrator", "inventory_staff", "viewer"], lookup({
    roles: [viewerRole, { roleKey: "administrator", applicationActive: true, roleExists: true }],
  }))
  assert.deepEqual(context, {
    userId: "user-1",
    membershipId: "membership-1",
    tenantId: "tenant-1",
    tenantKey: "inventory-test",
    roleKey: "administrator",
  })
  assert.equal(Object.isFrozen(context), true)
})

test("requireAccess denies inactive users", async () => {
  await permissionDenied(requireAccess(identity, "inventory", ["viewer"], lookup({ user: { ...user, active: false } })))
})

test("requireAccess denies missing or multiple memberships", async () => {
  await permissionDenied(requireAccess(identity, "inventory", ["viewer"], lookup({ memberships: [] })))
  await permissionDenied(requireAccess(identity, "inventory", ["viewer"], lookup({
    memberships: [membership, { ...membership, id: "membership-2", tenantId: "tenant-2" }],
  })))
})

test("requireAccess denies inactive memberships and tenants", async () => {
  await permissionDenied(requireAccess(identity, "inventory", ["viewer"], lookup({ memberships: [{ ...membership, status: "suspended" }] })))
  await permissionDenied(requireAccess(identity, "inventory", ["viewer"], lookup({ tenant: { ...tenant, active: false } })))
})

test("requireAccess denies missing, inactive, unknown, duplicate, and disallowed roles", async () => {
  await permissionDenied(requireAccess(identity, "inventory", ["viewer"], lookup({ roles: [] })))
  await permissionDenied(requireAccess(identity, "inventory", ["viewer"], lookup({ roles: [{ ...viewerRole, applicationActive: false }] })))
  await permissionDenied(requireAccess(identity, "inventory", ["viewer"], lookup({ roles: [{ roleKey: "invented", applicationActive: true, roleExists: false }] })))
  await permissionDenied(requireAccess(identity, "inventory", ["viewer"], lookup({ roles: [viewerRole, viewerRole] })))
  await permissionDenied(requireAccess(identity, "inventory", ["administrator"], lookup()))
})
