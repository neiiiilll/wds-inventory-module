import { createClient } from "@supabase/supabase-js"
import { firebaseAuth } from "./firebase"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabasePublishableKey!, {
      accessToken: async () => firebaseAuth?.currentUser?.getIdToken(false) ?? null,
    })
  : null
