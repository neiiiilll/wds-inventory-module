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

## Firebase Functions configuration

Production secrets are Firebase Secret Manager values:

```sh
firebase functions:secrets:set SUPABASE_URL --project apps-workspace-b61a9
firebase functions:secrets:set SUPABASE_SERVICE_ROLE_KEY --project apps-workspace-b61a9
```

For emulation, copy `functions/.env.example` to an ignored local configuration file. Firebase secret parameters can be overridden in `functions/.secret.local`; do not commit that file. Use the local Supabase API URL and local service-role value only. Keep `INVENTORY_BOOTSTRAP_TENANT_KEY=inventory-test` only for a non-production test tenant; leave it empty for production deployment.

Client and server region must match `asia-southeast1`. Start all relevant emulators together:

```sh
firebase emulators:start --only auth,functions,hosting
```

Test first login twice to confirm provisioning is idempotent, the `tenant_key` custom claim is set, and React refreshes the token. Then suspend the membership and confirm the very next callable is denied. Repeat with a valid ID from another tenant and confirm the response does not disclose its existence.

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
