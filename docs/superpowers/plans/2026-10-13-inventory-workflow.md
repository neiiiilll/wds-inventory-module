# Connected Inventory Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Extend the existing WDS mockup with linked requests, procurement, IAR acceptance, RIS release, cost-based charging, returns, and reconciliation.

**Architecture:** Keep the current application shell and inventory/report screens. Introduce a typed workflow service with pure validated state transitions and a shared persisted state containing items, documents, and transactions. New workflow components consume that state; all stock-affecting actions pass through the service.

**Tech Stack:** Existing React 19, TypeScript, Vite 8, Tailwind CSS v4; Node assertions with the existing TypeScript transpilation test pattern. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-13-inventory-workflow-design.md`

## Global Constraints

- Preserve the current visual design and existing inventory, transaction history, and reporting screens.
- This remains a browser-based prototype: role selection demonstrates permissions, acknowledgments are recorded names and dates rather than verified electronic signatures, and local persistence does not replace a production database.
- Reservations remain disabled by default because the client's use of reservations is unconfirmed.
- Acceptance itself does not post stock.
- Customer tariffs, taxes, labor fees, and markups are separate configurable inputs; no default surcharge is inferred.
- Missing acquisition costs are visibly unresolved and block final material-cost posting; they must not silently become zero.
- Corrections append linked transactions instead of overwriting history.
- Confirming an actual release with recipient acknowledgment is an explicit prototype assumption pending client confirmation.

## Review Focus

- Double-clicking or retrying a receipt/release must not post twice.
- Partially delivered orders and partially released RIS records must retain correct outstanding quantities.
- Refreshing or changing a demo role must preserve data while denying prohibited mutations.
- Later receipts must not change historical issue costs or return credit costs.
- Existing item actions must not bypass IAR/RIS controls or admit inactive/duplicate items.

## Files and responsibilities

- Create `src/services/workflow.ts`: document/state types, initial linked sample data, calculations, and mutation validation.
- Create `src/components/InventoryWorkflow.tsx`: request, order, inspection, issuance, and stock posting interfaces.
- Create `src/components/MaterialCharges.tsx`: job cost ledger and separately configured billing inputs.
- Create `src/components/Reconciliation.tsx`: linked returns, investigations, physical counts, and corrections.
- Create `src/services/workflow-storage.ts`: versioned browser persistence with recoverable storage errors.
- Create `scripts/workflow.test.mjs`: meaningful state-transition and costing assertions.
- Modify `src/services/inventory.ts`: valuation and linked-document metadata on items/transactions.
- Modify `src/App.tsx`: navigation and shared workflow state, route existing stock actions through document flows, retain reports/cards.
- Modify `src/index.css`: responsive workflow styles and print layouts.
- Modify `package.json`: include workflow assertions in the test command.

### Task 1: Stock posting and valuation service

**Interfaces:**
- `WorkflowState` contains `items`, `transactions`, `requests`, `orders`, `iars`, `ris`, `releases`, `returns`, and `counts`.
- `WorkflowAction` is a discriminated union for document creation/status changes, inspection, acceptance, receipt posting, release posting, returns, and count correction.
- `applyWorkflowAction(state: WorkflowState, action: WorkflowAction, role: string): WorkflowState` validates permissions and throws descriptive errors for invalid actions.
- `createWorkflowState(items: InventoryItem[], transactions: InventoryTransaction[]): WorkflowState` supplies linked sample records and explicitly labeled sample costs.
- `materialCostForJob(state: WorkflowState, job: string): number` sums immutable release values less accepted usable-return credits.

- [x] Write service tests using the existing transpile-and-import approach. Assert receipt of 10 units at PHP 20 into 10 units worth PHP 100 yields 20 units worth PHP 300 and unit cost PHP 15; issuing 4 yields PHP 60 and 16 units worth PHP 240; returning 2 against that release credits PHP 30.
- [x] Assert posting the same receipt/release ID twice cannot change quantities or values; assert a return above the unreturned issue quantity fails; assert a later receipt does not change an existing release's PHP 15 snapshot.
- [x] Assert acceptance before inspection, excess accepted/delivered quantities, receipts without acceptance, missing costs, inactive items, negative stock, and Viewer mutations fail.
- [x] Run `node scripts/workflow.test.mjs` and confirm failure before implementing the service.
- [x] Implement document types and atomic immutable transitions. Track ordered/delivered/accepted/posted amounts separately. Store original-cost issue snapshots, specific acquisition costs for individually tracked items, and posting identifiers.
- [x] Run the assertions and confirm all cases pass.

### Task 2: Requests, procurement, and accepted receipts

**Interfaces:** Consume `WorkflowState`, `WorkflowAction`, and `applyWorkflowAction`. Export default `InventoryWorkflow` accepting `section`, `state`, `role`, and `onAction(action: WorkflowAction): void`; section identifies request, procurement, inspection, receipt, or issuance views.

- [x] Add assertions: a request for 12 units with 5 on hand reports a shortage of 7 without changing stock; a partial delivery retains outstanding quantities; duplicate order references are flagged; duplicate item codes are rejected.
- [x] Run service tests and confirm the new cases fail before adding corresponding calculations/validation.
- [x] Implement multi-line request forms, specifications, requester/date/job fields, approval references, related additional requests, availability comparison, and request status tracking.
- [x] Implement shortage-linked procurement, supplier/order/delivery references, document attachments for the prototype, and duplicate-order warnings.
- [x] Implement IAR delivered/accepted/rejected quantities, findings, sequential officer/custodian acknowledgment, and accepted-only stock-in posting with unit costs. Show acceptance and posting as separate actions.
- [x] Provide print-friendly IAR, RIS, and item card views, labeled prototype layouts where an official template is unavailable.
- [x] Run service tests; verify create request → partial purchase delivery → inspection → acceptance → receipt updates Stock Card once.

### Task 3: RIS, releases, charges, and returns

**Interfaces:** `InventoryWorkflow` issuance view consumes linked requests and records RIS/release actions. Export default `MaterialCharges` accepting `state` and showing job-linked immutable charge lines; billing input changes never call stock-posting actions. `Reconciliation` return view emits linked return actions.

- [x] Add assertions: issuing 3 then 2 against a requested quantity of 8 leaves 3 outstanding; cancelling a partially issued RIS preserves its releases and prevents new ones; a damaged return does not increase usable stock or automatically credit charges.
- [x] Run tests and confirm failure, then implement the corresponding transitions.
- [x] Implement digital RIS with approval references, recipient acknowledgment, quantities requested/released/outstanding, partial releases, and cancellation.
- [x] Implement charge ledger by job/RIS/release, showing locked issue costs, additional issuances, usable-return credits, and net material cost. Distinguish sample costs and unresolved actual costs.
- [x] Implement separately configured fees, markup, and tax inputs with a clear billing preview; default all additions to zero and never mutate stock from billing.
- [x] Implement original-release-linked returns with condition, date, acceptance, and original-cost credit limits; record damaged returns separately.
- [x] Run tests and manually verify that viewing/printing charges leaves quantity and transaction count unchanged.

### Task 4: Reconciliation, persistence, and app integration

**Interfaces:** Export default `Reconciliation` accepting `state`, `role`, and `onAction`. `loadWorkflowState(): WorkflowState` and `saveWorkflowState(state: WorkflowState): void` in storage service use a versioned key and retain the last valid stored state on failure.

- [x] Add assertions: a count of 7 against a snapshot of 10 records a variance of -3 without stock movement; documented correction appends one -3 transaction; repeated correction fails; a changed balance requires a refreshed count rather than applying a stale correction.
- [x] Run tests and confirm failure, then implement count snapshots, findings, authorization references, correction links, and stale-count validation.
- [x] Integrate one shared workflow state into App. Persist after successful actions and provide visible storage-failure feedback. Preserve legacy report dates/history and current report-period checks.
- [x] Add navigation and dashboard workflow summaries. Redirect item Stock In/Out and legacy free-standing return/adjustment entry points to their controlled linked flows; validate role permissions centrally.
- [x] Add searchable stock balances/movements by item/date/document/job and Property Card identity metadata. Reject duplicate item codes and distinguish opening balances from receipts.
- [x] Add responsive layouts, accessible form labels, disabled-action explanations, validation messages, and printable records. Ensure sidebar scrolling works with the added destinations.
- [x] Run `npm test`, `npx tsc --noEmit`, and `npm run build`; all must succeed.
- [x] Inspect desktop/mobile flows, partial postings, damaged/usable returns, Viewer restrictions, refresh persistence, and print layouts. Review the final diff against the specification and record any remaining prototype limitations.

## Execution recommendation

Use native execution in this chat. These tasks share the same linked state and posting interfaces; one implementer can carry the flow through consistently with targeted validation at each step. No deployment, external service integration, or production database changes are part of this plan.


Implementation evidence and prototype limits: see `../implementation-progress.md`. Native print-dialog output was not captured; print layout rules and modal placement were reviewed. Changes remain in the existing preview checkout.
