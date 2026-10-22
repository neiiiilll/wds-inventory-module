# WDS Inventory

React 19 + Vite inventory UI with Firebase Authentication and a Supabase Edge Function backend. The Edge API verifies every Firebase ID token, derives the caller's tenant from the shared Supabase membership model, revalidates the inventory role and active status, then uses the server-only service role for a tenant-scoped operation.

The browser receives only the public Supabase URL and publishable key. It never receives the service role and never chooses its tenant, actor, or role. The backend does not depend on a Firebase `tenant_key` custom claim.

## Local development

Use Node.js 22. The Vite development server is normally already available on port 8443 in Figma Make.

```sh
npm install
npm --prefix supabase/functions install
npm test
npm run test:edge
npx tsc --noEmit
npm run build
```

Create `.env.local` from `.env.example` with the Firebase web configuration, public Supabase URL, and public publishable key. Never place a service-role key in a `VITE_*` value.

For local Edge execution, create an ignored environment file with the non-browser settings described in [supabase/README.md](supabase/README.md), start the local Supabase stack, then run:

```sh
supabase start
supabase functions serve inventory-api --no-verify-jwt --env-file supabase/functions/.env.local
```

## Login access validation

`provisionInventoryAccess` validates the verified Firebase identity against `app_users`, the single active `tenant_memberships` row, the active tenant, and an inventory `membership_roles` assignment. Tenant context is always derived from the database; no custom claim is read or written.

Automatic role assignment is disabled. Before a user can access inventory, an administrator must create their `app_users` record, active tenant membership, and inventory role assignment through a trusted administrative process. Login only reads existing access; it never creates users, memberships, or Viewer roles. Existing Administrator, Inventory Staff, and explicitly assigned Viewer roles are preserved.

## Deployment

The Supabase project reference is `tehynsbnasihzktzvyzy`. Firebase project `apps-workspace-b61a9` remains on its current plan and serves only Hosting target `app`, mapped to site `app-invb61a9`. Configure the Edge runtime without echoing credential values:

```sh
npx supabase secrets set FIREBASE_PROJECT_ID=apps-workspace-b61a9 --project-ref tehynsbnasihzktzvyzy
npx supabase secrets set INVENTORY_ALLOWED_ORIGINS=https://app-invb61a9.web.app,https://app-invb61a9.firebaseapp.com --project-ref tehynsbnasihzktzvyzy
```

Supabase automatically provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the Edge runtime. Apply and verify migrations first. Deploy Edge before Hosting so the browser never calls a missing endpoint:

```sh
npx supabase db push
npx supabase test db
npx supabase functions deploy inventory-api --project-ref tehynsbnasihzktzvyzy --no-verify-jwt
firebase deploy --project apps-workspace-b61a9 --only hosting:app
```

After deployment, smoke-test sign-in with an assigned role, denial for an unassigned account, the inventory list, a version-checked update, and an idempotent stock-post retry. Also use a second tenant fixture to confirm cross-tenant IDs return a generic denial/not-found response without revealing record existence.

Rollback database behavior with a new forward migration; never delete or rewrite migration history already applied to the shared project. Roll back Hosting before the Edge function only when the older UI is compatible with the older API contract.

## Security checklist

- No `SUPABASE_SERVICE_ROLE_KEY`, Firebase private key, database password, or real token is in React, Vite variables, source, logs, or Git.
- Every Edge action verifies the Firebase ID token, ignores client tenant/actor fields, and rechecks the active user, one active membership, active tenant/application, and allowed inventory role.
- Inventory queries and RPCs always receive the authorized `tenant_id`; child references are tenant-bound by composite foreign keys.
- RLS is enabled with no policies on every `inv_*` table. The service role bypasses RLS, so function-code tenant and role validation remains mandatory.
- RPC execution is revoked from `public`, `anon`, and `authenticated` and granted only to `service_role`.
- Stock posts use bounded idempotency keys and one atomic RPC; item updates require the expected version.
- Error responses hide SQL details and cross-tenant record existence; logs contain request IDs and failure types, not secrets.
- Login never creates users, memberships, or default roles; inventory access requires an explicit assignment.
- `INVENTORY_ALLOWED_ORIGINS` contains only the deployed Hosting origins.

## Important paths

| Path | Purpose |
| --- | --- |
| `supabase/migrations/` | Ordered shared prerequisites, inventory schema, integrity/RLS, and RPC migrations |
| `supabase/tests/inventory_rpcs_test.sql` | pgTAP transaction and tenant-boundary checks |
| `supabase/functions/inventory-api/index.ts` | Edge runtime wiring and server-only service-role client |
| `supabase/functions/_shared/access.ts` | Per-request Firebase/Supabase access revalidation |
| `src/services/inventory-api.ts` | Typed React Edge API wrappers |
| `src/components/InventoryItemsPage.tsx` | Edge-backed inventory catalog |

The remaining procurement screens retain local prototype workflow state; the Inventory List route is connected to the multitenant backend.
