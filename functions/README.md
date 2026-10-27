# Inventory Firebase callable

One Firebase v2 callable named `inventory` connects Firebase-authenticated React users to Apps Core Supabase Postgres. Node.js 22; region `asia-southeast1`; maximum five instances; timeout 60 seconds. All operations below are dispatched inside this single endpoint; they are not separate Cloud Functions.

## Secret

Only Firebase JSON secret `INVENTORY_BACKEND` is required. Its exact shape is:

```json
{
  "url": "https://oqsgzdkljtxtpwdzptnw.supabase.co",
  "secretKey": "<Supabase server secret key>",
  "firebaseProjectId": "apps-workspace-b61a9",
  "appKey": "inventory"
}
```

Use the existing secret. Its value is never printed, committed or passed to React. The parser currently accepts Supabase server keys beginning `sb_secret_`. The runtime service account requires Secret Manager Secret Accessor on this secret alone. Local emulator values belong in ignored `functions/.secret.local`.

## Shared authentication and tenant checks

Firebase verifies the Firebase ID token for this project. The handler rejects missing auth or unverified email before reading the secret, validates the operation envelope and configured project audience, and then resolves current access using `app_users`, `tenant_memberships`, `tenants`, `applications`, `membership_roles`, and `app_roles`.

Exactly one membership must exist and it must be active. The user, tenant and application must be active and an explicit Inventory role must exist. Tenant and role come only from these shared database records. No Firebase custom claims are read for tenant authority or written. Caller identity, role and tenant fields are rejected. These authorization tables are read only.

Every operation needs `INVENTORY_BACKEND`. The service role bypasses RLS, so repositories and Inventory RPCs enforce the authorized tenant explicitly. Service Desk's `serviceDesk`, `SERVICE_DESK_BACKEND`, `client_id` behavior and `svc_*` tables are untouched.

## Operation reference

### provisionInventoryAccess

Purpose: resolve existing account access, without enrolling users or assigning roles.
Input: `{}`.
Output: `status`, `firebaseUid`, `email`, `displayName`, `tenantKey`, `roleKey`. Inactive users return disabled access; missing or ambiguous assignments are denied.
Checks: authenticated verified email, existing user, exactly one active membership, active tenant/application and valid Inventory role.
Tables: shared authorization reads only; no database or Firebase Auth writes.
Secret: `INVENTORY_BACKEND`.

### listInventoryItems

Purpose: return a bounded page of caller-tenant catalog items and aggregated stock.
Input: optional `search`, `limit`, `cursor`.
Output: `{ items, nextCursor }`.
Checks: shared access checks; Administrator, Inventory Staff and Viewer allowed.
Tables: tenant-scoped `inv_inventory_items`, `inv_inventory_balances`, with `inv_categories` and `inv_units` relationships.
Secret: `INVENTORY_BACKEND`.

### updateInventoryItem

Purpose: update allowlisted item fields with optimistic concurrency.
Input: `id`, `expectedVersion`, `changes`.
Output: updated Inventory item DTO.
Checks: Administrator or Inventory Staff; caller tenant; expected version; no replacement identity, role or version.
Tables: updates `inv_inventory_items`; reads item reference and balance data.
Secret: `INVENTORY_BACKEND`.

### createMaterialRequest

Purpose: create an atomic draft material request.
Input: optional requester/job/date plus validated `lines`.
Output: request ID, request number, version and draft status.
Checks: Administrator or Inventory Staff; server-derived actor and tenant; validated tenant-owned references.
RPC: `inv_create_material_request`, which writes Inventory request headers, lines, document counters and audit objects atomically.
Secret: `INVENTORY_BACKEND`.

### postStockMovement

Purpose: post an atomic, idempotent inventory stock movement.
Input: movement type, optional source/notes, required idempotency key and validated lines.
Output: movement ID, posting timestamp and replay status.
Checks: Administrator or Inventory Staff; server-derived actor and tenant; tenant-owned items/locations/assets; duplicate line and quantity checks.
RPC: `inv_post_stock_movement`, which writes Inventory movements, lines, balances, versions, counters and audit objects atomically.
Secret: `INVENTORY_BACKEND`.

### getInventoryDashboard

Purpose: return full-tenant item, balance, critical-stock, recent-movement, and procurement aggregates without deriving totals from a capped browser page. Input: `{}`. Output: `DashboardDto`. Checks: authenticated active Inventory membership; all three Inventory roles may read. Tables/RPC: tenant-scoped `inv_*` data through `inv_get_inventory_dashboard`. Secret: `INVENTORY_BACKEND`.

### listProcurementDocuments / getProcurementDocument

Purpose: return bounded pages of material requests, quotations, purchase requests, purchase orders and inspections, then a bounded document graph containing immutable lines, audit history, reviewer route, related records and finalized attachments. Inputs: validated kind, cursor, limit/search/status or kind/id/section. Outputs: opaque-cursor pages and `DocumentDetail`. Checks: current database tenant and Inventory role on every request; Viewer actions are empty. RPCs: `inv_list_procurement_documents`, `inv_get_procurement_document`. Secret: `INVENTORY_BACKEND`.

### getProcurementReferenceData / listInventoryMovements

Purpose: provide tenant-scoped paginated selectors and the posted stock ledger used by live forms and reports. Inputs: bounded selector kind/search/cursor, or movement filters/dates/cursor. Outputs: reference or movement pages. Checks: authenticated tenant read access and cursor scope; movement dates use the application’s Manila calendar. RPCs: `inv_get_procurement_reference_data`, `inv_list_inventory_movements`. Secret: `INVENTORY_BACKEND`.

### executeProcurementCommand

Purpose: execute one typed, idempotent Inventory workflow transaction. Commands cover MR revision/additional/approval, quotation, priced PR with four-stage review/reassignment, PO/dispatch, delivery/inspection/acceptance/receipt/returns, explicit historical reconciliation, supplier/warehouse/location/tracking setup, and print display fields. Input: `kind`, command-specific `input`, idempotency key and, for updates, document ID plus expected version. Output: authoritative ID, kind, version, replay flag, invalidations, reference/status. Checks: tenant and actor are server-derived; Viewer is denied before payload validation; setup, reassignment and reconciliation require Administrator; optimistic version and database lifecycle rules apply. RPC: `inv_execute_procurement_command`. Secret: `INVENTORY_BACKEND`.

### createProcurementAttachmentUpload / finalizeProcurementAttachment / getProcurementAttachmentDownload

Purpose: reserve a random tenant/document path, issue a two-hour non-overwriting signed upload, verify the uploaded PDF/PNG/JPEG (maximum 5 MiB) by metadata, bytes and checksum, and issue a five-minute private download. Inputs: document identity and bounded file metadata, or attachment ID. Outputs: signed transfer data or finalized state. Checks: writers are Administrator/Inventory Staff; Viewer may download a ready file only after current document access is rechecked; bucket `inventory-documents` must already exist and remain private. Tables/RPCs: `inv_procurement_attachments` and attachment RPCs; Supabase Storage only for the dedicated bucket. Secret: `INVENTORY_BACKEND`.

## React example

```ts
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "./firebase";

const inventory = httpsCallable(getFunctions(firebaseApp!, "asia-southeast1"), "inventory");
const result = await inventory({
  operation: "listInventoryItems",
  input: { limit: 25 }
});
console.log(result.data); // Inventory data only; never credentials.
```

The signed-in Firebase user's token is attached automatically. Production code uses the typed wrappers in `src/services/inventory-api.ts` and maps failures to safe UI messages.

## Build, deploy and verify

```sh
npm run test:functions
npm run build:functions
firebase deploy --project apps-workspace-b61a9 --only functions:inventory:inventory
firebase functions:list --project apps-workspace-b61a9
```

Before deployment, apply exactly the reviewed `20261023000100` through `20261023000700` Inventory procurement migrations with an authorized PostgreSQL connection and run `npm run verify:inventory-release`. A Supabase service-role API key cannot apply SQL migrations. This exact selector deploys only `inventory` in codebase `inventory`. Confirm it is ready and rejects anonymous calls before deploying Hosting. Never deploy or delete `serviceDesk` as part of Inventory work. Keep the Supabase Edge deployment for the acceptance rollback window.

## If the callable is blocked by Cloud Run IAM

Firebase browser tokens are verified inside the callable. The Cloud Run transport must allow requests to reach that verifier. A project administrator with permission to change this service's IAM can run:

```sh
gcloud run services add-iam-policy-binding inventory \
  --project=apps-workspace-b61a9 \
  --region=asia-southeast1 \
  --member=allUsers \
  --role=roles/run.invoker
```

This changes only invocation of the `inventory` service. It grants no database, secret, user-administration or Service Desk access. The callable still rejects missing Firebase auth, unverified email, invalid membership, disallowed role and foreign-tenant data. The deployer does not need project Owner or Secret Manager Admin for this administrator-applied alternative.

After this command, verify an anonymous POST returns the callable JSON `UNAUTHENTICATED` response rather than an HTML transport 403. Then deploy Hosting and test signed-in tenant A/B accounts. Do not force an Artifact Registry cleanup policy on the shared repository as an unrelated deployment workaround.
