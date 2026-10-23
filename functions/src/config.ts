import { defineJsonSecret } from "firebase-functions/params"

export const REGION = "asia-southeast1"
export const INVENTORY_BACKEND = defineJsonSecret("INVENTORY_BACKEND")

const APPROVED_SUPABASE_URL = "https://oqsgzdkljtxtpwdzptnw.supabase.co"
const FIREBASE_PROJECT_ID = "apps-workspace-b61a9"
const APP_KEY = "inventory"
const CONFIG_FIELDS = ["url", "secretKey", "firebaseProjectId", "appKey"] as const

export interface InventoryBackendConfig {
  readonly url: string
  readonly secretKey: string
  readonly firebaseProjectId: typeof FIREBASE_PROJECT_ID
  readonly appKey: typeof APP_KEY
}

function invalidConfig(): never {
  throw new Error("Inventory backend configuration is invalid.")
}

export function parseInventoryBackendConfig(value: unknown): InventoryBackendConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidConfig()
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== CONFIG_FIELDS.length || keys.some((key) => !CONFIG_FIELDS.includes(key as typeof CONFIG_FIELDS[number]))) invalidConfig()
  if (record.url !== APPROVED_SUPABASE_URL) invalidConfig()
  if (typeof record.secretKey !== "string" || !/^sb_secret_[^\s\x00-\x1f\x7f]+$/.test(record.secretKey)) invalidConfig()
  if (record.firebaseProjectId !== FIREBASE_PROJECT_ID || record.appKey !== APP_KEY) invalidConfig()
  return Object.freeze({
    url: record.url,
    secretKey: record.secretKey,
    firebaseProjectId: record.firebaseProjectId,
    appKey: record.appKey,
  }) as InventoryBackendConfig
}

export const callableOptions = {
  region: REGION,
  secrets: [INVENTORY_BACKEND],
  maxInstances: 5,
  timeoutSeconds: 60,
}
