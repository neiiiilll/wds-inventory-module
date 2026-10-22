import { InventoryApiError, provisionInventoryAccess } from "./inventory-api"
import { toAppRole, type AppRole, type AppUser } from "./access-control"

export async function provisionCurrentUser(): Promise<AppUser> {
  const response = await provisionInventoryAccess()
  const role = toAppRole(response.roleKey)
  if (response.status === "active" && !role) throw new InventoryApiError("permission-denied")
  const timestamp = new Date().toISOString()
  return {
    firebaseUid: response.firebaseUid,
    email: response.email,
    displayName: response.displayName,
    role: role ?? "Viewer",
    tenantKey: response.tenantKey,
    active: response.status === "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    lastLoginAt: timestamp,
  }
}

export const loadCurrentUser = provisionCurrentUser

// User administration is not part of the inventory callable surface.
export async function listAppUsers(): Promise<AppUser[]> { return [] }

export async function setAppUserAccess(_input: {
  targetUid: string
  role: AppRole
  active: boolean
  reason: string
}): Promise<AppUser> {
  throw new InventoryApiError("permission-denied", "User access is managed by an administrator outside this screen.")
}
