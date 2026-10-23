import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { SUPABASE_SECRET_KEY, SUPABASE_URL } from "./config"

let client: SupabaseClient | undefined

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL.value(), SUPABASE_SECRET_KEY.value(), {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
  }
  return client
}
