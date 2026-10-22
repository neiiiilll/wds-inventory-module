import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "./config"

let cached: { url: string; key: string; client: SupabaseClient } | null = null

export function createSupabaseAdmin(url: string, serviceRoleKey: string): SupabaseClient {
  if (!url || !serviceRoleKey) throw new Error("Supabase service configuration is missing.")
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

export function getSupabaseAdmin(): SupabaseClient {
  const url = SUPABASE_URL.value()
  const key = SUPABASE_SERVICE_ROLE_KEY.value()
  if (!cached || cached.url !== url || cached.key !== key) {
    cached = { url, key, client: createSupabaseAdmin(url, key) }
  }
  return cached.client
}
