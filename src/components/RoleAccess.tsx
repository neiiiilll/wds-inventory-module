import type { ReactNode } from "react"

import {
  hasCapability,
  isReadOnlyRole,
  type AppCapability,
  type AppRole,
} from "../services/access-control"

export function CapabilityGate({
  role,
  capability,
  children,
}: {
  role: AppRole
  capability: AppCapability
  children: ReactNode
}) {
  return hasCapability(role, capability) ? children : null
}

export function ReadOnlyAccessNotice({ role }: { role: AppRole }) {
  if (!isReadOnlyRole(role)) return null

  return (
    <aside className="read-only-access" role="status">
      <strong>Read-only access</strong>
      <span>You can view, search, navigate, and print. Record changes require Inventory Staff or Administrator access.</span>
    </aside>
  )
}
