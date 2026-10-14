# Procurement workflow and request controls

## Requested outcome

Extend the existing WDS inventory mockup with Procurement submenus for Material Request (MR), Purchase Request (PR), Purchase Order (PO), and Inspection and Acceptance (IAR). Keep stock issuance outside Procurement. Show requesting personnel, controlled request revisions, audit history, and ordered-versus-delivered comparisons. Preserve the existing printable client forms and the user's simplified print controls.

The user confirmed on 2026-10-13 that MR, PR, and PO use the same monthly number format as IAR and RIS. All five formats are PREFIX YYYY-MM-COUNT, starting at 0001 independently per prefix and month. Existing references and linked transaction references are migrated once; original references remain available for traceability. Internal IDs remain stable.

## Research and proposed edit policy

The exact point at which an internal Material Request becomes read-only is an application control proposed here, not a claim that legislation mandates a universal MR edit deadline.

| Situation | Application behavior |
| --- | --- |
| MR has no PR, PO, or RIS | Allow corrections, added items, and increased or decreased quantities. Require a revision reason and recorded actor. |
| Approved MR changes before progression | Invalidate its previous approval; preserve the earlier approval in history; require approval again. |
| First PR created | Snapshot the approved MR and procurement quantities; lock the source MR. |
| Existing MR already has a PO or RIS | Lock it immediately, including legacy records with no PR. |
| More materials needed after lock | Create an additional MR linked to the original and the same job. Only additional quantities belong in the new MR; it follows a new approval and PR process. |
| Requirements change after PO issued | Preserve the issued document. A new linked request handles extra requirements; supplier contract amendments require a separate documented authorization process. Silent PO edits are excluded. |

Sources and implications:

- [GPPB RA 12009 implementing rules, section 71.1.1](https://www.gppb.gov.ph/wp-content/uploads/2025/08/GPPB-Resolution-No.-02-2025.pdf): post-contract amendments to goods orders are subject to defined conditions. This supports protecting issued orders from silent changes. It does not itself prescribe the proposed MR-to-PR locking rule.
- [COA supporting-document requirements](https://www.coa.gov.ph/wp-content/uploads/ABC-Help/DRCGT/DRCGT.50.1.htm): approved requisitions, delivery details, and inspector/custodian acceptance records provide the basis for linked document snapshots and sequential acceptance.
- [GPPB 2025 eMarketplace guidelines, sections 8 and 9](https://www.gppb.gov.ph/wp-content/uploads/2025/12/GPPB_Resolution-No.10-2025.pdf): damaged, wrong, incomplete, or nonconforming supplies require inspection and a replacement process. The prototype adopts separate rejection/replacement tracking. Those guidelines' specific eMarketplace deadlines are not applied universally to the client's purchasing process.

## Navigation

Procurement is an expandable main menu containing Material Request, Purchase Request, Purchase Order, and Inspection and Acceptance. Opening any child expands the group and highlights that child. The group works in both desktop and mobile navigation.

Stock In / Accepted Receipts remains a warehouse posting step. Stock Out / RIS Issuance, Material Charges, warehouse Returns and Reconciliation, inventory, and stock cards remain separate top-level destinations. Procurement screens never offer stock issuance as a numbered purchasing step.

## Material Request and history

The creation and edit forms display the requesting personnel explicitly, alongside the MR number, date, job/service connection, optional parent MR, and multiple material lines. Each line contains item identity, unit, quantity, and specification.

Before progression, an Edit / Add Quantities action opens the existing lines. Saving appends an event containing timestamp, actor, reason, and before/after values for personnel, job, specifications, added/removed items, and quantities. The original creation event and all approvals and progression events remain visible. No-change submissions do not create misleading revision entries.

New events retain exact timestamps and display in Asia/Manila. Legacy requests show their original recorded date without inventing an exact creation time or an unavailable editor identity. Request history cannot be edited through the UI.

The service enforces the edit lock independently of the UI. A stale form cannot modify a request after another action progresses it. Disabled actions explain which linked document locked the request and offer a new additional request instead.

## Purchase Request

A PR is a distinct document, not a renamed PO. It records reference, date, source MR, requesting personnel, job, approved requirement snapshot, selected procurement quantities, and approval acknowledgment/reference.

Preparing a PR requires an approved MR and at least one positive procurement quantity. Default quantities use current shortages, shown alongside requested quantities and available stock. The operator reviews the PR quantities; they cannot exceed the unprocured approved requirement. PR creation, approval, and PO linking do not reserve or deduct inventory.

Creating the PR locks its MR immediately. A PR must be approved before a new PO is issued. Legacy POs remain accessible with their original links and an explicit legacy provenance note; migration must not fabricate PR approvals.

## Purchase Order and IAR

POs support multiple material lines under one supplier/order reference. Each line snapshots the requested item, unit, specification, and ordered quantity. They link to an approved PR and cannot over-allocate its remaining approved procurement quantities. Split orders against a PR are permitted and displayed.

IAR preparation selects a PO and displays all ordered items, ordered quantities, previous deliveries, and current outstanding quantities before delivery entry. Each delivery line records actual delivered, acceptable, damaged, and other rejected quantities, plus findings and acquisition cost for accepted stock. Damaged plus other rejected plus acceptable must equal delivered. Invalid negative quantities and unexplained excess deliveries are blocked.

The PO and IAR comparison displays per item:

- Ordered quantity.
- Gross delivered quantity, separating original shipments from replacement shipments.
- Acceptable quantity and acknowledged accepted quantity.
- Undelivered shortage.
- Damaged and other rejected quantity.
- Return-required, returned-to-supplier, and replacement-pending quantity.
- Quantity posted to usable inventory.

Rejected deliveries stay outside usable stock. Record a supplier-return acknowledgment against the rejected IAR line with quantity, date, actor, and reference. A replacement delivery links to that rejected line and can satisfy only its open replacement quantity. It receives its own IAR number and inspection/acceptance sequence. It does not increase the original PO quantity or duplicate the accepted receipt.

Example: order 10; receive 8 acceptable plus 2 damaged. Show delivered 10, undelivered 0, rejected/return-required 2, accepted requirement still pending 2. Return the damaged 2 and receive 2 replacements: show original shipped 10 plus replacements 2, accepted total 10, and replacement pending 0. Stock receives only accepted quantities posted once.

Existing single-item POs/IARs migrate to equivalent one-line documents without changing stock, costs, acknowledgments, original control numbers, or posting IDs. Existing transactions and RIS/job-cost links remain intact.

## Data and implementation boundaries

Retain one WorkflowState owner in App and pure atomic service actions. Add PR records, request revision events, PO/IAR line snapshots, supplier-return records, replacement links, and schema migration. Every write validates permissions and document status. Existing browser storage is migrated without discarding the previous quantities or documents.

Printable IAR, RIS, and Stock Card remain blank when opened, following the user's latest instruction. Their existing manual-entry and Print / Save as PDF controls remain; no paper-size selector, Form Content selector, download button, or explanatory preview section is reintroduced.

This remains the existing browser-based mockup. A server-backed audit log, verified approvals, and concurrency-safe numbering across multiple users require a later backend phase; this change does not claim to provide them.

## Verification

Service tests cover MR editing before PR; approval invalidation; edit rejection after PR/legacy PO/RIS; chronological before/after history; independent monthly numbering and migration; PR approval and PO allocation limits; partial deliveries; damaged/nonconforming segregation; supplier-return limits; replacement delivery limits; accepted-only receipts; duplicate-post prevention; permissions; and preservation of existing valuation and return-credit behavior.

Browser checks cover all four Procurement submenus, separate RIS navigation, creation/edit/add-item flows, lock explanations, history, PR-to-PO links, delivery comparisons, and desktop/mobile layouts. Run the existing tests, TypeScript checking, production build, and diff checks.

## Review status

Implemented after the user explicitly repeated the instruction to update the system. The monthly numbering decision is confirmed. The MR locking/reapproval rule, PR approval, PO/IAR lines, comparisons, supplier returns, and replacement behavior are implemented in the current mockup.
