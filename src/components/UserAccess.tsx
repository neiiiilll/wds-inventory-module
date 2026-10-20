import { useCallback, useEffect, useState } from "react"
import { APP_ROLES, type AppRole, type AppUser } from "../services/access-control"
import { listAppUsers, setAppUserAccess } from "../services/user-access"
import { WButton, WField, WModal, WSelect, WText } from "./WorkflowUI"

const showDate = (value: string) => new Intl.DateTimeFormat("en-PH", {
  month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
}).format(new Date(value))

export default function UserAccess({ currentUser, embedded = false }: { currentUser: AppUser; embedded?: boolean }) {
  const [users, setUsers] = useState<AppUser[]>([])
  const [editing, setEditing] = useState<AppUser | null>(null)
  const [role, setRole] = useState<AppRole>("Viewer")
  const [active, setActive] = useState(true)
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      setUsers(await listAppUsers())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "User access could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const open = (user: AppUser) => {
    setEditing(user)
    setRole(user.role)
    setActive(user.active)
    setReason("")
    setError("")
  }

  const save = async () => {
    if (!editing || !reason.trim()) {
      setError("Reason for change is required.")
      return
    }
    setSaving(true)
    setError("")
    try {
      await setAppUserAccess({ targetUid: editing.firebaseUid, role, active, reason })
      setEditing(null)
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Access could not be updated.")
    } finally {
      setSaving(false)
    }
  }

  return <>
    {embedded
      ? <div className="settings-section-heading"><div><span className="eyebrow">ADMINISTRATION</span><h2>User Access</h2><p>Assign system roles to registered Google accounts.</p></div><WButton secondary onClick={() => void load()} disabled={loading}>Refresh</WButton></div>
      : <div className="page-header"><div><span className="eyebrow">SETTINGS</span><h1>User Access</h1><p>Assign roles and control access for Google accounts registered with the system.</p></div><div className="page-actions"><WButton secondary onClick={() => void load()} disabled={loading}>Refresh</WButton></div></div>}
    {error && <div role="alert" className="workflow-note workflow-error">{error}</div>}
    <section className="panel user-access-panel">
      <div className="panel-head"><div><h2>Registered users</h2><p>New Google accounts receive Viewer access automatically.</p></div></div>
      {loading ? <div className="empty"><p>Loading user access…</p></div> : <div className="table-wrap"><table><thead><tr><th>Display name</th><th>Email</th><th>Role</th><th>Status</th><th>Registered</th><th>Last login</th><th></th></tr></thead><tbody>{users.map(user => {
        const self = user.firebaseUid === currentUser.firebaseUid
        return <tr key={user.firebaseUid}><td><strong>{user.displayName}</strong>{self && <small className="cell-sub">Signed-in account</small>}</td><td>{user.email}</td><td><span className="type">{user.role}</span></td><td><span className={`badge ${user.active ? "badge-available" : "badge-inactive"}`}><i />{user.active ? "Active" : "Inactive"}</span></td><td>{showDate(user.createdAt)}</td><td>{showDate(user.lastLoginAt)}</td><td><button className="btn btn-secondary" type="button" title="Edit access" onClick={() => open(user)}>Edit access</button></td></tr>
      })}</tbody></table></div>}
    </section>
    {editing && <WModal title={`Edit access · ${editing.displayName}`} onClose={() => setEditing(null)}><div className="form-grid single"><WField label="Role"><WSelect value={role} onChange={event => setRole(event.target.value as AppRole)}>{APP_ROLES.map(option => <option key={option}>{option}</option>)}</WSelect></WField><WField label="Status"><WSelect value={active ? "Active" : "Inactive"} onChange={event => setActive(event.target.value === "Active")}><option>Active</option><option>Inactive</option></WSelect></WField><WField label="Reason for change"><WText required value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain why this access is changing" /></WField></div><div className="modal-actions"><WButton secondary onClick={() => setEditing(null)}>Cancel</WButton><WButton onClick={() => void save()} disabled={saving || !reason.trim()}>{saving ? "Saving…" : "Save access"}</WButton></div></WModal>}
  </>
}
