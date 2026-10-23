import type { SupabaseClient } from "@supabase/supabase-js"
import type { Auth } from "firebase-admin/auth"
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https"
import { createSupabaseAccessLookup, denyAccess, isTenantUuid } from "./access"
import { INVENTORY_ROLES, type ProvisionAccessResponse } from "./contracts"

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
export interface ProvisionDependencies {
  repository: ProvisionRepository
  auth: Pick<Auth, "getUser" | "setCustomUserClaims">
}

export function createProvisionRepository(client: SupabaseClient): ProvisionRepository {
  const lookup = createSupabaseAccessLookup(client)
  return {
    async resolve(firebaseUid) {
      const { data, error } = await client.from("app_users").select("id, firebase_uid, email, display_name, active").eq("firebase_uid", firebaseUid).maybeSingle()
      if (error) throw new Error("Authorization lookup failed.")
      const user = data as { id: string; firebase_uid: string; email: string | null; display_name: string | null; active: boolean } | null
      if (!user) return null
      const memberships = await lookup.listMemberships(user.id)
      const membership = memberships.length === 1 ? memberships[0] : null
      const tenant = membership ? await lookup.findTenant(membership.tenantId) : null
      const roles = membership ? await lookup.listRoles(membership.id, "inventory") : []
      return {
        firebaseUid: user.firebase_uid,
        email: user.email ?? "",
        displayName: user.display_name ?? user.email ?? "User",
        userActive: user.active,
        membershipCount: memberships.length,
        tenantId: tenant?.id ?? null,
        tenantKey: tenant?.tenantKey ?? null,
        tenantActive: tenant?.active === true && tenant.id === membership?.tenantId,
        membershipId: membership?.id ?? null,
        membershipStatus: membership?.status ?? null,
        roleKeys: roles.filter((role) => role.applicationActive && role.roleExists).map((role) => role.roleKey),
      }
    },
  }
}

export async function provisionInventoryAccessHandler(
  request: CallableRequest<unknown>,
  deps: ProvisionDependencies,
): Promise<ProvisionAccessResponse> {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to continue.")
  const { uid, token } = request.auth
  if (typeof token.email !== "string" || !token.email.trim() || token.email_verified !== true) denyAccess()
  if (request.data != null && (typeof request.data !== "object" || Array.isArray(request.data) || Object.keys(request.data).length > 0)) {
    throw new HttpsError("invalid-argument", "Tenant and role are assigned by the server.")
  }
  const record = await deps.repository.resolve(uid)
  if (!record) denyAccess()
  if (!record.userActive) {
    return { status: "disabled", firebaseUid: record.firebaseUid, email: record.email, displayName: record.displayName, tenantKey: null, roleKey: null, refreshToken: false }
  }
  const roleKey = INVENTORY_ROLES.find((role) => record.roleKeys.includes(role))
  if (record.firebaseUid !== uid || record.membershipCount !== 1 || !record.membershipId || record.membershipStatus !== "active" || !record.tenantActive || !isTenantUuid(record.tenantId) || !record.tenantKey || !roleKey || new Set(record.roleKeys).size !== record.roleKeys.length) denyAccess()
  const adminUser = await deps.auth.getUser(uid)
  const claims = adminUser.customClaims ?? {}
  const needsWrite = claims.tenant_id !== record.tenantId
  if (needsWrite) await deps.auth.setCustomUserClaims(uid, { ...claims, tenant_id: record.tenantId })
  return {
    status: "active", firebaseUid: record.firebaseUid, email: record.email, displayName: record.displayName,
    tenantKey: record.tenantKey, roleKey, refreshToken: needsWrite || token.tenant_id !== record.tenantId,
  }
}
