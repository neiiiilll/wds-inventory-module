# Supabase setup

The React app is configured with the supplied project URL and publishable key in the ignored `.env.local` file. Firebase Authentication supplies the Google user session and ID token; Supabase remains the database and verifies Firebase tokens through its Third-Party Auth integration. The app loads the current workflow from `workflow_snapshots` when the table exists and keeps the local browser fallback when Supabase is unavailable.

## Apply the database structure

1. Open the Supabase Dashboard for the WDS Inventory project.
2. Open **SQL Editor** and create a new query.
3. Copy the contents of `supabase/migrations/20261014000000_inventory_schema.sql` into the query.
4. Click **Run**.
5. Refresh the Inventory Module preview.

The migration creates the normalized inventory, procurement, receiving, issuance, printable-form, and reference-counter records. It also creates the `workflow_snapshots` compatibility table used by the current React mockup and removes any obsolete electronic-signature table or fields.

## Security note

The compatibility row has a prototype policy. Before production use, replace it with authenticated user and role policies. The normalized tables already have RLS enabled and currently allow authenticated access; narrow those policies by Firebase role claims before real client data is loaded.

Never place a database password, secret key, or `service_role` key in the React application. The browser uses only the publishable key.

## Configure Firebase Google sign-in

1. Create or open the Firebase project used for Hosting.
2. Register a Web app in Firebase and copy its web configuration into `.env.local` using the `VITE_FIREBASE_*` names in `.env.example`.
3. In Firebase Authentication → Sign-in method, enable **Google**.
4. In Supabase, open **Authentication → Third-Party Auth** and add Firebase using the Firebase project ID.
5. In Firebase Authentication → **Settings → Authorized domains**, add the local preview host and the Firebase Hosting host.
6. In Supabase **Authentication → URL Configuration**, add the local preview URL and the Firebase Hosting URL as allowed redirect URLs.
7. Ensure Firebase ID tokens include the custom claim `role: "authenticated"`; Supabase uses that claim to assign the authenticated database role. Add the application role separately as a trusted claim such as `app_role` when production RLS is enabled.

The login page opens Google through Firebase and returns to the same app origin. The inventory workspace is shown only after Firebase has restored an authenticated session. The sidebar logout action signs out of Firebase.
