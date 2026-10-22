# WDS Inventory

React 19 + Vite inventory UI with Firebase Authentication and Firebase callable Cloud Functions. The functions revalidate every Firebase user, tenant membership, inventory role, and active status in a shared Supabase Postgres database before using the service role for a tenant-scoped operation.

The browser never receives Supabase credentials and never chooses its tenant. `tenant_key` is a Firebase custom claim set by the Admin SDK; it is only a hint until the callable verifies the matching active Supabase membership.

## Local development

Use Node.js 22. The Vite development server is normally already available on port 8443 in Figma Make.

```sh
npm install
npm --prefix functions install
npm test
npm --prefix functions test
npx tsc --noEmit
npm run build
npm --prefix functions run build
```

Create `.env.local` from `.env.example` with the Firebase web configuration. Keep `VITE_FIREBASE_FUNCTIONS_REGION=asia-southeast1`; it must match the server region in `functions/src/config.ts`.

For local Functions emulation, use placeholder/value files ignored by Git as described in [supabase/README.md](supabase/README.md). Then run:

```sh
firebase emulators:start --only auth,functions,hosting
```

To execute the Functions unit suite while the emulators are running:

```sh
firebase emulators:exec --only auth,functions "npm --prefix functions test"
```

## First-login provisioning

`provisionInventoryAccess` validates the Firebase identity against `app_users`, the single active `tenant_memberships` row, the active tenant, and an inventory `membership_roles` assignment. If the database assignment is valid, it preserves existing Firebase custom claims, sets `tenant_key`, and tells React to force-refresh the ID token with `getIdToken(true)`.

`INVENTORY_BOOTSTRAP_TENANT_KEY` enables idempotent Viewer provisioning into the named test tenant. It is a non-production convenience only. Leave it empty in production and provision `app_users`, membership, and inventory roles through a trusted administrative process.

## Deployment

The Firebase project is `apps-workspace-b61a9`; Hosting target `app` maps to site `app-invb61a9`. Set secrets without echoing their values:

```sh
firebase functions:secrets:set SUPABASE_URL --project apps-workspace-b61a9
firebase functions:secrets:set SUPABASE_SERVICE_ROLE_KEY --project apps-workspace-b61a9
```

Apply and verify the inventory migrations first. Deploy Functions before Hosting so the new browser cannot call missing endpoints:

```sh
supabase db push
supabase test db
firebase deploy --project apps-workspace-b61a9 --only functions
firebase deploy --project apps-workspace-b61a9 --only hosting:app
```

After deployment, smoke-test sign-in, claim refresh, the inventory list, a version-checked update, and an idempotent stock-post retry. Also use a second tenant fixture to confirm cross-tenant IDs return a generic denial/not-found response without revealing record existence.

Rollback database behavior with a new forward migration; never delete or rewrite migration history already applied to the shared project. Roll back Functions before Hosting only when the older UI is compatible with the older callable contract.

## Security checklist

- No `SUPABASE_SERVICE_ROLE_KEY`, Firebase private key, database password, or real token is in React, Vite variables, source, logs, or Git.
- Every callable requires `request.auth.uid`, ignores client tenant/actor fields, and rechecks the active user, the one active membership, tenant claim match, active application, and allowed inventory role.
- Inventory queries and RPCs always receive the authorized `tenant_id`; child references are tenant-bound by composite foreign keys.
- RLS is enabled with no policies on every `inv_*` table. The service role bypasses RLS, so function-code tenant and role validation remains mandatory.
- RPC execution is revoked from `public`, `anon`, and `authenticated` and granted only to `service_role`.
- Stock posts use bounded idempotency keys and one atomic RPC; item updates require the expected version.
- Error responses hide SQL details and cross-tenant record existence; logs contain request IDs and failure types, not secrets.
- `INVENTORY_BOOTSTRAP_TENANT_KEY` is empty in production.
- Firebase client and server both use `asia-southeast1`.

## Important paths

| Path | Purpose |
| --- | --- |
| `supabase/migrations/` | Ordered shared prerequisites, inventory schema, integrity/RLS, and RPC migrations |
| `supabase/tests/inventory_rpcs_test.sql` | pgTAP transaction and tenant-boundary checks |
| `functions/src/access.ts` | Per-call Firebase/Supabase access revalidation |
| `functions/src/index.ts` | Regional callable exports |
| `src/services/inventory-api.ts` | Typed React callable wrappers and safe errors |
| `src/components/InventoryItemsPage.tsx` | Callable-backed inventory catalog |

The remaining procurement screens retain local prototype workflow state; the Inventory List route is connected to the multitenant backend.
