# Inventory Supabase and Firebase Callables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the prototype browser-to-Supabase integration with the canonical multitenant inventory schema and tenant-authorized Firebase callable Functions.

**Architecture:** Dependency-ordered Supabase migrations create only `inv_*` objects plus narrowly required shared indexes and inventory seed rows. TypeScript second-generation Firebase callables own the service-role client and revalidate Firebase UID, tenant claim, active membership, application, and role on every request. React uses typed regional callable wrappers and never receives Supabase credentials or chooses a tenant.

**Tech Stack:** PostgreSQL/Supabase migrations and RPCs, Firebase Cloud Functions 2nd gen on Node.js 22, TypeScript 5.7, `@supabase/supabase-js`, `firebase-admin`, Firebase Web SDK 13, React 19, Vite 8, Node test runner with `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-22-inventory-supabase-callables-design.md`

## Global Constraints

- Treat the 2026-10-22 pasted schema as canonical; retire the two prototype migrations instead of layering onto them.
- Own only `inv_*` tables and `app_key = 'inventory'`; never create, alter, query, or migrate any `svc_*` table.
- Shared tables may only receive the composite uniqueness and one-membership-per-user constraints inventory requires, after service desk coordination.
- Every business table has `tenant_id`; every child-to-parent reference is one composite foreign key over `(tenant_id, parent_id)`.
- Use `CREATE ... IF NOT EXISTS` and catalog-guarded `DO` blocks; never drop shared tables.
- Keep RLS enabled on every inventory table with no policies; revoke browser roles and grant RPC execution only to `service_role`.
- The service role bypasses RLS, so every callable must run `requireAccess` and every query/RPC must use its returned `tenantId`.
- Firebase Authentication is the only login system; Supabase Auth is not used.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` use `defineSecret` and never appear in React.
- The client never supplies a tenant or role. The `tenant_key` custom claim is a hint and must be revalidated on every business call.
- One user belongs to exactly one tenant. Test self-provisioning grants only `viewer` and is disabled when `INVENTORY_BOOTSTRAP_TENANT_KEY` is empty.
- Preserve optimistic `version` checks, movement idempotency, atomic numbering, atomic balance posting, workflow links, and `audit_events`.
- Use `asia-southeast1` for Functions and `VITE_FIREBASE_FUNCTIONS_REGION` so client and backend regions match.
- Follow the repository style: TypeScript, default component exports, balanced JSX, and double quotes for strings containing apostrophes.

## Review Focus

- A Firebase token with a valid UID but a stale or forged `tenant_key` must receive `permission-denied` and no record-existence detail; covered in Task 5.
- A user with two memberships, even if both are active, must be denied instead of selecting one arbitrarily; covered in Task 5.
- Concurrent duplicate stock posts with the same idempotency key must change balances exactly once and return the original movement; covered in Task 3.
- A batch containing valid rows followed by a cross-tenant or insufficient-stock row must roll back every header, line, balance, and audit change; covered in Task 3.
- A first-login retry after a partial network failure must reuse the same app user/membership/role and preserve unrelated Firebase custom claims; covered in Task 6.

---

### Task 1: Canonical shared prerequisites and inventory catalog migration

**Files:**
- Delete: `supabase/migrations/20261014000000_inventory_schema.sql`
- Delete: `supabase/migrations/20261019000000_role_based_access.sql`
- Create: `supabase/migrations/20261022000100_inventory_shared_prerequisites.sql`
- Create: `supabase/migrations/20261022000200_inventory_catalog_stock.sql`
- Create: `scripts/inventory-migrations.test.mjs`
- Modify: `package.json`
- Delete: `scripts/rbac-migration.test.mjs`

**Interfaces:**
- Consumes: the shared table/column contract listed in the approved spec.
- Produces: seeded application/roles/test tenant and catalog/stock tables through `inv_stock_movement_lines`, each with tenant-safe keys.

- [ ] **Step 1: Write the failing migration contract test**

Create `scripts/inventory-migrations.test.mjs` with assertions that:

```js
assert.deepEqual(migrationNames, [
  "20261022000100_inventory_shared_prerequisites.sql",
  "20261022000200_inventory_catalog_stock.sql",
])
assert.doesNotMatch(allInventorySql, /\bsvc_[a-z0-9_]+\b/i)
assert.match(prerequisites, /'inventory'\s*,\s*'Inventory'/)
assert.match(prerequisites, /'administrator'.*'inventory_staff'.*'viewer'/s)
assert.match(prerequisites, /'inventory-test'\s*,\s*'Inventory Test Tenant'/)
assert.match(catalog, /foreign key\s*\(tenant_id,\s*item_id\)/i)
assert.doesNotMatch(catalog, /foreign key\s*\(item_id\)[\s\S]*foreign key\s*\(tenant_id\)/i)
```

Also assert that the prerequisite migration catalog-checks all eleven approved shared tables, creates unique indexes on `(tenant_id, id)` for `tenant_memberships`, `departments`, and `personnel`, and creates a unique index on `tenant_memberships(user_id)`.

- [ ] **Step 2: Run the contract test to verify it fails**

Run: `node scripts/inventory-migrations.test.mjs`

Expected: FAIL because the canonical migration chain is absent.

- [ ] **Step 3: Replace the prototype migration history with shared prerequisites**

Delete the two prototype migrations. Implement `20261022000100_inventory_shared_prerequisites.sql` with:

- `CREATE EXTENSION IF NOT EXISTS pgcrypto`;
- a `DO` block that raises a descriptive exception for missing shared tables/columns;
- catalog-guarded required shared unique indexes;
- idempotent `INSERT ... ON CONFLICT ... DO UPDATE` seeds for `inventory`, its three roles, and `inventory-test`.

Do not create a shared table and do not mention a `svc_*` identifier.

- [ ] **Step 4: Create catalog and stock tables in dependency order**

Implement `20261022000200_inventory_catalog_stock.sql` for:

`inv_suppliers`, `inv_categories`, `inv_units`, `inv_warehouses`, `inv_storage_locations`, `inv_inventory_items`, `inv_inventory_assets`, `inv_inventory_balances`, `inv_stock_movements`, and `inv_stock_movement_lines`.

Preserve supplied columns/checks/defaults; add `UNIQUE (tenant_id, id)` to every parent with `id`, tenant-local code/tag/idempotency uniqueness, and merged composite foreign keys.

- [ ] **Step 5: Point the root test script at the canonical migration test**

Replace `scripts/rbac-migration.test.mjs` in `package.json#scripts.test` with `scripts/inventory-migrations.test.mjs` while leaving other tests intact until their owning tasks replace them.

- [ ] **Step 6: Run the migration contract test**

Run: `node scripts/inventory-migrations.test.mjs`

Expected: PASS for the two canonical migrations created in this task and their prerequisites/catalog assertions.

- [ ] **Step 7: Commit**

```bash
git add package.json scripts/inventory-migrations.test.mjs supabase/migrations
git commit -m "feat: add canonical inventory catalog migrations"
```

### Task 2: Workflow tables, integrity, indexes, triggers, and RLS lockdown

**Files:**
- Create: `supabase/migrations/20261022000300_inventory_workflows.sql`
- Create: `supabase/migrations/20261022000400_inventory_integrity_rls.sql`
- Modify: `scripts/inventory-migrations.test.mjs`

**Interfaces:**
- Consumes: catalog/stock parents from Task 1 and approved shared tables.
- Produces: the complete normalized workflow schema plus locked-down inventory privileges.

- [ ] **Step 1: Extend the failing contract test for the workflow and security migrations**

Assert the exact table set from `inv_material_requests` through `inv_document_counters`, and assert:

```js
assert.match(integrity, /alter table public\.inv_inventory_items enable row level security/i)
assert.doesNotMatch(integrity, /create\s+policy/i)
assert.match(integrity, /revoke all on table public\.inv_inventory_items from anon, authenticated/i)
assert.match(integrity, /create or replace function public\.inv_set_updated_at\(\)/i)
```

For every child in the pasted schema, assert one `(tenant_id, parent_id)` foreign key. Assert tenant-local unique indexes for document numbers and `(tenant_id, parent_id, line_no)` for line tables.

Extend `migrationNames` to require the two Task 1 files followed by `20261022000300_inventory_workflows.sql` and `20261022000400_inventory_integrity_rls.sql`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/inventory-migrations.test.mjs`

Expected: FAIL on missing workflow, integrity, RLS, or index contracts.

- [ ] **Step 3: Create the workflow migration**

Implement `20261022000300_inventory_workflows.sql` in this dependency order:

1. material requests and lines;
2. supplier quotations and lines;
3. purchase requests, lines, and approvals;
4. purchase orders, lines, and dispatches;
5. inspection reports, lines, and supplier returns;
6. requisition issue slips, lines, releases, and material returns;
7. stock counts and lines;
8. document counters.

Use the canonical columns, checks, `version` fields, parent composite uniqueness, and merged tenant foreign keys.

- [ ] **Step 4: Create the integrity and RLS migration**

Implement `20261022000400_inventory_integrity_rls.sql` with tenant-first indexes, `inv_set_updated_at()`, idempotently recreated triggers on inventory tables with `updated_at`, and a catalog-driven block that:

- enables RLS on every `inv_*` table;
- drops every policy found in `pg_policies` for those tables;
- revokes all table privileges from `anon` and `authenticated`.

The block must select only tables matching `inv\_%` with an escaped underscore and must never operate on shared or service desk tables.

- [ ] **Step 5: Run the migration contract test**

Run: `node scripts/inventory-migrations.test.mjs`

Expected: PASS for the complete table, composite-key, trigger, index, and RLS contract.

- [ ] **Step 6: Commit**

```bash
git add scripts/inventory-migrations.test.mjs supabase/migrations/20261022000300_inventory_workflows.sql supabase/migrations/20261022000400_inventory_integrity_rls.sql
git commit -m "feat: add inventory workflow schema and RLS lockdown"
```

### Task 3: Atomic database RPCs and SQL integration tests

**Files:**
- Create: `supabase/migrations/20261022000500_inventory_rpcs.sql`
- Create: `supabase/tests/inventory_rpcs_test.sql`
- Modify: `scripts/inventory-migrations.test.mjs`

**Interfaces:**
- Produces:
  - `public.inv_next_document_number(p_tenant_id uuid, p_document_type text, p_document_date date DEFAULT CURRENT_DATE) RETURNS text`
  - `public.inv_create_material_request(p_tenant_id uuid, p_actor_user_id uuid, p_requester_personnel_id uuid, p_job text, p_requested_on date, p_lines jsonb) RETURNS jsonb`
  - `public.inv_post_stock_movement(p_tenant_id uuid, p_actor_user_id uuid, p_movement_type text, p_source_type text, p_source_reference text, p_idempotency_key text, p_notes text, p_lines jsonb) RETURNS jsonb`
- Grants: execution only to `service_role`.

- [ ] **Step 1: Add failing RPC contract assertions**

Assert all three exact signatures, `SECURITY DEFINER`, `SET search_path = public, pg_temp`, allowed document types, `INSERT ... ON CONFLICT` counter increment, `(tenant_id, idempotency_key)` replay lookup, deterministic balance ordering, negative-balance rejection, audit insertion, and revoke/grant statements.

Extend `migrationNames` to require `20261022000500_inventory_rpcs.sql` as the fifth and final canonical migration.

- [ ] **Step 2: Write pgTAP transaction tests before the functions**

Create `supabase/tests/inventory_rpcs_test.sql` covering:

- two document numbers in the same month become `MR-202610-000001` and `MR-202610-000002`;
- another tenant starts at `MR-202610-000001`;
- material request header, lines, number, and audit row are created together;
- receipt changes quantity/value/average cost;
- issue uses stored average cost, not caller-provided issue cost;
- duplicate idempotency key returns the original movement and unchanged balance;
- cross-tenant item/location and insufficient stock raise an exception and leave counts/balances/audits unchanged;
- a multi-line failure rolls back earlier valid lines.

Wrap fixtures and assertions in a transaction that rolls back.

- [ ] **Step 3: Run the contract test to verify it fails**

Run: `node scripts/inventory-migrations.test.mjs`

Expected: FAIL because RPC SQL is absent.

- [ ] **Step 4: Implement the numbering and material-request RPCs**

Implement the exact interfaces above. The material-request RPC validates the line array, tenant-owned personnel/items, obtains `MR` numbering, inserts header/lines, and appends `audit_events` in its transaction.

- [ ] **Step 5: Implement atomic stock posting**

Validate JSON types before casts, claim idempotency before balance mutation, normalize/aggregate duplicate item-location lines, create missing zero balances, and lock rows ordered by item/location UUID. Positive lines add caller cost; negative lines use locked average cost. Reject negative quantity/value and return `{movementId, postedAt, replayed}`.

- [ ] **Step 6: Restrict RPC execution**

Revoke every RPC from `PUBLIC`, `anon`, and `authenticated`; grant the exact signatures to `service_role` only.

- [ ] **Step 7: Run database tests where the local Supabase stack is available**

Run: `npx supabase db reset && npx supabase test db`

Expected: all pgTAP assertions pass. If Docker/local Supabase is unavailable, record that explicitly and still run the contract test; do not claim SQL integration success.

- [ ] **Step 8: Run the portable contract test**

Run: `node scripts/inventory-migrations.test.mjs`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add scripts/inventory-migrations.test.mjs supabase/migrations/20261022000500_inventory_rpcs.sql supabase/tests/inventory_rpcs_test.sql
git commit -m "feat: add atomic inventory database RPCs"
```

### Task 4: TypeScript Functions foundation and secret-backed Supabase client

**Files:**
- Delete: `functions/index.js`
- Create: `functions/tsconfig.json`
- Create: `functions/src/config.ts`
- Create: `functions/src/contracts.ts`
- Create: `functions/src/errors.ts`
- Create: `functions/src/supabase.ts`
- Create: `functions/test/errors.test.ts`
- Modify: `functions/package.json`
- Modify: `functions/package-lock.json`
- Modify: `firebase.json`

**Interfaces:**
- Produces `FUNCTION_REGION = "asia-southeast1"`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INVENTORY_BOOTSTRAP_TENANT_KEY`, `getSupabaseAdmin(): SupabaseClient`, `toHttpsError(error: unknown, requestId: string): HttpsError`, and shared backend DTO/role types.

- [ ] **Step 1: Write the failing error-mapping tests**

Use `node:test` to assert validation maps to `invalid-argument`, version conflicts to `aborted`, known `HttpsError` values pass through, and unknown errors map to `internal` without exposing their original message.

- [ ] **Step 2: Run the Functions test to verify it fails**

Run: `npm --prefix functions test`

Expected: FAIL because TypeScript test infrastructure/modules are absent.

- [ ] **Step 3: Convert the Functions package to TypeScript**

Set `main` to `lib/index.js`; add scripts `build`, `test`, and `emulate`; add runtime `@supabase/supabase-js`; add dev dependencies `typescript`, `tsx`, and `@types/node`; generate the lockfile through `npm --prefix functions install`.

Configure strict CommonJS output from `src` to `lib` for Node.js 22 and exclude tests from production output.

- [ ] **Step 4: Add configuration, contracts, errors, and singleton Supabase client**

Use `defineSecret` for the two Supabase values and `defineString` for the optional bootstrap tenant. Construct the client with auth persistence/refresh/session detection disabled. Cache by current secret values so emulator tests can inject cleanly.

- [ ] **Step 5: Register Functions source and emulators**

Add `functions.source = "functions"` and emulator entries for Auth `9099`, Functions `5001`, Hosting `5000`, and Emulator UI to `firebase.json` without changing Hosting rewrites.

- [ ] **Step 6: Run Functions tests and build**

Run: `npm --prefix functions test && npm --prefix functions run build`

Expected: tests pass and `tsc` exits 0.

- [ ] **Step 7: Commit**

```bash
git add firebase.json functions
git commit -m "build: add TypeScript Firebase Functions foundation"
```

### Task 5: Tenant and role authorization helper

**Files:**
- Create: `functions/src/access.ts`
- Create: `functions/test/access.test.ts`

**Interfaces:**
- Consumes: `getSupabaseAdmin()` and `InventoryRole` from Task 4.
- Produces:

```ts
export interface AccessContext {
  userId: string
  membershipId: string
  tenantId: string
  tenantKey: string
  roleKey: InventoryRole
}
export interface AccessLookup {
  findUser(firebaseUid: string): Promise<AppUserRecord | null>
  listMemberships(userId: string): Promise<MembershipRecord[]>
  findTenant(tenantId: string): Promise<TenantRecord | null>
  listRoles(membershipId: string, appKey: "inventory"): Promise<RoleRecord[]>
}
export function createSupabaseAccessLookup(client: SupabaseClient): AccessLookup
export function requireAccess<T>(request: CallableRequest<T>, appKey: "inventory", allowedRoles: readonly InventoryRole[], lookup?: AccessLookup): Promise<AccessContext>
```

- [ ] **Step 1: Write failing authorization tests**

Use an in-memory `AccessLookup` to test success and separate denials for missing auth, missing claim, inactive user, zero memberships, two memberships, inactive membership, inactive tenant, mismatched tenant claim, missing inventory role, inactive application/unknown role, and disallowed role.

Explicitly assert stale/forged claims and cross-tenant UUID knowledge both yield only `permission-denied`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix functions test -- test/access.test.ts`

Expected: FAIL because `requireAccess` does not exist.

- [ ] **Step 3: Implement `requireAccess` against the interface**

Require exactly one active membership and at least one active inventory role, then choose the single allowed role deterministically by the order in `allowedRoles`. Reject ambiguous duplicate role records.

- [ ] **Step 4: Implement the Supabase lookup adapter**

Use explicit column lists and separate tenant-scoped shared-table queries. Limit membership and role reads to two rows where uniqueness is expected. Never accept tenant/app/role values from callable data.

- [ ] **Step 5: Run authorization tests and Functions build**

Run: `npm --prefix functions test && npm --prefix functions run build`

Expected: all tests pass and TypeScript compiles.

- [ ] **Step 6: Commit**

```bash
git add functions/src/access.ts functions/test/access.test.ts
git commit -m "feat: enforce inventory tenant access in callables"
```

### Task 6: First-login provisioning callable

**Files:**
- Create: `functions/src/provision.ts`
- Create: `functions/src/index.ts`
- Create: `functions/test/provision.test.ts`

**Interfaces:**
- Consumes: Firebase Admin Auth, bootstrap parameter, Supabase client, and `requireAccess`.
- Produces:

```ts
export interface ProvisionDependencies {
  repository: ProvisionRepository
  auth: Pick<Auth, "getUser" | "setCustomUserClaims">
  bootstrapTenantKey: string
}
export function provisionInventoryAccessHandler(request: CallableRequest<unknown>, deps: ProvisionDependencies): Promise<ProvisionAccessResponse>
export const provisionInventoryAccess: CallableFunction
```

- [ ] **Step 1: Write failing provisioning tests**

Cover unauthenticated calls, existing valid membership claim recovery, inactive user response, empty-bootstrap denial, idempotent viewer creation, retry after repository partial-state recovery, preservation of unrelated custom claims, rejection of client tenant/role fields, and `refreshToken: true` after claim change.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix functions test -- test/provision.test.ts`

Expected: FAIL because the handler is absent.

- [ ] **Step 3: Implement the repository and handler**

`ProvisionRepository` must resolve existing access by Firebase UID and idempotently upsert app user, one membership in the configured active tenant, and only `membership_roles(inventory, viewer)`. On retry it reuses existing UUIDs and completes missing rows.

Preserve Firebase claims with `{...customClaims, tenant_key: tenantKey}`. Do not set an application role claim.

- [ ] **Step 4: Export the regional callable**

Initialize Firebase Admin once. Export `onCall({region: FUNCTION_REGION, secrets: [...]}, ...)` from `functions/src/index.ts`; generate and log a request ID without logging tokens or request bodies.

- [ ] **Step 5: Run tests and build**

Run: `npm --prefix functions test && npm --prefix functions run build`

Expected: all tests pass and TypeScript compiles.

- [ ] **Step 6: Commit**

```bash
git add functions/src/provision.ts functions/src/index.ts functions/test/provision.test.ts
git commit -m "feat: provision inventory viewer access on first login"
```

### Task 7: List-items and optimistic-update callables

**Files:**
- Create: `functions/src/inventory.ts`
- Create: `functions/test/inventory.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Produces:

```ts
export function listInventoryItemsHandler(request: CallableRequest<ListItemsInput>, deps: InventoryDependencies): Promise<ListItemsResponse>
export function updateInventoryItemHandler(request: CallableRequest<UpdateItemInput>, deps: InventoryDependencies): Promise<InventoryItemDto>
export const listInventoryItems: CallableFunction
export const updateInventoryItem: CallableFunction
```

`ListItemsInput` is `{search?: string; limit?: number; cursor?: string}`. `UpdateItemInput` contains `id`, `expectedVersion`, and a whitelisted `changes` object; neither accepts `tenantId`, role, status, or replacement version.

- [ ] **Step 1: Write failing handler tests**

Assert viewer/staff/admin list access, viewer update denial, limit clamping to `1..100`, normalized search, tenant filters on item and balance reads, stable DTOs, no cross-tenant existence disclosure, whitelist enforcement, and zero-row update mapping to `aborted`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix functions test -- test/inventory.test.ts`

Expected: FAIL because handlers are absent.

- [ ] **Step 3: Implement list-items**

Authorize all three roles. Select explicit catalog fields plus tenant-scoped balance/location data, aggregate quantities without client-side tenant selection, and implement deterministic `(item_code, id)` cursor pagination.

- [ ] **Step 4: Implement optimistic item update**

Authorize `administrator` and `inventory_staff`. Update only `name`, `description`, `category_id`, `unit_id`, `supplier_id`, `minimum_quantity`, and `active`, filtering by authorized tenant, ID, and expected version while incrementing the version.

- [ ] **Step 5: Export both callables and run tests/build**

Run: `npm --prefix functions test && npm --prefix functions run build`

Expected: all tests pass and TypeScript compiles.

- [ ] **Step 6: Commit**

```bash
git add functions/src/inventory.ts functions/src/index.ts functions/test/inventory.test.ts
git commit -m "feat: add tenant-scoped inventory item callables"
```

### Task 8: Material-request and stock-posting callables

**Files:**
- Create: `functions/src/material-requests.ts`
- Create: `functions/src/stock.ts`
- Create: `functions/test/material-requests.test.ts`
- Create: `functions/test/stock.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Produces:

```ts
export function createMaterialRequestHandler(request: CallableRequest<CreateMaterialRequestInput>, deps: WorkflowDependencies): Promise<MaterialRequestDto>
export function postStockMovementHandler(request: CallableRequest<PostStockMovementInput>, deps: WorkflowDependencies): Promise<PostStockMovementResponse>
export const createMaterialRequest: CallableFunction
export const postStockMovement: CallableFunction
```

- [ ] **Step 1: Write failing material-request tests**

Assert staff/admin access, viewer denial, no tenant/document/status/version fields, non-empty lines, positive quantities, duplicate-line rejection, tenant-owned optional IDs, and exact RPC arguments using authorized tenant/actor.

- [ ] **Step 2: Write failing stock-post tests**

Assert staff/admin access, viewer denial, required bounded idempotency key, allowed movement types, non-empty non-zero lines, duplicate line-number rejection, no tenant/actor override, exact RPC arguments, replay response preservation, and safe mapping of insufficient-stock/cross-tenant database errors to `failed-precondition`/`not-found` without SQL detail.

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npm --prefix functions test -- test/material-requests.test.ts test/stock.test.ts`

Expected: FAIL because handlers are absent.

- [ ] **Step 4: Implement material-request validation and RPC adapter**

Trim text fields, cap line counts and string lengths, reject unknown keys, and invoke `inv_create_material_request` only after `requireAccess` returns.

- [ ] **Step 5: Implement stock validation and RPC adapter**

Require idempotency keys of 8–128 visible characters, cap line count, validate finite decimal inputs, and invoke `inv_post_stock_movement` with the authorized tenant/user IDs.

- [ ] **Step 6: Export callables and run tests/build**

Run: `npm --prefix functions test && npm --prefix functions run build`

Expected: all tests pass and TypeScript compiles.

- [ ] **Step 7: Commit**

```bash
git add functions/src functions/test
git commit -m "feat: add material request and stock posting callables"
```

### Task 9: Typed React callable client and access gate

**Files:**
- Modify: `src/services/firebase.ts`
- Create: `src/services/inventory-api.ts`
- Rewrite: `src/services/user-access.ts`
- Modify: `src/services/access-control.ts`
- Modify: `src/components/AccessGate.tsx`
- Modify: `.env.example`
- Create: `scripts/callable-client.test.mjs`
- Modify: `scripts/access-control.test.mjs`
- Modify: `scripts/access-gate.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Delete: `src/services/firebase-claims.ts`
- Delete: `src/services/supabase.ts`
- Delete: `supabase/functions/firebase-auth-bridge/index.ts`
- Delete: `supabase/functions/firebase-auth-bridge/deno.json`
- Delete: `scripts/firebase-claims.test.mjs`

**Interfaces:**
- Consumes: callable names and DTOs from Tasks 6–8.
- Produces `firebaseFunctions`, `callInventoryFunction<I, O>(name, input): Promise<O>`, `provisionInventoryAccess()`, `listInventoryItems()`, `updateInventoryItem()`, `createMaterialRequest()`, and `postStockMovement()`.

- [ ] **Step 1: Write failing callable-client and access-gate contract tests**

Assert `getFunctions(firebaseApp, region)`, `httpsCallable`, no Supabase imports/env names, token refresh via `getIdToken(true)` when provisioning requests it, role-key mapping, loading/retry/disabled states, and safe client messages for `permission-denied`, `aborted`, and `internal`.

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `node scripts/callable-client.test.mjs && node scripts/access-gate.test.mjs`

Expected: FAIL because the callable client and new gate flow are absent.

- [ ] **Step 3: Initialize regional Firebase Functions**

In `firebase.ts`, default the region to `asia-southeast1` and export `firebaseFunctions`. Update `.env.example` with `VITE_FIREBASE_FUNCTIONS_REGION=asia-southeast1` and remove both `VITE_SUPABASE_*` entries.

- [ ] **Step 4: Implement typed callable wrappers and error normalization**

Define matching client DTOs and expose the five wrappers. Reject use before Firebase is configured. Convert callable codes into a typed `InventoryApiError` without exposing raw `details`.

- [ ] **Step 5: Rewrite access models and gate**

Remove email-based bootstrap logic and role-history models. Map `administrator`, `inventory_staff`, and `viewer` to the UI labels used by the existing workflow permission functions. The gate provisions, force-refreshes the token if requested, displays disabled/unauthorized separately from retryable errors, and rechecks on focus/interval through the callable.

- [ ] **Step 6: Remove browser Supabase and bridge code**

Delete the obsolete client and Supabase Edge Function files. Remove root `@supabase/supabase-js`; it now exists only in `functions/package.json`. Update the root lockfile with `npm install`.

- [ ] **Step 7: Update the root test command and run focused tests**

Replace `firebase-claims.test.mjs` with `callable-client.test.mjs` and update access-control expectations to assert no bootstrap email behavior.

Run: `node scripts/callable-client.test.mjs && node scripts/access-control.test.mjs && node scripts/access-gate.test.mjs`

Expected: PASS.

- [ ] **Step 8: Run TypeScript and build**

Run: `npx tsc --noEmit && npm run build`

Expected: both exit 0.

- [ ] **Step 9: Commit**

```bash
git add .env.example package.json package-lock.json src scripts supabase/functions
git commit -m "feat: call inventory backend through Firebase Functions"
```

### Task 10: Callable-backed inventory list and removal of direct snapshot synchronization

**Files:**
- Create: `src/components/InventoryItemsPage.tsx`
- Create: `scripts/inventory-items-ui.test.mjs`
- Modify: `src/App.tsx`
- Modify: `src/components/Settings.tsx`
- Modify: `src/index.css`
- Modify: `package.json`
- Delete: `src/services/workflow-repository.ts`
- Delete: `scripts/supabase-workflow.test.mjs`
- Delete: `src/components/UserAccess.tsx`
- Delete: `scripts/user-access-ui.test.mjs`
- Delete: `scripts/user-access.test.mjs`

**Interfaces:**
- Consumes: `listInventoryItems` and `updateInventoryItem` from Task 9.
- Produces a callable-backed inventory route with initial loading, empty, populated, retry, background refresh, and optimistic-conflict states.

- [ ] **Step 1: Write the failing UI contract test**

Assert the new component calls `listInventoryItems`, renders `Loading inventory…`, `No inventory items found`, a retry button, preserves rows during background refresh, disables duplicate update submission, and recognizes `InventoryApiError.code === "aborted"` with a reload message.

Also assert `App.tsx` no longer imports `workflow-repository`, `supabase`, or `isSupabaseConfigured` and renders `<InventoryItemsPage>` for the inventory route.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/inventory-items-ui.test.mjs`

Expected: FAIL because the component is absent and direct snapshot synchronization remains.

- [ ] **Step 3: Implement the callable-backed inventory page**

Use explicit request state rather than Suspense. Preserve the last successful rows during refresh, debounce search, cancel stale response application with a request sequence, and show category/unit/balance/version fields returned by the callable.

- [ ] **Step 4: Remove direct snapshot synchronization from `App.tsx`**

Keep local demo state for workflow screens, but remove all direct remote load/save behavior and browser fallback messaging. Route the inventory page to `InventoryItemsPage`; other screens must not make Supabase calls.

- [ ] **Step 5: Remove the obsolete role-management UI**

Because administrative role management is explicitly out of scope and direct shared-table access is forbidden, remove `UserAccess` and replace the Settings section with read-only account, tenant, and role information plus sign-out.

- [ ] **Step 6: Update CSS and test script**

Add only the loading/error/empty/refresh styles needed by the new component. Replace deleted tests in `package.json#scripts.test` with `inventory-items-ui.test.mjs`.

- [ ] **Step 7: Run focused and full root verification**

Run: `node scripts/inventory-items-ui.test.mjs && npm test && npx tsc --noEmit && npm run build`

Expected: all commands exit 0.

- [ ] **Step 8: Commit**

```bash
git add package.json src scripts
git commit -m "feat: load inventory items through callable backend"
```

### Task 11: Deployment guide, emulator workflow, and final verification

**Files:**
- Rewrite: `supabase/README.md`
- Modify: `README.md`
- Create: `functions/.env.example`
- Create: `scripts/deployment-docs.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Documents the exact setup, testing, deployment, rollback, and security verification process for the completed system.

- [ ] **Step 1: Write the failing documentation contract test**

Create `scripts/deployment-docs.test.mjs` to require:

- `supabase db reset`, `supabase db push`, and `supabase test db`;
- both `firebase functions:secrets:set` commands;
- `INVENTORY_BOOTSTRAP_TENANT_KEY` non-production warning;
- `firebase emulators:start --only auth,functions,hosting`;
- `asia-southeast1` client/server region matching;
- deploy Functions before Hosting;
- RLS/service-role warning and security checklist;
- service desk coordination for shared unique indexes.

Add `node scripts/deployment-docs.test.mjs` to the root `test` script after `site-config.test.mjs`.

- [ ] **Step 2: Run the documentation test to verify it fails**

Run: `node scripts/deployment-docs.test.mjs`

Expected: FAIL because the new instructions are absent.

- [ ] **Step 3: Rewrite Supabase and project setup documentation**

Document fresh local setup, shared-schema prerequisite coordination, migration application, SQL tests, Firebase secrets/params, emulator commands, token-refresh smoke test, cross-tenant denial test, production bootstrap disablement, deploy order, and rollback by forward migration rather than deleting applied migration history.

- [ ] **Step 4: Add safe Functions environment example**

List variable names and local placeholders only. Never include a service-role value, access token, real tenant secret, or Firebase private key.

- [ ] **Step 5: Run the complete verification matrix**

Run:

```bash
npm test
npx tsc --noEmit
npm run build
npm --prefix functions test
npm --prefix functions run build
node scripts/deployment-docs.test.mjs
```

Expected: every command exits 0 with no test failures or TypeScript errors.

When Docker and Supabase CLI are available, also run:

```bash
npx supabase db reset
npx supabase test db
firebase emulators:exec --only auth,functions "npm --prefix functions test"
```

Expected: database integration tests and callable emulator tests pass. Report unavailable infrastructure separately rather than claiming those checks passed.

- [ ] **Step 6: Inspect the final change set against security invariants**

Run:

```bash
rg -n "service_role|SUPABASE_SERVICE_ROLE_KEY|VITE_SUPABASE|\.from\(" src
rg -n "\bsvc_[a-z0-9_]+\b" supabase/migrations functions/src
git diff --check
git status --short
```

Expected: no browser secret/direct-Supabase hits; no `svc_*` database identifiers; no whitespace errors; only intended files changed.

- [ ] **Step 7: Commit**

```bash
git add README.md supabase/README.md functions/.env.example scripts/deployment-docs.test.mjs package.json
git commit -m "docs: add inventory backend deployment guide"
```
