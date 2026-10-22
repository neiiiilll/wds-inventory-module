export type ApiErrorCode =
  | "unauthenticated"
  | "permission-denied"
  | "invalid-argument"
  | "not-found"
  | "already-exists"
  | "failed-precondition"
  | "aborted"
  | "internal"

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  "permission-denied": 403,
  "invalid-argument": 400,
  "not-found": 404,
  "already-exists": 409,
  "failed-precondition": 412,
  aborted: 409,
  internal: 500,
}

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export class InputError extends ApiError {
  constructor(message: string) { super("invalid-argument", message) }
}
export class ConflictError extends ApiError {
  constructor(message: string) { super("aborted", message) }
}
export class MissingRecordError extends ApiError {
  constructor(message: string) { super("not-found", message) }
}
export class DuplicateRecordError extends ApiError {
  constructor(message: string) { super("already-exists", message) }
}
export class PreconditionError extends ApiError {
  constructor(message: string) { super("failed-precondition", message) }
}

export function toErrorResponse(error: unknown, requestId: string, headers: HeadersInit = {}): Response {
  const safe = error instanceof ApiError
    ? error
    : new ApiError("internal", `The request could not be completed. Reference: ${requestId}.`)
  return Response.json(
    { error: { code: safe.code, message: safe.message, requestId } },
    { status: STATUS_BY_CODE[safe.code], headers },
  )
}
