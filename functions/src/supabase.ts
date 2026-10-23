import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { INVENTORY_BACKEND, parseInventoryBackendConfig } from "./config"

let client: SupabaseClient | undefined

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    const config = parseInventoryBackendConfig(INVENTORY_BACKEND.value())
    client = createClient(config.url, config.secretKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
  }
  return client
}
