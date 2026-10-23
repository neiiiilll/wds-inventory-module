import { HttpsError } from "firebase-functions/v2/https"

export class InputError extends Error {}
export class ConflictError extends Error {}

export function toHttpsError(error: unknown, reference: string): HttpsError {
  if (error instanceof HttpsError) return error
  if (error instanceof InputError) return new HttpsError("invalid-argument", error.message)
  if (error instanceof ConflictError) return new HttpsError("aborted", error.message)
  return new HttpsError("internal", `The request could not be completed. Reference: ${reference}.`)
}
