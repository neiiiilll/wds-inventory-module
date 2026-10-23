# Firebase Callable Cutover Design

## Goal

Move the inventory API transport and server secrets from Supabase Edge Functions to Firebase second-generation callable Cloud Functions while keeping Firebase Hosting and Authentication in front of the React client and keeping Supabase Postgres, inventory tables, and transaction RPCs as the data layer.

## Runtime architecture

The React app is hosted by Firebase and signs users in with Firebase Authentication. It initializes Firebase Functions in `asia-southeast1` and invokes typed callables with `httpsCallable`. Firebase automatically validates and exposes the caller's ID token as `request.auth`.

Firebase Functions run on Node.js 22. They use Firebase Secret Manager values `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to create a server-only Supabase client. No Supabase credential or public Supabase endpoint remains in browser configuration after cutover.

Supabase remains the shared Postgres backend. Existing migrations, deny-by-default inventory RLS, `inv_*` tables, shared access tables, and atomic inventory RPCs remain unchanged. Functions must never access a `svc_*` table.

## Identity, claims, and authorization

`provisionInventoryAccess` is the only callable that may run before a tenant claim exists. It requires Firebase authentication and a verified email, resolves `app_users.firebase_uid`, requires exactly one active membership, an active tenant and Inventory application, and an explicitly assigned Inventory role. It never creates a user, membership, or role.

When database access is valid, provisioning preserves unrelated Firebase custom claims and sets `tenant_id` to the Supabase tenant UUID. It returns `refreshToken: true` when the token is missing or has a stale tenant claim. React then calls `currentUser.getIdToken(true)` before invoking business functions.

Every business callable rejects an unauthenticated request, validates `request.auth.token.tenant_id`, re-resolves the active database membership and Inventory role, and requires the database tenant UUID to match the claim. The client may never submit tenant, actor, role, status, document number, or replacement version fields. Every database query and RPC is explicitly scoped by the authorized tenant UUID because the service role bypasses RLS.

## Callable surface

- `provisionInventoryAccess`: resolves explicit access and synchronizes `tenant_id`.
- `listInventoryItems`: lists a bounded page of tenant items and balances.
- `updateInventoryItem`: updates whitelisted fields with tenant scoping and optimistic version checks.
- `createMaterialRequest`: validates input and invokes the tenant-scoped atomic RPC.
- `postStockMovement`: validates input and invokes the tenant-scoped idempotent stock RPC.

The callables preserve the existing browser DTOs and error codes. Expected failures use `HttpsError`; unexpected failures return a correlation reference without leaking database, token, SQL, or secret details.

## Client cutover and rollback

The React transport changes from direct `fetch` to the Supabase Edge endpoint to `httpsCallable`. Browser Supabase environment values and the Edge HTTP transport are removed from the active path. The Edge deployment remains live during the rollback window, but its deployment scripts and documentation are retired so it is not accidentally treated as canonical.

Functions deploy before Hosting. If callable smoke tests fail before Hosting cutover, the current client remains on Edge. If failure occurs after Hosting cutover, roll Hosting back first while Edge remains live. Applied database migrations are never rewritten or dropped.

## Verification

Tests cover unauthenticated calls, malformed or stale claims, explicit-role enforcement, multiple memberships, tenant mismatch, forbidden client fields, tenant-scoped queries, cross-tenant identifiers, safe errors, optimistic conflicts, transaction failures, and idempotent replay. Source scans reject `svc_*` references and browser/server-secret leakage. Production smoke tests use separate tenant A and tenant B users.

