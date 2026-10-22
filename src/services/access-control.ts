export const APP_ROLES = ["Administrator", "Inventory Staff", "Viewer"] as const

export type AppRole = (typeof APP_ROLES)[number]
export type AccessState = "loading" | "active" | "inactive" | "error"

export interface AppUser {
  firebaseUid: string
  email: string
  displayName: string
  role: AppRole
  tenantKey: string | null
  active: boolean
  createdAt: string
  updatedAt: string
  lastLoginAt: string
}

export const isAppRole = (value: unknown): value is AppRole =>
  typeof value === "string" && APP_ROLES.includes(value as AppRole)

export const toAppRole = (roleKey: unknown): AppRole | null => {
  if (roleKey === "administrator") return "Administrator"
  if (roleKey === "inventory_staff") return "Inventory Staff"
  if (roleKey === "viewer") return "Viewer"
  return null
}

export const canManageUsers = (role: AppRole): boolean => role === "Administrator"
export const canMutateWorkflow = (role: AppRole): boolean => role !== "Viewer"
export const canChangeRequester = (role: AppRole): boolean => role === "Administrator"
export const canPrint = (_role: AppRole): boolean => true
