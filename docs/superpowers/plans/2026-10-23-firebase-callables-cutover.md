# Firebase Callable Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the active Supabase Edge API transport with secure Firebase v2 callable Functions while preserving Supabase Postgres and the existing inventory behavior.

**Architecture:** Firebase Hosting serves React, Firebase Auth supplies signed identity and the server-issued `tenant_id` claim, and regional callable Functions perform authorization and database access with Firebase-managed secrets. Supabase remains the shared database and RPC layer; Edge stays deployed only as a temporary rollback target.

**Tech Stack:** React 19, Firebase Web SDK 13, Firebase Functions v2, Firebase Admin, Node.js 22, TypeScript 5.7, Supabase JS 2, Node test runner with `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-23-firebase-callables-cutover-design.md`

## Global Constraints

- Runtime is Node.js 22 and region is `asia-southeast1`.
- The custom claim key is exactly `tenant_id` and its value is the Supabase tenant UUID.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are Firebase secrets bound to every database-using callable.
- No browser code or `VITE_*` value contains a Supabase service credential.
- No callable accepts a tenant, actor, or role from client data.
- Every business query/RPC uses the authorized tenant ID explicitly.
- Functions may use approved shared authorization tables and `inv_*` objects only; no `svc_*` access.
- Existing Supabase migrations and transaction RPCs are not rewritten.
- Users require an explicit Inventory role; login never creates a membership or grants Viewer.

## Review Focus

- A stale but correctly signed `tenant_id` claim must fail when it no longer matches the active database membership.
- Updating claims must preserve unrelated custom claims and force a browser token refresh before business calls.
- A cross-tenant UUID must not disclose whether the record exists.
- Service-role query construction must retain tenant filters on list, update, and RPC calls.
- Hosting rollback must remain possible until the old Edge endpoint is intentionally retired.

---

### Task 1: Functions foundation, claims, and access enforcement

**Files:**
- Create: `functions/package.json`
- Create: `functions/package-lock.json`
- Create: `functions/tsconfig.json`
- Create: `functions/src/config.ts`
- Create: `functions/src/contracts.ts`
- Create: `functions/src/errors.ts`
- Create: `functions/src/supabase.ts`
- Create: `functions/src/access.ts`
- Create: `functions/src/provision.ts`
- Create: `functions/src/index.ts`
- Create: `functions/test/errors.test.ts`
- Create: `functions/test/access.test.ts`
- Create: `functions/test/provision.test.ts`
- Modify: `firebase.json`

**Interfaces:**
- Consumes: current shared Supabase tables and Firebase authenticated callable context.
- Produces: `requireAccess(request, "inventory", allowedRoles)`, `provisionInventoryAccess`, common secrets/region, safe error mapping, and a testable server-only Supabase client.

- [ ] **Step 1: Restore and update failing tests first** for error mapping, unauthenticated denial, malformed/missing/stale `tenant_id`, single active membership, explicit roles, forbidden client tenant/role fields, claim preservation, and refresh response.
- [ ] **Step 2: Run `npm --prefix functions test`** and verify failure because the Functions production modules do not exist.
- [ ] **Step 3: Implement the Node 22 TypeScript package and helpers** using the deleted callable package only as structural reference and the current Edge authorization as behavioral authority.
- [ ] **Step 4: Implement and export `provisionInventoryAccess`** with `tenant_id` synchronization and no automatic enrollment.
- [ ] **Step 5: Add `functions.source` and emulator port `5001`** without changing Hosting routing.
- [ ] **Step 6: Run `npm --prefix functions test && npm --prefix functions run build`** and require zero failures.
- [ ] **Step 7: Commit** with message `feat: restore secure Firebase callable foundation`.

### Task 2: Inventory and workflow callable parity

**Files:**
- Create: `functions/src/inventory.ts`
- Create: `functions/src/material-requests.ts`
- Create: `functions/src/stock.ts`
- Create: `functions/test/inventory.test.ts`
- Create: `functions/test/material-requests.test.ts`
- Create: `functions/test/stock.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: Task 1 access context, secrets, contracts, and error mapping; existing Supabase inventory tables/RPCs.
- Produces: `listInventoryItems`, `updateInventoryItem`, `createMaterialRequest`, and `postStockMovement` callable exports with the current UI DTOs.

- [ ] **Step 1: Port callable handler tests first** from the deleted Functions history and current Edge tests, changing claims to `tenant_id` and retaining current explicit-role behavior.
- [ ] **Step 2: Run focused Functions tests** and verify failures because the handlers are absent.
- [ ] **Step 3: Port inventory list/update behavior** with input allowlists, bounded paging, tenant filters, balance aggregation, and optimistic locking.
- [ ] **Step 4: Port material-request and stock-post behavior** with server-derived tenant/actor parameters and existing atomic RPC contracts.
- [ ] **Step 5: Export all callables** with the shared region, both secrets, safe correlation logging, and one-line JSDoc purposes.
- [ ] **Step 6: Run the complete Functions tests and build** and require zero failures.
- [ ] **Step 7: Commit** with message `feat: add tenant-scoped inventory callables`.

### Task 3: React cutover, documentation, and repository contracts

**Files:**
- Modify: `src/services/firebase.ts`
- Modify: `src/services/inventory-api.ts`
- Modify: `src/services/user-access.ts`
- Delete: `src/services/inventory-http.ts`
- Modify: `src/vite-env.d.ts`
- Modify: `.env.example`
- Modify: `package.json`
- Modify: `scripts/edge-client.test.mjs`
- Modify: `scripts/edge-functions.test.mjs`
- Modify: `scripts/deployment-docs.test.mjs`
- Modify: `README.md`
- Modify: `supabase/README.md`
- Create: `functions/README.md`

**Interfaces:**
- Consumes: Task 1/2 callable names, DTOs, region, and provisioning refresh contract.
- Produces: regional `firebaseFunctions`, typed `httpsCallable` wrappers, claim-refresh login flow, updated security/deployment contracts, and per-function documentation.

- [ ] **Step 1: Rewrite client and deployment contract tests first** to require Firebase Functions, reject browser Supabase values, and require token refresh after claim changes.
- [ ] **Step 2: Run focused root tests** and verify they fail against the active Edge transport.
- [ ] **Step 3: Initialize regional Firebase Functions and replace Edge fetch** while preserving exported DTOs and safe client error messages.
- [ ] **Step 4: Remove browser Supabase configuration and active Edge scripts** while leaving the deployed Edge source available for rollback.
- [ ] **Step 5: Document every callable and deployment/rollback procedure** including both secret commands and the cross-tenant smoke test.
- [ ] **Step 6: Run `npm test`, `npx tsc --noEmit`, and `npm run build`** and require zero failures.
- [ ] **Step 7: Commit** with message `feat: switch inventory client to Firebase callables`.

### Task 4: Final security verification and deployment

**Files:**
- Verify only; modify implementation files only for test-proven defects.

**Interfaces:**
- Consumes: complete callable backend and React cutover.
- Produces: verified local build, deployed Functions/Hosting, function inventory, region evidence, and rollback-ready release.

- [ ] **Step 1: Run the complete local verification matrix** including Functions tests/build, root tests/typecheck/build, `git diff --check`, and source/secret/table scans.
- [ ] **Step 2: Reauthenticate Firebase CLI** for project `apps-workspace-b61a9` without exposing credentials.
- [ ] **Step 3: Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`** through interactive Firebase secret prompts.
- [ ] **Step 4: Deploy Functions and list deployed functions/regions**; diagnose and repair any deployment failure before continuing.
- [ ] **Step 5: Smoke-test authentication, provisioning, listing, and cross-tenant denial** with available test identities.
- [ ] **Step 6: Build and deploy Firebase Hosting** only after callable smoke tests pass.
- [ ] **Step 7: Report files, commands, deployed names/region, unresolved external test prerequisites, and rollback instructions.**

