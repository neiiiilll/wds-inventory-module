import { defineSecret, defineString } from "firebase-functions/params"

export const FUNCTION_REGION = "asia-southeast1" as const

export const SUPABASE_URL = defineSecret("SUPABASE_URL")
export const SUPABASE_SERVICE_ROLE_KEY = defineSecret("SUPABASE_SERVICE_ROLE_KEY")
export const INVENTORY_BOOTSTRAP_TENANT_KEY = defineString(
  "INVENTORY_BOOTSTRAP_TENANT_KEY",
  { default: "" },
)

export const SUPABASE_SECRETS = [SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY] as const
