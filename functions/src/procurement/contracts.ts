/** Pure transport types: importing these types never imports backend secrets. */
export type Decimal = string
export type DocumentKind = "material_request" | "quotation" | "purchase_request" | "purchase_order" | "inspection"
export type ReferenceKind = "items" | "suppliers" | "locations" | "requesters" | "reviewers" | "warehouses"
export interface PageInput { limit?: number; cursor?: string; search?: string; status?: string }
export interface Page<T> { items: T[]; nextCursor: string | null }
export interface DocumentSummary {
  id: string; kind: DocumentKind; reference: string; date: string | null; status: string; version: number
  revision: number | null; historical: boolean; availableActions: string[]
}
export interface DocumentLine {
  id: string; itemId: string | null; lineNo: number; quantity: Decimal; unitPrice: Decimal | null
  specification: string | null; snapshot: Record<string, unknown> | null
  materialRequestLineId?: string | null; quotationLineId?: string | null; purchaseRequestLineId?: string | null; orderLineId?: string | null
  [key: string]: unknown
}
export interface DocumentDetail extends DocumentSummary {
  fields: Record<string, unknown>; lines: DocumentLine[]; history: Array<Record<string, unknown>>
  reviewSteps: Array<Record<string, unknown>>; attachments: Array<Record<string, unknown>>
  related: Array<{ id: string; kind: DocumentKind; reference: string }>
  linesNextCursor: string | null; historyNextCursor: string | null; relatedNextCursor: string | null
}
export interface MovementDto {
  id: string; movementId: string; itemId: string; itemCode: string; itemName: string; locationId: string
  occurredAt: string; movementType: string; sourceReference: string | null; quantity: Decimal
  unitCost: Decimal; valueDelta: Decimal; balanceAfter: Decimal | null; actorName: string | null
}
export interface DashboardDto {
  activeItems: number; stockQuantity: Decimal; lowStockItems: number; outOfStockItems: number
  criticalItems: Array<{ id: string; itemCode: string; name: string; quantity: Decimal; minimum: Decimal; unit: string }>
  recentMovements: MovementDto[]
  workflow: { openMaterialRequests: number; openPurchaseOrders: number; pendingInspections: number; pendingReceipts: number; issuedNetCost: Decimal | null }
}
export interface ReferenceDto { id: string; label: string; metadata: Record<string, unknown> }
export type CommandKind =
  | "createMaterialRequest" | "editMaterialRequest" | "approveMaterialRequest" | "createAdditionalMaterialRequest"
  | "createQuotation" | "createPurchaseRequest" | "revisePurchaseRequest" | "submitPurchaseRequest"
  | "reviewPurchaseRequest" | "reassignPendingReviewer" | "createPurchaseOrder" | "dispatchPurchaseOrder"
  | "recordDelivery" | "recordInspection" | "acceptInspection" | "postAcceptedReceipt" | "recordSupplierReturn"
  | "reconcileHistoricalReceipt" | "saveSupplier" | "saveWarehouse" | "saveStorageLocation" | "configureItemTracking" | "saveDocumentPrintFields"
export interface CommandInput { kind: CommandKind; id?: string; expectedVersion?: number; idempotencyKey: string; input: Record<string, unknown> }
export interface CommandResult { id: string; kind: DocumentKind | ReferenceKind | "tracking"; version: number; replayed: boolean; invalidations: string[]; reference?: string; status?: string; parentVersion?: number }
