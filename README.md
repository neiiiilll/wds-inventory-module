# WDS Inventory Mockup

A React application demonstrating the client's inventory process: material requests, purchasing, inspection and acceptance, warehouse receipts, RIS issuance, material charges, returns, and stock reconciliation.

This is a React/Vite inventory application. Firebase Authentication provides Google-only sign-in, while Supabase stores the inventory and procurement data.

## Run locally

Use Node.js 22 and pnpm 10.34.3, as configured in `.mise.toml`.

```sh
pnpm install
pnpm dev
```

Open **http://localhost:8443/**. In the Figma Make workspace, the development server is already running and source changes reload automatically. Do not start a second server on the same port.

## Firebase Hosting

The repository includes `firebase.json` for the Hosting site shown in the Firebase console. Install or use the Firebase CLI, select the Firebase **project ID** that owns the `app-invb6la9` Hosting site, then run:

```sh
firebase login
firebase use apps-workspace-b61a9
npm run deploy:hosting
```

The Firebase project ID is different from the Hosting site ID. Do not commit Firebase Admin credentials or secrets.

Vite listens on `0.0.0.0` by default. For another device on the same network, use the development computer's IP address and port 8443. The `PORT` environment variable changes the port.

## Current features

- **Inventory:** item information, storage locations, quantities, minimum stock levels, and availability status.
- **Material Requests:** requesting personnel defaults to the current session name. Administrators can select a previously recorded requester or enter another name. Editable requests use Edit / Add Quantities; linked additional MRs are permitted only after the original progresses to PR, PO or RIS. Revisions preserve the original request number, record the editor and reason, and require reapproval.
- **Procurement:** an expandable sidebar menu containing Material Request, Purchase Request, Purchase Order, and Inspection and Acceptance. Supplier quotations record item quantities, prices, validity, terms and supporting documents. PRs compare offers, record the selection reason and preserve approved prices. Fully approved PRs authorize multi-item POs with quantity allocation limits, supplier dispatch records and printable PR/PO summaries.
- **Inspection and Acceptance:** outstanding POs and their ordered items/quantities appear before delivery recording. Start an IAR from a PO or the expected-delivery list with the order preselected. Ordered-versus-delivered comparisons by item; acceptable, damaged, rejected, undelivered, return-required and replacement-pending quantities; supplier return acknowledgments; replacement deliveries; and sequential inspector/custodian acceptance.
- **Stock In:** lists accepted IARs and their inventory postings. New acceptance automatically posts usable quantities once. Earlier accepted, unposted records retain a recovery posting action; loading saved records does not post them silently. Delivery entry stays in Inspection and Acceptance.
- **Stock Out:** RIS preparation, partial material releases, recipient acknowledgment, and outstanding quantities. An actual release deducts stock; printing does not.
- **Material Charges:** moving weighted-average cost for interchangeable items, specific acquisition cost for individually tracked assets, and job totals based on actual issues.
- **Returns and Reconciliation:** original-release-linked returns, original-cost credits for accepted usable returns, physical counts, and documented corrections.
- **Transactions, Stock Trail, and Reports:** movement history, running balances, document/project filters, date ranges, and report exports.
- **Demo roles:** Administrator, Inventory Staff, and Viewer. The role selector is retained for prototype demonstration; Viewer cannot change inventory records. Production role assignment must move to trusted Firebase claims before go-live.

## Procurement progression

The sidebar and process navigation share four steps: Material Request → Purchase Request → Purchase Order → Inspection and Acceptance. Acceptance automatically posts usable stock; Stock In provides receipt history and recovery of earlier unposted records. RIS issuance remains a separate inventory action.

MRs display procurement progress separately from stock issuance (Not issued, Partially issued or Fully issued). Issuing stock does not change the procurement status. New PRs show Draft, the current pending review stage, Returned, Rejected, Approved, Partially ordered or Ordered. POs show Awaiting dispatch before receiving is available, then delivery progress separately from processing progress. A full shipment does not imply inspection, acceptance or stock posting is complete. Completed requires all ordered quantities posted, all deliveries inspected/accepted, and supplier returns resolved.

### PR approval and revisions

The client-designated route is **Requester submission → Department Head → Budget Review → Procurement/Internal Control → Final Approver**. The four review stages stay in this order. Assign each reviewer before submission. Only the current stage can act; each decision records the assigned reviewer, timestamp, reason and the session user who recorded it. Submitted details are locked. Approval is complete only when every required reviewer approves the current revision.

A reviewer can approve, return for revision or reject. A returned PR must have an actual revision saved, with a reason, before resubmission. Resubmission restarts the route and clears the current decisions while preserving all earlier decisions and revision history. Rejected requests cannot be resubmitted or converted to a PO; further requirements use a new linked MR. Drafts can be revised. A PR already approved or linked to a PO cannot be silently changed.

The mockup records reviewer acknowledgments; it does not authenticate the named reviewers or send notifications. Production routing needs user accounts, reviewer permissions, server-side enforcement and notification delivery.

### Authentication and persistence

Firebase Authentication provides Google-only sign-in. Supabase remains the database and receives the Firebase ID token through its third-party authentication integration. Firebase tokens must include `role: "authenticated"` for Supabase to treat them as authenticated database requests. The three role options remain available for prototype demonstration; the current selector is not a production authorization boundary.

### Quotations, PO prices and dispatch

Record quotations against an approved MR, or update quotations while its PR is draft/returned and has no PO. MR revisions invalidate older quotations. Selected quotations must be current and valid for the PR date. PR unit prices come from the selected quotation; PO supplier and prices come from the approved PR. Item totals sum ordered quantities multiplied by unit prices. Record tax, delivery and payment treatment in quotation terms; these totals do not calculate separate taxes or freight.

Record supplier dispatch date, recipient, method, reference and note before recording a delivery against a new PO. This action records evidence of dispatch; it does not send an email or place an order with a supplier. IAR entry presents the PO's expected quantities and prefills its recorded unit costs for verification.

Earlier saved PRs and POs keep their recorded approvals and receipts. Missing quotations, prices, review routes and dispatch evidence are displayed as unrecorded. Existing POs remain receivable without invented dispatch evidence. Earlier PRs cannot create new POs under the new controls; use a new linked MR for new procurement.

Workflow guidance: [SAP quotation comparison](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/af9ef57f504840d2b81be8667206d485/0fd1842b7cb14be4bc38e43d457994dd.html) and [Oracle purchasing approval stages](https://docs.oracle.com/en/cloud/saas/procurement/25d/oapro/purchasing-approval-stages.html). The exact review sequence above follows the client's instruction.

Inspection must be acknowledged before acceptance. Acceptance and inventory posting are atomic: acquisition costs, opening valuations and unique asset tags must be valid before either is saved. Damaged/rejected quantities never enter usable stock. All-rejected deliveries can be acknowledged without a stock movement. Repeated acceptance/posting is rejected.

PO and IAR comparisons use the ordered item snapshots, units and specifications. Original shipments and replacement shipments are distinguished so replacements do not inflate the original ordered quantity. Undelivered and replacement-due quantities remain separate.

## Document references

MR, PR, PO, IAR, and RIS numbers use independent monthly sequences:

```text
IAR 2026-10-0001
IAR 2026-10-0002
RIS 2026-10-0001
MR 2026-10-0001
PR 2026-10-0001
PO 2026-10-0001
```

Each sequence starts at `0001` for a new month. The selected document date determines the month. Existing saved references are migrated once to this format, with linked transaction references updated and internal document IDs preserved. Previous references are retained on migrated records.

These sequences operate within the browser's saved data. Shared numbering across multiple users requires a backend.

Editable date fields support typing in **MM/DD/YYYY** or selecting a date with the calendar icon. Stored dates remain ISO dates (`YYYY-MM-DD`), and calendar selections respect each field's minimum/maximum dates. Read-only and disabled fields cannot open a calendar.

## Printable client forms

The IAR, RIS, and Stock Card layouts follow the supplied `IAR-RIS-StockCard.xlsx` workbook.

- **IAR:** open an Inspection and Acceptance record and select **Client form · Print / Save as PDF**.
- **RIS:** open a Stock Out / RIS record and select **Client form · Print / Save as PDF**.
- **Stock Card:** open **Inventory List → View item → Stock Card · Print**.

Forms open blank, following the client's latest design direction. Use **Edit form fields** to enter the available metadata, then **Save form fields** and **Print / Save as PDF**. Entered fields appear in the printable form. Transaction lines are not automatically filled into these blank templates. Each opening starts with a blank entry session.

Printing uses the browser's print dialog. There is no Form Content selector, Paper Size selector, or downloadable printable-copy button. Form layouts include blank table rows and signature spaces.

IAR and RIS retain blank signature spaces for manual signing after printing. The forms do not upload, draw, save, or display electronic signatures.

## Browser storage

Workflow data uses the local storage key `wds-inventory-workflow-v1`. Inventory actions save records in the current browser and origin. For example, `localhost:8443` and a network IP address use separate storage, even when they serve the same application.

The initial screen contains demo records when no saved data exists. Recorded names and dates represent prototype acknowledgments.

## Request editing and progression

Material Requests can be edited or have extra quantities added before any PR, PO, or RIS is linked. A change to an approved request clears its approval and requires approval again. The system records the actor, time, reason, and before/after values; stale edit forms cannot overwrite a newer revision.

Once the request progresses, its edit action is disabled. Use **Additional request** for extra requirements under the same job. The original approved requirements remain intact. Existing POs without PRs retain their original approval provenance; the migration does not fabricate PR approvals. New POs require an approved PR.

These edit cutoffs are application controls informed by the procurement references in the [Procurement design](docs/superpowers/specs/2026-10-13-procurement-controls-design.md). The design distinguishes the proposed internal policy from regulatory rules governing contract amendments. Legacy history uses the recorded date where an exact timestamp is unavailable.

Rejected items do not enter usable inventory. Supplier returns record disposition of rejected goods; replacement deliveries link to their original IAR and cannot exceed its open rejected quantity. Warehouse stock issuance remains separate from Procurement.

## Development checks

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

The tests cover reporting periods, workflow validation and valuation, document numbering/migration, client form rendering, quotation prices, required sequential approvals, return/revision/resubmission, rejection, PO dispatch gates and receipt completion. `pnpm preview` serves the production build after building.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/App.tsx` | App navigation, shared workflow state, inventory screens, and reports |
| `src/index.css` | Global styles, responsive layouts, and print rules |
| `src/components/InventoryWorkflow.tsx` | Requests, purchasing, IAR, and RIS interactions |
| `src/components/PurchaseDocuments.tsx` | PR/PO registers, quotation comparison, reviews, dispatch and print summaries |
| `src/components/ClientDocument.tsx` | Blank client forms, metadata entry, and browser printing |
| `src/components/MaterialCharges.tsx` | Job material costs and billing preview |
| `src/components/Reconciliation.tsx` | Returns, count worksheets, and corrections |
| `src/services/workflow.ts` | Atomic actions, validation, costing, references, and migrations |
| `src/services/workflow-storage.ts` | Browser persistence |
| `scripts/` | Automated checks |
| `docs/superpowers/` | Designs, plans, and implementation notes |

Historical implementation notes may describe earlier UI behavior. The current application and this README reflect the latest completed changes; proposed features are identified separately above.
