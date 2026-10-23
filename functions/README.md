# Inventory callable Functions

Canonical API: Firebase v2 callable Functions, Node.js 22, region `asia-southeast1`, with a 60-second timeout and at most five instances per callable. The React SDK uses `httpsCallable` with automatically attached Firebase Authentication; do not call these functions as the old Edge action/data HTTP endpoint. See [root setup and release procedure](../README.md) and [database setup](../supabase/README.md).

## Shared security and secrets

Every callable binds one Firebase JSON secret named `INVENTORY_BACKEND`, independently from Service Desk's `SERVICE_DESK_BACKEND`. Set it interactively with `firebase functions:secrets:set INVENTORY_BACKEND --project apps-workspace-b61a9` and enter one compact JSON object with exactly `url`, `secretKey`, `firebaseProjectId`, and `appKey`. The required values are the Apps Core URL `https://oqsgzdkljtxtpwdzptnw.supabase.co`, a current `sb_secret_...` server key from that project, Firebase project `apps-workspace-b61a9`, and application key `inventory`. The parser rejects missing, extra, or mismatched fields without logging the secret. The service client initializes lazily after authentication checks, with session persistence and refresh disabled. Secret values never belong in browser configuration, logs, or Git; redeploy Functions after a secret change.

All business callables require Firebase authentication, a verified email, and a valid `request.auth.token.tenant_id` UUID. Before handling input, they query `app_users`, `tenant_memberships`, `tenants`, `applications`, `membership_roles`, and `app_roles` to require an active user, exactly one active membership, an active tenant/Inventory application, and an explicit permitted Inventory role. The database tenant must match the claim. Every query/RPC receives that authorized UUID because the server secret has elevated access and bypasses RLS. No callable accesses service desk tables.

Inputs use exact allowlists: never send tenant, actor, role, status, document number, or replacement version fields. UUID references must belong to the authorized tenant. Expected failures use callable codes `unauthenticated`, `permission-denied`, `invalid-argument`, `not-found`, `failed-precondition`, and `aborted`; unexpected errors expose a correlation reference only. React preserves its fixed safe messages and discards backend messages/details. Server logs contain correlation references and safe codes, not input, SQL, tokens, or secrets.

## Callable reference

### provisionInventoryAccess

Purpose: resolve existing Inventory access and synchronize the Firebase tenant claim. Input: `{}` only. Output: `{ status: "active" | "disabled", firebaseUid, email, displayName, tenantKey, roleKey, refreshToken }`, where `roleKey` is `administrator`, `inventory_staff`, `viewer`, or null for disabled access.

Auth/tenant: Firebase authentication and verified email are required; this is the only callable permitted before `tenant_id` exists. It reads the shared authorization tables listed above and never enrolls users, creates memberships, or grants roles. Any explicit supported Inventory role may provision. It preserves unrelated Firebase custom claims and writes the database tenant UUID to `tenant_id` through Admin Auth only when needed. Inactive users return disabled access and `refreshToken: false` without changing claims. When active access returns `refreshToken: true`, force `getIdToken(true)` and provision once more; a repeated refresh response fails closed. Secret: `INVENTORY_BACKEND`; no inventory RPC.

### listInventoryItems

Purpose: return one tenant's catalog and aggregate stock balances. Input: `{ search?: string, limit?: number, cursor?: string }`; limit defaults to 50, clamps to 1–100, search normalizes whitespace/case with a 100-character maximum, and cursor is opaque. Output: `{ items: InventoryItemDto[], nextCursor: string | null }`. Items preserve `id`, `itemCode`, `name`, `description`, `categoryId`, `categoryName`, `unitId`, `unitName`, `unitSymbol`, `supplierId`, `minimumQuantity`, `quantity`, `active`, and `version`.

Auth/tenant: shared authentication, membership, and claim checks; Administrator, Inventory Staff, or Viewer may list. Reads tenant-filtered `inv_inventory_items` and `inv_inventory_balances`, joining `inv_categories` and `inv_units` through tenant-bound foreign keys. Stable ordering uses item code then ID. Secret: `INVENTORY_BACKEND`; no RPC.

### updateInventoryItem

Purpose: change allowed item fields using optimistic concurrency. Input: `{ id, expectedVersion, changes }`, with positive integer `expectedVersion`. Nonempty changes may contain only `name`, `description`, `categoryId`, `unitId`, `supplierId`, `minimumQuantity`, and `active`. Output: the updated `InventoryItemDto` with the incremented version.

Auth/tenant: shared checks; Administrator or Inventory Staff only. Updates `inv_inventory_items` using tenant, item ID, and expected-version predicates together; related category/unit/supplier references are tenant-bound. Reads category/unit labels and tenant-filtered `inv_inventory_balances` for the response. Missing, foreign-tenant, or stale-version items return the same safe `aborted` conflict. Secret: `INVENTORY_BACKEND`; no RPC.

### createMaterialRequest

Purpose: create an atomic draft request. Input: `{ requesterPersonnelId?: UUID, job?: string, requestedOn?: "YYYY-MM-DD", lines: [{ lineNo, itemId, quantity, specification? }] }`. Require 1–200 lines, unique positive integer line numbers, UUID items, and positive finite quantities. Output: `{ requestId, requestNo, version, status: "draft" }`.

Auth/tenant: shared checks; Administrator or Inventory Staff only. Calls `inv_create_material_request` with server-derived `p_tenant_id` and `p_actor_user_id`. The RPC validates tenant personnel/item references and atomically writes `inv_material_requests`, `inv_material_request_lines`, `inv_document_counters` via `inv_next_document_number`, and `audit_events`. The requester reference uses shared `personnel` records. Secret: `INVENTORY_BACKEND`. Foreign/missing references produce a generic failure without disclosing existence; a failed line rolls back the transaction.

### postStockMovement

Purpose: atomically post stock with idempotent retries. Input: `{ movementType, sourceType?, sourceReference?, idempotencyKey, notes?, lines: [{ lineNo, itemId, locationId, signedQuantity, unitCost, assetId? }] }`. Types: `receipt`, `issue`, `transfer`, `adjustment`, `return`, `writeoff`. Require a trimmed 1–200 character key, 1–500 lines, unique positive integer line numbers, nonzero finite signed quantities, nonnegative finite unit costs, and UUID references. Output: `{ movementId, postedAt, replayed }`; reuse the same key for retries of one logical operation.

Auth/tenant: shared checks; Administrator or Inventory Staff only. Calls `inv_post_stock_movement` with server-derived tenant and actor. The RPC validates `inv_inventory_items`, `inv_storage_locations`, and optional `inv_inventory_assets`, then atomically changes `inv_stock_movements`, `inv_stock_movement_lines`, `inv_inventory_balances`, and `audit_events`. Tenant/key replay returns the original movement without applying stock twice; insufficient stock returns `failed-precondition`. Secret: `INVENTORY_BACKEND`. Mixed invalid/cross-tenant lines must roll back all writes.

## Build and emulators

```sh
npm --prefix functions install
npm run test:functions
npm run build:functions
npm run build
npm run emulators
```

Use Node.js 22. The root `npm test` also runs the Functions tests. Authentication and malformed-request emulator tests stop before secret access and do not require a local backend secret. The current four-field configuration intentionally pins the approved Apps Core URL, so do not put the production key in `functions/.secret.local` or run emulator mutation tests against production. A disposable Supabase project would require a separately reviewed emulator-only configuration path; it is not part of this deployment.

Auth, Functions, and Hosting use ports 9099, 5001, and 5000. The production browser intentionally does not connect automatically. Run an SDK harness in a separate local process (or use equivalent devtools imports) with explicit emulator connections before sign-in. Use a dedicated emulator app and real local Auth/database fixtures; create the user's database mapping and explicit role first. Mark the emulator user's email verified using the Auth emulator UI before testing provisioning.

```js
import { initializeApp } from "firebase/app"
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth"
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions"

const app = initializeApp({ projectId: "apps-workspace-b61a9", apiKey: "emulator-only" }, "inventory-smoke")
const auth = getAuth(app)
const functions = getFunctions(app, "asia-southeast1")
connectAuthEmulator(auth, "http://127.0.0.1:9099")
connectFunctionsEmulator(functions, "127.0.0.1", 5001)
// Read fixture credentials securely in your harness; never commit real credentials.
const credential = await signInWithEmailAndPassword(auth, fixtureEmail, fixturePassword)
const provision = httpsCallable(functions, "provisionInventoryAccess")
let access = (await provision({})).data
if (access.refreshToken) {
  await credential.user.getIdToken(true)
  access = (await provision({})).data
  if (access.refreshToken) throw new Error("Claim refresh did not settle")
}
const page = (await httpsCallable(functions, "listInventoryItems")({ limit: 10 })).data
```

For deployed smoke tests use real Firebase web configuration and verified fixture accounts; omit both emulator connection calls. Use a read-only list first, then controlled disposable inventory fixtures for writes. Never print ID tokens.

## Release, smoke tests, and rollback

Before changing Firebase, verify that the URL is exactly `https://oqsgzdkljtxtpwdzptnw.supabase.co` and that the saved `sb_secret_...` value authenticates to that URL's `/rest/v1/` endpoint. Perform the check without printing the key or response data, send the key only to this approved host, and stop the release on any non-2xx response. Confirm the returned schema exposes the shared authorization tables, required `inv_*` tables, and Inventory RPCs. Never deploy a URL/key pair that has not passed this check.

Enable Blaze for the target project, set `INVENTORY_BACKEND` interactively, and grant the Functions runtime service account direct `Secret Manager Secret Accessor` access on that secret. Run tests/build/typecheck, then deploy Functions before Hosting with `npm run deploy:functions`. The Firebase configuration uses the isolated `inventory` codebase so this deploy cannot delete the shared project's `serviceDesk` function or bind its `SERVICE_DESK_BACKEND` secret. Run `firebase functions:list --project apps-workspace-b61a9` and verify all five exports in `asia-southeast1` alongside the unchanged `serviceDesk` function. Smoke-test provisioning (including missing/stale claims), list, expected-version update, material request, stock posting and same-key replay; inspect the database to verify transaction/idempotency behavior.

Use separate tenant A/B fixtures for cross-tenant reads and every mutation reference. Verify Viewer cannot mutate; unauthenticated, unverified, unassigned, and revoked users cannot gain access; forged tenant/actor/role fields are rejected. Record generic failures and unchanged foreign-tenant rows. A multi-line batch with a bad reference must leave all balances, headers, lines, counters, and audit writes unchanged. See [database integration tests](../supabase/tests/inventory_rpcs_test.sql).

Only after these checks pass, run `npm run deploy:hosting`. Keep the previous Edge deployment alive throughout the rollback window. Restore the previous compatible Hosting release first if needed; do not delete Edge settings until production acceptance. Preserve all existing migrations/RPCs and use a forward migration for database corrections.
