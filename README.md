# WDS Inventory

React 19 + Vite inventory UI with Firebase Hosting, Authentication, and second-generation callable Functions. Functions run on Node.js 22 in `asia-southeast1` and use Supabase Postgres as the shared data layer. The browser sends its Firebase ID token through `httpsCallable`; every business call compares its server-issued `tenant_id` UUID claim with current database membership and role records.

Only Firebase web configuration and the optional Functions region are browser settings. Database credentials live in Firebase Secret Manager. The browser never chooses tenant, actor, role, status, document number, or replacement version values.

## Setup and local verification

Use Node.js 22, the Firebase CLI, and Supabase CLI/Docker for database integration tests. Firebase Functions deployment requires the Blaze billing plan. The running Figma Make Vite preview is normally on port 8443.

```sh
npm install
npm --prefix functions install
npm test
npm run test:functions
npm run build:functions
npx tsc --noEmit
npm run build
```

Copy `.env.example` to ignored `.env.local` and fill in Firebase web settings. `VITE_FIREBASE_FUNCTIONS_REGION=asia-southeast1` defaults to the deployed region; override only for a matching deployment. Remove obsolete browser database settings. Never put server secrets in any `VITE_*` value.

For a disposable database, run `supabase start`, `supabase db reset`, and `supabase test db`. See [supabase/README.md](supabase/README.md) for migration order and shared-project precautions.

Run `npm run build` then `npm run emulators` for Auth (9099), Functions (5001), and Hosting (5000). Set ignored `functions/.secret.local` values for `SUPABASE_URL` and `SUPABASE_SECRET_KEY` using a disposable database only. The browser does not automatically connect to emulators: use the explicitly connected SDK harness in [functions/README.md](functions/README.md), with Auth users whose UIDs match database fixtures. Hosting emulator alone still serves a client configured for deployed services.

## Login access validation

Automatic role assignment is disabled. A trusted administrator must create the existing `app_users` record, exactly one active tenant membership, and an explicit Inventory role. Login never creates users, memberships, or default roles. Administrator, Inventory Staff, and explicitly assigned Viewer roles retain their permissions.

`provisionInventoryAccess` requires verified email and synchronizes `tenant_id` to the authorized Supabase tenant UUID, preserving unrelated claims. If `refreshToken` is true, React forces `getIdToken(true)` once and calls provisioning again for fresh access. A second refresh request fails closed. Inactive accounts remain blocked; every business callable revalidates active database access, including revoked memberships and roles.

## Deployment

Firebase project `apps-workspace-b61a9` serves Hosting target `app`, site `app-invb61a9`. Supabase project `tehynsbnasihzktzvyzy` remains the shared database. Verify the target project and use interactive secret entry so credentials never appear in shell history or output:

```sh
firebase login --reauth
firebase functions:secrets:set SUPABASE_URL --project apps-workspace-b61a9
firebase functions:secrets:set SUPABASE_SECRET_KEY --project apps-workspace-b61a9
supabase db push --dry-run
supabase db push
supabase test db
npm test
npm run build:functions
npx tsc --noEmit
npm run build
npm run deploy:functions
firebase functions:list --project apps-workspace-b61a9
```

Deploy the isolated `inventory` Functions codebase before Hosting. This preserves the separate `serviceDesk` callable in the shared Firebase project. Confirm all five callable names and `asia-southeast1`; complete callable smoke tests before running `npm run deploy:hosting`. Changing a secret requires redeploying bound Functions. [functions/README.md](functions/README.md) documents each callable and the smoke harness.

Use verified, explicitly assigned tenant A and tenant B accounts. Smoke-test provisioning and claim refresh, listing, a version-checked update, a draft material request, and a stock post retried with the same idempotency key. Verify one stock movement and one balance change. Repeat a stale item version and expect `aborted`. Unassigned/unverified accounts, disabled users, and revoked memberships must be denied. Viewer may list but cannot mutate.

For the cross-tenant test, use tenant A credentials with tenant B item, location, requester, and asset identifiers. Updates must return a generic conflict; workflows must reject without disclosing existence, and tenant B data must remain unchanged. Submit forged tenant/actor/role fields and confirm rejection. Confirm full transaction rollback for a multi-line batch with one invalid line. Retain before/after evidence from both fixtures.

## Rollback window

Keep the previous Edge deployment live throughout the rollback window, until production acceptance and an explicit retirement decision. Its source/configuration in `supabase/functions/` is noncanonical and rollback-only; active scripts deploy Firebase Functions.

Record the previous Hosting release before cutover. If smoke tests fail before Hosting deployment, stop while the previous client continues using Edge. If failure occurs afterward, restore the previous compatible Hosting release first through Firebase Hosting release history; keep its matching Edge deployment available. Rebuilding the old client from source also requires its former browser settings. Do not retire Edge or its secrets during this window. Fix database behavior with a reviewed forward migration; never drop tables, remove RPCs, or rewrite applied history for rollback.

## Security checklist

- No server credential, private key, database password, or real token belongs in React, Vite variables, source, logs, or Git.
- Firebase validates callable authentication; handlers validate `tenant_id` and recheck one active membership, tenant/application, and allowed Inventory role.
- Every query/RPC receives the authorized tenant UUID. The server secret bypasses RLS, so function-code tenant and role validation remains mandatory.
- Inventory tables have deny-by-default RLS; RPC execution is granted only to `service_role`. Composite child references remain tenant-bound.
- Updates require expected versions; stock posts use bounded idempotency keys and atomic RPCs.
- Safe UI errors hide SQL, credentials, internal details, and cross-tenant existence. Server logs use correlation references and safe error codes.
- Login never grants roles. Coordinate shared-table/index changes with the service desk team.

## Important paths

| Path | Purpose |
| --- | --- |
| `functions/src/index.ts` | Canonical regional callable exports |
| `functions/src/access.ts` | Database membership, claim, and role checks |
| `functions/README.md` | Callable reference, secrets, emulators, smoke tests |
| `supabase/migrations/` | Existing prerequisites, inventory schema, RLS, RPCs |
| `supabase/tests/inventory_rpcs_test.sql` | pgTAP transaction and tenant-boundary tests |
| `supabase/functions/` | Rollback-only Edge source |
| `src/services/inventory-api.ts` | Typed React callable wrappers and safe errors |

The Inventory List route uses the backend; remaining procurement screens retain local prototype workflow state.
