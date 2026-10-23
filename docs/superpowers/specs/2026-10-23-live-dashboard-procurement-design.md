# Live Inventory Dashboard and Procurement Design

Status: approved by the user on 2026-10-23 for backend-first implementation followed by React. The independent reviewer reported “nothing important left” after the costing/tracking, historical-receipt and reviewer-recovery proposals were made explicit. Approval includes existing Supabase records only, no demo import, tenant/role enforcement, and no Service Desk changes.

## Intent and approved direction

Connect the existing React Dashboard and the complete procurement lifecycle to the existing Apps Core Supabase records through the single Firebase `inventory` callable. Preserve the current interface and business rules where practical, replace browser-authoritative mutations with server transactions, and retain tenant isolation and role-based access.

The user selected the complete live workflow rather than a read-only cutover. The user explicitly requires **no demo-data import** and **no Service Desk changes**. Existing browser data must not be deleted, uploaded, used as opening balances, or treated as a fallback when a live request fails.

## Current evidence

- Firebase Auth provides Google sign-in. The deployed `inventory` v2 callable uses Node 22, `asia-southeast1`, maximum five instances, a 60-second timeout, and the `INVENTORY_BACKEND` JSON secret.
- Inventory access is derived from existing Apps Core `app_users`, `tenant_memberships`, `tenants`, `applications`, `membership_roles`, and `app_roles`. Inventory does not mutate Firebase custom claims. Exactly one membership total is required, and that membership must be active; one active plus another inactive membership still fails closed.
- The live Inventory List already uses the callable. Its Administrator/Viewer and two-tenant acceptance checks passed before this project.
- `InventoryApp` currently initializes `WorkflowState` from `loadWorkflowState()`. Dashboard and procurement use that browser state. `onWorkflowAction` runs `applyWorkflowAction` locally and writes `wds-inventory-workflow-v1` to localStorage. This is not live persistence or backend authorization.
- Existing browser procurement includes MR revisions, quotations, four ordered PR review stages, returned/rejected PRs, PO dispatch, partial deliveries, inspection/acceptance, supplier returns/replacements, printing, attachments, and receipt posting.
- A read-only inspection of live Inventory metadata on 2026-10-23 confirmed the canonical `inv_*` tables and only `inv_next_document_number`, `inv_create_material_request`, and `inv_post_stock_movement` RPCs. The database lacks persisted review routes/revision history, receipt-to-ledger linkage, document snapshots, and several fields needed by the current UI. The repository SQL alone is not proof that a future migration is installed.
- A separate read-only check of the two existing test-account tenants found one item per tenant, both using `average` costing. This is not evidence about every other tenant or a basis for changing any item's configuration.

## Approaches considered

1. **Complete transactional cutover, selected:** implement live reads and explicit commands against normalized `inv_*` records, with the state machine enforced inside Postgres transactions. More work up front, but supports multiple browsers, reliable approvals, stock integrity, and current records without copying demo data.
2. **Read-only first:** live Dashboard and registers, with procurement writes disabled until backend commands exist. Smaller initial release but does not deliver the selected complete workflow.

A client-uploaded WorkflowState/tenant JSON blob and direct browser service-role queries are excluded: they would bypass relational controls, permit forged actors/statuses/balances, and create lost updates.

## Scope and boundaries

### Included

- Live Dashboard stock totals/statuses, posted recent movements, and procurement/receipt summary counts.
- Tenant-scoped reference selectors and paginated material request, supplier quotation, PR, PO, and inspection/acceptance registers and detail views.
- MR creation, revision, approval, and linked additional requests; quotations; PR preparation, revision, submission, ordered review/return/rejection; approved PO preparation and dispatch; original/replacement delivery recording; inspection; acceptance and exactly-once accepted-stock receipt; supplier return tracking; document history, saved print fields/snapshots, and private attachments.
- A live read-only movement register for Dashboard drill-down and live receipt data on Stock In. These must not navigate into demo transactions while claiming to show live figures.
- Minimal Administrator-only Inventory setup for suppliers, warehouses/locations and item tracking needed by these selectors/receipts. Create real records only on explicit form submission; no import, automatic seeding or shared personnel/account edits. Catalog item creation and broader master-data administration remain separate.
- Existing Inventory List remains live and uses the same authorization boundary.

### Not included

- Migrating demo data, inventing missing historical approvals/prices, or assigning new tenant/role memberships.
- Converting separate RIS issuance, material-return-to-store, stock-count/reconciliation, billing/markup, or unrelated report workflows into live writes. These are separate projects; their existing browser data remains preserved and clearly marked demo wherever those screens remain available. They must not feed the live Dashboard, procurement fulfillment calculations, or balances. Reads needed to compute live outstanding requirements/issued costs use existing live RIS/release/return records only.
- Service Desk function/source/deployment/Hosting, `SERVICE_DESK_BACKEND`, `svc_*` objects or data, shared authorization/personnel writes, Firebase claims, broad IAM changes, or a new Firebase function per operation.

## Architecture and authority

React → Firebase Auth + `httpsCallable("inventory")` → existing access resolver → Inventory read repositories or transactional `inv_*` RPCs → Apps Core Postgres. The callable alone obtains `INVENTORY_BACKEND`; no backend credential is emitted to React, logs, test artifacts, or generated bundles.

Keep the current five operations compatible. Extend the strict gateway operation allowlist with typed Dashboard/procurement reads, a typed procurement-command dispatcher, and private attachment upload/finalize/download operations. These are operations within `inventory`, not additional deployed Cloud Functions. Unknown operations, unknown command kinds, identity/tenant/role/status injection, unsupported fields, and prototype properties fail closed.

Every request authenticates and checks verified email, active application/user/tenant/membership, and the appropriate Inventory role. The callable derives the actor ID and tenant ID, never from client input or a display-name field. Every business query is tenant-scoped. Shared reference names are resolved only through rows already proven to belong to that tenant. Cross-tenant IDs return a safe unavailable/not-found/conflict response without leaking existence or content.

Service-role credentials bypass RLS, so RLS is not the primary isolation boundary. Keep browser table access revoked. New mutation RPCs independently revalidate the server-supplied actor's current Inventory role and membership inside the transaction. Give `anon`, `authenticated`, and PUBLIC no execute rights to Inventory privileged RPCs; grant only to `service_role`. Use fixed search paths, fixed SQL/table names, tenant-bound FKs, and no caller-supplied SQL/table names.

## Authorization and identity decisions

Preserve the established capability model:

| Action | Administrator | Inventory Staff | Viewer |
| --- | --- | --- | --- |
| Read Dashboard, procurement, movements; print/download own-tenant documents | Yes | Yes | Yes |
| Create/update procurement and receive approved stock | Yes | Yes | No |
| Change a document requester to another eligible person | Yes | No | No |
| Record a PR review | Only if currently assigned to the pending stage | Only if currently assigned to the pending stage | No |
| Repair a pending PR route after reviewer eligibility is lost | Audited replacement of a pending reviewer only | No | No |
| Configure Inventory suppliers/locations and item tracking | Yes, without balance or shared-account changes | No | No |
| Alter shared memberships/roles or impersonate an approver | No | No | No |

**Builder proposals, not pre-existing user policy:**

- Replace free-text PR reviewers with active same-tenant Inventory user selectors. The route stages remain Department Head → Budget Review → Procurement/Internal Control → Final Approver. Reject assignments to Viewer, inactive, or foreign-tenant users. Bind decisions to the authenticated `app_users.id`, not email/name comparisons.
- The same eligible user may occupy multiple stages, matching the current UI's lack of separation-of-duties enforcement. Each stage still requires a separate ordered decision; no implicit approval or Administrator bypass. Introducing mandatory distinct reviewers/self-approval bans is a separate policy change.
- Administrator/Staff may approve an MR, inspect, and accept using their own authenticated identity, consistent with current mutation capabilities. Signatory labels on printed forms are presentation data, never proof of approval.
- Staff requests default to their own authenticated requester identity. If a same-tenant active `personnel.user_id` linkage exists, use it; otherwise preserve an Inventory-local requester user/name snapshot without inserting or altering shared personnel. Administrator may select an existing same-tenant active personnel entry. Missing reference data is shown as setup required, never auto-created from demo records.
- If a submitted PR's pending assigned reviewer becomes inactive/ineligible, reviews fail closed. An explicit Administrator-only `reassignPendingReviewer` command may replace that pending assignment with an active same-tenant eligible Inventory user, requiring current version and reason. Record old/new IDs and reason in immutable history, preserve document/prices/revision and completed decisions, and never record approval on behalf of either reviewer. No bulk route rewrite, hidden fallback to any Administrator, or alteration of completed stages is permitted.

## Read API and frontend behavior

Proposed operation interfaces (names may be refined without changing authority):

- `getInventoryDashboard({})`: one bounded server summary, including active-item count, active-item aggregate stock, low-stock count (`quantity > 0 && quantity <= minimum`), out-of-stock count (`quantity === 0`), five critical items, six recent posted movement lines, and live workflow counters. Aggregate across all matching rows in SQL, not just the first Inventory List page. Item quantities sum their tenant's location balances. Do not double-count joined lines. Exclude inactive items from availability metrics; label the count as active items.
- `listProcurementDocuments({ kind, limit, cursor, search?, status? })`: allowlisted kinds, deterministic keyset ordering and bounded pages; returns server-computed status/summary and next cursor. Cursor/query scope is validated so changing the filter/kind cannot silently skip records.
- `getProcurementDocument({ kind, id })`: authorized document graph with lines, historical snapshots, revision/version, status, related references, current route/history, and available actions. Bounded dependent lists paginate where necessary.
- `getProcurementReferenceData({ kind, search?, limit, cursor? })`: per-kind item/supplier/location/requester/reviewer selectors; shared users/personnel are minimum-field, same-tenant projections, not global account lists.
- `listInventoryMovements({ limit, cursor, ...allowedFilters })`: posted movement lines only, joined to their tenant-scoped header/item/location. Use the stored ledger for quantity/value, not browser samples. Keep location-level before/after quantities correctly labelled; never mislabel them as tenant totals.
- `executeProcurementCommand({ kind, id?, expectedVersion?, idempotencyKey, input })`: a discriminated union with a fixed schema per command. The request carries references and business values only, not authoritative actor, tenant, posted balances, audit history, or approved status. Return the resulting document ID/version and affected Dashboard/register invalidations.

Use exact decimal handling for money/quantities in Postgres and serialize DTO values deliberately. Show unresolved historical cost as unavailable, not a fabricated zero. Issued-cost summaries use posted live releases/returns only and have an explicit gross/net label.

Use a dedicated live procurement data layer/components or narrow adapters; do not hydrate the whole tenant into an unbounded `WorkflowState`. Reuse presentational/print helpers where appropriate. Existing synchronous `onAction(): boolean` forms need asynchronous submission: disable duplicate submits, close only after server success, preserve form values on error, and display safe conflict/retry feedback. Backend versions govern, not client reducer results. After a mutation, invalidate/reload affected documents, registers, Dashboard, and Inventory balances; avoid polling every component.

Separate live data completely from `workflow-storage`. On auth/tenant change, clear live caches, modal selection and form drafts before a new user's data can render; key requests by the signed-in session and cancel/discard stale responses. Refresh permissions/current record on conflicts or denials. Loading, empty, unauthorized, failed, and historical-missing-data states are distinct. There is no demo fallback on failure. Existing localStorage remains untouched.

## Transactional state machine and integrity

Implement explicit commands for MR create/edit/approve/additional-request; quotation create; PR create/revise/submit/review/reassign-pending-reviewer; PO create/dispatch; delivery create; inspection record; acceptance/receipt; historical receipt reconciliation; supplier return; Inventory supplier/location/tracking setup; and allowed document print-field updates. There is no generic save-table or set-status command.

- **MR:** validate active same-tenant items and quantities/precision; generate IDs/numbers on the server. Editing requires the current version and a reason, records history, invalidates previous approval/current quotes, and is locked after downstream procurement or live issuance has progressed. Additional requests reference a same-tenant parent and the same job; they do not rewrite the original. Preserve existing historical rows without manufacturing approvals or revisions.
- **Quotations:** require an approved editable MR and eligible same-tenant supplier. Save MR revision and item/unit/specification/price snapshots. Validate dates/expiry, unique supplier reference per MR, finite nonnegative prices, positive quantities, no duplicate lines, and offered quantities within requirements. Item/unit identity changes make a quotation stale.
- **PR:** use valid current quotation prices, not client-asserted totals or unit prices. Store selection reason, route, revision and version. Draft/Returned can be revised with a reason; revision resets current decisions but preserves earlier history. Submitted locks content. Return requires a saved revision before resubmission; Rejected is terminal. Approved requires all four stages for the current revision. Only the assigned pending actor can review. Pending/approved PRs reserve unfulfilled requirements; rejected/cancelled/returned/draft documents do not double-reserve. Lock the MR while allocating/releasing quantities across concurrent PRs/POs.
- **PO:** only create from an approved current same-tenant PR, copy approved supplier/prices/snapshots, and reject over-allocation across concurrent orders. Lock the PR/MR allocation rows. Store immutable approved-document identity. Dispatch is a separate auditable action; delivery cannot predate it or bypass it. Historical POs lacking dispatch evidence remain readable but need an explicit authenticated confirmation event before new receiving; do not invent an old dispatch or rerun approvals.
- **Delivery/inspection:** persist multi-line quantities against exact PO line IDs. Require unique delivery references, valid chronological dates and current PO version. Original delivered quantity cannot exceed remaining ordered quantity. Split delivered units into acceptable, damaged, and other rejected quantities, with totals never above delivered; acceptance is not the same as delivered. Replacements link to a specific inspected rejection/return and cannot exceed its unfilled capacity. Supplier return records cannot exceed inspected rejected quantity minus previous returns. Lock PO/original delivery while calculating capacity so two browsers cannot over-receive/replace/return.
- **Acceptance/receipt:** inspection must be complete, values/locations valid, and actor authorized. Accept-and-post good quantities in a single transaction; link one accepted report to one immutable movement. All-rejected deliveries can be acknowledged with no receipt movement. Use same-tenant location selection, proper unit precision, and validated costs. Partial failure rolls back acceptance, all lines, assets, balances, receipt link, audit, and status. Retry cannot post twice. Historical accepted reports created before receipt linkage are **not assumed unposted**. If their posting cannot be proven, mark them `reconciliation_required` in Inventory-local metadata and block stock posting. Administrator reconciliation must either link a proven same-tenant posted movement whose type/source/item/location/quantity/cost match exactly, or record documented external evidence confirming no prior posting and explicitly authorize one receipt. Store evidence/reason/actor/version; do not alter/delete/revalue existing movements or balances, guess a link from a matching total/name/date, or repost while evidence is ambiguous. Confirmed already-posted reports gain linkage without balance changes; confirmed unposted reports use the same exactly-once transaction as new receipts.
- **Assets/cost methods — approval proposal:** the initial live receipt engine supports the database's existing **weighted-average** accounting. Preserve all existing `fifo` and `standard` values, balances and assets, but block their receipt mutations with `failed-precondition`/setup-required until an approved FIFO/standard valuation configuration exists; do not silently account for them as average. This explicit unsupported-costing boundary is part of the proposed scope, not a claim of full FIFO/standard support. Add an independent Inventory-local tracking configuration rather than deriving tagging from `cost_method` or the browser `Specific` flag. Existing items start unconfigured unless authoritative explicit tracking configuration already exists; Administrator must confirm `quantity_only` or `individually_tagged` with a reason before the first new live receipt. Do not infer untagged merely from an absence of asset rows. For tagged average-cost items, require integer quantities and one unique never-reused same-tenant tag per accepted unit; create acquisition records and movement links atomically. No tags, valuations or opening stock are invented, no bulk auto-configuration is performed, and no historical revaluation is part of this cutover. An audited Administrator-only configuration command cannot change cost_method, existing asset ownership, or balances. The UI distinguishes configuration-required and unsupported-method states from generic service errors.
- **Print fields/history:** allowlist bounded display-only fields. Persist immutable document/item snapshots as records progress so later catalog edits do not rewrite historical print identity. Print/display signatory names are not authorizing decisions. Missing historical snapshots display missing-data notices rather than demo values.

Each mutating command runs in one Postgres transaction with deterministic lock ordering, optimistic expected versions, a tenant/command-scoped idempotency record and a canonical payload fingerprint. Successful retries return the prior outcome before stale-version checks; a different payload with the same key fails. Concurrency tests cover parent allocations, staged decisions, replacements, document numbers, and receipt replays. No multi-request REST sequence may implement a financial/stock transaction.

## Additive Inventory-only schema work

Create new forward-only migrations after inspecting existing records and database capabilities. Do not replay historical shared-prerequisite/compatibility migrations; they write shared tables and are outside this scope. Do not use a blanket `supabase db push` that applies unrelated pending migrations. Apply only the reviewed new Inventory migration(s), in order, after a dry run and backup/restore plan.

Expected additions, confined to `inv_*` objects:

- MR owner/parent links, revision/approval metadata and historical item/specification snapshots.
- Quotation quote date, MR revision, snapshot/unit versions and recorder identity; PR selection rationale and immutable line snapshots.
- Persisted PR route assignments and revision-scoped decisions/history (remove no historical decisions; account for the existing approvals table's stage-only uniqueness).
- PO dispatch/evidence metadata, immutable snapshots, and versioned inspection header/line fields including receipt linkage, explicit historical reconciliation evidence and replacement relationships.
- Independent Inventory-local item tracking configuration and its audit; preserve current catalog cost_method values, with no assumed asset-mode backfill.
- `inv_procurement_events` append-only audit, `inv_procurement_commands` idempotency outcomes/fingerprints, and private attachment metadata.
- Only required explicit tenant/parent indexes, composite FKs, nonnegative/precision/check constraints, guarded status vocabularies and narrowly scoped privileges. New constraints are staged/validated against existing data; unsupported historical statuses are not overwritten or coerced without review.

Add service-role-only read/command RPCs with active actor/tenant checks. Avoid changing shared table triggers/defaults/RLS or Service Desk views/functions. Shared auth/personnel reference tables are read-only here. If an existing Inventory helper appends to shared `audit_events`, only its existing `inv_*` inventory events are permitted; do not alter that shared table or other records. New procurement audit goes to `inv_procurement_events`.

## Attachments

Preserve attachment capability without storing browser data URLs in document JSON or exposing public files. Builder proposal: an independent **private Supabase Storage bucket `inventory-documents`**, never a Service Desk bucket. Confirm bucket ownership/configuration before creating; do not alter an existing shared bucket/policy. If this name is already owned by another app, stop for an Inventory-only alternative.

The authenticated callable authorizes the parent document and mutating role, allocates a random tenant/document-scoped path and returns a short-lived upload URL. React uploads the selected bytes to that URL. Finalization rechecks role/tenant/parent, validates stored size/type/path and attaches Inventory metadata. Download authorizes the current read role and parent before returning a short-lived signed URL. No public listing or direct browser DB policies. Allow PDF/PNG/JPEG only, initially 5 MiB/file and 10 files/document; sanitize names, reject active HTML/SVG/executable content and use download disposition. Validate magic/type/size server-side, not just client claims. No demo attachment import, no inline data URL fallback, no unrequested scheduled cleanup job. Keep unfinalized files non-downloadable through the app. If a safe private storage path cannot be verified, do not claim attachment support is complete or publish a misleading upload button.

## Deployment and rollback

1. Baseline current Git/deployment status, Service Desk metadata and Inventory schema before changes. Keep main current per the user's branch preference; use narrowly selected commits and never force-push.
2. Add tests first, implement and verify locally with mock/ephemeral controlled database fixtures. No schema mutation or live business-record test during the design stage.
3. Review/test the exact new SQL and apply only its Inventory changes to Apps Core. If SQL credentials/authority are unavailable, give the owner the exact reviewed Inventory-only script and wait for installation; do not escalate IAM or obtain a new service key automatically.
4. Deploy only `functions:inventory:inventory`, leaving existing operations compatible. Verify live reads against existing records; test new writes in designated controlled test tenants/records only with authorization, never a real PO or balance. Do not auto-seed missing references or approve test users.
5. Deploy only `hosting:app` after backend verification. Verify the actual final bundle and remove any temporary acceptance route/fixtures from production. Record immutable release evidence and push verified code/docs to main.
6. On failure, roll back Inventory function/client code together to the compatible previous release. Keep additive schema/history and existing records; do not drop columns/tables, delete movements/approvals, re-import browser data, or route automatically to the Edge rollback endpoint. Distinguish rollback to the prior demo UI from restored live-write functionality.

## Verification and acceptance

- Existing full regression suite, Functions tests/build, React type check/build; add focused live-read/client and transaction tests rather than treating old browser reducer tests as proof of server behavior.
- Database-executed tests in a disposable test database for atomic rollback, constraints/privileges, exact decimal behavior, idempotency fingerprint/replay, stale edits, duplicate stage decisions, concurrent MR/PR/PO allocation, receipt posting, original/replacement deliveries, supplier returns and historical compatibility. Do not rely only on regex inspection of SQL.
- Explicitly test ineligible pending-reviewer reassignment (Administrator only, no approval impersonation), ambiguous historical receipt blocks and both evidence-based reconciliation outcomes, unknown tracking configuration, tagged/non-tagged weighted-average receipts, and non-mutating FIFO/standard precondition failures. Do not call those blocked methods supported or mark their positive receipt tests passed.
- Anonymous/unverified/inactive/ambiguous-membership calls are denied. Viewer read succeeds; every command/upload is denied before mutation payload validation. Administrator and Staff writes succeed where authorized; requester override and nonassigned reviewer impersonation fail.
- In two test tenants, Dashboard totals/counters, all register/detail/history/selector/download reads and all nested foreign IDs remain isolated. Foreign record IDs, parent/line/supplier/location/reviewer/attachment references, tenant/actor fields and forged cursors fail safely. Recheck record values to prove zero unauthorized changes.
- Complete controlled MR → approval → quote → PR → four reviews → PO → dispatch → partial delivery → inspection → acceptance/receipt, plus returned PR/revision, rejection, supplier return/replacement and retry/concurrency paths. Verify persisted state after refresh and from a second session, stock balance/ledger linkage, and no demo rows appearing.
- Attachments are private, authorization is rechecked for upload/finalize/download, invalid uploads fail, and foreign tenant paths are inaccessible. Document signed-URL expiry limits after permission removal.
- Verify fresh and switching-user sessions, cold/empty tenants, filtered pagination, safe loading/errors, no fallback to demo, and accurate Dashboard after every accepted mutation. Keep UI screenshots and sanitized evidence without tokens/keys/person-to-tenant fixture maps.
- Compare Service Desk deployment metadata and explicitly inspect the SQL/deployment target allowlists to prove it was not changed. Report remaining blockers honestly; no complete-live claim if a required migration, workflow operation, storage behavior, or acceptance test remains unverified.

## Builder discretion

The builder may choose file boundaries, DTO operation names, narrowly scoped indexes and test helpers. They may reuse presentational components but not the browser reducer as backend authority. They may not weaken tenant/role checks, broaden Service Desk/shared-data scope, invent historical data, silently drop currently scoped procurement behaviors, change approval policy beyond the proposals above, or substitute static/mock reads for the selected live workflow.
