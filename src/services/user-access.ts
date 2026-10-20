import { firebaseAuth } from "./firebase"
import {
  isAppRole,
  isBootstrapAdministrator,
  type AppRole,
  type AppUser,
  type UserRoleHistoryEntry,
} from "./access-control"

const usersStorageKey = "wds-inventory-demo-users-v1"
const historyStorageKey = "wds-inventory-demo-role-history-v1"

function requireFirebaseUser() {
  const user = firebaseAuth?.currentUser
  if (!user?.email) throw new Error("Firebase authentication is required.")
  return user
}

function readUsers(): AppUser[] {
  const parsed = JSON.parse(localStorage.getItem(usersStorageKey) ?? "[]") as AppUser[]
  return Array.isArray(parsed)
    ? parsed.filter(user => user && typeof user.firebaseUid === "string" && isAppRole(user.role))
    : []
}

function writeUsers(users: AppUser[]) {
  localStorage.setItem(usersStorageKey, JSON.stringify(users))
}

function readHistory(): UserRoleHistoryEntry[] {
  const parsed = JSON.parse(localStorage.getItem(historyStorageKey) ?? "[]") as UserRoleHistoryEntry[]
  return Array.isArray(parsed) ? parsed : []
}

function newHistoryId() {
  return globalThis.crypto?.randomUUID?.() ?? `access-${Date.now()}`
}

export async function registerCurrentUser(): Promise<AppUser> {
  const firebaseUser = requireFirebaseUser()
  const now = new Date().toISOString()
  const users = readUsers()
  const existing = users.find(user => user.firebaseUid === firebaseUser.uid)
  const next: AppUser = existing
    ? {
        ...existing,
        email: firebaseUser.email!,
        displayName: firebaseUser.displayName || firebaseUser.email!,
        updatedAt: now,
        lastLoginAt: now,
      }
    : {
        firebaseUid: firebaseUser.uid,
        email: firebaseUser.email!,
        displayName: firebaseUser.displayName || firebaseUser.email!,
        role: isBootstrapAdministrator(firebaseUser.email!) ? "Administrator" : "Viewer",
        active: true,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      }
  writeUsers(existing
    ? users.map(user => user.firebaseUid === next.firebaseUid ? next : user)
    : [...users, next])
  return next
}

export async function loadCurrentUser(): Promise<AppUser> {
  const firebaseUser = requireFirebaseUser()
  const user = readUsers().find(candidate => candidate.firebaseUid === firebaseUser.uid)
  if (!user) return registerCurrentUser()
  return user
}

export async function listAppUsers(): Promise<AppUser[]> {
  requireFirebaseUser()
  return readUsers().sort((left, right) => left.displayName.localeCompare(right.displayName))
}

export async function setAppUserAccess(input: {
  targetUid: string
  role: AppRole
  active: boolean
  reason: string
}): Promise<AppUser> {
  const firebaseUser = requireFirebaseUser()
  const reason = input.reason.trim()
  if (!reason) throw new Error("Change reason is required.")
  const users = readUsers()
  const current = users.find(user => user.firebaseUid === firebaseUser.uid)
  if (!current || current.role !== "Administrator" || !current.active)
    throw new Error("Only an active Administrator can change demo access.")
  if (input.targetUid === current.firebaseUid)
    throw new Error("Another Administrator must change your access.")
  const target = users.find(user => user.firebaseUid === input.targetUid)
  if (!target) throw new Error("The selected demo user could not be found.")
  const occurredAt = new Date().toISOString()
  const updated: AppUser = {
    ...target,
    role: input.role,
    active: input.active,
    updatedAt: occurredAt,
  }
  writeUsers(users.map(user => user.firebaseUid === updated.firebaseUid ? updated : user))
  const history = readHistory()
  history.unshift({
    id: newHistoryId(),
    targetUid: updated.firebaseUid,
    targetEmail: updated.email,
    previousRole: target.role,
    newRole: updated.role,
    previousActive: target.active,
    newActive: updated.active,
    reason,
    actorUid: current.firebaseUid,
    actorEmail: current.email,
    occurredAt,
  })
  localStorage.setItem(historyStorageKey, JSON.stringify(history))
  window.dispatchEvent(new Event("wds-access-invalidated"))
  return updated
}

export async function listUserRoleHistory(targetUid?: string): Promise<UserRoleHistoryEntry[]> {
  requireFirebaseUser()
  const history = readHistory()
  return targetUid ? history.filter(entry => entry.targetUid === targetUid) : history
}
