import type { SupabaseClient } from "@supabase/supabase-js"
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https"
import { requireAccess, type AccessLookup } from "./access"
import type { MaterialRequestDto } from "./contracts"
import { InputError } from "./errors"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
export function inputObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError(message)
  return value as Record<string, unknown>
}
export function allowOnly(value: Record<string, unknown>, allowed: ReadonlySet<string>) {
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new InputError("The request contains an unsupported field.")
}
export function uuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new InputError(`${field} must be a valid UUID.`)
  return value
}
export function optionalText(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== "string") throw new InputError(`${field} must be a string.`)
  const trimmed = value.trim()
  if (trimmed.length > maxLength) throw new InputError(`${field} is too long.`)
  return trimmed || null
}
function validDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}
export function mapRpcError(message: string): Error {
  const normalized = message.toLowerCase()
  if (normalized.includes("insufficient stock") || normalized.includes("negative inventory value")) return new HttpsError("failed-precondition", "Insufficient stock for this movement.")
  if (normalized.includes("authorized tenant") || normalized.includes("was not found")) return new HttpsError("not-found", "One or more inventory references were not found.")
  return new Error(message)
}

const REQUEST_KEYS = new Set(["requesterPersonnelId", "job", "requestedOn", "lines"])
const REQUEST_LINE_KEYS = new Set(["lineNo", "itemId", "quantity", "specification"])

export interface CreateMaterialRequestRpcArgs {
  p_tenant_id: string; p_actor_user_id: string; p_requester_personnel_id: string | null; p_job: string | null; p_requested_on: string | null
  p_lines: Array<{ lineNo: number; itemId: string; quantity: number; specification?: string }>
}

export interface MaterialRequestRepository {
  createMaterialRequest(args: CreateMaterialRequestRpcArgs): Promise<MaterialRequestDto>
}
export interface MaterialRequestDependencies { accessLookup: AccessLookup; repository: MaterialRequestRepository }
export function createMaterialRequestRepository(client: SupabaseClient): MaterialRequestRepository {
  return {
    async createMaterialRequest(args) {
      const { data, error } = await client.rpc("inv_create_material_request", args)
      if (error) throw mapRpcError(error.message)
      if (!data || typeof data !== "object") throw new Error("Material request RPC returned no result.")
      return data as unknown as MaterialRequestDto
    },
  }
}
function normalizeRequest(value: unknown): Omit<CreateMaterialRequestRpcArgs, "p_tenant_id" | "p_actor_user_id"> {
  const input = inputObject(value, "Material request input must be an object.")
  allowOnly(input, REQUEST_KEYS)
  const requester = input.requesterPersonnelId === undefined ? null : uuid(input.requesterPersonnelId, "requesterPersonnelId")
  const job = optionalText(input.job, "job", 500)
  let requestedOn: string | null = null
  if (input.requestedOn !== undefined) {
    if (typeof input.requestedOn !== "string" || !validDate(input.requestedOn)) throw new InputError("requestedOn must be a valid YYYY-MM-DD date.")
    requestedOn = input.requestedOn
  }
  if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > 200) throw new InputError("lines must contain between 1 and 200 entries.")
  const numbers = new Set<number>()
  const lines = input.lines.map((entry, index) => {
    const line = inputObject(entry, `lines[${index}] must be an object.`)
    allowOnly(line, REQUEST_LINE_KEYS)
    if (typeof line.lineNo !== "number" || !Number.isInteger(line.lineNo) || line.lineNo < 1) throw new InputError("Each lineNo must be a positive integer.")
    if (numbers.has(line.lineNo)) throw new InputError("lineNo values must be unique.")
    numbers.add(line.lineNo)
    if (typeof line.quantity !== "number" || !Number.isFinite(line.quantity) || line.quantity <= 0) throw new InputError("Each quantity must be greater than zero.")
    const specification = optionalText(line.specification, "specification", 1000)
    return { lineNo: line.lineNo, itemId: uuid(line.itemId, "itemId"), quantity: line.quantity, ...(specification ? { specification } : {}) }
  })
  return { p_requester_personnel_id: requester, p_job: job, p_requested_on: requestedOn, p_lines: lines }
}

export async function createMaterialRequestHandler(request: CallableRequest<unknown>, dependencies: MaterialRequestDependencies): Promise<MaterialRequestDto> {
  const access = await requireAccess(request, "inventory", ["administrator", "inventory_staff"], dependencies.accessLookup)
  return dependencies.repository.createMaterialRequest({ p_tenant_id: access.tenantId, p_actor_user_id: access.userId, ...normalizeRequest(request.data) })
}
