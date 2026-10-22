# Inventory Supabase Edge Functions Design

## Status and goal

This design supersedes only the Firebase Cloud Functions transport in `2026-10-22-inventory-supabase-callables-design.md`. The approved database schema, migrations, RPCs, tenant integrity, inventory roles, optimistic locking, idempotency, and deny-all inventory RLS remain authoritative.

Firebase Authentication remains the login provider. Supabase Auth is not introduced. Because the Firebase project cannot use the Blaze plan, the inventory API moves from Firebase callable Functions to one Supabase Edge Function and Firebase Hosting remains the static frontend host.

The implementation continues to own only `inv_*` objects and `app_key = 'inventory'`. It must not create, alter, query, or otherwise reference `svc_*` tables.

## Approved tenancy decision

The Edge Function does not read, set, or depend on a Firebase `tenant_key` custom claim. A Firebase Admin credential is therefore not required.

On every request, the function derives tenancy from the authoritative database relationship:

1. Verify the Firebase ID token and obtain its immutable UID.
2. Resolve `app_users.firebase_uid` and require an active user.
3. Require exactly one `tenant_memberships` row and require `status = 'active'`.
4. Require the referenced tenant to be active.
5. Require an active `inventory` application and an assigned, existing inventory role allowed for the requested action.

The client never sends a tenant ID, tenant key, actor user ID, or role. Existing Firebase `tenant_key` claims are ignored. Every database query and RPC receives the tenant ID returned by this authorization chain.

## Edge endpoint and transport

The backend is a single Edge Function named `inventory-api`. It accepts `POST` requests containing:

```json
{
  "action": "listInventoryItems",
  "data": {}
}
```

Supported actions are:

- `provisionInventoryAccess`
- `listInventoryItems`
- `updateInventoryItem`
- `createMaterialRequest`
- `postStockMovement`

The action router rejects unknown actions and non-object payloads. The success envelope is `{ "data": ... }`. The error envelope is `{ "error": { "code", "message", "requestId" } }` with an appropriate HTTP status. Stable error codes remain `unauthenticated`, `permission-denied`, `invalid-argument`, `not-found`, `already-exists`, `failed-precondition`, `aborted`, and `internal`.

The Supabase gateway JWT check is disabled for this function because the bearer token is issued by Firebase, not Supabase. This does not make the business API anonymous: the handler itself requires and cryptographically verifies a Firebase ID token before routing any action except an `OPTIONS` preflight.

## Firebase token verification

React sends the current Firebase ID token as `Authorization: Bearer <token>`. The Edge Function verifies the token signature against Google's Secure Token public keys and validates:

- algorithm and signature;
- audience equals Firebase project `apps-workspace-b61a9`;
- issuer equals `https://securetoken.google.com/apps-workspace-b61a9`;
- subject/UID is non-empty;
- issued-at and expiration times are valid.

Provisioning additionally requires a verified email claim. Token contents, bearer credentials, and database secrets are never logged.

## Database client and authorization

The function creates one Supabase client with the platform-provided service-role environment value. That value remains server-side. Inventory RLS stays enabled with no policies; because the service role bypasses RLS, the function's authorization and explicit tenant filters remain mandatory.

`requireAccess(identity, 'inventory', allowedRoles)` returns immutable `userId`, `membershipId`, `tenantId`, `tenantKey`, and `roleKey`. It denies inactive or ambiguous records, duplicate role assignments, missing roles, and roles outside the action allow-list without revealing whether a cross-tenant object exists.

Action permissions remain:

- list items: `administrator`, `inventory_staff`, `viewer`;
- update item: `administrator`, `inventory_staff`;
- create material request: `administrator`, `inventory_staff`;
- post stock movement: `administrator`, `inventory_staff`.

The existing `inv_create_material_request` and `inv_post_stock_movement` RPCs remain the transaction boundaries. Item updates continue to require `expectedVersion` and increment `version` atomically.

## First-login provisioning

`provisionInventoryAccess` accepts no tenant or role data. It verifies the Firebase UID and verified email, then resolves existing access.

If the user already has one active membership and a valid inventory role, the function returns it. If access is incomplete, test self-provisioning is permitted only when server environment variable `INVENTORY_BOOTSTRAP_TENANT_KEY` is non-empty. It creates or updates the app user, creates the one active membership in that configured tenant, and assigns only `viewer`. It never reactivates inactive users or suspended/removed memberships.

The response no longer requests a Firebase token refresh because no custom claim is written. Production deployments must leave the bootstrap variable empty unless open viewer enrollment is intentionally desired. This deployment uses `inventory-test` as the explicitly requested test tenant.

## Browser client and CORS

`src/services/firebase.ts` keeps Firebase App and Authentication initialization and removes Firebase Functions initialization. The inventory API wrapper obtains `firebaseAuth.currentUser.getIdToken()`, calls the Edge URL derived from `VITE_SUPABASE_URL`, and sends the public Supabase publishable key in `apikey`. The publishable key is not privileged; the service-role value never enters Vite configuration.

The Edge Function allows only configured origins. Production origins are:

- `https://app-invb61a9.web.app`
- `https://app-invb61a9.firebaseapp.com`

Local development may add the Vite origins explicitly. Preflight responses advertise only `POST`, `authorization`, `apikey`, and `content-type`. Requests with an unapproved `Origin` are rejected. Non-browser requests without `Origin` still require a valid Firebase token.

## Source layout

- `supabase/functions/inventory-api/index.ts`: HTTP/CORS adapter and action routing.
- `supabase/functions/_shared/firebase-auth.ts`: Firebase ID-token verification.
- `supabase/functions/_shared/errors.ts`: stable API errors and safe envelopes.
- `supabase/functions/_shared/access.ts`: database-derived tenant and role authorization.
- `supabase/functions/_shared/provision.ts`: first-login viewer provisioning.
- `supabase/functions/_shared/inventory.ts`: list and optimistic update handlers.
- `supabase/functions/_shared/workflows.ts`: material request and stock movement handlers.
- `src/services/inventory-api.ts`: authenticated Edge HTTP client.
- `src/services/firebase.ts`: Firebase Authentication initialization only.

The obsolete `functions/` deployment package is removed after equivalent Edge tests exist so the repository cannot accidentally advertise two backends.

## Error handling and observability

Each request gets a UUID correlation identifier. Server logs include the identifier, action, safe failure category, and Firebase UID only after token verification. Logs exclude request bodies, tokens, secrets, SQL details, and user email.

Validation and domain errors map to stable safe messages. Unexpected errors return `internal` and the request identifier. Optimistic conflicts return `aborted`; idempotent stock replays remain successful responses.

## Testing and verification

Tests are written before each transport or behavior change. Coverage includes:

- Firebase token verification success plus invalid signature, issuer, audience, expiry, and missing token;
- CORS allowed-origin, rejected-origin, and preflight behavior;
- action routing and unknown/malformed requests;
- authorization success and every inactive, ambiguous, and disallowed-role branch;
- first-login viewer provisioning without a custom claim or Admin credential;
- payload rejection for client-selected tenant, actor, role, status, document number, or version replacement;
- existing list, versioned update, material-request, idempotent stock-posting, and safe-error behavior;
- client token attachment, response decoding, loading/error states, and absence of Firebase Functions imports;
- source scans proving no `svc_*` references and no service-role value in browser code.

The required local checks are root tests, TypeScript, Vite production build, Edge source contract tests, and the existing database migration contracts. The deployed checks are an unauthenticated denial, allowed CORS preflight, Firebase sign-in/provisioning, inventory listing, and a repeat idempotency request when a suitable test fixture is available.

## Deployment

1. Keep the already-applied database migrations unchanged.
2. Configure Edge environment values for allowed origins and the `inventory-test` bootstrap tenant.
3. Deploy `inventory-api` with the Supabase gateway JWT check disabled.
4. Verify unauthenticated requests are denied by the handler.
5. Build React with the existing public Supabase URL/publishable key and Firebase client configuration.
6. Deploy Firebase Hosting target `app` only; no Firebase Functions deployment occurs.
7. Smoke-test the production URL and inspect Edge logs for safe request metadata.

Rollback deploys the previous Edge Function version and, if necessary, the previous Hosting release. Database rollback remains forward-only; deployed migrations are never rewritten or dropped.

## Security checklist

- Firebase ID tokens are signature-, issuer-, audience-, time-, and UID-validated.
- The client cannot select tenant, actor, or role.
- Every action revalidates active user, single membership, active tenant, application, role assignment, and allowed role.
- Every business query and RPC is explicitly tenant-scoped.
- Service-role access exists only inside the Edge runtime.
- Inventory RLS remains deny-all for browser roles.
- CORS is an additional browser control, not authentication.
- Bootstrap grants only `viewer` and is explicitly a test-tenant setting.
- Error responses and logs do not disclose tokens, SQL details, secrets, or cross-tenant existence.
- No `svc_*` object is referenced.

## Out of scope

- Supabase Auth or browser database access.
- RLS policies for browser users.
- Firebase custom-claim management.
- Service desk schema or application behavior.
- A production invitation/administration UI.
