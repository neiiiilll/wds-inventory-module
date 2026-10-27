# Inventory live procurement release

This release changes Inventory only. It must not deploy, delete, or change `serviceDesk`, `SERVICE_DESK_BACKEND`, `svc_*` objects, Firebase Hosting, IAM, or existing business rows as a shortcut.

## Current gate

The local Firebase CLI account can list the existing `inventory` and `serviceDesk` callables, but the current Supabase CLI account receives HTTP 403 for database login-role access. The service-role API key inside `INVENTORY_BACKEND` is an application credential, not migration authority. Therefore Functions and Hosting deployment must wait for an Apps Core owner/database administrator to apply the reviewed SQL and return the schema-probe result.

## Reviewed migration order

Run `npm run verify:inventory-release` to print the current SHA-256 values. The only files authorized for this phase, in order, are:

1. `supabase/migrations/20261023000100_inventory_procurement_foundation.sql`
2. `supabase/migrations/20261023000200_inventory_procurement_reads.sql`
3. `supabase/migrations/20261023000300_inventory_procurement_documents.sql`
4. `supabase/migrations/20261023000400_inventory_procurement_receiving.sql`
5. `supabase/migrations/20261023000500_inventory_procurement_setup.sql`
6. `supabase/migrations/20261023000600_inventory_procurement_attachments.sql`
7. `supabase/migrations/20261023000700_inventory_procurement_ui.sql`

Before applying them, the owner must confirm a recoverable Apps Core backup/PITR point under the organization’s normal policy. Do not change shared backup settings merely for this task.

With an authorized direct PostgreSQL connection in `INVENTORY_DATABASE_URL`, apply all seven in one error-stopping transaction from the repository root:

```powershell
psql "$env:INVENTORY_DATABASE_URL" --single-transaction --set ON_ERROR_STOP=1 `
  --file supabase/migrations/20261023000100_inventory_procurement_foundation.sql `
  --file supabase/migrations/20261023000200_inventory_procurement_reads.sql `
  --file supabase/migrations/20261023000300_inventory_procurement_documents.sql `
  --file supabase/migrations/20261023000400_inventory_procurement_receiving.sql `
  --file supabase/migrations/20261023000500_inventory_procurement_setup.sql `
  --file supabase/migrations/20261023000600_inventory_procurement_attachments.sql `
  --file supabase/migrations/20261023000700_inventory_procurement_ui.sql
```

Then run the installed-schema probe without sharing or printing the connection value:

```powershell
npm run verify:inventory-release
```

The expected final line is `Installed Inventory schema probe passed.` If any migration or probe fails, stop. Do not deploy Functions or Hosting.

## Sequential release after the schema gate

1. Record `firebase functions:list --project apps-workspace-b61a9`; it must include both `inventory` and `serviceDesk` in `asia-southeast1`.
2. Run the complete local test/build gate documented in the implementation plan.
3. Deploy only `npm run deploy:functions` (`functions:inventory:inventory`).
4. Verify anonymous rejection and controlled signed-in Administrator, Inventory Staff, Viewer, tenant A and tenant B behavior. Use designated test records only; never edit real procurement rows for acceptance.
5. Verify the private `inventory-documents` bucket exists and is private before testing signed files.
6. Compare Service Desk metadata with the baseline. It must be unchanged.
7. Only after backend acceptance, run `npm run deploy:hosting` and repeat the two-tenant/role smoke test.

The retained Supabase Edge `inventory-api` remains an explicit rollback path during the acceptance window. React has no silent Edge or browser-demo fallback for live screens.
