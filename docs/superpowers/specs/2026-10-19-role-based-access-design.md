# Role-Based Access Design

## Goal

Replace the client-controlled demo role selector with role assignments tied to each Firebase Google account. Firebase Authentication remains the only sign-in provider. Supabase remains the database and enforces authorization with Row Level Security (RLS).

## Roles and access states

The application has three assigned roles:

- **Administrator** — full operational access plus user access management.
- **Inventory Staff** — operational inventory, procurement, receiving, issuance, return, reconciliation, and printing access.
- **Viewer** — read-only and printing access.

The following Google accounts are the bootstrap Administrators:

- `neilchristiand17@gmail.com`
- `ojt@likhainternet.com`

Email comparisons are case-insensitive. Bootstrap status is applied by trusted database logic during registration; it is not decided by browser code.

## Permission matrix

| Capability | Administrator | Inventory Staff | Viewer |
| --- | --- | --- | --- |
| View inventory and procurement records | Yes | Yes | Yes |
| Print IAR, RIS, and stock cards | Yes | Yes | Yes |
| Create and update inventory records | Yes | Yes | No |
| Process MR, PR, PO, and IAR | Yes | Yes | No |
| Record stock issuance and returns | Yes | Yes | No |
| Change requesting personnel | Yes | No | No |
| Assign roles and activate or deactivate users | Yes | No | No |

Existing workflow-specific status locks still apply. A role grants permission to attempt an action; it does not bypass document status, approval order, quantity, or posting rules.

## Data model

Create `public.app_users` as the source of truth for application access:

- `firebase_uid text primary key`
- `email text not null`
- `display_name text not null`
- `role text not null` constrained to `Administrator`, `Inventory Staff`, or `Viewer`
- `active boolean not null default true`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- `last_login_at timestamptz not null`

New users receive Viewer automatically. The application must not accept a role from the registration request.

Create `public.user_role_history` as an append-only audit log:

- affected Firebase UID and email
- previous role and new role
- previous and new active state
- reason
- acting administrator UID and email
- occurrence time

Role history cannot be edited or deleted through the browser client.

## Registration and session flow

1. Firebase restores or creates the Google session.
2. The Supabase client sends the Firebase ID token through its existing `accessToken` callback.
3. The app calls a security-definer registration RPC. The RPC derives UID, email, and display name from the verified JWT, upserts identity details, updates `last_login_at`, and ignores role values from the client.
4. The RPC assigns Administrator when the verified email matches one of the two bootstrap addresses; every other new account receives Viewer.
5. The app loads the current `app_users` row.
6. An inactive user sees an access-disabled screen with their signed-in email and a logout button. Inventory data is not loaded.
7. An assigned active user enters the workspace with the database role. The role selector is removed and the assigned role remains visible beside the user name.

Role changes take effect after the app refreshes its current user record. The user access screen refreshes immediately after an Administrator changes a role. The application also reloads access when the browser regains focus so revoked access does not depend on a new login.

## Administrator user access screen

Add **Settings → User Access**, visible only to Administrators. It lists registered Google users, their email, display name, role, active state, first registration, and last login.

An Administrator can:

- assign or change a role;
- activate or deactivate an account;
- enter a required reason for each access change;
- review immutable role history.

The system prevents an Administrator from deactivating themselves or removing their own Administrator role. This avoids accidental loss of all administration access. Changes to the two bootstrap accounts still require another active Administrator.

## Application authorization

Add a shared role module that defines `AppRole`, permission predicates, and route visibility. `InventoryApp` receives the assigned role from the authenticated access record instead of local state.

The UI will:

- remove the demo role selector;
- hide Administrator-only user management;
- disable or omit mutation actions for Viewers;
- keep printing available to assigned roles;
- show a clear access-revoked state if the user becomes inactive.

The existing workflow reducer remains a second application-layer guard. It will consume the assigned role and continue rejecting Viewer mutations and non-Administrator requester changes.

## Supabase authorization

RLS is the security boundary. Add security-definer helper functions that read the Firebase subject from `auth.jwt()->>'sub'` and return the current active application role without exposing arbitrary role updates.

Policies will provide:

- Viewer: select access to the workflow snapshot and normalized inventory tables; no insert, update, or delete.
- Inventory Staff: select and operational insert/update access to inventory and workflow data; no user-role administration.
- Administrator: operational access plus controlled user-role RPCs and role history access.

The compatibility `workflow_snapshots` table receives the same read/write split because the current React application persists its aggregate workflow there. Existing anonymous and broad authenticated policies are removed. Normalized tables receive explicit policies instead of `using (true)` access.

Role assignment uses an Administrator-only security-definer RPC. The RPC validates the target role, active state, required reason, self-lockout rules, and current caller role, then updates `app_users` and inserts `user_role_history` in one transaction.

## Failure handling

- If role registration or lookup fails, the workspace stays closed and shows a retry and logout option.
- If Supabase is unavailable, authenticated users do not fall back to browser storage because their authorization cannot be verified.
- If a write is rejected after a role change, the app reloads the access record and shows the updated access state.
- Invalid or missing Firebase identity claims cause registration and data policies to deny access.
- Deactivated users retain no inventory read or write access.

## Migration and deployment

Add a new idempotent Supabase migration rather than rewriting the previously applied schema file. The migration creates role tables, helper functions, RPCs, indexes, grants, and replacement RLS policies.

The migration must be applied in the Supabase SQL Editor before deploying the React update. Deploying the UI first would block users because the required role RPCs would not exist. The deployment sequence is:

1. Back up the current `workflow_snapshots` row.
2. Apply and verify the Supabase RBAC migration.
3. Sign in with one bootstrap Administrator and confirm role registration.
4. Deploy the React application to Firebase Hosting.
5. Verify automatic Viewer registration, Viewer, Inventory Staff, Administrator, and inactive-account behavior with separate Google accounts.

No Firebase Admin private key, Supabase service-role key, database password, or Google client secret is added to the React project.

## Validation

Automated tests will cover:

- role parsing and permission predicates;
- bootstrap Administrator matching;
- default Viewer registration and inactive access states;
- Viewer mutation rejection;
- Inventory Staff operational access and Administrator-only restrictions;
- self-lockout prevention and required role-change reasons;
- removal of the client role selector;
- workflow loading only after assigned access is confirmed.

Verification will include `npm test`, `npx tsc --noEmit`, `npm run build`, SQL policy inspection, and browser checks for all three roles plus inactive access. The live site will be deployed only after the database migration is successfully applied.
