import assert from "node:assert/strict"
import test from "node:test"
import type { CallableRequest } from "firebase-functions/v2/https"

import {
  requireAccess,
  type AccessLookup,
  type AppUserRecord,
  type MembershipRecord,
  type RoleRecord,
  type TenantRecord,
} from "../src/access"

const user: AppUserRecord = { id: "user-1", active: true }
const membership: MembershipRecord = {
  id: "membership-1",
  tenantId: "tenant-1",
  status: "active",
}
const tenant: TenantRecord = {
  id: "tenant-1",
  tenantKey: "inventory-test",
  active: true,
}
const viewerRole: RoleRecord = {
  roleKey: "viewer",
  applicationActive: true,
  roleExists: true,
}

function request(
  tenantKey: unknown = "inventory-test",
  data: unknown = {},
): CallableRequest<unknown> {
  return {
    auth: {
      uid: "firebase-1",
      token: { tenant_key: tenantKey },
    },
    data,
  } as CallableRequest<unknown>
}

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
  await assert.rejects(promise, (error: { code?: string; message?: string }) => {
    assert.equal(error.code, "permission-denied")
    assert.equal(error.message, "Inventory access is not permitted.")
    return true
  })
}

test("returns immutable tenant context and honors allowed-role priority", async () => {
  const context = await requireAccess(
    request(),
    "inventory",
    ["administrator", "inventory_staff", "viewer"],
    lookup({
      roles: [
        viewerRole,
        { roleKey: "administrator", applicationActive: true, roleExists: true },
      ],
    }),
  )

  assert.deepEqual(context, {
    userId: "user-1",
    membershipId: "membership-1",
    tenantId: "tenant-1",
    tenantKey: "inventory-test",
    roleKey: "administrator",
  })
})

test("missing Firebase authentication is unauthenticated", async () => {
  const unauthenticated = { data: {} } as CallableRequest<unknown>
  await assert.rejects(
    requireAccess(unauthenticated, "inventory", ["viewer"], lookup()),
    (error: { code?: string }) => error.code === "unauthenticated",
  )
})

test("missing tenant claim is denied", async () => {
  await permissionDenied(requireAccess(request(null), "inventory", ["viewer"], lookup()))
})

test("inactive users are denied", async () => {
  await permissionDenied(requireAccess(request(), "inventory", ["viewer"], lookup({ user: { ...user, active: false } })))
})

test("users without a membership are denied", async () => {
  await permissionDenied(requireAccess(request(), "inventory", ["viewer"], lookup({ memberships: [] })))
})

test("users with multiple memberships are denied", async () => {
  await permissionDenied(requireAccess(request(), "inventory", ["viewer"], lookup({
    memberships: [membership, { ...membership, id: "membership-2", tenantId: "tenant-2" }],
  })))
})

test("inactive memberships are denied", async () => {
  await permissionDenied(requireAccess(request(), "inventory", ["viewer"], lookup({
    memberships: [{ ...membership, status: "suspended" }],
  })))
})

test("inactive tenants are denied", async () => {
  await permissionDenied(requireAccess(request(), "inventory", ["viewer"], lookup({
    tenant: { ...tenant, active: false },
  })))
})

test("stale or forged tenant claims return only the generic denial", async () => {
  await permissionDenied(requireAccess(
    request("other-tenant", { targetId: "known-cross-tenant-id" }),
    "inventory",
    ["viewer"],
    lookup(),
  ))
})

test("missing inventory roles are denied", async () => {
  await permissionDenied(requireAccess(request(), "inventory", ["viewer"], lookup({ roles: [] })))
})

test("inactive applications and unknown roles are denied", async () => {
  await permissionDenied(requireAccess(request(), "inventory", ["viewer"], lookup({
    roles: [{ roleKey: "viewer", applicationActive: false, roleExists: true }],
  })))
  await permissionDenied(requireAccess(request(), "inventory", ["viewer"], lookup({
    roles: [{ roleKey: "invented", applicationActive: true, roleExists: false }],
  })))
})

test("roles outside the callable allow-list are denied", async () => {
  await permissionDenied(requireAccess(request(), "inventory", ["administrator"], lookup()))
})

test("duplicate role records are denied as ambiguous", async () => {
  await permissionDenied(requireAccess(request(), "inventory", ["viewer"], lookup({ roles: [viewerRole, viewerRole] })))
})
