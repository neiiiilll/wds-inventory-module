import type { SupabaseClient } from "@supabase/supabase-js"
import type { CallableRequest } from "firebase-functions/v2/https"

import { requireAccess, type AccessLookup } from "./access"
import type {
  InventoryItemDto,
  ListItemsInput,
  ListItemsResponse,
  UpdateItemInput,
} from "./contracts"
import { ConflictError, InputError } from "./errors"
import { getSupabaseAdmin } from "./supabase"

const ITEM_SELECT = [
  "id",
  "item_code",
  "name",
  "description",
  "category_id",
  "unit_id",
  "supplier_id",
  "minimum_quantity",
  "active",
  "version",
  "category:inv_categories!inv_inventory_items_category_fk(name)",
  "unit:inv_units!inv_inventory_items_unit_fk(name,symbol)",
].join(",")

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LIST_KEYS = new Set(["search", "limit", "cursor"])
const UPDATE_KEYS = new Set(["id", "expectedVersion", "changes"])
const CHANGE_KEYS = new Set([
  "name",
  "description",
  "categoryId",
  "unitId",
  "supplierId",
  "minimumQuantity",
  "active",
])

interface ItemRow {
  id: string
  item_code: string
  name: string
  description: string | null
  category_id: string
  unit_id: string
  supplier_id: string | null
  minimum_quantity: number | string
  active: boolean
  version: number | string
  category: { name: string } | Array<{ name: string }> | null
  unit: { name: string; symbol: string | null } | Array<{ name: string; symbol: string | null }> | null
}

export interface ListQuery {
  limit: number
  search: string | null
  cursor: string | null
}

export interface UpdateItemChanges {
  name?: string
  description?: string | null
  category_id?: string
  unit_id?: string
  supplier_id?: string | null
  minimum_quantity?: number
  active?: boolean
}

export interface InventoryRepository {
  list(tenantId: string, query: ListQuery): Promise<ListItemsResponse>
  update(
    tenantId: string,
    id: string,
    expectedVersion: number,
    changes: UpdateItemChanges,
  ): Promise<InventoryItemDto | null>
}

export interface InventoryDependencies {
  accessLookup: AccessLookup
  repository: InventoryRepository
}

function object(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError(message)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new InputError("The request contains an unsupported field.")
  }
}

function requiredUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new InputError(`${field} must be a valid UUID.`)
  }
  return value
}

function normalizeListInput(value: unknown): ListQuery {
  const input = object(value, "List input must be an object.")
  exactKeys(input, LIST_KEYS)

  let limit = 50
  if (input.limit !== undefined) {
    if (typeof input.limit !== "number" || !Number.isInteger(input.limit)) {
      throw new InputError("limit must be an integer.")
    }
    limit = Math.max(1, Math.min(100, input.limit))
  }

  let search: string | null = null
  if (input.search !== undefined) {
    if (typeof input.search !== "string") throw new InputError("search must be a string.")
    search = input.search.trim().replace(/\s+/g, " ").toLowerCase() || null
    if (search && search.length > 100) throw new InputError("search must be at most 100 characters.")
  }

  let cursor: string | null = null
  if (input.cursor !== undefined) {
    if (typeof input.cursor !== "string" || input.cursor.length === 0 || input.cursor.length > 500) {
      throw new InputError("cursor is invalid.")
    }
    cursor = input.cursor
  }
  return { limit, search, cursor }
}

function normalizeUpdateInput(value: unknown): {
  id: string
  expectedVersion: number
  changes: UpdateItemChanges
} {
  const input = object(value, "Update input must be an object.")
  exactKeys(input, UPDATE_KEYS)
  const id = requiredUuid(input.id, "id")
  if (typeof input.expectedVersion !== "number" || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new InputError("expectedVersion must be a positive integer.")
  }

  const raw = object(input.changes, "changes must be an object.")
  exactKeys(raw, CHANGE_KEYS)
  if (Object.keys(raw).length === 0) throw new InputError("At least one change is required.")

  const changes: UpdateItemChanges = {}
  if (raw.name !== undefined) {
    if (typeof raw.name !== "string" || !raw.name.trim() || raw.name.trim().length > 200) {
      throw new InputError("name must be between 1 and 200 characters.")
    }
    changes.name = raw.name.trim()
  }
  if (raw.description !== undefined) {
    if (raw.description !== null && typeof raw.description !== "string") {
      throw new InputError("description must be a string or null.")
    }
    changes.description = raw.description === null ? null : raw.description.trim() || null
  }
  if (raw.categoryId !== undefined) changes.category_id = requiredUuid(raw.categoryId, "categoryId")
  if (raw.unitId !== undefined) changes.unit_id = requiredUuid(raw.unitId, "unitId")
  if (raw.supplierId !== undefined) {
    changes.supplier_id = raw.supplierId === null ? null : requiredUuid(raw.supplierId, "supplierId")
  }
  if (raw.minimumQuantity !== undefined) {
    if (typeof raw.minimumQuantity !== "number" || !Number.isFinite(raw.minimumQuantity) || raw.minimumQuantity < 0) {
      throw new InputError("minimumQuantity must be a non-negative number.")
    }
    changes.minimum_quantity = raw.minimumQuantity
  }
  if (raw.active !== undefined) {
    if (typeof raw.active !== "boolean") throw new InputError("active must be a boolean.")
    changes.active = raw.active
  }
  return { id, expectedVersion: input.expectedVersion, changes }
}

function relation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
}

function mapItem(row: ItemRow, quantity: number): InventoryItemDto {
  const category = relation(row.category)
  const unit = relation(row.unit)
  if (!category || !unit) throw new Error("Inventory item reference data is incomplete.")
  return {
    id: row.id,
    itemCode: row.item_code,
    name: row.name,
    description: row.description,
    categoryId: row.category_id,
    categoryName: category.name,
    unitId: row.unit_id,
    unitName: unit.name,
    unitSymbol: unit.symbol,
    supplierId: row.supplier_id,
    minimumQuantity: Number(row.minimum_quantity),
    quantity,
    active: row.active,
    version: Number(row.version),
  }
}

function encodeCursor(row: ItemRow): string {
  return Buffer.from(JSON.stringify({ itemCode: row.item_code, id: row.id })).toString("base64url")
}

function decodeCursor(cursor: string): { itemCode: string; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown
    const value = object(parsed, "cursor is invalid.")
    if (typeof value.itemCode !== "string" || value.itemCode.length === 0 || value.itemCode.length > 200) {
      throw new InputError("cursor is invalid.")
    }
    return { itemCode: value.itemCode, id: requiredUuid(value.id, "cursor id") }
  } catch (error) {
    if (error instanceof InputError) throw error
    throw new InputError("cursor is invalid.")
  }
}

function filterValue(value: string): string {
  return JSON.stringify(value)
}

async function quantities(
  client: SupabaseClient,
  tenantId: string,
  itemIds: string[],
): Promise<Map<string, number>> {
  if (itemIds.length === 0) return new Map()
  const { data, error } = await client
    .from("inv_inventory_balances")
    .select("item_id, quantity")
    .eq("tenant_id", tenantId)
    .in("item_id", itemIds)
  if (error) throw new Error(error.message)
  const totals = new Map<string, number>()
  for (const row of (data ?? []) as Array<{ item_id: string; quantity: number | string }>) {
    totals.set(row.item_id, (totals.get(row.item_id) ?? 0) + Number(row.quantity))
  }
  return totals
}

export function createInventoryRepository(client: SupabaseClient = getSupabaseAdmin()): InventoryRepository {
  return {
    async list(tenantId, input) {
      let request = client
        .from("inv_inventory_items")
        .select(ITEM_SELECT)
        .eq("tenant_id", tenantId)
        .order("item_code", { ascending: true })
        .order("id", { ascending: true })
        .limit(input.limit + 1)

      if (input.search) {
        const pattern = `%${input.search.replace(/[\\%_]/g, "\\$&")}%`
        request = request.or(`item_code.ilike.${filterValue(pattern)},name.ilike.${filterValue(pattern)}`)
      }
      if (input.cursor) {
        const cursor = decodeCursor(input.cursor)
        request = request.or(
          `item_code.gt.${filterValue(cursor.itemCode)},and(item_code.eq.${filterValue(cursor.itemCode)},id.gt.${filterValue(cursor.id)})`,
        )
      }

      const { data, error } = await request
      if (error) throw new Error(error.message)
      const fetched = (data ?? []) as unknown as ItemRow[]
      const page = fetched.slice(0, input.limit)
      const totals = await quantities(client, tenantId, page.map((row) => row.id))
      return {
        items: page.map((row) => mapItem(row, totals.get(row.id) ?? 0)),
        nextCursor: fetched.length > input.limit && page.length ? encodeCursor(page[page.length - 1]) : null,
      }
    },

    async update(tenantId, id, expectedVersion, changes) {
      const { data, error } = await client
        .from("inv_inventory_items")
        .update({ ...changes, version: expectedVersion + 1 })
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .eq("version", expectedVersion)
        .select(ITEM_SELECT)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) return null
      const row = data as unknown as ItemRow
      const totals = await quantities(client, tenantId, [row.id])
      return mapItem(row, totals.get(row.id) ?? 0)
    },
  }
}

export async function listInventoryItemsHandler(
  request: CallableRequest<ListItemsInput>,
  dependencies: InventoryDependencies,
): Promise<ListItemsResponse> {
  const input = normalizeListInput(request.data)
  const access = await requireAccess(
    request,
    "inventory",
    ["administrator", "inventory_staff", "viewer"],
    dependencies.accessLookup,
  )
  return dependencies.repository.list(access.tenantId, input)
}

export async function updateInventoryItemHandler(
  request: CallableRequest<UpdateItemInput>,
  dependencies: InventoryDependencies,
): Promise<InventoryItemDto> {
  const input = normalizeUpdateInput(request.data)
  const access = await requireAccess(
    request,
    "inventory",
    ["administrator", "inventory_staff"],
    dependencies.accessLookup,
  )
  const updated = await dependencies.repository.update(
    access.tenantId,
    input.id,
    input.expectedVersion,
    input.changes,
  )
  if (!updated) {
    throw new ConflictError("The item changed or is no longer available. Reload and try again.")
  }
  return updated
}
