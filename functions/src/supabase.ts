import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "./config"

let client: SupabaseClient | undefined

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL.value(), SUPABASE_SERVICE_ROLE_KEY.value(), {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
  }
  return client
}
