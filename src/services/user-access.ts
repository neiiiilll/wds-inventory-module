import { firebaseAuth } from "./firebase"
import { ensureFirebaseSupabaseRole } from "./firebase-claims"
import { supabase } from "./supabase"
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

type UserRoleHistoryRow = {
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

function requireFirebaseUser() {
  const user = firebaseAuth?.currentUser
  if (!user?.email) throw new Error("Firebase authentication is required.")
  return user
}

function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured.")
  return supabase
}

function databaseError(error: { message?: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback)
}

function toAppUser(row: AppUserRow): AppUser {
  if (!isAppRole(row.role)) throw new Error("The database returned an invalid application role.")
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

function toHistoryEntry(row: UserRoleHistoryRow): UserRoleHistoryEntry {
  if (!isAppRole(row.new_role) || (row.previous_role !== null && !isAppRole(row.previous_role))) {
    throw new Error("The database returned an invalid role history entry.")
  }
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

async function prepareRequest() {
  const user = requireFirebaseUser()
  await ensureFirebaseSupabaseRole()
  return { client: requireSupabase(), user }
}

export async function registerCurrentUser(): Promise<AppUser> {
  const { client } = await prepareRequest()
  const { data, error } = await client.rpc("register_current_app_user")
  databaseError(error, "User registration failed.")
  const row = (Array.isArray(data) ? data[0] : data) as AppUserRow | null
  if (!row) throw new Error("Supabase did not return the registered user.")
  return toAppUser(row)
}

export async function loadCurrentUser(): Promise<AppUser> {
  const { client, user } = await prepareRequest()
  const { data, error } = await client
    .from("app_users")
    .select("*")
    .eq("firebase_uid", user.uid)
    .maybeSingle()
  databaseError(error, "User access could not be loaded.")
  if (!data) return registerCurrentUser()
  return toAppUser(data as AppUserRow)
}

export async function listAppUsers(): Promise<AppUser[]> {
  const { client } = await prepareRequest()
  const { data, error } = await client
    .from("app_users")
    .select("*")
    .order("display_name")
  databaseError(error, "User access could not be loaded.")
  return ((data ?? []) as AppUserRow[]).map(toAppUser)
}

export async function setAppUserAccess(input: {
  targetUid: string
  role: AppRole
  active: boolean
  reason: string
}): Promise<AppUser> {
  const reason = input.reason.trim()
  if (!reason) throw new Error("Change reason is required.")
  const { client } = await prepareRequest()
  const { data, error } = await client.rpc("set_app_user_access", {
    target_uid: input.targetUid,
    next_role: input.role,
    next_active: input.active,
    change_reason: reason,
  })
  databaseError(error, "Access could not be updated.")
  const row = (Array.isArray(data) ? data[0] : data) as AppUserRow | null
  if (!row) throw new Error("Supabase did not return the updated user.")
  window.dispatchEvent(new Event("wds-access-invalidated"))
  return toAppUser(row)
}

export async function listUserRoleHistory(
  targetUid?: string,
): Promise<UserRoleHistoryEntry[]> {
  const { client } = await prepareRequest()
  let query = client
    .from("user_role_history")
    .select("*")
    .order("occurred_at", { ascending: false })
  if (targetUid) query = query.eq("target_uid", targetUid)
  const { data, error } = await query
  databaseError(error, "Access history could not be loaded.")
  return ((data ?? []) as UserRoleHistoryRow[]).map(toHistoryEntry)
}

export const APP_ROLES = ["Administrator", "Inventory Staff", "Viewer"] as const
