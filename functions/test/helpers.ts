import assert from "node:assert/strict"
import type { CallableRequest } from "firebase-functions/v2/https"
import { toHttpsError } from "../src/errors"
import type { AccessLookup } from "../src/access"

export const tenantId = "11111111-1111-4111-8111-111111111111"
export const itemId = "80000000-0000-0000-0000-000000000001"
export function request(data: unknown = {}): CallableRequest<unknown> {
  return { data, auth: { uid: "firebase-1", token: { email_verified: true, tenant_id: tenantId } } } as CallableRequest<unknown>
}
export function lookup(roleKey = "inventory_staff"): AccessLookup {
  return {
    async findUser() { return { id: "user-1", active: true } },
    async listMemberships() { return [{ id: "member-1", tenantId, status: "active" }] },
    async findTenant() { return { id: tenantId, tenantKey: "inventory", active: true } },
    async listRoles() { return [{ roleKey, applicationActive: true, roleExists: true }] },
  }
}
export async function rejectsCode(work: Promise<unknown>, code: string, message?: string) {
  await assert.rejects(work.catch((error) => { throw toHttpsError(error, "test-reference") }), (error: any) => error.code === code && (message === undefined || error.message === message))
}
