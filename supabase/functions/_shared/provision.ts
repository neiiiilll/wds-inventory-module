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
  ensureViewer(identity: ProvisionIdentity, tenantKey: string): Promise<ProvisionRecord>
}
export interface ProvisionDependencies { repository: ProvisionRepository; bootstrapTenantKey: string }

type TenantRow = { id: string; tenant_key: string; active: boolean }
type MembershipRow = { id: string; tenant_id: string; status: string }

function denied(): never {
  throw new ApiError("permission-denied", "Inventory access is not permitted.")
}

function assertResult<T>(data: T | null, error: { message?: string } | null): T {
  if (error) throw new Error(error.message || "Supabase provisioning failed.")
  if (!data) throw new Error("Supabase provisioning returned no record.")
  return data
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
    async ensureViewer(identity, tenantKey) {
      const tenantResult = await client.from("tenants").select("id").eq("tenant_key", tenantKey).eq("active", true).limit(1).maybeSingle()
      const tenant = assertResult(tenantResult.data as { id: string } | null, tenantResult.error)
      const userResult = await client.from("app_users").select("id, active").eq("firebase_uid", identity.firebaseUid).limit(1).maybeSingle()
      if (userResult.error) throw new Error(userResult.error.message)
      let user = userResult.data as { id: string; active: boolean } | null
      if (!user) {
        const insertResult = await client.from("app_users").insert({ firebase_uid: identity.firebaseUid, email: identity.email, display_name: identity.displayName, active: true }).select("id, active").single()
        user = assertResult(insertResult.data as { id: string; active: boolean } | null, insertResult.error)
      } else if (!user.active) {
        denied()
      } else {
        const updateResult = await client.from("app_users").update({ email: identity.email, display_name: identity.displayName, updated_at: new Date().toISOString() }).eq("id", user.id)
        if (updateResult.error) throw new Error(updateResult.error.message)
      }
      const membershipResult = await client.from("tenant_memberships").select("id, tenant_id, status").eq("user_id", user.id).limit(2)
      if (membershipResult.error) throw new Error(membershipResult.error.message)
      const memberships = (membershipResult.data ?? []) as MembershipRow[]
      if (memberships.length > 1 || (memberships[0] && memberships[0].tenant_id !== tenant.id)) denied()
      let membership = memberships[0]
      if (!membership) {
        const insertResult = await client.from("tenant_memberships").insert({ tenant_id: tenant.id, user_id: user.id, status: "active" }).select("id, tenant_id, status").single()
        membership = assertResult(insertResult.data as MembershipRow | null, insertResult.error)
      } else if (membership.status !== "active") {
        denied()
      }
      const roleResult = await client.from("membership_roles").upsert(
        { membership_id: membership.id, app_key: "inventory", role_key: "viewer" },
        { onConflict: "membership_id,app_key,role_key", ignoreDuplicates: true },
      )
      if (roleResult.error) throw new Error(roleResult.error.message)
      const result = await repository.resolve(identity.firebaseUid)
      if (!result) throw new Error("Provisioned inventory access could not be resolved.")
      return result
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
  const provisionIdentity: ProvisionIdentity = { firebaseUid: identity.uid, email: identity.email, displayName: identity.displayName || identity.email }
  let record = await deps.repository.resolve(identity.uid)
  if (record && !record.userActive) {
    return { status: "disabled", firebaseUid: record.firebaseUid, email: record.email, displayName: record.displayName, tenantKey: null, roleKey: null }
  }
  if (record && record.membershipCount > 1) denied()
  const membershipUsable = record?.membershipCount === 1 && record.membershipStatus === "active" && record.tenantActive && Boolean(record.tenantKey)
  let roleKey = record ? roleFrom(record) : null
  if (!membershipUsable || !roleKey) {
    const bootstrapTenant = deps.bootstrapTenantKey.trim()
    if (record?.membershipCount === 1 && !membershipUsable) denied()
    const targetTenant = record?.tenantKey ?? bootstrapTenant
    if (!targetTenant) denied()
    record = await deps.repository.ensureViewer(provisionIdentity, targetTenant)
    roleKey = roleFrom(record)
  }
  if (!record || !record.userActive || record.membershipCount !== 1 || record.membershipStatus !== "active" || !record.tenantActive || !record.tenantKey || !roleKey) denied()
  return { status: "active", firebaseUid: record.firebaseUid, email: record.email, displayName: record.displayName, tenantKey: record.tenantKey, roleKey }
}
