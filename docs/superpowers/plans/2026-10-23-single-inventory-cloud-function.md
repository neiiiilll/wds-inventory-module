# Single Inventory Cloud Function Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch React to one Firebase `inventory` callable using `INVENTORY_BACKEND`, preserving Apps Core tenant and role authority.

**Architecture:** A Firebase v2 callable dispatches an explicit operation envelope into tested Inventory domain handlers and tenant-scoped Supabase repositories. React keeps existing service methods and response types but calls the Firebase SDK instead of Edge HTTP.

**Tech Stack:** React, TypeScript, Firebase Authentication, Firebase Functions v2, Node.js 22, Supabase Postgres.

**Spec:** `docs/superpowers/specs/2026-10-23-single-inventory-cloud-function-design.md`

## Global Constraints

- One exported callable `inventory`, region `asia-southeast1`, maxInstances 5, timeoutSeconds 60.
- Independent JSON secret `INVENTORY_BACKEND`; no credential output or frontend secret.
- Apps Core database membership is the sole tenant and Inventory role authority; no custom-claim mutations.
- Service Desk sources, deployment, secrets, claims and `svc_*` data remain unchanged.
- Preserve all current DTOs, role restrictions and tenant-scoped queries.
- Keep the existing Edge endpoint available for explicit rollback; do not route React to two APIs automatically.
- Do not migrate browser demo workflow storage or change database schema.

## Review Focus

- A valid Firebase login alone must never grant tenant access or create membership.
- Unknown operations, inherited object keys and identity-bearing envelope fields must fail closed.
- Viewer denial must precede malformed mutation input validation.
- Public Cloud Run invocation enables callable transport only; Firebase auth remains enforced inside the handler.
- The deployment selector must include the function name and exclude all Service Desk resources.

---

### Task 1: Single callable and current database authority

**Files:** `functions/src/index.ts`, new `functions/src/gateway.ts`, `functions/src/access.ts`, `functions/src/provision.ts`, `functions/test/*.test.ts`.

**Interfaces:** `dispatchInventory(request, dependencies)` validates `{ operation, input }` and routes exactly five operations; `inventory` is the only export registered for deployment. Existing domain handler signatures remain callable-request based. Access no longer depends on tenant claims; provisioning becomes read-only.

- [ ] Add gateway tests for auth/verified-email rejection before secrets, project audience mismatch, exact operation allowlist, strict envelope, handler dispatch, and safe errors.
- [ ] Update access/provision tests to prove database-derived tenancy and zero Firebase Admin claim writes.
- [ ] Run focused tests and observe meaningful failures before implementation.
- [ ] Implement gateway, single endpoint and read-only provisioning; preserve query/stock/request validation.
- [ ] Run `npm run test:functions` and `npm run build:functions`; require zero failures.

### Task 2: React callable transport and release documentation

**Files:** `src/services/inventory-api.ts`, new `src/services/inventory-callable.ts`, `scripts/edge-client.test.mjs`, `scripts/production-env.test.mjs`, `scripts/deployment-docs.test.mjs`, `package.json`, `README.md`, `functions/README.md`, `supabase/README.md`.

**Interfaces:** Existing React API exports remain unchanged. Transport invokes `httpsCallable` in `asia-southeast1`, sends `{ operation, input }`, unwraps `.data`, and maps Firebase error codes to the existing `InventoryApiError`.

- [ ] Test every client wrapper routes to the single function, preserves DTOs, omits client tenancy and uses safe errors.
- [ ] Implement callable transport without requiring Supabase browser configuration.
- [ ] Update production config verification to verify Firebase project and remove dependence on a Supabase public key for callable use.
- [ ] Document function purposes, inputs/outputs, auth/tenant checks, tables/RPCs, JSON secret schema and React example.
- [ ] Add an exact single-function deploy script; update documentation tests to the new canonical architecture while keeping Edge rollback tooling.
- [ ] Run full `npm test`, React `npx tsc --noEmit`, Functions build and `npm run build`.

### Task 3: Review, deploy and verify

**Interfaces:** Verified function and React builds become a sequential Function-then-Hosting release.

- [ ] Obtain independent final review; fix material issues before deployment.
- [ ] Record existing Firebase functions and Service Desk metadata; check secret version existence without reading its value.
- [ ] Deploy only `functions:inventory:inventory`; confirm the live callable rejects anonymous requests and no other function was altered.
- [ ] Deploy only `hosting:app`, confirm HTTP 200 and the current generated bundle.
- [ ] Report live evidence, test results and any authenticated acceptance checks still needing signed-in users.
- [ ] Commit and push approved changes to `main` per the user's standing branch preference after checks pass.

## Release evidence and remaining access step

The implementation passed the full application suite, 149 Functions tests, 50 retained Edge tests, React type check, Functions build and React production build. Independent review found two gateway defects; both were reproduced with failing tests, fixed and verified with the full green suite.

Firebase created `inventory` as ACTIVE in `asia-southeast1` on Node.js 22, with `INVENTORY_BACKEND` version 1. The before/after `serviceDesk` metadata was exactly unchanged. The deployer could not set the new service's invoker IAM policy; an anonymous POST returned a transport-level non-JSON HTTP 403. Hosting has therefore not been updated to the new callable. The existing Edge deployment remains the live React path until the invoker access step in `functions/README.md` is completed.

The CLI also reported that the regional Artifact Registry repository has no cleanup policy. No `--force` cleanup policy was applied to this shared repository.
