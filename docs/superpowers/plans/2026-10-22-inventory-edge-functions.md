# Inventory Supabase Edge Functions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the undeployable Firebase callable backend with a tested Supabase Edge Function, deploy it, and publish the matching Firebase Hosting client.

**Architecture:** One `inventory-api` Edge Function verifies Firebase ID tokens itself, derives the caller's single tenant from the shared Supabase membership model, routes five inventory actions, and uses the runtime-only service role for tenant-scoped queries and RPCs. React keeps Firebase Authentication but replaces `httpsCallable` with authenticated HTTPS requests to the Edge endpoint; Firebase Hosting remains static-only.

**Tech Stack:** TypeScript, Supabase Edge Runtime/Deno, `jose`, `@supabase/supabase-js`, Firebase Auth Web SDK, React 19, Node/tsx contract tests, Supabase CLI, Firebase Hosting CLI.

**Spec:** `docs/superpowers/specs/2026-10-22-inventory-edge-functions-design.md`

## Global Constraints

- Own and reference only `inv_*` objects plus approved shared tables; never reference or query `svc_*`.
- Firebase Auth remains the only login provider; Supabase Auth is not introduced.
- The browser never submits tenant, actor user, or role values and never receives a service-role credential.
- Every action derives tenancy from exactly one active membership and rechecks the active tenant, inventory application, assigned role, and action allow-list.
- Inventory RLS stays enabled with no browser policies; the Edge service role bypasses RLS, so code-level tenant scoping is mandatory.
- The `inventory-api` gateway JWT check is disabled only because Firebase, not Supabase, issues the bearer token; handler verification is mandatory before action routing.
- Firebase project/audience is exactly `apps-workspace-b61a9`.
- Production CORS origins are exactly `https://app-invb61a9.web.app` and `https://app-invb61a9.firebaseapp.com`.
- Test bootstrap uses tenant key `inventory-test` and grants only `viewer`; inactive users and suspended/removed memberships are never reactivated.
- Existing database migrations and transaction RPCs remain unchanged and rollback stays forward-only.
- Work is performed on `main` because the user explicitly requested direct main-branch implementation.

## Review Focus

- A structurally valid Firebase JWT with the wrong signature, issuer, or audience must fail before any database call.
- Requests with an unapproved browser `Origin` must be rejected, while originless server requests must still require a valid Firebase token.
- Retrying after a partially completed bootstrap must converge to one active membership and one viewer assignment without reactivating disabled records.
- Replaying a stock-post idempotency key must return the original success and must not duplicate balances or audit effects.
- Unexpected Supabase, JWT, and parsing failures must expose only a stable error code, safe message, and request ID—never SQL, token, or internal details.

---

### Task 1: Edge test harness, errors, and Firebase token verification

**Files:**
- Create: `supabase/functions/package.json`
- Create: `supabase/functions/deno.json`
- Create: `supabase/functions/_shared/contracts.ts`
- Create: `supabase/functions/_shared/errors.ts`
- Create: `supabase/functions/_shared/firebase-auth.ts`
- Create: `supabase/functions/tests/firebase-auth.test.ts`
- Create: `supabase/functions/tests/errors.test.ts`

**Interfaces:**
- Consumes: Firebase project ID `apps-workspace-b61a9` and bearer-token HTTP headers.
- Produces: `verifyFirebaseIdToken(token: string, projectId: string, verifier?: TokenVerifier): Promise<FirebaseIdentity>`, `ApiError`, `toErrorResponse(error, requestId)`, and shared action DTOs.

- [ ] **Step 1: Write failing verifier and safe-error tests**

Cover a valid identity; missing/invalid bearer values; wrong signature, issuer, audience, expired token, empty UID; and internal-error redaction with a request ID.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm --prefix supabase/functions test`
Expected: FAIL because the Edge modules do not exist.

- [ ] **Step 3: Implement the minimal cross-runtime verifier and error contracts**

Use `jose.jwtVerify`/remote JWKS with `RS256`, exact issuer/audience, required non-empty subject, and injected verifier support for deterministic tests. Keep error codes identical to the former callable contract.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `npm --prefix supabase/functions test`
Expected: all focused tests pass.

- [ ] **Step 5: Commit**

```sh
git add supabase/functions
git commit -m "feat: verify Firebase tokens at the edge"
```

### Task 2: Database-derived access and first-login provisioning

**Files:**
- Create: `supabase/functions/_shared/access.ts`
- Create: `supabase/functions/_shared/provision.ts`
- Create: `supabase/functions/tests/access.test.ts`
- Create: `supabase/functions/tests/provision.test.ts`

**Interfaces:**
- Consumes: `FirebaseIdentity`, `ApiError`, Supabase client, `INVENTORY_BOOTSTRAP_TENANT_KEY`.
- Produces: `requireAccess(identity, appKey, allowedRoles, lookup): Promise<AccessContext>` and `provisionInventoryAccess(identity, input, deps): Promise<ProvisionAccessResponse>`.

- [ ] **Step 1: Write failing authorization and provisioning tests**

Port every former callable branch and add claim-free tenancy, partial-bootstrap retry, duplicate-membership denial, inactive-record denial, and rejection of tenant/role fields supplied by the client.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm --prefix supabase/functions test`
Expected: FAIL because access/provision modules do not exist.

- [ ] **Step 3: Implement access and idempotent viewer provisioning**

Derive the tenant solely from the one membership. Return the tenant key for UI context but never require or write a Firebase custom claim. Provision only into the server-configured test tenant.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm --prefix supabase/functions test`
Expected: all access and provisioning tests pass.

- [ ] **Step 5: Commit**

```sh
git add supabase/functions/_shared supabase/functions/tests
git commit -m "feat: derive inventory access from memberships"
```

### Task 3: Inventory and workflow action handlers

**Files:**
- Create: `supabase/functions/_shared/inventory.ts`
- Create: `supabase/functions/_shared/workflows.ts`
- Create: `supabase/functions/tests/inventory.test.ts`
- Create: `supabase/functions/tests/workflows.test.ts`

**Interfaces:**
- Consumes: `FirebaseIdentity`, `requireAccess`, shared DTOs, Supabase repository adapters, existing RPC names/signatures.
- Produces: `listInventoryItems`, `updateInventoryItem`, `createMaterialRequest`, and `postStockMovement` action handlers.

- [ ] **Step 1: Write failing handler tests**

Port list/search/pagination, allow-list checks, optimistic update conflict, request validation, actor/tenant injection prevention, RPC error mapping, and stock idempotency replay coverage.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm --prefix supabase/functions test`
Expected: FAIL because the action handlers do not exist.

- [ ] **Step 3: Implement the tenant-scoped repositories and handlers**

Keep role permissions and DTO shapes unchanged. Pass only `AccessContext.tenantId` and `.userId` to database queries/RPCs; retain `expectedVersion` compare-and-increment semantics.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm --prefix supabase/functions test`
Expected: all inventory/workflow tests pass.

- [ ] **Step 5: Commit**

```sh
git add supabase/functions/_shared supabase/functions/tests
git commit -m "feat: port inventory actions to edge runtime"
```

### Task 4: HTTP action router, CORS, and runtime wiring

**Files:**
- Create: `supabase/functions/_shared/http.ts`
- Create: `supabase/functions/inventory-api/index.ts`
- Modify: `supabase/config.toml`
- Create: `supabase/functions/tests/http.test.ts`
- Create: `scripts/edge-functions.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: verifier and five action handlers from Tasks 1–3; platform `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_PROJECT_ID`, `INVENTORY_ALLOWED_ORIGINS`, `INVENTORY_BOOTSTRAP_TENANT_KEY`.
- Produces: `handleInventoryHttpRequest(request, deps): Promise<Response>` and deployed function entrypoint `inventory-api`.

- [ ] **Step 1: Write failing router/CORS/source-contract tests**

Cover allowed and rejected origins, preflight, originless unauthenticated denial, malformed JSON/object/action, unknown action, token verification before handler dispatch, safe envelopes, no `svc_*`, and `verify_jwt = false` scoped only to `inventory-api`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm --prefix supabase/functions test`, then `node scripts/edge-functions.test.mjs`
Expected: FAIL because the HTTP adapter/config do not exist.

- [ ] **Step 3: Implement HTTP routing and runtime dependency construction**

Allow `OPTIONS` only for configured origins; require `POST` otherwise; verify the Firebase bearer token before dispatch; construct the service-role client only in the Edge entrypoint.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm --prefix supabase/functions test`, then `node scripts/edge-functions.test.mjs`
Expected: all focused tests pass.

- [ ] **Step 5: Commit**

```sh
git add supabase/functions supabase/config.toml scripts/edge-functions.test.mjs package.json
git commit -m "feat: expose inventory edge API"
```

### Task 5: React Edge client and claim-free access gate

**Files:**
- Modify: `src/services/firebase.ts`
- Modify: `src/services/inventory-api.ts`
- Modify: `src/services/user-access.ts`
- Modify: `src/vite-env.d.ts`
- Modify: `.env.example`
- Modify: `scripts/callable-client.test.mjs`
- Modify: `scripts/access-gate.test.mjs`

**Interfaces:**
- Consumes: Firebase `currentUser.getIdToken()`, public `VITE_SUPABASE_URL`, public `VITE_SUPABASE_PUBLISHABLE_KEY`, Edge success/error envelopes.
- Produces: unchanged public inventory API functions implemented by `callInventoryFunction<I, O>(action, input)` over `fetch`.

- [ ] **Step 1: Replace callable expectations with failing Edge client tests**

Assert token attachment, `apikey`, action/data envelope, safe error normalization, no tenant field, no token refresh, no Firebase Functions import, and missing-config/missing-user behavior.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node scripts/callable-client.test.mjs && node scripts/access-gate.test.mjs`
Expected: FAIL while the client still imports `firebase/functions` and refreshes a claim.

- [ ] **Step 3: Implement the authenticated Edge HTTP client**

Keep exported action names and UI DTOs stable. Derive the endpoint as `${VITE_SUPABASE_URL}/functions/v1/inventory-api`, use the publishable key only as `apikey`, and obtain a fresh-enough Firebase ID token from the active user.

- [ ] **Step 4: Run focused tests, TypeScript, and build**

Run: `node scripts/callable-client.test.mjs && node scripts/access-gate.test.mjs && npx tsc --noEmit && npm run build`
Expected: tests pass, TypeScript passes, and Vite produces `dist`.

- [ ] **Step 5: Commit**

```sh
git add src .env.example scripts/callable-client.test.mjs scripts/access-gate.test.mjs
git commit -m "feat: call inventory through Supabase Edge"
```

### Task 6: Remove obsolete Firebase Functions backend and update operations docs

**Files:**
- Delete: `functions/`
- Modify: `firebase.json`
- Modify: `README.md`
- Modify: `supabase/README.md`
- Modify: `scripts/deployment-docs.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: complete Edge implementation and React client.
- Produces: one documented backend path, Edge emulator/deploy commands, static-only Firebase Hosting config, and security checklist matching the new architecture.

- [ ] **Step 1: Write failing documentation/configuration tests**

Require Edge deployment, `--no-verify-jwt`, Edge secrets, Firebase Hosting-only deployment, origin configuration, and absence of Functions source/config or service-role Vite variables.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node scripts/deployment-docs.test.mjs && node scripts/edge-functions.test.mjs`
Expected: FAIL while documentation and Firebase configuration still advertise callable Functions.

- [ ] **Step 3: Remove the obsolete package and update deployment documentation**

Document local Edge testing, production secret names, service-desk coordination, public Vite values, and the exact deployment order: Edge first, Hosting second.

- [ ] **Step 4: Run the complete local verification matrix**

Run: `npm test && npm --prefix supabase/functions test && npx tsc --noEmit && npm run build`
Expected: every root and Edge test passes, TypeScript passes, and the production build succeeds.

- [ ] **Step 5: Commit**

```sh
git add -A
git commit -m "chore: retire Firebase callable backend"
```

### Task 7: Configure, deploy, and smoke-test production

**Files:**
- No committed secret files.
- Generated/ignored: production build output and local CLI state only.

**Interfaces:**
- Consumes: linked Supabase project `tehynsbnasihzktzvyzy`, Edge function `inventory-api`, Firebase Hosting target `app` / site `app-invb61a9`.
- Produces: deployed Edge API and matching static frontend at `https://app-invb61a9.web.app`.

- [ ] **Step 1: Confirm remote database and clean working tree**

Run: `npx supabase migration list && git status --short`
Expected: local/remote migrations match through `20261022000600`; working tree is clean.

- [ ] **Step 2: Configure non-secret/public build values and Edge secrets safely**

Set `FIREBASE_PROJECT_ID=apps-workspace-b61a9`, `INVENTORY_BOOTSTRAP_TENANT_KEY=inventory-test`, and `INVENTORY_ALLOWED_ORIGINS` to the two production Hosting origins without echoing secret values. Rely on Supabase-provided service-role environment variables.

- [ ] **Step 3: Deploy Edge before Hosting**

Run: `npx supabase functions deploy inventory-api --project-ref tehynsbnasihzktzvyzy --no-verify-jwt`
Expected: deployment succeeds and lists `inventory-api` as active.

- [ ] **Step 4: Smoke-test the API security boundary**

Check allowed preflight, rejected origin, and unauthenticated POST.
Expected: allowed preflight succeeds; rejected origin is forbidden; unauthenticated action is denied with the safe envelope.

- [ ] **Step 5: Deploy Firebase Hosting and smoke-test the site**

Run: `npm run build && firebase deploy --project apps-workspace-b61a9 --only hosting:app`
Expected: Hosting deploy succeeds, the live site returns HTTP 200, and its asset hash matches the new build.

- [ ] **Step 6: Final verification and release record**

Run: `npm test && npm --prefix supabase/functions test && npx tsc --noEmit && npm run build && git status --short`
Expected: all checks pass and the tracked working tree is clean.

