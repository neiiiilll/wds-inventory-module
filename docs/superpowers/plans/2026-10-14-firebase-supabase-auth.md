# Firebase Google Auth with Supabase Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Supabase Google OAuth with Firebase Google Authentication while keeping Supabase as the database and preserving the three demo roles.

**Architecture:** Firebase Authentication owns the browser session and Google sign-in. The Supabase client is initialized with an `accessToken` callback that returns the Firebase ID token, and Supabase Third-Party Auth verifies that token. The current role selector remains a prototype-only role demonstration; the existing UI and workflow checks continue to enforce Administrator, Inventory Staff, and Viewer behavior in the demo.

**Tech Stack:** React 19, TypeScript, Vite 8, Firebase Web SDK, Supabase JS v2, Supabase RLS, Firebase Hosting.

**Spec:** `docs/superpowers/specs/2026-10-14-firebase-supabase-auth-design.md`

## Global Constraints

- Google is the only authentication provider in the app.
- Supabase remains the inventory database and API.
- Preserve the demo roles: Administrator, Inventory Staff, and Viewer.
- Do not place Firebase Admin credentials, Google client secrets, Supabase service-role keys, or database passwords in the browser bundle.
- Firebase Hosting serves the Vite `dist` directory with SPA fallback to `index.html`.

## Review Focus

- Firebase configuration missing: show a clear setup error and do not crash the app.
- Firebase session refresh and logout: Supabase requests must stop using the old Supabase session.
- Google-only sign-in: no email/password or Supabase OAuth button remains.
- Demo role behavior: all three roles remain selectable and existing workflow guards still apply.
- Unauthenticated database access: Supabase client requests must not run without a Firebase token.

### Task 1: Firebase client and environment configuration

**Files:**
- Create: `src/services/firebase.ts`
- Modify: `package.json`, `package-lock.json`
- Modify: `.env.example` or create it if absent

**Interfaces:**
- Produces `firebaseApp`, `firebaseAuth`, and `googleProvider` exports.
- Produces `isFirebaseConfigured: boolean`.

- [ ] Add the `firebase` dependency.
- [ ] Define the six Vite environment variables for the Firebase web app config.
- [ ] Initialize Firebase only when all required values exist; expose a clear configured flag.
- [ ] Run `npx tsc --noEmit`.

### Task 2: Supabase Firebase-token bridge

**Files:**
- Modify: `src/services/supabase.ts`
- Modify: `src/services/workflow-storage.ts`

**Interfaces:**
- Consumes `firebaseAuth` from Task 1.
- Keeps the existing `supabase` export and `isSupabaseConfigured` export.

- [ ] Initialize Supabase with `accessToken: async () => firebaseAuth.currentUser?.getIdToken(false) ?? null`.
- [ ] Remove Supabase Auth session persistence and URL detection from this client.
- [ ] Keep workflow snapshot load/save guarded by Firebase authentication.
- [ ] Return a clear error when a database request is attempted without a Firebase user.
- [ ] Run the existing test suite and TypeScript check.

### Task 3: Firebase-only login and session lifecycle

**Files:**
- Modify: `src/components/LoginPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes `firebaseAuth`, `googleProvider`, and `isFirebaseConfigured`.
- Produces the current Firebase user to `InventoryApp`.

- [ ] Replace `supabase.auth.signInWithOAuth` with Firebase `signInWithPopup(firebaseAuth, googleProvider)`.
- [ ] Subscribe to `onAuthStateChanged` and render the login page until a Firebase user exists.
- [ ] Derive the displayed requester/personnel name from the Firebase display name, then email.
- [ ] Change logout to Firebase `signOut`.
- [ ] Keep the current Google-only button and error styling.
- [ ] Verify no `supabase.auth` sign-in or sign-out calls remain.
- [ ] Run TypeScript and production build checks.

### Task 4: Preserve and audit the three demo roles

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/services/workflow.ts`
- Modify: `README.md`
- Test: `scripts/auth-role.test.mjs`

**Interfaces:**
- Keeps `Role = "Administrator" | "Inventory Staff" | "Viewer"`.
- Keeps the existing `applyWorkflowAction` role argument and checks.

- [ ] Keep the role selector visible after Firebase login for prototype demonstration.
- [ ] Verify Viewer cannot mutate records, Inventory Staff can perform operational edits, and Administrator-only requester changes remain restricted.
- [ ] Add focused tests for the three role outcomes using the existing workflow action API.
- [ ] Document clearly that the selector is demo-only and is not production authorization.
- [ ] Run `npm test` and the new role test.

### Task 5: Supabase third-party auth and RLS migration

**Files:**
- Create: `supabase/migrations/20261014000002_firebase_auth_rls.sql`
- Modify: `supabase/README.md`

**Interfaces:**
- Consumes the Firebase project ID supplied during deployment.
- Produces RLS policies that are ready for Firebase JWT claims without exposing service credentials.

- [ ] Document the Supabase Dashboard path to add Firebase under Authentication → Third-Party Auth.
- [ ] Add policies that use `auth.jwt()` role claims only after claims are available; do not silently grant production-wide access.
- [ ] Preserve the prototype compatibility snapshot policy as explicitly temporary, or scope it to an authenticated Firebase subject if the app is switched to per-user snapshots.
- [ ] Document the required Firebase `role: authenticated` claim and the future application roles.
- [ ] Review the SQL for destructive operations and run the migration only after the Firebase project ID is known.

### Task 6: Firebase Hosting deployment configuration

**Files:**
- Create: `firebase.json`
- Create: `.firebaserc`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes the Firebase Hosting project ID and the existing Vite `dist` output.

- [ ] Configure Hosting public directory `dist`, SPA rewrite to `/index.html`, and ignore rules for local files.
- [ ] Add build and deploy instructions without committing secrets.
- [ ] Verify `npm run build` creates `dist/index.html` and the Firebase Hosting configuration points to it.

### Task 7: End-to-end verification

**Files:**
- No new source files.

- [ ] Run `npm test`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run build`.
- [ ] Verify login, refresh, logout, Supabase request authorization, and all three demo roles in the deployed or preview build.
- [ ] Verify the Firebase Hosting URL is added to Supabase redirect URLs and the Google OAuth authorized origins.
