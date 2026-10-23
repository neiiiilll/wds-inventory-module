export const APP_ROLES = ["Administrator", "Inventory Staff", "Viewer"] as const

export type AppRole = (typeof APP_ROLES)[number]
export type AccessState = "loading" | "active" | "inactive" | "error"

export const APP_CAPABILITIES = [
  "inventory.read",
  "inventory.update",
  "workflow.read",
  "workflow.mutate",
  "stock.post",
  "requester.change",
  "reports.read",
  "documents.print",
  "settings.read",
] as const

export type AppCapability = (typeof APP_CAPABILITIES)[number]

export const APP_PAGES = [
  "dashboard",
  "inventory",
  "stock-in",
  "stock-out",
  "transactions",
  "trail",
  "reports",
  "requests",
  "purchase-requests",
  "procurement",
  "inspection",
  "charges",
  "reconciliation",
  "settings",
] as const

export type AppPage = (typeof APP_PAGES)[number]

const defineCapabilities = (...capabilities: AppCapability[]): readonly AppCapability[] =>
  Object.freeze(capabilities)

const ROLE_CAPABILITIES: Readonly<Record<AppRole, readonly AppCapability[]>> = Object.freeze({
  Administrator: defineCapabilities(...APP_CAPABILITIES),
  "Inventory Staff": defineCapabilities(
    "inventory.read",
    "inventory.update",
    "workflow.read",
    "workflow.mutate",
    "stock.post",
    "reports.read",
    "documents.print",
    "settings.read",
  ),
  Viewer: defineCapabilities(
    "inventory.read",
    "workflow.read",
    "reports.read",
    "documents.print",
    "settings.read",
  ),
})

const PAGE_CAPABILITY: Readonly<Record<AppPage, AppCapability>> = Object.freeze({
  dashboard: "inventory.read",
  inventory: "inventory.read",
  "stock-in": "workflow.read",
  "stock-out": "workflow.read",
  transactions: "workflow.read",
  trail: "workflow.read",
  reports: "reports.read",
  requests: "workflow.read",
  "purchase-requests": "workflow.read",
  procurement: "workflow.read",
  inspection: "workflow.read",
  charges: "workflow.read",
  reconciliation: "workflow.read",
  settings: "settings.read",
})

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

export const capabilitiesFor = (role: AppRole): AppCapability[] => [...ROLE_CAPABILITIES[role]]

export const hasCapability = (role: AppRole, capability: AppCapability): boolean =>
  ROLE_CAPABILITIES[role].includes(capability)

export const canAccessPage = (role: AppRole, page: AppPage): boolean =>
  hasCapability(role, PAGE_CAPABILITY[page])

export const isReadOnlyRole = (role: AppRole): boolean =>
  !hasCapability(role, "inventory.update") && !hasCapability(role, "workflow.mutate")

export const canMutateWorkflow = (role: AppRole): boolean => hasCapability(role, "workflow.mutate")
export const canChangeRequester = (role: AppRole): boolean => hasCapability(role, "requester.change")
export const canPrint = (role: AppRole): boolean => hasCapability(role, "documents.print")
