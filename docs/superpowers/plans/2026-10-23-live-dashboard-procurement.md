# Live Dashboard and Procurement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. The user previously selected Native execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved live Dashboard and complete procurement lifecycle using existing Apps Core records, without demo import or Service Desk changes.

**Architecture:** Extend the existing Firebase `inventory` callable with tenant-scoped read operations and explicit transactional procurement commands. Postgres owns allocation, approval, receipt, valuation, audit and idempotency invariants. React uses asynchronous live queries and commands, not the browser WorkflowState reducer.

**Tech Stack:** React 19, TypeScript, Firebase Auth and v2 Functions on Node 22, Supabase Postgres/private Storage, Node test runner, real PostgreSQL transaction tests.

**Spec:** `docs/superpowers/specs/2026-10-23-live-dashboard-procurement-design.md` (approved 2026-10-23).

## Global Constraints

- Keep one exported `inventory` callable, region `asia-southeast1`, maxInstances 5, timeoutSeconds 60, and secret `INVENTORY_BACKEND`.
- Firebase verifies identity; existing database membership/Inventory roles determine authority. Exactly one membership total must exist and be active.
- No demo import, seed-on-login, browser-state upload, demo fallback, membership/claim/IAM mutation or historical data invention.
- No Service Desk source/function/deployment/Hosting/secret/`svc_*` data changes. Shared authorization/personnel schema/data remains read-only.
- Forward-only Inventory-specific SQL only; never run blanket `supabase db push` or replay shared prerequisite/compatibility migrations.
- Initial receipt valuation is weighted-average only. Unknown tracking and FIFO/standard receipts fail with a safe setup/precondition error; no conversion or guessed balances.
- Private `inventory-documents` attachments only, PDF/PNG/JPEG, 5 MiB/file, 10 files/document. No public bucket or inline data-URL persistence.
- Database transactions and backend acceptance pass before React cutover; only deploy `functions:inventory:inventory` and `hosting:app`.
- Keep main current through verified commits; no force-push, no unrelated changes. Native implementation with one final independent review.

## Review Focus

- An actor loses eligibility between the callable check and transaction: SQL rechecks current membership/role and denies without writes (Tasks 1, 3, 5).
- Replay after a successful write carries an old version: same actor/key/payload returns its stored result; changed payload or actor conflicts (Tasks 1, 3, 4).
- Historical accepted receipts lack links: a missing link never implies permission to post again (Task 4).
- A cached/in-flight response belongs to a previous session: it never renders under a new user or tenant, including modal/draft state (Task 7).
- Uploaded files change or a user loses access before finalize/download: verify stored bytes/current parent/role, disallow overwrite and cross-tenant references (Task 6).

## File boundaries and interfaces

- `functions/src/procurement/contracts.ts`: pure TypeScript DTOs/unions, no SDKs or secrets. React imports these with `import type` only; no Functions runtime enters the browser bundle.
- `functions/src/procurement/validation.ts`, `reads.ts`, `commands.ts`, `attachments.ts`: bounded allowlists, read adapters, transaction gateway and private file handling respectively. Existing `gateway.ts`/`index.ts` register operations without adding function exports.
- New migrations `20261023000100_inventory_procurement_foundation.sql`, `...000200_inventory_procurement_reads.sql`, `...000300_inventory_procurement_documents.sql`, `...000400_inventory_procurement_receiving.sql`, `...000500_inventory_procurement_setup.sql`, `...000600_inventory_procurement_attachments.sql`: explicit Inventory objects and service-role-only RPCs. Never dynamically rewrite every schema/table policy.
- `functions/test/procurement-*.test.ts`: gateway/validation/access/repository/Storage tests. `database/test/` and `scripts/inventory-db-test.mjs`: disposable SQL fixtures and real single-/multi-connection tests. `scripts/inventory-release-check.mjs`: read-only release validation.
- `src/services/procurement-api.ts`, `use-live-inventory.ts`: callable wrappers and session-scoped request/invalidation lifecycle. `src/components/live/`: Dashboard, registers/detail/editors, receipt/setup/attachment/print views. Keep legacy demo reducer/tests intact but separated.
- `src/App.tsx`: routes included screens to live components; clearly labels out-of-scope browser demos. `functions/README.md`, root README and release progress document the expanded single-function API and exact SQL/rollback steps.

All APIs accept JSON only. Quantities/costs/totals use decimal strings, never JS-calculated authoritative amounts; validate precision against `inv_units.quantity_precision`, keep existing stored values intact, and format strings without recomputing money in binary floats. Versions are positive safe integers; unrepresentable versions fail safely.

`DocumentKind = "material_request" | "quotation" | "purchase_request" | "purchase_order" | "inspection"`. Common document summaries contain `id`, `kind`, `reference`, `date`, `status`, `version`, optional `revision`, and server-derived `availableActions`; detail adds typed lines, parent references, snapshots, history and review/receipt fields. Permissions returned in DTOs aid UI only and never authorize a mutation.

New operation names are `getInventoryDashboard`, `listProcurementDocuments`, `getProcurementDocument`, `getProcurementReferenceData`, `listInventoryMovements`, `executeProcurementCommand`, `createProcurementAttachmentUpload`, `finalizeProcurementAttachment`, and `getProcurementAttachmentDownload`. Preserve existing five operation envelopes/responses.

Read RPCs receive server-derived `p_tenant_id` and `p_actor_user_id`, plus allowlisted filters; return typed DTO JSON. The fixed command entrypoint is `inv_execute_procurement_command(p_tenant_id uuid, p_actor_user_id uuid, p_kind text, p_document_id uuid, p_expected_version bigint, p_idempotency_key text, p_input jsonb) returns jsonb`. It dispatches fixed internal functions, not dynamic table names/SQL. `CommandResult = { id, kind, version, replayed, invalidations }`; invalidations are allowlisted live resources, never arbitrary URLs.

---

### Task 1: SQL foundation and executable transaction harness

**Files:** first foundation migration; `functions/src/procurement/contracts.ts`; `database/test/bootstrap.sql`, `foundation.test.mjs`; `scripts/inventory-db-test.mjs`; root dev test dependencies/scripts/lockfile.

**Interfaces:** `npm run test:database` creates a disposable uniquely named `inventory_test_*` database on loopback only and executes real SQL using separate PostgreSQL connections. It must reject Apps Core/production URLs before connecting. Fixtures create minimal shared authorization tables and canonical Inventory tables in the disposable database only. SQL helper `inv_require_procurement_access(tenant, actor, admin_only)` validates current authority; common command/idempotency helpers lock and fingerprint tenant/kind/actor/input consistently.

- [ ] Write failing executed-SQL tests: anonymous/authenticated cannot execute RPCs; Viewer/inactive/multiple-membership/wrong-tenant actors cannot mutate; existing legacy records survive migration unchanged; same key+payload replays and changed actor/payload conflicts.
- [ ] Run `npm run test:database -- foundation` and capture meaningful failures before adding production SQL.
- [ ] Implement the guarded runner with real disposable PostgreSQL, not SQLite/mock SQL. Read-only preflight found PostgreSQL 18.1 tools at `C:\Program Files\PostgreSQL\18\bin`; use these to initialize an isolated cluster under an ignored workspace test directory, bind loopback on a separately allocated port, and stop only the test-owned server afterward. Never connect to/start/stop an existing Windows database service or use production as a fixture. Verify the native runner actually starts before claiming SQL execution/concurrency coverage; if blocked, report it rather than mark tests passed.
- [ ] Implement additive MR/quotation/PR/PO/inspection metadata, Inventory-only events/commands/review-route/tracking/attachment tables, composite tenant FKs and explicit privileges. Preserve unknown historical status strings; expose them read-only instead of coercing or automatically approving. Store revision-specific new PR decisions separately from the existing stage-unique approvals table.
- [ ] Run the foundation tests and `npm run test:functions`; commit only green, scoped changes.

### Task 2: Authoritative Dashboard, registers, details and reference reads

**Files:** read migration; `functions/src/procurement/reads.ts`, `validation.ts`; `functions/test/procurement-reads.test.ts`; `database/test/reads.test.mjs`; `gateway.ts`, `index.ts`.

**Interfaces:** five read operations defined above. List inputs use `limit` 1–100 with stable keyset cursors scoped to kind/filter; selectors allow only `items`, `suppliers`, `locations`, `requesters`, `reviewers`, `warehouses`. Details require tenant/ID matches on all nested rows; history/related lists paginate. `DashboardDto` contains activeItems, stockQuantity, lowStockItems, outOfStockItems, criticalItems (5), recentMovements (6), and live procurement/receipt/issued-net-cost summary fields.

- [ ] Write failing tests for two tenants; >100 items/multiple balances; inactive/zero/low-stock metrics; empty tenants; posted-only movements; historic missing costs; foreign IDs/filters/cursors; unknown selector kinds; missing snapshots and unknown historical statuses.
- [ ] Run focused Functions and `npm run test:database -- reads`; require observed failures.
- [ ] Implement SQL aggregation across all authorized rows without join multiplication or client-page truncation. Every shared name lookup follows a tenant-bound membership/personnel reference. Return decimal text and explicit missing-data flags. Resolve item/location-level movement balances accurately.
- [ ] Add read handlers through `requireAccess` and safe error mapping, then register only inside `inventory`. Do not touch React yet.
- [ ] Run focused/legacy backend tests, Functions build and SQL read tests; commit.

### Task 3: MR, quotations, staged PRs and POs

**Files:** document migration; `functions/src/procurement/commands.ts`, `validation.ts`; `functions/test/procurement-commands.test.ts`; `database/test/documents.test.mjs`, `concurrency.test.mjs`.

**Interfaces:** command kinds `createMaterialRequest`, `editMaterialRequest`, `approveMaterialRequest`, `createAdditionalMaterialRequest`, `createQuotation`, `createPurchaseRequest`, `revisePurchaseRequest`, `submitPurchaseRequest`, `reviewPurchaseRequest`, `reassignPendingReviewer`, `createPurchaseOrder`, `dispatchPurchaseOrder`. Each has an exact input schema; client identity/status/history/prices-at-PR/PO inputs are rejected. Allocations and unit/price snapshots are server-derived. IDs/numbers are server-generated.

- [ ] Add failing executed-SQL tests for the complete MR→quote→PR→four-stage review→PO→dispatch path; returned/revised/rejected PRs; stale quotations/versions; Staff requester override; nonassigned reviewer; duplicate/out-of-order reviews; active/inactive reviewer reassignment; parent/job and foreign line/supplier/reviewer injection.
- [ ] Add two-real-connection tests proving simultaneous PR submission/PO creation cannot allocate the same requirement twice, and document numbers remain unique.
- [ ] Run the tests red, then implement command transactions with deterministic MR→PR→PO lock order. Check authorization before payload validation at the callable and again inside SQL. Replay successful same-actor commands before old-version checks; do not replay a different user's result.
- [ ] Preserve immutable approved supplier/prices/identities and revision-scoped decisions; Submitted is locked, Returned requires a saved revision, Rejected is terminal, and reassignment changes only an ineligible pending assignment with an Administrator reason/audit.
- [ ] Keep existing createMaterialRequest response compatible; route procurement creates through the new transaction so requester restrictions cannot be bypassed through its legacy envelope. Reserve procurement movement source/idempotency namespaces against generic public stock operations without changing legitimate unrelated legacy posting semantics.
- [ ] Run document/concurrency SQL tests, gateway/domain tests and Functions build; commit.

### Task 4: Receiving, inspection, supplier returns and atomic stock receipt

**Files:** receiving migration; `database/test/receiving.test.mjs`, `historical-receipts.test.mjs`, concurrency tests; command validation/handler tests.

**Interfaces:** command kinds `recordDelivery`, `recordInspection`, `acceptInspection`, `postAcceptedReceipt`, `recordSupplierReturn`, `reconcileHistoricalReceipt`; inputs identify exact PO/inspection lines and locations, never computed balances or an arbitrary accepted status. Acceptance records a unique report→movement link. Historical reconciliation mode is `linkExistingMovement` or `confirmUnposted`, with required evidence/reason and Administrator authority.

- [ ] Write failing SQL tests for partial/all-rejected deliveries, chronological dispatch/inspection checks, replacement limits, supplier-return capacity, foreign line/location IDs, stale versions, two simultaneous deliveries/replacements/returns, and receipt retry/rollback after failure on a later line.
- [ ] Write historical tests proving an unlinked accepted report cannot post, exact proven movement linkage changes no balance, ambiguous matches fail, and documented confirmed-unposted recovery posts once.
- [ ] Implement receiving transactions and server-side capacity calculation. Reuse `inv_post_stock_movement` only inside the same outer transaction with reserved source/key, after role/reference/precision/cost/tracking checks. Multiple assets/lines and audit/acceptance changes roll back together.
- [ ] Implement weighted-average tagged/non-tagged receipts with independently confirmed tracking; unknown tracking and `fifo`/`standard` fail without changes. Reject duplicate/reused tags and fractional tagged quantities. No opening-cost inference or cost_method conversion.
- [ ] Run all receiving/historical/concurrency tests and the full backend suite; commit.

### Task 5: Minimal Inventory setup and printable document integrity

**Files:** `supabase/migrations/20261023000500_inventory_procurement_setup.sql`; command module/validation; `database/test/setup-print.test.mjs`; `functions/test/procurement-setup.test.ts`.

**Interfaces:** Administrator-only command kinds `saveSupplier`, `saveWarehouse`, `saveStorageLocation`, `configureItemTracking`; writable-role `saveDocumentPrintFields` with bounded kind-specific display-field allowlists. Tracking mode is `quantity_only` or `individually_tagged` with required reason/version. Existing asset rows constrain mode changes; no command changes balances or shared users/personnel.

- [ ] Write failing tests for Viewer/Staff setup denial, foreign references, duplicate codes, inactive locations, changing tracking with existing assets/stock incompatibilities, forged approval fields in print metadata, and catalog edits preserving approved/printed historical snapshots.
- [ ] Run focused tests red; implement explicit Inventory setup commands and document field validators with audit/idempotency.
- [ ] Ensure no missing supplier/location/tracking configuration is auto-created; expose setup-required responses and server action availability.
- [ ] Run focused database/Functions tests and full backend regression; commit.

### Task 6: Private attachment lifecycle

**Files:** `functions/src/procurement/attachments.ts`; `supabase/migrations/20261023000600_inventory_procurement_attachments.sql`; `functions/test/procurement-attachments.test.ts`; `database/test/attachments.test.mjs`; `scripts/inventory-attachment-acceptance.mjs` (controlled private Storage acceptance).

**Interfaces:** upload input `{ kind, id, name, contentType, size }`; finalize `{ attachmentId }`; download `{ attachmentId }`. All identifiers/paths are generated or resolved server-side. Upload/finalize require mutating role; read/download permit Viewer. Only finalized files with a current readable parent may receive download URLs.

- [ ] Write failing tests for 5 MiB+1, eleventh finalized/pending attachment, spoofed MIME/magic, HTML/SVG/executable data, path substitution, missing/foreign parent, Viewer upload, inactive actor, replaced bytes and role removal between upload/finalize/download.
- [ ] Verify current official Supabase SDK signed-upload/download semantics before implementation; no invented expiry guarantee. Use random non-overwriting object paths and record pending reservations transactionally so concurrent uploads cannot exceed the cap.
- [ ] Implement byte/metadata validation and private bucket checks; do not alter a pre-existing bucket owned by another app. No direct browser DB write policy, public URLs or automatic cleanup/deletion of user data.
- [ ] Run Functions/database tests and controlled Storage acceptance (private Inventory-only test objects); document signed-URL lifetime/revocation limits and orphan behavior. Commit only verified behavior.

### Task 7: Typed React transport and session-scoped live request lifecycle

**Files:** `src/services/procurement-api.ts`, `src/services/use-live-inventory.ts`, `src/services/inventory-api.ts`; `scripts/procurement-api.test.mjs`, `scripts/live-inventory-session.test.mjs`; existing callable transport tests; root test script.

**Interfaces:** export one typed wrapper per new operation using existing `callInventoryFunction`; extend its operation union without introducing a second API. `useLiveInventoryResource(key, loader)` returns loading/error/data/reload, discards stale sessions/requests, and subscribes to allowlisted invalidations. `executeProcurementCommand` preserves a single idempotency key per user submission/retry and resolves only after server success.

- [ ] Write failing tests proving all wrappers invoke `inventory` in `asia-southeast1`, omit undefined fields but keep intentional null, reject client tenancy/authority, preserve decimal strings and map safe errors.
- [ ] Write delayed-response tests proving user/tenant change discards old reads and clears modal/draft state, and rejected commands leave forms open with inputs intact. Test duplicate-click suppression and retry key reuse.
- [ ] Implement wrappers/hooks without localStorage/demo imports or Supabase service credentials; client may only use signed attachment transfer URLs.
- [ ] Run focused client tests, existing application regressions and `tsc --noEmit`; commit.

### Task 8: Live Dashboard and movement/receipt drill-down

**Files:** `src/components/live/LiveDashboard.tsx`, `src/components/live/LiveMovementRegister.tsx`, `src/components/live/LiveReceiptRegister.tsx`, `src/components/live/DemoDataNotice.tsx`; `src/App.tsx`; `scripts/live-dashboard.test.mjs`; root test script.

**Interfaces:** components consume only Task 7 live resources/DTOs; Dashboard delegates counts to `getInventoryDashboard`, not `listInventoryItems(limit:100)` or browser arrays. Navigation leads to corresponding live registers, not demo transaction/charge summaries.

- [ ] Write failing rendering tests for empty/loading/error/denied data, decimal formatting, live totals across >100 items, five/six row caps, no demo fallback, and accurate refetch after mutation.
- [ ] Implement existing-look live components with labelled active-item and location-balance semantics and missing-cost notices. Route Dashboard, Transactions and Stock In to them; keep unrelated legacy demos clearly labelled and isolated without deleting local data.
- [ ] Verify React build/typecheck and UI tests. Do not deploy Hosting before backend release gates; commit.

### Task 9: Live procurement registers, forms, reviews, receiving and print/files

**Files:** under `src/components/live/`, create `LiveProcurement.tsx`, `ProcurementRegister.tsx`, `ProcurementDocument.tsx`, `MaterialRequestForm.tsx`, `QuotationForm.tsx`, `PurchaseRequestForm.tsx`, `PurchaseOrderForm.tsx`, `ReceivingForm.tsx`, `InventorySetup.tsx`, `ProcurementAttachments.tsx`, `ProcurementPrint.tsx`; narrow presentational helpers as needed; `src/App.tsx`; `scripts/live-procurement.test.mjs`; root test script.

**Interfaces:** paginated kind-specific live registers and document graphs; asynchronous forms issue only typed commands. Editors use same-tenant paginated selectors. Review controls bind to the authenticated reviewer; printed labels are never authorization. Preserve display layout and approved lifecycle, but never submit browser `WorkflowState` or run its reducer as live authority.

- [ ] Write failing UI tests for MR additional/revision/approval, quotations, priced PR route/revision/ordered decisions, PO dispatch, delivery/inspection/replacement/returns, acceptance/reconciliation/setup-required, print snapshots and signed attachment transfer.
- [ ] Implement bounded detail/editor components and command-specific async submission. Server success closes/invalidate/reloads; conflict/denial preserves drafts and refreshes authority. Viewer gets read/print/download only; Admin setup/reassignment/reconciliation are explicit and audited.
- [ ] Add tests and guards preventing included routes from reading/writing `workflow-storage`, showing demo histories or using typed approver names as authority. Retain old demo files/tests and add explicit visual demo labels only for out-of-scope routes.
- [ ] Run all client/React checks and browser acceptance against a safe test backend; commit after verification.

### Task 10: Independent review, scoped migration and sequential release

**Files:** `scripts/inventory-release-check.mjs`; `functions/README.md`, root README, implementation progress and this plan; sanitized acceptance evidence.

**Interfaces:** release check reads expected Inventory schema/RPC presence and Service Desk deployment metadata without secret/identity output. Migration runner accepts only the explicit new `20261023*inventory_procurement*.sql` files, shows their hash/order, refuses unrelated pending migrations/shared DDL, and requires an actual authorized SQL connection or owner-run reviewed script. It never fabricates migrations via a service-role PostgREST API key.

- [ ] Run fresh full `npm test`, `npm run test:database`, React typecheck/build and Functions build. Obtain one independent whole-change review, address material findings with failing-then-passing tests, and keep a record of exactly what executed.
- [ ] Baseline deployed Service Desk metadata and Inventory schema. Inspect SQL object/privilege allowlists and existing-record compatibility. Prepare a recovery snapshot/backup using available authorized facilities; do not silently mutate shared backup/IAM configuration.
- [ ] Apply only the reviewed new Inventory migrations to `oqsgzdkljtxtpwdzptnw`. If SQL authority is missing, provide exact reviewed scripts/hashes for the owner and pause deployment; continue safe local work, never broaden permissions.
- [ ] Verify installed schema and deploy `npm run deploy:functions` only; confirm existing operation compatibility and anonymous rejection before any Hosting change.
- [ ] Execute controlled two-tenant live read/write/role/concurrency and complete lifecycle acceptance, including private files, stale/replayed commands, historical/unsupported states and a second session. Existing test sample balances are not disposable; use explicitly designated new fixtures and do not silently delete/reverse business events afterward.
- [ ] Deploy `npm run deploy:hosting` only after backend acceptance; verify live bundle and screen state, remove temporary test routes/maps, compare Service Desk metadata unchanged, and record remaining limits honestly.
- [ ] Push verified scoped commits to main per the user's standing preference. On rollback redeploy compatible Inventory function/client code only; keep additive schema/audit and no automatic Edge/demo write fallback.

## Self-review and execution gates

Spec coverage: Tasks 1–6 implement authority, schema, transactions, setup/print and private files; Tasks 7–9 implement live client/session/UI behavior and explicit demo isolation; Task 10 owns review, real release evidence, deployment and rollback. Each task has a red/green test cycle; SQL invariants require executed PostgreSQL tests, and concurrency specifically requires multiple real connections. No production data changes occur merely by running unit/fixture tests.

Execution remains Native as previously chosen. Start Task 1 after the user reviews this plan; no further design interview is required. Any missing SQL authority or safe live-test fixture authorization is a release gate, not permission to change IAM, share keys, use real procurement records as test data, or claim completion without deployment evidence.
