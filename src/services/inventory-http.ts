export type InventoryApiErrorCode =
  | "unauthenticated"
  | "permission-denied"
  | "invalid-argument"
  | "not-found"
  | "already-exists"
  | "failed-precondition"
  | "aborted"
  | "internal"

const SAFE_MESSAGES: Record<InventoryApiErrorCode, string> = {
  unauthenticated: "Sign in again to continue.",
  "permission-denied": "You do not have permission to perform this action.",
  "invalid-argument": "Check the entered information and try again.",
  "not-found": "The requested inventory record was not found.",
  "already-exists": "That inventory record already exists.",
  "failed-precondition": "The inventory operation cannot be completed in its current state.",
  aborted: "This record changed. Refresh it and try again.",
  internal: "The inventory service could not complete the request. Try again.",
}

export class InventoryApiError extends Error {
  constructor(readonly code: InventoryApiErrorCode, message = SAFE_MESSAGES[code]) {
    super(message)
    this.name = "InventoryApiError"
  }
}

export interface InventoryEdgeTransport {
  endpoint: string
  publishableKey: string
  getIdToken(): Promise<string | null>
  fetchImpl?: typeof fetch
}

function safeCode(value: unknown): InventoryApiErrorCode {
  return typeof value === "string" && value in SAFE_MESSAGES ? value as InventoryApiErrorCode : "internal"
}

export async function invokeInventoryEdge<I, O>(
  transport: InventoryEdgeTransport,
  action: string,
  input: I,
): Promise<O> {
  if (!transport.endpoint || !transport.publishableKey) throw new InventoryApiError("internal")
  const token = await transport.getIdToken()
  if (!token) throw new InventoryApiError("unauthenticated")
  try {
    const response = await (transport.fetchImpl ?? fetch)(transport.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        apikey: transport.publishableKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ action, data: input }),
    })
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new InventoryApiError("internal")
    }
    if (!response.ok) {
      const error = body && typeof body === "object" && "error" in body ? (body as { error?: unknown }).error : null
      const code = error && typeof error === "object" && "code" in error ? safeCode((error as { code?: unknown }).code) : "internal"
      throw new InventoryApiError(code)
    }
    if (!body || typeof body !== "object" || !("data" in body)) throw new InventoryApiError("internal")
    return (body as { data: O }).data
  } catch (error) {
    if (error instanceof InventoryApiError) throw error
    throw new InventoryApiError("internal")
  }
}
