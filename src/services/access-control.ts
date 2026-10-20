export const APP_ROLES = ["Administrator", "Inventory Staff", "Viewer"] as const

export type AppRole = (typeof APP_ROLES)[number]
export type AccessState = "loading" | "active" | "inactive" | "error"

export interface AppUser {
  firebaseUid: string
  email: string
  displayName: string
  role: AppRole
  active: boolean
  createdAt: string
  updatedAt: string
  lastLoginAt: string
}

export interface UserRoleHistoryEntry {
  id: string
  targetUid: string
  targetEmail: string
  previousRole: AppRole | null
  newRole: AppRole
  previousActive: boolean | null
  newActive: boolean
  reason: string
  actorUid: string
  actorEmail: string
  occurredAt: string
}

const bootstrapAdministrators = new Set([
  "neilchristiand17@gmail.com",
  "ojt@likhainternet.com",
])

export const isAppRole = (value: unknown): value is AppRole =>
  typeof value === "string" && APP_ROLES.includes(value as AppRole)

export const isBootstrapAdministrator = (email: string): boolean =>
  bootstrapAdministrators.has(email.trim().toLowerCase())

export const normalizeDemoAccess = (
  access: Pick<AppUser, "role" | "active">,
  email: string,
): Pick<AppUser, "role" | "active"> =>
  isBootstrapAdministrator(email)
    ? { role: "Administrator", active: true }
    : { role: access.role, active: access.active }

export const canManageUsers = (role: AppRole): boolean => role === "Administrator"
export const canMutateWorkflow = (role: AppRole): boolean => role !== "Viewer"
export const canChangeRequester = (role: AppRole): boolean => role === "Administrator"
export const canPrint = (_role: AppRole): boolean => true
