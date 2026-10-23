# Inventory Supabase Edge Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Inventory from five Firebase callable Functions to the single Apps Core Supabase `inventory-api` Edge Function, prove tenant isolation, and retire only the five Inventory Firebase Functions.

**Architecture:** Firebase Auth continues to issue the user identity token. The React client sends that token and the browser-safe Apps Core publishable key to one Supabase Edge endpoint; the endpoint verifies the token, derives the only permitted tenant from Supabase membership records, and performs tenant-bound `inv_*` queries and RPCs with server-only credentials. Firebase Inventory Functions remain live until Edge, client, and cross-tenant production acceptance pass.

**Tech Stack:** React 19, Vite 8, TypeScript 5.7, Firebase Auth, Supabase Edge Runtime/Deno, `@supabase/supabase-js`, `jose`, Node test runner, Firebase CLI, Supabase CLI

**Spec:** `docs/superpowers/specs/2026-10-23-inventory-supabase-edge-cutover-design.md`

## Global Constraints

- Target only Supabase Apps Core project `oqsgzdkljtxtpwdzptnw` and Firebase project `apps-workspace-b61a9`.
- Firebase Auth proves identity; active Supabase `tenant_memberships` is the sole Inventory tenant authority.
- Never put a service-role or secret key in a `VITE_*` variable, committed file, command output, or log.
- Never read, write, migrate, deploy, modify, or delete Service Desk code, the Firebase `serviceDesk` function, `SERVICE_DESK_BACKEND`, or any `svc_*` table.
- Keep the five Firebase Inventory Functions live until Edge and live cross-tenant acceptance pass.
- Do not deploy Firebase Hosting without a separate explicit release confirmation at the cutover gate.
- Delete Firebase resources only by an exact five-name allowlist and verify `serviceDesk` before and afterward.
- Do not modify the shared database schema or reapply Inventory migrations during this cutover.

## Review Focus

- A valid token from another Firebase project must receive `unauthenticated` before database access; Task 1 exercises wrong audience, issuer, and signature.
- A user with zero, two, inactive, or suspended memberships must receive `permission-denied`; Task 1 exercises each membership state.
- A browser-supplied tenant or role field must never alter the server-derived access context; Tasks 1 and 2 exercise strict input envelopes and foreign-tenant inputs.
- Network, non-JSON, unknown-code, and credential-bearing server errors must map to sanitized client errors; Task 2 exercises each failure form.
- A partial cutover or failed acceptance must leave the callable-backed production client recoverable; Tasks 4 through 6 enforce deployment and rollback gates.

---

### Task 1: Validate and harden the canonical Edge authorization boundary

**Files:**
- Modify: `supabase/functions/_shared/firebase-auth.ts`
- Modify: `supabase/functions/_shared/access.ts`
- Modify: `supabase/functions/_shared/http.ts`
- Modify: `supabase/functions/tests/firebase-auth.test.ts`
- Modify: `supabase/functions/tests/access.test.ts`
- Modify: `supabase/functions/tests/http.test.ts`

**Interfaces:**
- Consumes: Firebase bearer ID token and Supabase shared authorization records.
- Produces: `verifyFirebaseIdToken(token, projectId) -> FirebaseIdentity`, `requireAccess(identity, "inventory", allowedRoles, lookup) -> AccessContext`, and `handleInventoryHttpRequest(request, deps) -> Response` with database-derived `tenantId` only.

- [ ] **Step 1: Extend failing tests for the approved authorization contract**

Add assertions that `FirebaseIdentity` contains no trusted tenant, `requireAccess` derives the tenant with no custom claim, zero/multiple/inactive memberships fail, client tenant fields fail, and wrong-project/expired/malformed tokens fail before an action runs.

- [ ] **Step 2: Run the targeted Edge tests and confirm any new assertion fails before implementation**

Run: `npx --yes deno test --allow-env --allow-net supabase/functions/tests/firebase-auth.test.ts supabase/functions/tests/access.test.ts supabase/functions/tests/http.test.ts`

Expected: at least one newly added assertion fails if the retained implementation does not satisfy the approved contract; otherwise record that the retained implementation already satisfies it and do not create a no-op production change.

- [ ] **Step 3: Make the minimum Edge changes required by the tests**

Keep `FirebaseIdentity` limited to verified identity fields. Ensure access is resolved by Firebase UID, exactly one active membership, active tenant/application, and one explicit supported Inventory role. Reject unknown envelope fields before action dispatch and never accept `tenantId`, `tenant_id`, role, or actor authority from the client.

- [ ] **Step 4: Run all Edge unit tests**

Run: `npx --yes deno test --allow-env --allow-net supabase/functions/tests`

Expected: all Edge tests pass with no live credentials.

- [ ] **Step 5: Commit the authorization boundary**

```bash
git add supabase/functions/_shared supabase/functions/tests scripts/edge-functions.test.mjs
git commit -m "test: lock inventory edge authorization"
```

### Task 2: Switch the React Inventory transport from callables to Edge

**Files:**
- Create: `src/services/inventory-http.ts`
- Modify: `src/services/inventory-api.ts`
- Modify: `src/services/user-access.ts`
- Modify: `src/services/firebase.ts`
- Modify: `.env.example`
- Modify: `src/vite-env.d.ts`
- Modify: `scripts/edge-client.test.mjs`

**Interfaces:**
- Consumes: `firebaseAuth.currentUser.getIdToken()`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Produces: `invokeInventoryEdge<I, O>(transport, action, input) -> Promise<O>` and the unchanged public action functions exported by `src/services/inventory-api.ts`.

- [ ] **Step 1: Rewrite the client transport tests to fail on the callable implementation**

Assert the client sends exactly `{ action, data }`, Firebase token in `Authorization`, publishable key in `apikey`, and JSON content type. Assert missing user/config stops before fetch; non-JSON responses, unknown codes, network errors, and server messages containing sensitive text become the existing safe `InventoryApiError` messages. Assert provisioning no longer refreshes a token or expects `refreshToken`.

- [ ] **Step 2: Run the client test and confirm failure**

Run: `node scripts/edge-client.test.mjs`

Expected: FAIL because `src/services/inventory-api.ts` still imports `firebase/functions` and `src/services/inventory-http.ts` is absent.

- [ ] **Step 3: Implement the Edge HTTP transport**

Create `InventoryEdgeTransport { endpoint: string; publishableKey: string; getIdToken(): Promise<string | null>; fetchImpl?: typeof fetch }` and `invokeInventoryEdge<I, O>()`. Construct the endpoint as `${VITE_SUPABASE_URL without trailing slash}/functions/v1/inventory-api`. Preserve the existing public action names and response DTOs while removing `refreshToken` from `ProvisionAccessResponse`.

- [ ] **Step 4: Remove callable-only client initialization and claim-refresh behavior**

Keep Firebase app and Auth initialization in `src/services/firebase.ts`, remove `getFunctions` and `firebaseFunctions`, and make `provisionCurrentUser()` call the read-only Edge access resolver once. Add only the browser-safe Supabase URL and publishable-key variable declarations to `.env.example` and `src/vite-env.d.ts`.

- [ ] **Step 5: Run the client and UI tests**

Run: `node scripts/edge-client.test.mjs && node scripts/access-gate.test.mjs && node scripts/inventory-items-ui.test.mjs`

Expected: all tests pass; source checks find no `firebase/functions`, callable region, service-role key, or client tenant authority in the active React transport.

- [ ] **Step 6: Commit the client cutover**

```bash
git add src/services src/vite-env.d.ts .env.example scripts/edge-client.test.mjs
git commit -m "feat: call inventory through Supabase Edge"
```

### Task 3: Make Edge the documented and test-enforced canonical Inventory API

**Files:**
- Modify: `README.md`
- Modify: `supabase/README.md`
- Modify: `functions/README.md`
- Modify: `scripts/deployment-docs.test.mjs`
- Modify: `scripts/edge-functions.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: deployment identifiers and security decisions from the approved spec.
- Produces: canonical Edge test/deploy commands and rollback-only Firebase Function documentation.

- [ ] **Step 1: Change documentation-contract tests to require the Edge architecture**

Require project ref `oqsgzdkljtxtpwdzptnw`, `inventory-api`, `--no-verify-jwt`, Firebase token verification, database membership authority, `VITE_SUPABASE_PUBLISHABLE_KEY`, explicit Hosting gate, cross-tenant acceptance, exact five-function retirement, and preserved `serviceDesk`. Reject historical project ref `tehynsbnasihzktzvyzy` from active commands.

- [ ] **Step 2: Run the documentation tests and confirm failure**

Run: `node scripts/deployment-docs.test.mjs && node scripts/edge-functions.test.mjs`

Expected: FAIL because the current docs call Edge rollback-only and Firebase callables canonical.

- [ ] **Step 3: Rewrite the operational documentation and scripts**

Document Edge as canonical, Firebase Functions as rollback-only during the window, safe client variables, exact secret/deploy commands, smoke tests, Hosting approval gate, explicit five-name deletion, post-delete `serviceDesk` verification, and secret cleanup deferral. Add `test:edge` and `deploy:edge` scripts; rename callable deployment commands as rollback-only rather than removing their source yet.

- [ ] **Step 4: Run documentation tests**

Run: `node scripts/deployment-docs.test.mjs && node scripts/edge-functions.test.mjs`

Expected: both pass and no active command targets the historical Supabase project.

- [ ] **Step 5: Commit canonical API documentation**

```bash
git add README.md supabase/README.md functions/README.md scripts/deployment-docs.test.mjs scripts/edge-functions.test.mjs package.json
git commit -m "docs: make inventory edge API canonical"
```

### Task 4: Verify the complete local release candidate

**Files:**
- Modify only files required to fix failures caused by Tasks 1 through 3.

**Interfaces:**
- Consumes: canonical Edge handler and React transport.
- Produces: a tested build that can be deployed without changing Hosting or Firebase Functions.

- [ ] **Step 1: Run the full repository test suite**

Run: `npm test`

Expected: all Node, Edge contract, UI, migration, and retained rollback Function tests pass.

- [ ] **Step 2: Build the React application**

Run: `npm run build`

Expected: Vite production build succeeds with no TypeScript or missing-environment compile errors.

- [ ] **Step 3: Build the retained rollback Functions**

Run: `npm run build:functions`

Expected: TypeScript build succeeds, proving rollback source remains usable.

- [ ] **Step 4: Review the release diff and secret scan**

Run: `git diff --check` and a targeted `rg` scan for service-role or secret key values in tracked browser files.

Expected: no whitespace errors, credentials, `svc_*` references in Inventory Edge source, or accidental Service Desk changes.

- [ ] **Step 5: Commit only necessary verification fixes**

If verification required fixes, commit them with `fix: verify inventory edge cutover`; otherwise create no empty commit.

### Task 5: Deploy and smoke-test `inventory-api` in Apps Core

**Files:**
- No tracked file changes expected.

**Interfaces:**
- Consumes: Supabase CLI authorization for Apps Core and the tested Edge bundle.
- Produces: deployed `inventory-api` in project `oqsgzdkljtxtpwdzptnw`; Firebase Functions and Hosting remain unchanged.

- [ ] **Step 1: Confirm the exact Supabase target and current Function inventory**

Run: `npx supabase projects list` and `npx supabase functions list --project-ref oqsgzdkljtxtpwdzptnw`.

Expected: Apps Core ownership/access is confirmed. Stop if the target does not match; never use the currently linked project implicitly.

- [ ] **Step 2: Confirm required database API objects without changing schema**

Use read-only checks for `app_users`, `tenant_memberships`, `tenants`, `applications`, `membership_roles`, `app_roles`, required `inv_*` tables, and RPCs `inv_next_document_number`, `inv_create_material_request`, and `inv_post_stock_movement`.

Expected: every dependency exists in Apps Core; no `svc_*` object is queried or changed.

- [ ] **Step 3: Set non-browser Edge configuration**

Run `npx supabase secrets set` with `FIREBASE_PROJECT_ID=apps-workspace-b61a9` and production `INVENTORY_ALLOWED_ORIGINS` for project ref `oqsgzdkljtxtpwdzptnw`.

Expected: command succeeds without printing server credentials. Do not set or overwrite platform-managed Supabase credentials.

- [ ] **Step 4: Deploy only `inventory-api`**

Run: `npx supabase functions deploy inventory-api --project-ref oqsgzdkljtxtpwdzptnw --no-verify-jwt`

Expected: the one Edge Function deploys successfully; no database migration, Firebase Function, Hosting site, or Service Desk resource changes.

- [ ] **Step 5: Perform unauthenticated and invalid-token smoke tests**

Call the deployed endpoint with the Apps Core publishable key but without a Firebase token, then with a malformed or wrong-project bearer token.

Expected: sanitized `401 unauthenticated` responses; no database data or server detail is returned.

- [ ] **Step 6: Inspect sanitized Edge logs and invocation region**

Expected: request IDs and safe failure metadata only, no Firebase token or Supabase credential. Record `x-sb-edge-region`; pin the client invocation to the database region later only if measurement shows a benefit.

### Task 6: Complete authenticated tenant-isolation acceptance and release the client

**Files:**
- Modify: ignored `.env.local` only, with browser-safe values.

**Interfaces:**
- Consumes: two controlled verified Firebase users in different active tenants, known tenant-scoped fixtures, and the deployed Edge endpoint.
- Produces: evidence that the Edge-backed client is safe to release; no Firebase Function deletion yet.

- [ ] **Step 1: Configure local browser-safe Apps Core values**

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in ignored `.env.local`. Never add a service-role key.

- [ ] **Step 2: Run authenticated request-validation, role, and workflow smoke tests**

With a valid Firebase token, verify malformed JSON and unsupported actions return sanitized `400 invalid-argument`. Verify Viewer list/mutation rules, Administrator or Inventory Staff updates, stale-version conflicts, material request creation, stock posting, and idempotent replay.

Expected: permissions and safe error codes match the unit tests; transactions and replay behavior match database state.

- [ ] **Step 3: Run cross-tenant tests with two controlled users**

Attempt Tenant A list/update/workflow operations using Tenant B item, location, personnel, and asset identifiers, including a mixed valid/foreign batch.

Expected: Tenant B data is neither returned nor disclosed; writes fail safely and mixed batches roll back completely.

- [ ] **Step 4: Obtain explicit Hosting release confirmation**

Present local test/build results, Edge deployment identity, and tenant-isolation evidence. Do not continue without explicit authorization to update production Hosting.

- [ ] **Step 5: Deploy only the Inventory Hosting target after confirmation**

Run: `npm run deploy:hosting`

Expected: `app-invb61a9` deploys; no Firebase Function is created, updated, or deleted.

- [ ] **Step 6: Verify the production client uses Edge**

Repeat login, access resolution, list, one safe authorized mutation, and one denied cross-tenant request from the deployed site. Inspect browser network traffic to confirm calls go to Apps Core `inventory-api`, not Firebase callable URLs.

Expected: production acceptance passes before any Function retirement.

### Task 7: Retire only the five Firebase Inventory Functions

**Files:**
- Modify after successful deletion: `firebase.json`
- Modify after successful deletion: `package.json`
- Modify after successful deletion: `README.md`
- Modify after successful deletion: `functions/README.md`
- Modify after successful deletion: `scripts/deployment-docs.test.mjs`

**Interfaces:**
- Consumes: successful production Edge acceptance from Task 6 and a pre-delete Firebase Function inventory.
- Produces: only `serviceDesk` remaining from the affected set; local Firebase Inventory source retained as rollback-only during the rollback window.

- [ ] **Step 1: Record the pre-delete Firebase Function list**

Run: `firebase functions:list --project apps-workspace-b61a9`

Expected: the five exact Inventory names and `serviceDesk` are visible. Stop if names or regions differ.

- [ ] **Step 2: Delete only the exact Inventory allowlist**

Run: `firebase functions:delete provisionInventoryAccess listInventoryItems updateInventoryItem createMaterialRequest postStockMovement --region asia-southeast1 --project apps-workspace-b61a9 --force`

Expected: only the five named Inventory Functions are deleted. Do not use wildcards, codebase-wide deletion, or a broad deploy.

- [ ] **Step 3: Verify Service Desk survived unchanged**

Run: `firebase functions:list --project apps-workspace-b61a9`

Expected: `serviceDesk` remains in its existing region/version, and none of the five Inventory names remains.

- [ ] **Step 4: Disable accidental callable redeployment locally**

Remove the active Inventory Functions block and Functions emulator entry from `firebase.json`, remove callable deployment from default package scripts/tests, and mark `functions/` as rollback-only. Retain the source and exact restoration instructions until the rollback window closes.

- [ ] **Step 5: Run final tests and builds**

Run: `npm test && npm run build && npm run build:functions`

Expected: canonical Edge/client tests and production build pass; retained rollback Functions still build independently.

- [ ] **Step 6: Commit retirement metadata**

```bash
git add firebase.json package.json README.md functions/README.md scripts/deployment-docs.test.mjs
git commit -m "chore: retire inventory Firebase functions"
```

- [ ] **Step 7: Defer secret cleanup to the rollback-window decision**

Do not delete `INVENTORY_BACKEND` in this task. Document its later cleanup separately and verify no Service Desk resource references it before any future deletion.

### Task 8: Final review and operational handoff

**Files:**
- Modify only documentation defects found during final review.

**Interfaces:**
- Consumes: final repository and deployed-state evidence.
- Produces: verified handoff with rollback path, function inventory, region, and billing controls.

- [ ] **Step 1: Run the complete final verification**

Run: `npm test`, `npm run build`, `npm run build:functions`, `npx supabase functions list --project-ref oqsgzdkljtxtpwdzptnw`, and `firebase functions:list --project apps-workspace-b61a9`.

Expected: tests/builds pass, `inventory-api` is present in Apps Core, the five Inventory Firebase Functions are absent, and `serviceDesk` remains.

- [ ] **Step 2: Review billing and observability controls**

Confirm Supabase usage monitoring/spend controls, Edge logs, and Firebase billing show the intended post-cutover traffic and no continued Inventory callable requests.

- [ ] **Step 3: Review the branch against the spec**

Verify no secrets, old active project reference, `svc_*` changes, broad Firebase deployment command, or unresolved rollback ambiguity remains.

- [ ] **Step 4: Commit any documentation-only corrections**

If needed, commit with `docs: finalize inventory edge handoff`; otherwise create no empty commit.
