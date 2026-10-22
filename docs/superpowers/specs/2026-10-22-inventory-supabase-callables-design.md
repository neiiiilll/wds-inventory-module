# Inventory Supabase and Firebase Callables Design

## Goal

Replace the repository's prototype database integration with the canonical shared multitenant schema supplied on 2026-10-22. Inventory data must be accessible only through Firebase callable Cloud Functions that verify Firebase Authentication and re-authorize every request against Supabase.

The implementation owns only `inv_*` tables and the `inventory` application registration. It may use the approved shared tables but must never create, alter, query, or otherwise depend on `svc_*` tables.

## Canonical schema and migration history

The newly supplied introspection schema is authoritative. The existing prototype migrations are incompatible because they create non-tenant inventory tables, a global `workflow_snapshots` row, and an `app_users` shape that conflicts with the shared schema. They will be retired and replaced by a clean migration chain.

Each inventory migration will be independently named, dependency ordered, and safe to rerun where PostgreSQL permits. Tables and indexes use `CREATE ... IF NOT EXISTS`. Constraint additions that lack native `IF NOT EXISTS` support use catalog checks in `DO` blocks. No migration contains a `svc_*` identifier.

The migration chain is:

1. Shared prerequisites and inventory seed data.
2. Inventory catalog and stock tables.
3. Procurement, inspection, issuance, return, and stock-count tables.
4. Inventory indexes, uniqueness rules, and `updated_at` triggers.
5. Inventory RLS lockdown and grants.
6. Inventory RPC functions.

## Shared prerequisites

The prerequisite migration verifies that these shared tables already exist:

- `app_users`
- `tenants`
- `applications`
- `app_roles`
- `tenant_memberships`
- `membership_roles`
- `departments`
- `personnel`
- `attachments`
- `audit_events`
- `user_role_history`

It fails with a clear error when a required shared table or required column is missing. It does not recreate an incompatible shared table.

The migration adds only the shared uniqueness required by composite inventory references:

- `tenant_memberships (tenant_id, id)`
- `departments (tenant_id, id)`
- `personnel (tenant_id, id)`
- `app_roles (app_key, role_key)`, already satisfied when the supplied primary key exists
- `tenant_memberships (user_id)` to enforce the decision that one user belongs to exactly one tenant

These changes require coordination with the service desk team before production application. They do not change service desk tables.

The seed is idempotent and creates or updates:

- application `inventory`, displayed as `Inventory`;
- roles `administrator`, `inventory_staff`, and `viewer`;
- test tenant `inventory-test`, displayed as `Inventory Test Tenant`.

The seed does not assign an elevated role to a user.

## Inventory relational model

All tables from the supplied schema whose names begin with `inv_` will be created in dependency order with the supplied columns, checks, and defaults. Every business table contains `tenant_id`.

Every inventory parent with an `id` has `UNIQUE (tenant_id, id)`. Child references are merged into real composite foreign keys. For example:

```sql
FOREIGN KEY (tenant_id, item_id)
  REFERENCES public.inv_inventory_items (tenant_id, id)
```

Tenant-local business identifiers are unique where required for correct operation:

- catalog codes, warehouse codes, location codes, asset tags;
- material request, quotation, purchase request, purchase order, RIS, and supplier return numbers;
- stock movement idempotency keys;
- line numbers within their parent documents;
- one balance per tenant, item, and location.

Inventory rows with a `version` column retain optimistic locking. Mutable versioned rows increment `version` during a successful update. Existing version values are never accepted from the client as replacement values.

## Timestamps and indexes

A reusable trigger function sets `updated_at = now()`. Triggers are attached only to `inv_*` tables that contain `updated_at`.

Indexes cover:

- every composite foreign-key lookup not already backed by a unique index;
- tenant-scoped active catalog lists;
- tenant-scoped document number and status searches;
- movement history by tenant, item, location, and occurrence time;
- open procurement and fulfillment documents;
- audit and idempotency lookup paths used by Functions.

Indexes begin with `tenant_id` whenever the query is tenant scoped.

## RLS and database privileges

RLS is enabled on every `inv_*` table. Inventory tables have no RLS policies. Any pre-existing policy on an inventory table is removed during the lockdown migration. Privileges are revoked from `anon` and `authenticated`.

The Supabase service role bypasses RLS. Therefore RLS is defense against browser access, not the tenant authorization mechanism for Cloud Functions. Each callable must run `requireAccess` and every query or RPC invocation must use the returned `tenantId` explicitly.

Inventory RPCs are revoked from `PUBLIC`, `anon`, and `authenticated`, and granted only to `service_role`.

## Document-number RPC

`inv_next_document_number` accepts a validated tenant ID, a supported document type, and an optional document date. Supported types are `MR`, `SQ`, `PR`, `PO`, `IR`, `RIS`, `SR`, `SC`, and `SM`.

It normalizes the date to the first day of its month and atomically upserts `inv_document_counters`, incrementing `last_number`. It returns `<TYPE>-<YYYYMM>-<six-digit sequence>`, for example `MR-202610-000001`.

The function is `SECURITY DEFINER`, fixes its `search_path`, validates the tenant and document type, and is executable only by `service_role`.

## Atomic stock-posting RPC

`inv_post_stock_movement` accepts:

- the authorized tenant ID;
- the authorized actor user ID;
- movement type and optional source details;
- a non-empty idempotency key;
- notes;
- a JSON array of movement lines.

Each line contains an item ID, location ID, non-zero signed quantity, and non-negative unit cost. Asset ID is optional. Transfer movements are represented by balanced negative and positive lines.

In one database transaction, the function:

1. Validates the tenant, movement type, line shape, and unique line numbers.
2. Reuses an existing movement for the same `(tenant_id, idempotency_key)` and returns its persisted result without applying balances again.
3. Creates the pending movement and claims the idempotency key.
4. Validates every referenced item, location, and optional asset belongs to the authorized tenant.
5. Creates missing zero balance rows and locks affected balances in deterministic item/location order.
6. Calculates each resulting quantity and value, rejecting a negative quantity or negative inventory value.
7. Inserts movement lines with the calculated value delta and balance-after quantity.
8. Updates balance quantity, inventory value, average cost, `version`, and `updated_at`.
9. Marks the movement posted.
10. Adds an `audit_events` entry containing the movement summary and actor.

Positive quantities add `signed_quantity * unit_cost` to inventory value. Negative quantities use the current average cost, preventing the caller from choosing the cost of an issue. The resulting average cost is inventory value divided by quantity, or zero when both reach zero.

The RPC returns the movement ID, posting timestamp, and whether the request was replayed.

## Firebase Functions architecture

Firebase Cloud Functions use second-generation TypeScript callables on Node.js 22. All functions use one exported region constant. React initializes Firebase Functions with the identical region.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` use `defineSecret` and are attached to every function that needs them. The Supabase service-role key is never compiled into or sent to React.

The Functions source is divided into focused modules:

- `config.ts`: region, secrets, and server-side bootstrap parameters;
- `supabase.ts`: shared service-role Supabase client factory;
- `access.ts`: authorization types and `requireAccess`;
- `errors.ts`: safe conversion to `HttpsError`;
- `provision.ts`: first-login provisioning and claim refresh response;
- `inventory.ts`: item listing and optimistic item update;
- `material-requests.ts`: material-request creation;
- `stock.ts`: stock movement posting;
- `index.ts`: callable exports.

Database error details, SQL text, secret values, and cross-tenant existence information are never returned to clients.

## Authorization helper

`requireAccess(request, "inventory", allowedRoles)` first requires `request.auth.uid`. It treats `request.auth.token.tenant_key` only as a routing hint and never accepts a tenant from callable data.

The helper queries the shared schema with the service role and requires exactly one chain in which:

- `app_users.firebase_uid` equals the verified Firebase UID;
- the app user is active;
- the user has exactly one membership;
- the membership is active;
- the membership tenant is active;
- `tenants.tenant_key` equals the Firebase claim;
- `membership_roles.app_key` is `inventory`;
- the referenced application is active;
- the referenced inventory role exists and is in `allowedRoles`.

It returns immutable authorization context containing `userId`, `membershipId`, `tenantId`, `tenantKey`, and `roleKey`. Missing authentication produces `unauthenticated`; a missing claim, inactive record, tenant mismatch, missing role, or disallowed role produces `permission-denied`. Unexpected database failures produce `internal` with a correlation identifier.

Every callable scopes all database operations with `tenant_id = context.tenantId`, even when querying by a globally unique UUID.

## First-login provisioning

`provisionInventoryAccess` requires a verified Firebase user and accepts no tenant or role input.

When the Firebase token already contains `tenant_key`, it revalidates the existing database relationship and returns the current access context.

When no claim exists, the callable:

1. Looks up `app_users` by Firebase UID.
2. If the user already has one active membership and inventory role, derives the tenant key from that membership.
3. Otherwise permits test self-provisioning only when the server-side `INVENTORY_BOOTSTRAP_TENANT_KEY` parameter is non-empty.
4. In test self-provisioning, upserts the app user, creates or reactivates membership in that configured active tenant, and adds only the `viewer` inventory role.
5. Sets `tenant_key` with Firebase Admin while preserving unrelated custom claims.
6. Returns `refreshToken: true`.

React then calls `getIdToken(true)` before any business callable. An elevated role is never selected by the client or inferred from email. Production can disable open self-provisioning by leaving `INVENTORY_BOOTSTRAP_TENANT_KEY` empty and provisioning memberships through an administrative process.

## Example callables

### List items

Allowed roles: `administrator`, `inventory_staff`, `viewer`.

The callable supports bounded pagination and an optional normalized search string. It selects only the authorized tenant's items and their category/unit display fields. It returns a stable DTO rather than raw Supabase rows.

### Create material request

Allowed roles: `administrator`, `inventory_staff`.

The callable validates a non-empty line array, positive quantities, and tenant-owned optional item and personnel IDs. It obtains the request number from `inv_next_document_number`, inserts the header and lines atomically through a database RPC, and writes an audit event. Client-supplied document numbers, tenant IDs, status, and version values are ignored or rejected.

### Post stock movement

Allowed roles: `administrator`, `inventory_staff`.

The callable requires a caller-generated idempotency key, validates the DTO, and invokes `inv_post_stock_movement` with the authorized tenant and actor. A retry returns the same movement without a second balance change.

### Update item with version check

Allowed roles: `administrator`, `inventory_staff`.

The callable updates an allowed field set with:

```sql
WHERE tenant_id = authorized_tenant
  AND id = requested_id
  AND version = expected_version
```

It increments `version` in the same statement. No matching row returns `aborted` with a refresh-and-retry message. The response does not reveal whether a cross-tenant row exists.

## React integration

The browser retains Firebase Authentication as its only sign-in mechanism. Direct Supabase initialization, Firebase-token-to-Supabase bridging, and direct browser database repositories are removed from the active flow.

`src/services/firebase.ts` initializes Firebase Authentication and regional Firebase Functions. A typed callable client wraps `httpsCallable`, normalizes Firebase error codes, and exposes the provisioning and inventory methods.

The authentication/access gate has explicit states:

- restoring Firebase session;
- provisioning access;
- refreshing the ID token;
- loading inventory access;
- ready;
- disabled or unauthorized;
- retryable failure.

Callable-driven screens preserve their current data while a background request is running, disable duplicate submissions, and show user-safe validation, conflict, permission, and transient error messages. A stale-version error prompts the user to reload the current record.

The example item list demonstrates initial loading, empty, populated, and error-with-retry states. Mutation examples demonstrate submit loading and idempotent retry behavior.

## Error handling and observability

Expected client errors use stable callable codes:

- `unauthenticated`: missing Firebase session;
- `permission-denied`: invalid tenant/access/role state;
- `invalid-argument`: malformed request data;
- `not-found`: tenant-scoped referenced record absent;
- `already-exists`: conflicting tenant-local code or document state;
- `failed-precondition`: workflow or stock invariant violation;
- `aborted`: optimistic locking conflict;
- `internal`: unexpected infrastructure failure.

Functions log a generated request/correlation ID, function name, Firebase UID, authorized tenant ID when available, and safe failure category. Logs exclude access tokens, secrets, and full request bodies.

## Tests

Tests are written before production behavior and include:

- migration contract checks for every expected `inv_*` table;
- no `svc_*` identifiers in inventory migrations or Functions queries;
- merged composite foreign keys and parent composite uniqueness;
- RLS enabled, no inventory policies, browser grants revoked, and RPCs restricted to `service_role`;
- document numbering SQL contract and concurrent counter behavior when a local Supabase test database is available;
- stock-posting success, replay, invalid lines, cross-tenant references, deterministic locking, and insufficient-stock behavior;
- `requireAccess` success and every rejection branch;
- exact allowed-role behavior for each callable;
- tenant IDs ignored or rejected in all client payloads;
- first-login viewer provisioning, existing-membership claim recovery, disabled bootstrap, and token refresh;
- optimistic update success and stale-version conflict;
- React callable loading, empty, error, retry, and conflict states.

The required verification commands are the root test suite, Functions tests, Functions TypeScript build, root TypeScript check, and Vite production build. SQL integration tests run against the Supabase local stack when Docker is available; contract tests remain runnable without Docker.

## Deployment and local development

Deployment order is:

1. Coordinate and apply shared prerequisite indexes.
2. Apply the inventory migration chain with the Supabase CLI.
3. Verify inventory RLS, policy absence, grants, seeds, and RPC ownership.
4. Set Firebase secrets with `firebase functions:secrets:set`.
5. Set the callable region consistently in Functions and React configuration.
6. Configure the optional test bootstrap tenant only in non-production environments.
7. Build and test Functions and React.
8. Deploy Functions before Hosting.
9. Perform a first-login token-refresh smoke test and cross-tenant denial test.

The Firebase Emulator Suite tests Authentication and callable behavior. Supabase local development tests database transactions separately. Emulator environment files contain only local/test credentials and remain ignored by Git.

## Security checklist

- Service-role credentials exist only in Functions secrets.
- Callable payloads never select a tenant or role.
- Every business call revalidates active user, tenant, membership, application, and role.
- Every query and RPC is explicitly tenant scoped.
- Inventory RLS is enabled with no browser policies.
- RPC execution is restricted to `service_role`.
- Elevated roles require trusted administrative assignment.
- Test self-provisioning grants only `viewer` and is disabled in production.
- Version checks protect mutable records from lost updates.
- Idempotency protects stock balances from retries.
- Stock posting and document numbering are database-atomic.
- Cross-tenant failures do not reveal record existence.
- Audit events capture privileged and stock-changing operations.
- Logs and client errors exclude secrets and sensitive database details.

## Out of scope

- Creating, altering, querying, or migrating any `svc_*` table.
- Supabase Auth or browser use of the service-role key.
- A full administrative role-management UI.
- Production invitation workflows beyond the trusted pre-provisioning path.
- Migrating prototype `workflow_snapshots` data into normalized tables.
- Deploying to live Firebase or Supabase projects without an explicit deployment request.
