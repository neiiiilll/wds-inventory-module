# Firebase Google Auth with Supabase Database

## Goal

Use Firebase Authentication as the only sign-in mechanism and keep Supabase as the inventory database and API. Preserve the existing demo role set: Administrator, Inventory Staff, and Viewer.

## Approved scope

- Google sign-in is handled by Firebase Authentication.
- Supabase Auth Google OAuth is removed from the application flow.
- The Supabase JavaScript client sends the current Firebase ID token through its `accessToken` callback.
- Supabase is configured with the Firebase project as a Third-Party Auth provider.
- Firebase Hosting serves the Vite production build.
- The demo role selector remains during this prototype phase so all three roles can be demonstrated after login.

## Current role behavior

The existing UI and workflow reducer already recognize Administrator, Inventory Staff, and Viewer. Viewer is read-only in the UI and workflow actions reject prohibited mutations. This remains the demo behavior for this phase. The selector is not production authorization because it is client-controlled.

## Authentication flow

1. The login page calls Firebase `signInWithPopup` with `GoogleAuthProvider`.
2. `onAuthStateChanged` restores the Firebase session after refresh.
3. The app derives the display name and email from the Firebase user.
4. The Supabase client obtains the Firebase ID token for each request.
5. Logout calls Firebase `signOut` and clears the local session.

## Database and security

The existing normalized Supabase schema remains the source of truth. RLS stays enabled. During the prototype phase, the existing demo policies remain documented as prototype-only; production role enforcement will later use Firebase custom claims and policies based on `auth.jwt()`.

The shared compatibility snapshot must be scoped to the authenticated demo user before production deployment. Until that change, it must not be treated as a multi-user security boundary.

## Deployment

- Add Firebase web configuration through Vite environment variables.
- Add Firebase Hosting configuration for the Vite `dist` directory and SPA fallback to `index.html`.
- Add the Firebase Hosting domain to Supabase redirect URLs and Google OAuth authorized origins.

## Required configuration

- Firebase project ID
- Firebase web app configuration (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`)
- Supabase Firebase Third-Party Auth integration using the Firebase project ID
- Google provider enabled in Firebase Authentication

## Validation

- Google login and logout work through Firebase.
- Refreshing the page restores the Firebase session.
- The three demo roles remain selectable and enforce their existing UI/workflow behavior.
- Supabase requests include the Firebase ID token.
- TypeScript, tests, and production build pass.
- Firebase Hosting deploy output contains the built SPA.
