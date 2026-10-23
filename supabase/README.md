# Inventory database setup

These migrations own only `inv_*` objects and `app_key = 'inventory'`. They must not create, alter, delete, or query `svc_*` tables. The database is shared, so coordinate prerequisite changes to shared tables with the service desk team before deployment.

## Migration order

Supabase applies the timestamped files in this dependency order:

1. `20261022000100_inventory_shared_prerequisites.sql` — safe shared uniqueness prerequisites, application/role seeds, and one test tenant.
2. `20261022000200_inventory_catalog_stock.sql` — catalog, locations, items, balances, movements, and counters.
3. `20261022000300_inventory_workflows.sql` — request/procurement/receiving/issue/return/count workflow chain.
4. `20261022000400_inventory_integrity_rls.sql` — indexes, timestamps, tenant integrity, and deny-by-default RLS.
5. `20261022000500_inventory_rpcs.sql` — atomic document numbering, request creation, and stock posting.
6. `20261022000600_inventory_legacy_compatibility.sql` — forward-only compatibility for the approved legacy shared `app_users.role` requirement.

The shared prerequisites add `UNIQUE (tenant_id, id)` to parent tables when absent and `UNIQUE (app_key, role_key)` to `app_roles`. Composite child foreign keys are represented as one composite constraint, not two same-named single-column constraints. Review these shared indexes with the service desk team because both applications use the same tables.

## Local database and tests

Install the Supabase CLI and Docker, link only when targeting the intended project, then use a disposable local database:

```sh
supabase start
supabase db reset
supabase test db
```

`supabase db reset` applies every migration from a clean database. `supabase test db` runs `supabase/tests/inventory_rpcs_test.sql`, including document counter concurrency semantics, idempotent stock replays, negative-stock rejection, audit writes, and tenant boundaries.

Review the remote diff before applying to the shared project, then push only the committed migrations:

```sh
supabase db diff --linked
supabase db push --dry-run
supabase db push
supabase test db
```

Never paste the original introspection dump into SQL Editor. Never repair a deployed change by dropping shared objects or editing applied migration files. Create a new forward migration and coordinate any shared-table change.

## Supabase Edge Function configuration (rollback-only)

The following noncanonical configuration is retained only for the previous client during the rollback window. New releases use Firebase callables; do not redeploy Edge as the active API. The existing Edge runtime receives `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Supabase automatically. Its retained settings are:

```sh
npx supabase secrets set FIREBASE_PROJECT_ID=apps-workspace-b61a9 --project-ref tehynsbnasihzktzvyzy
npx supabase secrets set INVENTORY_ALLOWED_ORIGINS=https://app-invb61a9.web.app,https://app-invb61a9.firebaseapp.com --project-ref tehynsbnasihzktzvyzy
```

For local execution, create ignored `supabase/functions/.env.local` values and run `supabase functions serve inventory-api --no-verify-jwt --env-file supabase/functions/.env.local`. Automatic role assignment is disabled. Create test users, memberships, and explicit inventory roles through an administrative process before signing in.

The gateway JWT check is disabled because the bearer token is a Firebase ID token. The old handler verifies its RS256 signature, issuer, audience, lifetime, and UID. Only if restoring an older compatible release requires reconstructing its endpoint, the historical command is:

```sh
npx supabase functions deploy inventory-api --project-ref tehynsbnasihzktzvyzy --no-verify-jwt
```

Keep the existing Edge deployment and its settings live until production acceptance and an explicit retirement decision. Before Hosting cutover, failed callable smoke tests leave the old client on Edge. After cutover, restore the previous compatible Hosting release first while Edge remains live. Never remove migrations or RPCs for this rollback.

## Canonical Firebase callable deployment

The active API uses second-generation Functions on Node.js 22 in `asia-southeast1`. Set both server-only secrets interactively in Firebase Secret Manager:

```sh
firebase functions:secrets:set SUPABASE_URL --project apps-workspace-b61a9
firebase functions:secrets:set SUPABASE_SERVICE_ROLE_KEY --project apps-workspace-b61a9
npm run test:functions
npm run build:functions
npm run deploy:functions
```

Deploy Functions before Hosting; complete callable smoke tests before `npm run deploy:hosting`. Both secrets are bound to every callable. Use `npm run emulators` and ignored `functions/.secret.local` with disposable database credentials for local tests; see [functions/README.md](../functions/README.md) for explicit SDK emulator connections, inputs/outputs, role checks, and smoke harness.

Provisioning synchronizes `tenant_id` to the authorized database tenant UUID. A `refreshToken` response causes one browser token refresh before access is retried. Business calls recheck the membership and claim on every request. Automatic role assignment is disabled; fixtures require existing users, memberships, and explicit roles.

Smoke-test assigned/unassigned accounts, verified email, disabled/revoked memberships, Viewer mutation denial, version conflicts, material requests, and idempotent stock replay. Perform the cross-tenant test with two users and known item/location/personnel/asset identifiers; prove tenant A cannot access tenant B and failures do not reveal existence. Test mixed valid/invalid batches and confirm full transaction rollback.

## RLS and service-role boundary

Every `inv_*` table has RLS enabled and intentionally has no policies, so browser/anonymous/authenticated access is deny-all. The service role bypasses RLS. Therefore every callable must verify access and add the authorized tenant filter even though RLS is enabled; RLS is defense against accidental direct clients, not the authorization boundary for service-role code.

The transaction RPCs are executable only by `service_role`. `inv_next_document_number` locks the counter through `INSERT ... ON CONFLICT DO UPDATE`; `inv_post_stock_movement` validates all tenant-owned references and updates movement rows, balances, versions, and audit records in one database transaction.

## Shared-project pre-deploy review

- Confirm the service desk team approved shared unique constraints and no pending migration uses conflicting constraint names.
- Inspect every migration for `svc_`; the inventory migration set must never reference it.
- Confirm the test tenant key does not collide with production tenancy.
- Confirm all `inv_*` tables report RLS enabled and no client policies.
- Confirm RPC grants include `service_role` only.
- Run `supabase db push --dry-run` and retain its reviewed output with the release record.

If a release must be undone, preserve migration history and ship a reviewed forward migration. Do not drop shared tables, remove another team's indexes, or reset the production database.
