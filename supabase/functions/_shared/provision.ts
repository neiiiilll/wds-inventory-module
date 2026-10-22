import type { SupabaseClient } from "@supabase/supabase-js"

import { INVENTORY_ROLES, type InventoryRole, type ProvisionAccessResponse } from "./contracts.ts"
import { ApiError } from "./errors.ts"
import type { FirebaseIdentity } from "./firebase-auth.ts"

export interface ProvisionIdentity { firebaseUid: string; email: string; displayName: string }
export interface ProvisionRecord extends ProvisionIdentity {
  userActive: boolean
  membershipCount: number
  tenantId: string | null
  tenantKey: string | null
  tenantActive: boolean
  membershipId: string | null
  membershipStatus: string | null
  roleKeys: string[]
}
export interface ProvisionRepository {
  resolve(firebaseUid: string): Promise<ProvisionRecord | null>
}
export interface ProvisionDependencies { repository: ProvisionRepository }

type TenantRow = { id: string; tenant_key: string; active: boolean }
type MembershipRow = { id: string; tenant_id: string; status: string }

function denied(): never {
  throw new ApiError("permission-denied", "Inventory access is not permitted.")
}

export function createProvisionRepository(client: SupabaseClient): ProvisionRepository {
  const repository: ProvisionRepository = {
    async resolve(firebaseUid) {
      const userResult = await client.from("app_users").select("id, firebase_uid, email, display_name, active").eq("firebase_uid", firebaseUid).limit(1).maybeSingle()
      if (userResult.error) throw new Error(userResult.error.message)
      const user = userResult.data as { id: string; firebase_uid: string; email: string | null; display_name: string | null; active: boolean } | null
      if (!user) return null
      const membershipResult = await client.from("tenant_memberships").select("id, tenant_id, status").eq("user_id", user.id).limit(2)
      if (membershipResult.error) throw new Error(membershipResult.error.message)
      const memberships = (membershipResult.data ?? []) as MembershipRow[]
      const membership = memberships.length === 1 ? memberships[0] : null
      let tenant: TenantRow | null = null
      let roleKeys: string[] = []
      if (membership) {
        const [tenantResult, applicationResult, assignmentsResult] = await Promise.all([
          client.from("tenants").select("id, tenant_key, active").eq("id", membership.tenant_id).limit(1).maybeSingle(),
          client.from("applications").select("active").eq("app_key", "inventory").limit(1).maybeSingle(),
          client.from("membership_roles").select("role_key").eq("membership_id", membership.id).eq("app_key", "inventory").limit(4),
        ])
        if (tenantResult.error) throw new Error(tenantResult.error.message)
        if (applicationResult.error) throw new Error(applicationResult.error.message)
        if (assignmentsResult.error) throw new Error(assignmentsResult.error.message)
        tenant = tenantResult.data as TenantRow | null
        const applicationActive = (applicationResult.data as { active: boolean } | null)?.active === true
        const assigned = ((assignmentsResult.data ?? []) as Array<{ role_key: string }>).map((row) => row.role_key)
        if (applicationActive && assigned.length > 0) {
          const roleResult = await client.from("app_roles").select("role_key").eq("app_key", "inventory").in("role_key", assigned)
          if (roleResult.error) throw new Error(roleResult.error.message)
          const existing = new Set(((roleResult.data ?? []) as Array<{ role_key: string }>).map((row) => row.role_key))
          roleKeys = assigned.filter((roleKey) => existing.has(roleKey))
        }
      }
      return {
        firebaseUid: user.firebase_uid,
        email: user.email ?? "",
        displayName: user.display_name ?? user.email ?? "User",
        userActive: user.active,
        membershipCount: memberships.length,
        tenantId: tenant?.id ?? null,
        tenantKey: tenant?.tenant_key ?? null,
        tenantActive: tenant?.active === true,
        membershipId: membership?.id ?? null,
        membershipStatus: membership?.status ?? null,
        roleKeys,
      }
    },
  }
  return repository
}

function roleFrom(record: ProvisionRecord): InventoryRole | null {
  return INVENTORY_ROLES.find((role) => record.roleKeys.includes(role)) ?? null
}

export async function provisionInventoryAccess(
  identity: FirebaseIdentity,
  input: unknown,
  deps: ProvisionDependencies,
): Promise<ProvisionAccessResponse> {
  if (input && typeof input === "object") {
    const values = input as Record<string, unknown>
    if (["tenantId", "tenantKey", "role", "roleKey"].some((key) => key in values)) {
      throw new ApiError("invalid-argument", "Tenant and role are assigned by the server.")
    }
  }
  if (!identity.email || !identity.emailVerified) denied()
  const record = await deps.repository.resolve(identity.uid)
  if (record && !record.userActive) {
    return { status: "disabled", firebaseUid: record.firebaseUid, email: record.email, displayName: record.displayName, tenantKey: null, roleKey: null }
  }
  const roleKey = record ? roleFrom(record) : null
  if (!record || !record.userActive || record.membershipCount !== 1 || record.membershipStatus !== "active" || !record.tenantActive || !record.tenantKey || !roleKey) denied()
  return { status: "active", firebaseUid: record.firebaseUid, email: record.email, displayName: record.displayName, tenantKey: record.tenantKey, roleKey }
}
