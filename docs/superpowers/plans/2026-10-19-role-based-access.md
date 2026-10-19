# Role-Based Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the demo role selector with Supabase-backed roles tied to Firebase Google users and enforce those roles in both the React application and Supabase RLS.

**Architecture:** Firebase continues to authenticate Google users. A protected Supabase `app_users` record supplies the application role after a trusted registration RPC derives identity from the verified Firebase JWT. React gates routes and actions for usability, while Supabase RLS and Administrator-only RPCs provide the security boundary.

**Tech Stack:** React 19, TypeScript 5.7, Vite 8, Firebase Authentication, Supabase JavaScript v2, PostgreSQL functions and RLS, Node test scripts

**Spec:** `docs/superpowers/specs/2026-10-19-role-based-access-design.md`

## Global Constraints

- Google through Firebase Authentication remains the only sign-in mechanism.
- Supabase remains the inventory database and API.
- Roles are exactly `Administrator`, `Inventory Staff`, and `Viewer`; a null role means Pending.
- Bootstrap Administrators are `neilchristiand17@gmail.com` and `ojt@likhainternet.com`, matched case-insensitively by trusted database code.
- Pending and inactive users cannot load inventory data.
- Viewer can read and print but cannot mutate records.
- Inventory Staff can perform operational work but cannot manage users or change requesting personnel.
- Administrator has operational access and user-role management.
- Never expose Firebase Admin credentials, Supabase service-role keys, database passwords, or Google client secrets in client code.
- The Supabase migration must be applied before the Firebase Hosting deployment.

## Review Focus

- A client-supplied role during registration must be ignored; the registration test and SQL policy test must prove the database derives role itself.
- Mixed-case bootstrap emails must still become Administrators; the access-control tests must cover case-insensitive matching.
- Pending, inactive, and revoked users must not hydrate cached or remote inventory state; the application-shell source test and browser verification must cover all three states.
- An Administrator must not remove their own Administrator role or deactivate themselves; the migration test and RPC browser check must cover self-lockout prevention.
- Existing broad `anon` and `authenticated using (true)` policies must not survive; the SQL policy test and post-migration catalog query must verify their removal.

---

### Task 1: Role domain and permission rules

**Files:**
- Create: `src/services/access-control.ts`
- Create: `scripts/access-control.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `AppRole = "Administrator" | "Inventory Staff" | "Viewer"`
- Produces: `AccessState = "loading" | "pending" | "active" | "inactive" | "error"`
- Produces: `AppUser` with `firebaseUid`, `email`, `displayName`, `role`, `active`, `createdAt`, `updatedAt`, and `lastLoginAt`
- Produces: `canManageUsers(role)`, `canMutateWorkflow(role)`, `canChangeRequester(role)`, and `canPrint(role)`
- Produces: `isBootstrapAdministrator(email)` for client display/testing only; database code remains authoritative

- [ ] **Step 1: Write failing role-domain tests**

Assert the exact role strings, case-insensitive matching of both bootstrap emails, Viewer read/print-only behavior, Inventory Staff operational behavior, and Administrator-only user management/requester changes.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node scripts/access-control.test.mjs`

Expected: FAIL because `src/services/access-control.ts` does not exist.

- [ ] **Step 3: Implement the role types and pure permission predicates**

Keep the module independent of React, Firebase, and Supabase so workflow code and UI code share one permission vocabulary.

- [ ] **Step 4: Add the focused test to `npm test` and verify it passes**

Run: `node scripts/access-control.test.mjs`

Expected: `Access control checks passed.`

- [ ] **Step 5: Commit the role domain**

Commit only the files from this task with message `feat: define application access roles`.

### Task 2: Supabase RBAC schema, RPCs, and RLS

**Files:**
- Create: `supabase/migrations/20261019000000_role_based_access.sql`
- Create: `scripts/rbac-migration.test.mjs`
- Modify: `package.json`
- Modify: `supabase/README.md`

**Interfaces:**
- Produces: `public.app_users`
- Produces: append-only `public.user_role_history`
- Produces: `public.register_current_app_user()` returning the caller's `app_users` row
- Produces: `public.set_app_user_access(target_uid text, next_role text, next_active boolean, change_reason text)` returning the updated row
- Produces: `public.current_app_role()` and `public.current_app_user_active()` security-definer helpers
- Consumes: verified Firebase claims `sub`, `email`, and `name` from `auth.jwt()`

- [ ] **Step 1: Write a failing SQL contract test**

Assert that the migration file creates both tables and both RPCs, contains the two bootstrap emails, rejects self-lockout, requires a nonblank reason, removes the demo snapshot policies and broad normalized-table policies, grants Viewer select only, grants operational writes only to Inventory Staff and Administrator, and grants role changes only through the Administrator RPC.

- [ ] **Step 2: Run the SQL contract test and verify it fails**

Run: `node scripts/rbac-migration.test.mjs`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Implement the idempotent migration**

Use JWT-derived identity only. Registration accepts no identity or role arguments. Restrict function `search_path`, revoke default function execution, grant RPC execution to `authenticated`, and use explicit policies for `workflow_snapshots` plus every normalized table listed in the base migration.

- [ ] **Step 4: Document migration order and recovery**

Add backup, SQL Editor execution, bootstrap-login verification, policy-catalog verification, and rollback guidance to `supabase/README.md`.

- [ ] **Step 5: Run the migration contract and existing tests**

Run: `node scripts/rbac-migration.test.mjs`

Expected: `RBAC migration checks passed.`

Run: `npm test`

Expected: all checks pass.

- [ ] **Step 6: Commit the database access boundary**

Commit only this task's files with message `feat: enforce roles with Supabase RLS`.

### Task 3: Supabase access service

**Files:**
- Create: `src/services/user-access.ts`
- Create: `scripts/user-access.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `supabase`, `firebaseAuth`, `AppUser`, and `AppRole`
- Produces: `registerCurrentUser(): Promise<AppUser>`
- Produces: `loadCurrentUser(): Promise<AppUser>`
- Produces: `listAppUsers(): Promise<AppUser[]>`
- Produces: `setAppUserAccess(input: { targetUid: string; role: AppRole; active: boolean; reason: string }): Promise<AppUser>`
- Produces: `listUserRoleHistory(targetUid?: string): Promise<UserRoleHistoryEntry[]>`

- [ ] **Step 1: Write failing access-service contract tests**

Assert exact table/RPC names, snake_case-to-camelCase mapping, rejection when Firebase or Supabase is unavailable, required nonblank reason, and propagation of Supabase errors without falling back to local roles.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node scripts/user-access.test.mjs`

Expected: FAIL because `src/services/user-access.ts` does not exist.

- [ ] **Step 3: Implement the access service**

Keep Supabase query construction and row mapping in this module. Never accept a role in `registerCurrentUser()`.

- [ ] **Step 4: Verify focused and full tests**

Run: `node scripts/user-access.test.mjs`

Expected: `User access service checks passed.`

Run: `npm test`

Expected: all checks pass.

- [ ] **Step 5: Commit the access service**

Commit only this task's files with message `feat: connect Firebase users to assigned roles`.

### Task 4: Authenticated access gate

**Files:**
- Create: `src/components/AccessGate.tsx`
- Create: `scripts/access-gate.test.mjs`
- Modify: `src/App.tsx`
- Modify: `src/services/workflow.ts`
- Modify: `src/services/workflow-storage.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `registerCurrentUser()`, `AppUser`, and permission predicates
- Produces: `AccessGate` states for loading, Pending, inactive, error/retry, and active access
- Changes: `InventoryApp` receives `appUser: AppUser` and uses `appUser.role` instead of local role state

- [ ] **Step 1: Write failing access-gate tests**

Assert the demo selector and `setRole` are absent, Pending/inactive copy is present, the workspace receives a database-assigned role, inventory hydration happens only inside active access, Viewer mutations still fail, and non-Administrator requester changes still fail.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node scripts/access-gate.test.mjs`

Expected: FAIL because the app still contains the demo selector and local role state.

- [ ] **Step 3: Implement `AccessGate` and refactor `App.tsx`**

Register and load access after Firebase authentication. Show Pending, inactive, and retry/logout screens before mounting `InventoryApp`. Refresh access on window focus. Display the assigned role as text beside the signed-in name.

- [ ] **Step 4: Replace local role checks with shared predicates**

Keep reducer guards authoritative within the app and remove local browser fallback whenever authorization cannot be verified.

- [ ] **Step 5: Verify focused tests, TypeScript, and the full suite**

Run: `node scripts/access-gate.test.mjs`

Expected: `Access gate checks passed.`

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npm test`

Expected: all checks pass.

- [ ] **Step 6: Commit the access gate**

Commit only this task's files with message `feat: gate inventory by assigned role`.

### Task 5: Administrator user access management

**Files:**
- Create: `src/components/UserAccess.tsx`
- Create: `scripts/user-access-ui.test.mjs`
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Modify: `package.json`

**Interfaces:**
- Consumes: `listAppUsers()`, `setAppUserAccess()`, `listUserRoleHistory()`, `AppRole`, and `canManageUsers()`
- Produces: Administrator-only **Settings → User Access** page

- [ ] **Step 1: Write failing user-access UI tests**

Assert the page is reachable only for Administrators, lists identity/role/active/registration/last-login fields, requires a reason, exposes the three exact roles, prevents editing the signed-in Administrator, refreshes rows after a change, and displays role history.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node scripts/user-access-ui.test.mjs`

Expected: FAIL because `UserAccess.tsx` does not exist.

- [ ] **Step 3: Implement the Administrator page and responsive styles**

Use existing panel, table, modal, field, and button patterns. Display Supabase errors in the page and keep the current row unchanged after a failed update.

- [ ] **Step 4: Add Administrator-only navigation**

Show **User Access** beneath Settings only when `canManageUsers(role)` is true. If access is revoked while this page is open, return to the access gate.

- [ ] **Step 5: Verify focused tests, TypeScript, full tests, and production build**

Run: `node scripts/user-access-ui.test.mjs`

Expected: `User access UI checks passed.`

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npm test`

Expected: all checks pass.

Run: `npm run build`

Expected: Vite exits 0 and creates `dist/index.html`.

- [ ] **Step 6: Commit the Administrator UI**

Commit only this task's files with message `feat: add administrator user access management`.

### Task 6: Apply migration, verify roles, and deploy

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/implementation-progress.md`

**Interfaces:**
- Consumes: the completed migration and React build
- Produces: a live Firebase Hosting release backed by Supabase RLS

- [ ] **Step 1: Back up the live compatibility snapshot**

Use Supabase SQL Editor to select and preserve the current `workflow_snapshots` row before changing policies.

- [ ] **Step 2: Apply the RBAC migration in Supabase**

Run the complete `20261019000000_role_based_access.sql` in one SQL Editor execution and verify it completes without errors.

- [ ] **Step 3: Verify the database security boundary**

Query PostgreSQL catalogs to confirm RLS is enabled, broad demo policies are absent, the new policies exist, and both RPCs have only the intended grants. Sign in as one bootstrap account and verify its `app_users` role is Administrator.

- [ ] **Step 4: Run final local verification**

Run: `npm test`

Expected: all checks pass.

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npm run build`

Expected: exit 0.

- [ ] **Step 5: Deploy to Firebase Hosting**

Run: `npm run deploy:hosting`

Expected: deployment succeeds for `https://app-invb61a9.web.app`.

- [ ] **Step 6: Verify the live access flows**

Confirm bootstrap Administrator access, a new Pending account, Administrator role assignment, Viewer read/print-only behavior, Inventory Staff operational behavior, inactive-user denial, role history, refresh persistence, and logout/login restoration.

- [ ] **Step 7: Record evidence and commit documentation**

Update the project README and implementation progress with migration/deployment steps and observed verification results. Commit with message `docs: record role access deployment`.
