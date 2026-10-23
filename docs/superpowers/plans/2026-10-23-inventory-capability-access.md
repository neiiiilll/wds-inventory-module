# Inventory Capability Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize Inventory role capabilities and present Viewer as a safe read-only workspace without weakening server authorization.

**Architecture:** A pure TypeScript access-control module maps the three database roles to named capabilities and page-read permissions. React consumes those predicates for navigation, read-only messaging, and action visibility; Apps Core `inventory-api` remains authoritative for every live database operation.

**Tech Stack:** React 19, TypeScript 5.7, Vite 8, Firebase Authentication, Supabase Edge Functions, Node test scripts

**Spec:** `docs/superpowers/specs/2026-10-23-inventory-capability-access-design.md`

## Global Constraints

- Roles remain exactly `Administrator`, `Inventory Staff`, and `Viewer` in the React domain.
- Tenant and role continue to come only from Apps Core authorization records resolved by `inventory-api`.
- Viewer retains read, search, navigation, detail, report, audit-history, refresh, and print access.
- Viewer receives no mutation control and application mutation handlers still reject Viewer.
- Inventory Staff cannot change requester/ownership fields or manage users and roles.
- Service Desk, `svc_*` tables, and Firebase `serviceDesk` are untouched.
- No client secret or service-role credential is added to the React bundle.

## Review Focus

- A missing or unknown role key must never become an active role; existing access-gate parsing owns this case.
- Hiding a control must not become the security boundary; reducer and Edge rejection tests remain required.
- Viewer must retain print and read-only navigation while mutation controls disappear.
- A role refresh while an unauthorized page is open must return the user to Dashboard.
- Inventory Staff must retain operational actions while Administrator-only requester changes remain unavailable.

---

### Task 1: Central capability and page matrix

**Files:**
- Modify: `src/services/access-control.ts`
- Modify: `scripts/access-control.test.mjs`

**Interfaces:**
- Produces: `AppCapability`, `AppPage`, `hasCapability(role, capability)`, `canAccessPage(role, page)`, and `isReadOnlyRole(role)`
- Preserves: `canManageUsers`, `canMutateWorkflow`, `canChangeRequester`, and `canPrint` as capability-backed helpers

- [ ] **Step 1: Write failing matrix tests**

Assert every role/capability result, Viewer read-only state, all current read pages, and rejection of an Administrator-only page by Staff and Viewer.

- [ ] **Step 2: Run the focused test and verify expected failure**

Run: `node scripts/access-control.test.mjs`

Expected: FAIL because the capability and page APIs do not exist.

- [ ] **Step 3: Implement the immutable matrices and predicates**

Keep the module independent of React, Firebase, and Supabase.

- [ ] **Step 4: Run the focused test**

Run: `node scripts/access-control.test.mjs`

Expected: `Access control checks passed.`

### Task 2: Read-only workspace and centralized UI guards

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/InventoryWorkflow.tsx`
- Modify: `src/components/PurchaseDocuments.tsx`
- Modify: `src/components/Reconciliation.tsx`
- Modify: `src/components/MaterialCharges.tsx`
- Modify: `src/components/ClientDocument.tsx`
- Modify: `src/index.css`
- Create: `scripts/role-ui.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: the Task 1 capability and page predicates
- Produces: guarded `navigate(page)`, a Viewer read-only notice, and mutation-control omission

- [ ] **Step 1: Write failing UI source-contract tests**

Assert the workspace uses `canAccessPage` and `isReadOnlyRole`, renders the read-only notice, updated components import shared predicates instead of comparing role strings, and Viewer mutation controls are conditionally omitted.

- [ ] **Step 2: Run the focused UI test and verify expected failure**

Run: `node scripts/role-ui.test.mjs`

Expected: FAIL because centralized page guards and read-only UI are absent.

- [ ] **Step 3: Implement page navigation and read-only notice**

Use `AppPage` as the shell page type, guard all shell navigation through `navigate`, and return to Dashboard if refreshed access no longer permits the current page.

- [ ] **Step 4: Replace ad-hoc role comparisons and omit mutation controls**

Use shared capability predicates in workflow, procurement, reconciliation, charges, and document components. Keep print, view, and navigation controls visible.

- [ ] **Step 5: Run focused checks**

Run: `node scripts/access-control.test.mjs && node scripts/role-ui.test.mjs && node scripts/access-gate.test.mjs`

Expected: all three checks pass.

### Task 3: Verify and release the client-only RBAC update

**Files:**
- No production source beyond Tasks 1–2

**Interfaces:**
- Consumes: completed capability UI
- Produces: verified Firebase Hosting release

- [ ] **Step 1: Run complete verification**

Run: `npm test`

Expected: all application checks, Edge tests, and retained rollback Function tests pass.

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npm run build`

Expected: Vite exits 0 and creates `dist/index.html`.

- [ ] **Step 2: Deploy only Hosting**

Run: `npm run deploy:hosting`

Expected: deployment succeeds for `https://app-invb61a9.web.app`; no Firebase Function or Supabase deployment occurs.

- [ ] **Step 3: Verify live resources**

Confirm Hosting returns HTTP 200, Apps Core `inventory-api` remains ACTIVE, and Firebase still lists only `serviceDesk`.

