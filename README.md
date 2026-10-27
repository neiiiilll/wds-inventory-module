# WDS Inventory

React 19 + Vite on Firebase Hosting, Firebase Authentication for Google sign-in, one Firebase v2 callable named `inventory`, and Supabase Apps Core Postgres for database transactions and Inventory data.

The canonical Inventory API is the Firebase `inventory` callable in `asia-southeast1`. React sends a Firebase ID token automatically through `httpsCallable`. The callable reads Firebase JSON secret `INVENTORY_BACKEND`, resolves exactly one existing tenant membership and the Inventory role in Apps Core, and applies that tenant to every operational query and RPC.

Architecture: React → Firebase Authentication → Firebase `inventory` callable → Supabase Postgres. Secret Manager supplies credentials only to the callable. Firebase project: `apps-workspace-b61a9`. Supabase project: `oqsgzdkljtxtpwdzptnw`. The separate `serviceDesk` function and `SERVICE_DESK_BACKEND` remain outside Inventory deployment.

See the [architecture](docs/superpowers/specs/2026-10-23-single-inventory-cloud-function-design.md) and [implementation plan](docs/superpowers/plans/2026-10-23-single-inventory-cloud-function.md).

## Local setup and verification

Use Node.js 22 and copy the Firebase browser settings from `.env.example` into ignored `.env.local`. React requires Firebase web configuration, not a Supabase secret or publishable key. Optional Supabase public environment settings remain for explicit Edge rollback only.

```sh
npm install
npm --prefix functions install
npm test
npm run build:functions
npx tsc --noEmit
npm run build
```

## Authentication, tenant and roles

Automatic role assignment is disabled. A trusted administrator supplies `app_users`, exactly one `tenant_memberships` record, an active tenant, and explicit `membership_roles`/`app_roles` for app `inventory`. Every request rechecks these records. A valid login does not create access.

Apps Core is the sole tenant and Inventory role authority. Inventory does not set, remove or depend on Firebase tenant claims. Administrator and Inventory Staff can perform allowed operational changes; Viewer can read but cannot mutate. Browser tenant, actor, and role values are rejected.

The callable supports catalog operations plus live Dashboard/procurement reads, typed procurement commands, and private attachment transfer through one allowlisted gateway. See [functions/README.md](functions/README.md) for every input, output, table, RPC, secret and access check.

## Deployment

Function before Hosting: verify and deploy the single callable first, then the React Hosting build.

```sh
npm run test:functions
npm run test:database
npm run verify:inventory-release
npm run deploy:functions
firebase functions:list --project apps-workspace-b61a9
npm run deploy:hosting
```

The Functions script selects only `functions:inventory:inventory`. Never use a broad Functions deployment or deletion against the shared project. Service Desk requires no deployment or access changes. The runtime needs Secret Manager Secret Accessor on `INVENTORY_BACKEND`; do not grant project Owner/Admin as a workaround.

Verify anonymous requests fail with unauthenticated. Use controlled signed-in users to check tenant A/B isolation, Viewer denial, current role changes, version conflicts and idempotent stock replay. A foreign-tenant ID must never expose data or permit mutation. Test complete rollback of mixed valid/foreign batches.

## Rollback

The existing Supabase `inventory-api` Edge deployment is retained during the rollback window. React calls only the Firebase callable and has no silent Edge fallback. If callable acceptance fails, redeploy the last known Edge-backed Hosting release. `npm run test:edge` continues testing retained Edge source; `npm run deploy:edge` is an explicit rollback maintenance command, not part of normal releases.

## Database and security

Supabase remains the database and transaction layer. Inventory operational tables are `inv_*`; authorization tables are shared. The service role bypasses RLS, so callable handlers and atomic RPCs must enforce tenant restrictions. RLS remains enabled, and privileged RPCs remain service-role-only.

Never put service credentials, private keys, real tokens or database passwords in React, Vite environment variables, source, logs or Git. Error responses use safe messages and correlation references.

See [supabase/README.md](supabase/README.md) for migration order, `supabase db reset`, `supabase test db`, and forward migration precautions.

## Current UI scope

Dashboard, Inventory List, Transactions, Stock In, Material Requests, Quotations, Purchase Requests, Purchase Orders, Inspection & Acceptance, procurement setup, print views and private attachments use the live Firebase callable and existing Supabase records. They never fall back to browser demo state. Stock Out/RIS, Material Charges, Returns & Reconciliation, Stock Trail and Reports remain explicitly labelled browser-demo areas until their own live backend scope is approved.

## Database release gate

The seven additive Inventory procurement migrations are `20261023000100` through `20261023000700`. Apply only those reviewed files to Apps Core using an authorized PostgreSQL migration connection, then run `npm run verify:inventory-release` with `INVENTORY_DATABASE_URL` set for a read-only installed-schema probe. The script prints SHA-256 hashes and refuses unexpected Inventory procurement files, Service Desk references, or shared-table DDL. If SQL authority is unavailable, stop before Functions/Hosting deployment and give the exact scripts and hashes to the Apps Core owner; never substitute the Supabase service-role API key.
