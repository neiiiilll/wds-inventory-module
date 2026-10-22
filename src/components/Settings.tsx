import type { AppUser } from "../services/access-control"
import { userInitials } from "../services/user-display"

export default function Settings({ currentUser, onSignOut }: {
  currentUser: AppUser
  onSignOut: () => void
}) {
  return <>
    <div className="page-header">
      <div>
        <span className="eyebrow">SETTINGS</span>
        <h1>Account settings</h1>
        <p>Review your signed-in Google account and inventory access.</p>
      </div>
    </div>

    <section className="panel settings-account-panel">
      <div className="settings-profile">
        <div className="settings-avatar" aria-hidden="true">{userInitials(currentUser.displayName || currentUser.email)}</div>
        <div>
          <span>Signed-in Google account</span>
          <h2>{currentUser.displayName}</h2>
          <p>{currentUser.email}</p>
        </div>
        <span className="badge badge-available"><i />{currentUser.active ? "Active" : "Inactive"}</span>
      </div>
      <dl className="settings-details">
        <div><dt>Inventory role</dt><dd><span className="type">{currentUser.role}</span></dd></div>
        <div><dt>Tenant</dt><dd>{currentUser.tenantKey ?? "Unavailable"}</dd></div>
        <div><dt>Account access</dt><dd>{currentUser.active ? "Enabled" : "Disabled"}</dd></div>
      </dl>
      <div className="settings-actions">
        <p>Tenant and role assignments are managed securely by an Administrator.</p>
        <button className="btn btn-secondary" type="button" onClick={onSignOut}>Sign out</button>
      </div>
    </section>
  </>
}
