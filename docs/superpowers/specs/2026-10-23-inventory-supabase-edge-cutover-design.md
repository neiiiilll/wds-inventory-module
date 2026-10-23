# Inventory Supabase Edge Cutover Design

Date: 2026-10-23

## Objective

Move the Inventory API from five Firebase callable Functions to the existing single Supabase Edge Function, `inventory-api`, without interrupting production access. Firebase Authentication remains the identity provider. Supabase Apps Core (`oqsgzdkljtxtpwdzptnw`) becomes both the Inventory API runtime and the PostgreSQL data platform. The existing Firebase `serviceDesk` function and all `svc_*` database objects remain untouched.

## Current State

- React authenticates users with Firebase Auth and calls five Firebase v2 callable Functions with `httpsCallable`.
- The Functions validate Firebase authentication, verified email, the `tenant_id` claim, current database membership, and Inventory role permissions.
- The Functions use the Firebase JSON secret `INVENTORY_BACKEND` to call tenant-filtered `inv_*` tables and service-role-only Inventory RPCs in Apps Core.
- A previous Supabase Edge implementation remains in `supabase/functions/inventory-api` with the same five logical actions and server-side Firebase ID-token verification.
- Historical Edge deployment documentation references Supabase project `tehynsbnasihzktzvyzy`; that reference must not be used for this cutover. The approved target is Apps Core, `oqsgzdkljtxtpwdzptnw`.

## Target Architecture

```text
React application
    -> Firebase Authentication ID token
    -> Supabase inventory-api Edge Function
    -> authentication, verified-email, membership, role, and tenant checks
    -> Apps Core inv_* tables and Inventory RPCs
```

Firebase continues to own user authentication and custom claims. The browser sends the current Firebase ID token as a bearer token, but never sends a trusted tenant, actor, role, status, version replacement, or server credential. The Edge Function verifies the token against Firebase's public signing keys and derives authorization from server-controlled identity and database records.

## API Shape

One Edge endpoint accepts a strict JSON envelope containing an `action` and action-specific `data`. It exposes the same five logical operations used by the current React service:

- `provisionInventoryAccess`
- `listInventoryItems`
- `updateInventoryItem`
- `createMaterialRequest`
- `postStockMovement`

The public TypeScript service interface and safe client error codes remain stable so components do not need business-logic changes. Only the transport changes from Firebase `httpsCallable` to the Supabase Edge HTTP endpoint.

## Runtime Configuration

Deploy `inventory-api` only to Supabase Apps Core (`oqsgzdkljtxtpwdzptnw`). The deployment uses `--no-verify-jwt` because the incoming bearer token is issued by Firebase, not Supabase; the handler performs full Firebase JWT verification itself.

The Edge runtime receives Supabase platform values server-side and requires these additional project secrets:

- `FIREBASE_PROJECT_ID=apps-workspace-b61a9`
- `INVENTORY_ALLOWED_ORIGINS`, containing only approved Inventory Hosting origins and explicitly approved local development origins when needed

No service-role key or other server secret may be placed in a `VITE_*` variable, committed file, browser bundle, or log. The browser receives only the Supabase project URL needed to reach the Edge endpoint.

For database-heavy requests, invoke the Edge Function in the Apps Core database region when the project region is confirmed. Do not hardcode a region until that check is complete.

## Authorization and Tenant Isolation

The Edge Function must preserve the existing fail-closed checks:

1. Require a valid Firebase ID token issued for `apps-workspace-b61a9`.
2. Require a verified email.
3. Reject client-supplied tenant, actor, role, status, document number, or replacement-version authority fields.
4. Resolve the Firebase UID to the active shared user record.
5. Require exactly one active tenant membership and an explicit active Inventory role.
6. Compare any required Firebase `tenant_id` claim with the database tenant and reject mismatches.
7. Apply the authorized tenant UUID to every `inv_*` query and Inventory RPC.
8. Never access `svc_*` tables.

The service role bypasses RLS, so server-side tenant predicates and RPC validation remain mandatory. Existing deny-by-default RLS and service-role-only RPC grants remain unchanged during this cutover.

## Client Cutover

Update `src/services/inventory-api.ts` to:

- Require a signed-in Firebase user.
- Obtain a current Firebase ID token without exposing it in logs.
- POST `{ action, data }` to the Apps Core `inventory-api` endpoint.
- Send the ID token only in the `Authorization: Bearer` header.
- Map sanitized Edge error responses to the existing `InventoryApiError` codes and messages.
- Preserve the existing provisioning and one-time token-refresh behavior.

Remove the React dependency on `firebase/functions` only after all Inventory callers use the Edge transport. Firebase Auth remains configured.

## Deployment and Cutover Sequence

1. Validate the retained Edge source and tests against the current Firebase callable behavior.
2. Confirm the Apps Core region, required `inv_*` tables, authorization records, and three Inventory RPCs.
3. Set only the two required Edge configuration secrets in Apps Core without printing their values.
4. Deploy `inventory-api` to `oqsgzdkljtxtpwdzptnw` with Firebase-token gateway verification delegated to the handler.
5. Smoke-test the Edge endpoint before changing React.
6. Change React to the Edge transport and run unit tests, type checking, and the production build.
7. Test a preview or controlled client release against the Edge endpoint.
8. Verify authentication, verified-email enforcement, roles, mutations, transaction behavior, idempotency, and tenant isolation.
9. Deploy Hosting only after acceptance if explicitly authorized.
10. Delete only the five Inventory Firebase Functions after the Edge-backed client is verified in production.
11. Retain `serviceDesk` and its configuration unchanged.

## Verification

Required acceptance tests include:

- Unauthenticated requests fail.
- Unverified-email requests fail.
- Users without an explicit Inventory role fail.
- Viewers can list but cannot mutate.
- Administrators and Inventory Staff can perform permitted mutations.
- Stale item versions fail without overwriting newer data.
- Material-request and stock-movement RPCs remain atomic.
- Replaying a stock idempotency key does not apply stock twice.
- Tenant A cannot list, update, reference, or infer Tenant B records.
- Mixed valid and foreign-tenant transaction inputs roll back completely.
- No response or log contains service credentials or sensitive record-existence details.
- `serviceDesk` remains deployed and unchanged.

Run the existing Edge tests, application tests, production build, and targeted live smoke tests. Record endpoint response status and sanitized results without storing tokens or secrets.

## Rollback

Keep the five Firebase Inventory Functions deployed while the Edge endpoint and new React transport are validated. If Edge verification or the client cutover fails, keep or restore the callable-backed Hosting release. Do not delete either runtime until production acceptance.

After the five Firebase Inventory Functions are deleted, rollback requires redeploying only the isolated `functions:inventory` codebase before reverting Hosting. Never deploy all Firebase functions, delete `serviceDesk`, reset the shared database, or roll back migrations destructively.

## Out of Scope

- Changing Firebase Authentication providers or migrating users to Supabase Auth
- Modifying or deleting `serviceDesk`
- Reading or changing `svc_*` tables
- Changing shared database schema or existing Inventory migrations
- Removing Firebase Hosting
- Exposing direct browser access to service-role credentials
