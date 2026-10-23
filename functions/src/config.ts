import { defineSecret } from "firebase-functions/params"

export const REGION = "asia-southeast1"
export const SUPABASE_URL = defineSecret("SUPABASE_URL")
export const SUPABASE_SECRET_KEY = defineSecret("SUPABASE_SECRET_KEY")
export const callableOptions = {
  region: REGION,
  secrets: [SUPABASE_URL, SUPABASE_SECRET_KEY],
}
