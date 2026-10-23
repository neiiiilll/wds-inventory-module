# WDS Inventory

React 19 + Vite Inventory UI with Firebase Authentication and Hosting, a Supabase Edge API, and Supabase Postgres. Firebase proves user identity with an ID token. The canonical `inventory-api` Edge Function validates that token, resolves exactly one active `tenant_memberships` record and an explicit Inventory role, and applies the database-derived tenant UUID to every `inv_*` query and Inventory RPC.

Supabase Apps Core project `oqsgzdkljtxtpwdzptnw` is the Inventory API and database target. The shared Firebase project is `apps-workspace-b61a9`; its separate `serviceDesk` Function and all `svc_*` tables are outside Inventory scope.

## Setup and local verification

Use Node.js 22, npm, Firebase CLI, Supabase CLI, and Deno. Copy `.env.example` to ignored `.env.local` and set the Firebase web configuration plus Apps Core's browser-safe publishable configuration:

```dotenv
VITE_SUPABASE_URL=https://oqsgzdkljtxtpwdzptnw.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_browser_safe_publishable_key
```

The publishable key is intended for browser use. Never put a Supabase service-role key, secret key, Firebase Admin credential, real ID token, or database password in a `VITE_*` value, source file, log, or Git.

```sh
npm install
npm test
npm run test:edge
npm run build
```

The root suite also tests the retained Firebase rollback source until its rollback window closes. Run it independently with `npm run test:functions` and `npm run build:functions`.

For a disposable local database:

```sh
supabase start
supabase db reset
supabase test db
```

See [supabase/README.md](supabase/README.md) for migration order, Edge configuration, and shared-project precautions.

## Identity, authorization, and tenancy

Automatic role assignment is disabled. A trusted administrator must create the existing `app_users` record, exactly one active tenant membership, and an explicit Inventory role. Login never creates users, memberships, roles, or Firebase claims.

Firebase Auth identifies the user. Inventory ignores Firebase `tenant_id` for authorization and derives the one permitted tenant from Supabase `tenant_memberships`. This prevents the browser from choosing its tenant and avoids placing Firebase Admin credentials in Supabase. Service Desk's separate `client_id` behavior remains unchanged.

The active API exposes five logical actions through one Edge endpoint:

- `provisionInventoryAccess` resolves existing access without provisioning records or claims.
- `listInventoryItems` returns tenant-filtered catalog and balances.
- `updateInventoryItem` updates allowed fields with optimistic version checks.
- `createMaterialRequest` invokes the atomic request RPC.
- `postStockMovement` invokes the atomic, idempotent stock RPC.

Administrator and Inventory Staff may perform permitted mutations. An explicitly assigned Viewer may list but not mutate. Every action revalidates current user, membership, tenant, application, and role state.

## Edge deployment

The canonical Inventory API is `inventory-api` in Apps Core. Supabase supplies its server-side URL and service-role environment values. Set only the Firebase project and approved browser origins for the handler:

```sh
npx supabase secrets set FIREBASE_PROJECT_ID=apps-workspace-b61a9 INVENTORY_ALLOWED_ORIGINS=https://app-invb61a9.web.app,https://app-invb61a9.firebaseapp.com --project-ref oqsgzdkljtxtpwdzptnw
npm run test:edge
npm run deploy:edge
npx supabase functions list --project-ref oqsgzdkljtxtpwdzptnw
```

The deployment uses `--no-verify-jwt` because callers send Firebase rather than Supabase user tokens. The handler still verifies the Firebase token's signature, issuer, audience, lifetime, and UID before database access. CORS restricts browsers but is not authentication.

Deploy Edge before Hosting. First smoke-test missing, malformed, expired, and wrong-project tokens; valid verified users; explicit role rules; safe errors; version conflicts; material requests; stock posting; and idempotent replay.

For cross-tenant acceptance, use controlled users in tenants A and B. With tenant A's authenticated session, attempt to list or mutate tenant B item, location, requester, and asset identifiers. Foreign data must not be returned or disclosed, and a mixed valid/foreign batch must roll back completely. Never commit, log, or send test passwords or ID tokens through chat.

Only after authenticated Edge acceptance, obtain explicit approval and run:

```sh
npm run deploy:hosting
```

Verify the production browser calls `https://oqsgzdkljtxtpwdzptnw.supabase.co/functions/v1/inventory-api` and not a Firebase callable URL.

## Firebase Function retirement and rollback window

Keep the five Inventory Functions live until the Edge-backed production client and cross-tenant tests pass. Record the current list before any deletion:

```sh
firebase functions:list --project apps-workspace-b61a9
```

After production acceptance, delete only the exact Inventory allowlist:

```sh
firebase functions:delete provisionInventoryAccess listInventoryItems updateInventoryItem createMaterialRequest postStockMovement --region asia-southeast1 --project apps-workspace-b61a9 --force
firebase functions:list --project apps-workspace-b61a9
```

The second list must still contain the unchanged `serviceDesk` Function. Never use a wildcard, broad Functions deployment, or codebase-wide deletion. Keep `functions/` buildable during the rollback window. If rollback is required, restore the compatible callable-backed Hosting release and run `npm run deploy:functions:rollback`; do not change Service Desk or database migrations.

Do not delete the Firebase `INVENTORY_BACKEND` secret during this cutover. Secret cleanup is a separate reviewed decision after the rollback window.

## Security checklist

- No server credential, private key, database password, or real token belongs in React, Vite variables, source, logs, or Git.
- Firebase ID tokens establish identity; Supabase membership records establish Inventory tenant and role.
- The service role bypasses RLS, so Edge code and RPCs must enforce tenant boundaries on every operation.
- Inventory tables retain deny-by-default RLS and service-role-only RPC execution.
- Updates require expected versions; stock posts use bounded idempotency keys and atomic RPCs.
- Safe client errors hide SQL, credentials, internals, and foreign-record existence.
- Configure Supabase usage monitoring and spend controls because rejected Edge invocations may still count toward usage.
- Coordinate shared-table changes with the service desk team and use only reviewed forward migration files.

## Important paths

| Path | Purpose |
| --- | --- |
| `supabase/functions/inventory-api/index.ts` | Canonical Edge entry point |
| `supabase/functions/_shared/` | Firebase verification, authorization, validation, and repositories |
| `supabase/migrations/` | Shared prerequisites and `inv_*` schema/RPC migrations |
| `supabase/tests/inventory_rpcs_test.sql` | Transaction and tenant-boundary database tests |
| `src/services/inventory-http.ts` | Authenticated Edge transport and safe client errors |
| `src/services/inventory-api.ts` | Typed Inventory action wrappers |
| `functions/` | Temporary rollback-only Firebase Inventory source |

The Inventory List route uses the backend; remaining procurement screens retain local prototype workflow state.
