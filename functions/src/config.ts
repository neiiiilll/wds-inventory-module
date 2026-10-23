import { defineSecret } from "firebase-functions/params"

export const REGION = "asia-southeast1"
export const SUPABASE_URL = defineSecret("SUPABASE_URL")
export const SUPABASE_SERVICE_ROLE_KEY = defineSecret("SUPABASE_SERVICE_ROLE_KEY")
export const callableOptions = {
  region: REGION,
  secrets: [SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY],
}
