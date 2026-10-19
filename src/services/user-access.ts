import { firebaseAuth } from "./firebase"
import { isSupabaseConfigured, supabase } from "./supabase"
import {
  isAppRole,
  type AppRole,
  type AppUser,
  type UserRoleHistoryEntry,
} from "./access-control"

type AppUserRow = {
  firebase_uid: string
  email: string
  display_name: string
  role: string
  active: boolean
  created_at: string
  updated_at: string
  last_login_at: string
}

type HistoryRow = {
  id: string
  target_uid: string
  target_email: string
  previous_role: string | null
  new_role: string
  previous_active: boolean | null
  new_active: boolean
  reason: string
  actor_uid: string
  actor_email: string
  occurred_at: string
}

function requireAccessClient() {
  if (!firebaseAuth?.currentUser) throw new Error("Firebase authentication is required.")
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase is not configured.")
  return supabase
}

function mapAppUser(row: AppUserRow): AppUser {
  if (!isAppRole(row.role)) throw new Error(`Unknown application role: ${row.role}`)
  return {
    firebaseUid: row.firebase_uid,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  }
}

function mapHistory(row: HistoryRow): UserRoleHistoryEntry {
  if (!isAppRole(row.new_role) || (row.previous_role !== null && !isAppRole(row.previous_role)))
    throw new Error("Role history contains an unknown application role.")
  return {
    id: row.id,
    targetUid: row.target_uid,
    targetEmail: row.target_email,
    previousRole: row.previous_role,
    newRole: row.new_role,
    previousActive: row.previous_active,
    newActive: row.new_active,
    reason: row.reason,
    actorUid: row.actor_uid,
    actorEmail: row.actor_email,
    occurredAt: row.occurred_at,
  }
}

export async function registerCurrentUser(): Promise<AppUser> {
  const client = requireAccessClient()
  const { data, error } = await client.rpc("register_current_app_user").single()
  if (error) throw new Error(`Access registration failed: ${error.message}`)
  return mapAppUser(data as AppUserRow)
}

export async function loadCurrentUser(): Promise<AppUser> {
  const client = requireAccessClient()
  const uid = firebaseAuth!.currentUser!.uid
  const { data, error } = await client
    .from("app_users")
    .select("firebase_uid,email,display_name,role,active,created_at,updated_at,last_login_at")
    .eq("firebase_uid", uid)
    .single()
  if (error) throw new Error(`Access lookup failed: ${error.message}`)
  return mapAppUser(data as AppUserRow)
}

export async function listAppUsers(): Promise<AppUser[]> {
  const client = requireAccessClient()
  const { data, error } = await client
    .from("app_users")
    .select("firebase_uid,email,display_name,role,active,created_at,updated_at,last_login_at")
    .order("display_name")
  if (error) throw new Error(`User access list failed: ${error.message}`)
  return (data as AppUserRow[]).map(mapAppUser)
}

export async function setAppUserAccess(input: {
  targetUid: string
  role: AppRole
  active: boolean
  reason: string
}): Promise<AppUser> {
  const client = requireAccessClient()
  const reason = input.reason.trim()
  if (!reason) throw new Error("Change reason is required.")
  const { data, error } = await client.rpc("set_app_user_access", {
    target_uid: input.targetUid,
    next_role: input.role,
    next_active: input.active,
    change_reason: reason,
  }).single()
  if (error) throw new Error(`Access update failed: ${error.message}`)
  return mapAppUser(data as AppUserRow)
}

export async function listUserRoleHistory(targetUid?: string): Promise<UserRoleHistoryEntry[]> {
  const client = requireAccessClient()
  let query = client.from("user_role_history").select("*").order("occurred_at", { ascending: false })
  if (targetUid) query = query.eq("target_uid", targetUid)
  const { data, error } = await query
  if (error) throw new Error(`Role history load failed: ${error.message}`)
  return (data as HistoryRow[]).map(mapHistory)
}
