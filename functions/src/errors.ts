import { HttpsError } from "firebase-functions/v2/https"

export class InputError extends Error {}
export class ConflictError extends Error {}
export class MissingRecordError extends Error {}
export class DuplicateRecordError extends Error {}
export class PreconditionError extends Error {}

export function toHttpsError(error: unknown, requestId: string): HttpsError {
  if (error instanceof HttpsError) return error
  if (error instanceof InputError) return new HttpsError("invalid-argument", error.message)
  if (error instanceof ConflictError) return new HttpsError("aborted", error.message)
  if (error instanceof MissingRecordError) return new HttpsError("not-found", error.message)
  if (error instanceof DuplicateRecordError) return new HttpsError("already-exists", error.message)
  if (error instanceof PreconditionError) return new HttpsError("failed-precondition", error.message)
  return new HttpsError("internal", `The request could not be completed. Reference: ${requestId}.`)
}
