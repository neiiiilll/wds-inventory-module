import { InventoryApiError, provisionInventoryAccess } from "./inventory-api"
import { toAppRole, type AppRole, type AppUser } from "./access-control"
import { firebaseAuth } from "./firebase"

export async function provisionCurrentUser(): Promise<AppUser> {
  let response = await provisionInventoryAccess()
  if (response.refreshToken) {
    const user = firebaseAuth?.currentUser
    if (!user) throw new InventoryApiError("unauthenticated")
    try {
      await user.getIdToken(true)
    } catch {
      throw new InventoryApiError("unauthenticated")
    }
    response = await provisionInventoryAccess()
    if (response.refreshToken) throw new InventoryApiError("permission-denied")
  }
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

// User administration is not part of the inventory callable API surface.
export async function listAppUsers(): Promise<AppUser[]> { return [] }

export async function setAppUserAccess(_input: {
  targetUid: string
  role: AppRole
  active: boolean
  reason: string
}): Promise<AppUser> {
  throw new InventoryApiError("permission-denied", "User access is managed by an administrator outside this screen.")
}
