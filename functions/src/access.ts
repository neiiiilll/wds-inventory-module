import type { SupabaseClient } from "@supabase/supabase-js"
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https"
import { INVENTORY_ROLES, type InventoryRole } from "./contracts"

export interface AccessContext {
  readonly userId: string
  readonly membershipId: string
  readonly tenantId: string
  readonly tenantKey: string
  readonly roleKey: InventoryRole
}
export interface AppUserRecord { id: string; active: boolean }
export interface MembershipRecord { id: string; tenantId: string; status: string }
export interface TenantRecord { id: string; tenantKey: string; active: boolean }
export interface RoleRecord { roleKey: string; applicationActive: boolean; roleExists: boolean }
export interface AccessLookup {
  findUser(firebaseUid: string): Promise<AppUserRecord | null>
  listMemberships(userId: string): Promise<MembershipRecord[]>
  findTenant(tenantId: string): Promise<TenantRecord | null>
  listRoles(membershipId: string, appKey: "inventory"): Promise<RoleRecord[]>
}

export function denyAccess(): never {
  throw new HttpsError("permission-denied", "Inventory access is not permitted.")
}

export function isTenantUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function checked<T>(data: T | null, error: unknown): T | null {
  if (error) throw new Error("Authorization lookup failed.")
  return data
}

export function createSupabaseAccessLookup(client: SupabaseClient): AccessLookup {
  return {
    async findUser(firebaseUid) {
      const { data, error } = await client.from("app_users").select("id, active").eq("firebase_uid", firebaseUid).maybeSingle()
      return checked(data as AppUserRecord | null, error)
    },
    async listMemberships(userId) {
      const { data, error } = await client.from("tenant_memberships").select("id, tenant_id, status").eq("user_id", userId).limit(2)
      const rows = checked(data as Array<{ id: string; tenant_id: string; status: string }> | null, error) ?? []
      return rows.map((row) => ({ id: row.id, tenantId: row.tenant_id, status: row.status }))
    },
    async findTenant(tenantId) {
      const { data, error } = await client.from("tenants").select("id, tenant_key, active").eq("id", tenantId).maybeSingle()
      const row = checked(data as { id: string; tenant_key: string; active: boolean } | null, error)
      return row ? { id: row.id, tenantKey: row.tenant_key, active: row.active } : null
    },
    async listRoles(membershipId, appKey) {
      const [appResult, assignmentResult] = await Promise.all([
        client.from("applications").select("app_key, active").eq("app_key", appKey).maybeSingle(),
        client.from("membership_roles").select("role_key").eq("membership_id", membershipId).eq("app_key", appKey).limit(4),
      ])
      const application = checked(appResult.data as { active: boolean } | null, appResult.error)
      const assignments = checked(assignmentResult.data as Array<{ role_key: string }> | null, assignmentResult.error) ?? []
      if (assignments.length === 0) return []
      const roleKeys = assignments.map((row) => row.role_key)
      const { data, error } = await client.from("app_roles").select("role_key").eq("app_key", appKey).in("role_key", roleKeys)
      const roles = checked(data as Array<{ role_key: string }> | null, error) ?? []
      const existing = new Set(roles.map((row) => row.role_key))
      return roleKeys.map((roleKey) => ({ roleKey, applicationActive: application?.active === true, roleExists: existing.has(roleKey) }))
    },
  }
}

export async function requireAccess(
  request: CallableRequest<unknown>,
  appKey: "inventory",
  allowedRoles: readonly InventoryRole[],
  lookup: AccessLookup,
): Promise<AccessContext> {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to continue.")
  if (request.auth.token.email_verified !== true) denyAccess()
  const claim = request.auth.token.tenant_id
  if (!isTenantUuid(claim)) denyAccess()
  const user = await lookup.findUser(request.auth.uid)
  if (!user?.active) denyAccess()
  const memberships = await lookup.listMemberships(user.id)
  if (memberships.length !== 1 || memberships[0].status !== "active") denyAccess()
  const membership = memberships[0]
  const tenant = await lookup.findTenant(membership.tenantId)
  if (!tenant?.active || tenant.id !== membership.tenantId || tenant.id !== claim.toLowerCase()) denyAccess()
  const roles = await lookup.listRoles(membership.id, appKey)
  const keys = roles.map((role) => role.roleKey)
  if (new Set(keys).size !== keys.length) denyAccess()
  const validRoles = new Set(roles
    .filter((role) => role.applicationActive && role.roleExists)
    .map((role) => role.roleKey)
    .filter((role): role is InventoryRole => INVENTORY_ROLES.includes(role as InventoryRole)))
  const roleKey = allowedRoles.find((role) => validRoles.has(role))
  if (!roleKey) denyAccess()
  return Object.freeze({ userId: user.id, membershipId: membership.id, tenantId: tenant.id, tenantKey: tenant.tenantKey, roleKey })
}
