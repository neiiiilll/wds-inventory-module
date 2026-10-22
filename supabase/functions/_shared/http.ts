import type { InventoryAction } from "./contracts.ts"
import { ApiError, InputError, toErrorResponse } from "./errors.ts"
import { extractBearerToken, type FirebaseIdentity } from "./firebase-auth.ts"

type ActionHandler = (identity: FirebaseIdentity, data: unknown) => Promise<unknown>

export interface HttpDependencies {
  projectId: string
  allowedOrigins: ReadonlySet<string>
  verifyToken(token: string, projectId: string): Promise<FirebaseIdentity>
  actions: Record<InventoryAction, ActionHandler>
  logFailure?: (metadata: { requestId: string; action: string | null; uid: string | null; failureType: string }) => void
}

const ACTIONS = new Set<InventoryAction>([
  "provisionInventoryAccess",
  "listInventoryItems",
  "updateInventoryItem",
  "createMaterialRequest",
  "postStockMovement",
])

function corsHeaders(origin: string | null, allowedOrigins: ReadonlySet<string>): Headers {
  const headers = new Headers({ "vary": "Origin" })
  if (origin && allowedOrigins.has(origin)) {
    headers.set("access-control-allow-origin", origin)
    headers.set("access-control-allow-methods", "POST")
    headers.set("access-control-allow-headers", "authorization, apikey, content-type")
  }
  return headers
}

function requestEnvelope(value: unknown): { action: InventoryAction; data: Record<string, unknown> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError("Request body must be an object.")
  const envelope = value as Record<string, unknown>
  if (Object.keys(envelope).some((key) => key !== "action" && key !== "data")) throw new InputError("The request contains an unsupported field.")
  if (typeof envelope.action !== "string" || !ACTIONS.has(envelope.action as InventoryAction)) throw new InputError("The requested inventory action is invalid.")
  if (!envelope.data || typeof envelope.data !== "object" || Array.isArray(envelope.data)) throw new InputError("Action data must be an object.")
  return { action: envelope.action as InventoryAction, data: envelope.data as Record<string, unknown> }
}

export async function handleInventoryHttpRequest(request: Request, deps: HttpDependencies): Promise<Response> {
  const requestId = crypto.randomUUID()
  const origin = request.headers.get("origin")
  const headers = corsHeaders(origin, deps.allowedOrigins)
  let action: string | null = null
  let uid: string | null = null
  try {
    if (origin && !deps.allowedOrigins.has(origin)) throw new ApiError("permission-denied", "This origin is not permitted.")
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers })
    if (request.method !== "POST") throw new InputError("Only POST requests are supported.")
    const token = extractBearerToken(request.headers.get("authorization"))
    const identity = await deps.verifyToken(token, deps.projectId)
    uid = identity.uid
    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new InputError("Request body must be valid JSON.")
    }
    const envelope = requestEnvelope(body)
    action = envelope.action
    const data = await deps.actions[envelope.action](identity, envelope.data)
    return Response.json({ data }, { status: 200, headers })
  } catch (error) {
    deps.logFailure?.({
      requestId,
      action,
      uid,
      failureType: error instanceof Error ? error.name : "UnknownError",
    })
    return toErrorResponse(error, requestId, headers)
  }
}
