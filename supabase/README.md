# Inventory database and canonical Edge API

Supabase Apps Core project `oqsgzdkljtxtpwdzptnw` hosts the shared Postgres database and the canonical Inventory API, `inventory-api`. Inventory owns only `inv_*` objects and `app_key = 'inventory'`. It must not create, alter, delete, or query `svc_*` tables. Coordinate any shared-table prerequisite with the service desk team.

## Migration order

Supabase applies the committed files in this dependency order:

1. `20261022000100_inventory_shared_prerequisites.sql` — shared uniqueness prerequisites, application/role seeds, and test tenant.
2. `20261022000200_inventory_catalog_stock.sql` — catalog, locations, items, balances, movements, and counters.
3. `20261022000300_inventory_workflows.sql` — request, procurement, receiving, issue, return, and count workflows.
4. `20261022000400_inventory_integrity_rls.sql` — indexes, timestamps, tenant integrity, and deny-by-default RLS.
5. `20261022000500_inventory_rpcs.sql` — atomic document numbering, request creation, and stock posting.
6. `20261022000600_inventory_legacy_compatibility.sql` — forward-only compatibility for the approved shared `app_users.role` requirement.

Shared parent tables use `UNIQUE (tenant_id, id)` and application roles use `UNIQUE (app_key, role_key)`. Composite child foreign keys remain tenant-bound.

## Local database verification

Use a disposable local database:

```sh
supabase start
supabase db reset
supabase test db
```

Before an authorized schema release, review rather than blindly apply changes:

```sh
supabase db diff --linked
supabase db push --dry-run
supabase db push
supabase test db
```

This Edge cutover does not authorize a database migration. Never paste an introspection dump into SQL Editor, edit applied migration history, reset production, or drop shared objects. Correct database behavior with a reviewed forward migration.

## Canonical Inventory API configuration

The Edge runtime receives `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Supabase. Set the additional handler configuration only on Apps Core:

```sh
npx supabase secrets set FIREBASE_PROJECT_ID=apps-workspace-b61a9 INVENTORY_ALLOWED_ORIGINS=https://app-invb61a9.web.app,https://app-invb61a9.firebaseapp.com --project-ref oqsgzdkljtxtpwdzptnw
npx supabase functions deploy inventory-api --project-ref oqsgzdkljtxtpwdzptnw --no-verify-jwt
npx supabase functions list --project-ref oqsgzdkljtxtpwdzptnw
```

For local execution, create ignored `supabase/functions/.env.local` values and run:

```sh
supabase functions serve inventory-api --no-verify-jwt --env-file supabase/functions/.env.local
```

Automatic role assignment is disabled. Create test users, exactly one active membership, and explicit Inventory roles through a trusted administrative process before signing in.

The gateway JWT check is disabled because the bearer token is a Firebase ID token. The handler verifies RS256 signature, issuer, audience, lifetime, and UID. It then derives tenant and role exclusively from `app_users`, `tenant_memberships`, `tenants`, `applications`, `membership_roles`, and `app_roles`. It ignores Firebase `tenant_id` as Inventory authority and never creates records or custom claims.

## RLS and service-role boundary

Every `inv_*` table has RLS enabled and intentionally has no browser policies. The service role bypasses RLS, so Edge handlers must validate access and add the authorized tenant to every query and RPC. RLS blocks accidental direct browser access; it is not the authorization boundary for service-role code.

Transaction RPCs are executable only by `service_role`. `inv_next_document_number` locks the counter through `INSERT ... ON CONFLICT DO UPDATE`. `inv_create_material_request` and `inv_post_stock_movement` validate tenant-owned references and perform headers, lines, balances, versions, counters, and audit writes atomically.

## Deployment verification

Edge before Hosting is mandatory. Run `npm run test:edge`, deploy only `inventory-api`, and verify unauthenticated and invalid tokens fail safely. Then use controlled tenant A and tenant B Firebase users to prove listing, updates, requests, and stock movements cannot cross tenants. Test Viewer mutation denial, stale versions, idempotent replay, and full rollback of mixed valid/foreign batches.

The browser uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never put `SUPABASE_SERVICE_ROLE_KEY`, a secret key, Firebase Admin credential, password, or ID token in browser configuration.

## Shared-project pre-deploy review

- Confirm the project ref is exactly `oqsgzdkljtxtpwdzptnw`.
- Inspect Inventory migrations and Edge source for `svc_`; none may be referenced.
- Confirm required authorization records, `inv_*` tables, and the three Inventory RPCs exist.
- Confirm all `inv_*` tables have RLS enabled and RPC execution remains service-role-only.
- Confirm production CORS origins are exact.
- Configure Supabase usage monitoring and spend controls.
- Preserve migration history and use a reviewed forward migration for future database corrections.

The Firebase Inventory Functions remain available only during the rollback window. Their source and restoration command are documented in [functions/README.md](../functions/README.md). The Firebase `serviceDesk` Function is never part of Inventory deployment or retirement.
