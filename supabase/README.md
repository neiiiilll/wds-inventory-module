# Inventory database and retained Edge source

Supabase Apps Core `oqsgzdkljtxtpwdzptnw` hosts the shared Postgres database and atomic transaction RPCs. The canonical Inventory API is the Firebase `inventory` callable. It authenticates Firebase ID tokens and resolves access from Apps Core shared authorization tables. The retained Supabase `inventory-api` Edge Function is available for explicit rollback during acceptance.

Inventory owns operational `inv_*` tables and `app_key = 'inventory'`. Shared authorization tables are read for access checks. The separate Firebase `serviceDesk` function, its secret and `svc_*` data are outside this release. Coordinate shared schema changes with the service desk team.

## Migration order

1. `20261022000100_inventory_shared_prerequisites.sql`: shared constraints, application/role seeds and test tenant.
2. `20261022000200_inventory_catalog_stock.sql`: catalog, locations, items, balances and movements.
3. `20261022000300_inventory_workflows.sql`: request, procurement, receipt and issue workflows.
4. `20261022000400_inventory_integrity_rls.sql`: indexes, tenant integrity and RLS.
5. `20261022000500_inventory_rpcs.sql`: atomic request creation, counters and stock posting.
6. `20261022000600_inventory_legacy_compatibility.sql`: forward compatibility for shared user records.

Shared parents use `UNIQUE (tenant_id, id)`; child foreign keys preserve tenant ownership.

For a disposable local database:

```sh
supabase start
supabase db reset
supabase test db
```

Review any future schema release with `supabase db push --dry-run` before `supabase db push`. Use a reviewed forward migration, never edit applied history or reset production. This callable cutover changes no database schema.

## Authority and RLS

Automatic role assignment is disabled. Supply an existing active `app_users` account, exactly one membership total that is active, an active tenant/application, and explicit `membership_roles`/`app_roles`. Both backends resolve the tenant from `tenant_memberships` and do not use browser tenancy or Firebase tenant claims as Inventory authority.

The service role bypasses RLS. Callable repositories and Inventory RPCs must apply tenant restrictions to every operation. Tables retain deny-by-default RLS. `inv_create_material_request` and `inv_post_stock_movement` are service-role-only and validate references and perform atomic writes. `inv_next_document_number` locks counters safely.

## Deployment and tests

Deploy the Firebase Function before Hosting using `npm run deploy:functions`. Firebase JSON secret `INVENTORY_BACKEND` holds the Supabase connection; no database credentials belong in React.

Use signed-in controlled tenant A/B users to verify listing and updates never cross tenants. Check Viewer mutation denial, changed roles, stale versions, stock idempotency and rollback of mixed valid/foreign batches. The repository unit suites simulate these boundaries; actual live authenticated acceptance is a separate check.

## Retained Edge rollback configuration

Normal React traffic uses Firebase `inventory`. The existing Edge source and deployment remain available during the rollback window:

```sh
npm run test:edge
npx supabase functions list --project-ref oqsgzdkljtxtpwdzptnw
```

If maintaining the rollback deployment, Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; the handler also needs `FIREBASE_PROJECT_ID=apps-workspace-b61a9` and exact `INVENTORY_ALLOWED_ORIGINS`. Its deployment uses `--no-verify-jwt` because the handler verifies Firebase rather than Supabase user tokens.

Do not redeploy or delete the Edge function merely to switch React. Do not put server keys in browser environment values. See [functions/README.md](../functions/README.md) for the active callable contract.
