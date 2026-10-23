# Inventory Capability Access Design

## Intent

Make the existing database-assigned Inventory roles consistent across navigation and actions. Firebase continues to authenticate the Google account, Apps Core membership remains the sole tenant/role authority, and `inventory-api` remains the security boundary.

## Roles and capabilities

| Capability | Administrator | Inventory Staff | Viewer |
| --- | --- | --- | --- |
| View inventory, workflows, reports, and audit history | Yes | Yes | Yes |
| Print operational documents | Yes | Yes | Yes |
| Update Inventory items | Yes | Yes | No |
| Create or update operational workflow records | Yes | Yes | No |
| Post stock movements | Yes | Yes | No |
| Change requester/ownership fields | Yes | No | No |
| Manage application users and roles | Yes | No | No |

All existing workflow-state locks still apply. A role grants permission to attempt an action; it never bypasses approval sequence, quantity, version, tenant, or document-state validation.

## Selected approach

Use a centralized capability matrix. Normal workflow pages remain visible to all active roles, while mutation controls are omitted for Viewer and a workspace-level read-only notice explains why. Administrator-only pages are hidden and guarded. A centralized page guard prevents navigation to any page the role cannot read.

Alternatives considered:

- Hide all operational pages from Viewer: simpler, but removes useful audit visibility.
- Leave every control visible but disabled: transparent, but noisy and easy to implement inconsistently.
- Central capabilities with read-only visibility: selected because it provides audit visibility, a clear interface, and one permission vocabulary.

## Enforcement

- The React capability matrix controls presentation and client navigation only.
- Mutation handlers keep an application-layer guard so hidden controls cannot be bypassed through component state.
- `inventory-api` independently derives tenant and role from Apps Core tables and continues to reject unauthorized calls.
- No role, tenant, or permission supplied by the browser is trusted.
- Existing Service Desk code, `svc_*` data, and Firebase `serviceDesk` remain out of scope.

## User experience

- Viewer sees the same operational pages and data their tenant permits.
- Viewer sees a clear **Read-only access** notice.
- Mutation buttons and editing affordances are not rendered for Viewer.
- Read, search, navigation, printing, refresh, and record-detail actions remain available.
- Inventory Staff has operational mutation controls but not Administrator-only ownership or access-management controls.
- Administrator has all defined capabilities.

## Validation

Automated checks cover the complete role/capability matrix, page access, read-only detection, absence of ad-hoc role checks in updated UI components, Viewer mutation rejection in the workflow reducer, and the existing Edge authorization tests. Final verification is `npm test`, `npx tsc --noEmit`, and `npm run build` before deploying only Firebase Hosting.

