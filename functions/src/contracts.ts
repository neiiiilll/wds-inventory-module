export const INVENTORY_ROLES = ["administrator", "inventory_staff", "viewer"] as const
export type InventoryRole = (typeof INVENTORY_ROLES)[number]

export interface ProvisionAccessResponse {
  status: "active" | "disabled"
  firebaseUid: string
  email: string
  displayName: string
  tenantKey: string | null
  roleKey: InventoryRole | null
  refreshToken: boolean
}

export interface ListItemsInput {
  search?: string
  limit?: number
  cursor?: string
}

export interface InventoryItemDto {
  id: string
  itemCode: string
  name: string
  description: string | null
  categoryId: string
  categoryName: string
  unitId: string
  unitName: string
  unitSymbol: string | null
  supplierId: string | null
  minimumQuantity: number
  quantity: number
  active: boolean
  version: number
}

export interface ListItemsResponse {
  items: InventoryItemDto[]
  nextCursor: string | null
}

export interface UpdateItemInput {
  id: string
  expectedVersion: number
  changes: Partial<Pick<InventoryItemDto,
    "name" | "description" | "categoryId" | "unitId" | "supplierId" | "minimumQuantity" | "active"
  >>
}

export interface MaterialRequestLineInput {
  lineNo: number
  itemId: string
  quantity: number
  specification?: string
}

export interface CreateMaterialRequestInput {
  requesterPersonnelId?: string
  job?: string
  requestedOn?: string
  lines: MaterialRequestLineInput[]
}

export interface MaterialRequestDto {
  requestId: string
  requestNo: string
  version: number
  status: "draft"
}

export type StockMovementType =
  | "receipt"
  | "issue"
  | "transfer"
  | "adjustment"
  | "return"
  | "writeoff"

export interface StockMovementLineInput {
  lineNo: number
  itemId: string
  locationId: string
  signedQuantity: number
  unitCost: number
  assetId?: string
}

export interface PostStockMovementInput {
  movementType: StockMovementType
  sourceType?: string
  sourceReference?: string
  idempotencyKey: string
  notes?: string
  lines: StockMovementLineInput[]
}

export interface PostStockMovementResponse {
  movementId: string
  postedAt: string
  replayed: boolean
}
