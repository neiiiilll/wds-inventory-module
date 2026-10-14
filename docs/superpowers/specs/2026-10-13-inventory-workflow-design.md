# Inventory workflow update

## Purpose and scope

Extend the existing WDS React inventory mockup to demonstrate the client's interview workflow in INVENTORY MODULE.pdf. Preserve the current visual design and existing inventory, transaction history, and reporting screens. Add connected requests, procurement, IAR acceptance, RIS issuance, material charging, returns, and reconciliation. This remains a browser-based prototype: role selection demonstrates permissions, acknowledgments are recorded names and dates rather than verified electronic signatures, and local persistence does not replace a production database.

The user directs material charging to follow industry inventory practice. Use the valuation approach below rather than inventing Sir Maki's calculations. Customer tariffs, taxes, labor fees, and markups are separate configurable inputs; no default surcharge is inferred.

## Connected documents and workflow

1. Material requests capture unique number, date, requesting personnel, project or service connection, items, quantities, units, specifications, and recorded Management/GM approval references. Additional requests link to the same job and optionally the original request. Show potential duplicates for review rather than silently blocking legitimate additional needs.
2. Availability checking compares requested and outstanding quantities against stock. Checking stock does not change physical balances. Reservations remain disabled by default because the client's use of reservations is unconfirmed.
3. Procurement records link to request shortages and capture supplier, purchase reference, ordered quantities, delivery references, and supporting documents. Show ordered, delivered, accepted, and outstanding quantities separately. Flag repeated order references and overlapping outstanding orders.
4. IAR records capture control number, purchase and delivery links, delivered and accepted quantities, rejected or damaged quantities, findings, Inspection Officer acknowledgment, and subsequent Supply and Property Custodian acceptance. Acceptance cannot precede inspection. Support print-friendly records for manual signatures. Acceptance itself does not post stock.
5. Stock-in posts only accepted, previously unposted IAR quantities. Posting updates quantity, inventory value, and the Stock Card once. Existing item codes and units are reused. New records are checked for duplicate codes. Opening balances are explicitly identified rather than treated as unexplained receipts.
6. RIS records link to requests and jobs, capture control number, requested quantities, recorded applicable approval references, actual releases, recipient acknowledgment, and outstanding quantities. Status is pending, partially issued, fully issued, or cancelled. Partial releases are permitted; cancellation prevents further releases and preserves earlier ones.
7. For the prototype, confirming an actual release with recipient acknowledgment is the stock posting trigger. This is an explicit prototype assumption pending client confirmation. Each release receives a unique posting identifier and deducts stock once. Printing, viewing, charging, or retrying a posted release cannot deduct stock again.

## Valuation and material charging

IAS 2 supports weighted-average or FIFO costs for interchangeable inventories and specific identification for noninterchangeable items. Select moving weighted average for ordinary consumables in this perpetual inventory prototype; use specific acquisition cost for individually tracked items. This is a design selection, not a claim that a single charging formula is mandatory across the industry.

- Each accepted receipt records quantity and acquisition unit cost. Acquisition cost includes attributable inbound costs net of discounts; recoverable taxes are excluded from material cost.
- New average unit cost = (existing inventory carrying value + accepted receipt acquisition value) / (existing quantity + accepted receipt quantity).
- Each actual issue snapshots its unit cost at posting. Material charge = actual quantity issued multiplied by that snapshot. Later receipts never rewrite earlier issue costs.
- Partial and additional releases produce separate charge lines linked to their release, RIS, and job. Job totals consolidate those lines without posting more inventory movements.
- Accepted usable returns link to an original issue line, cannot exceed its unreturned quantity, and restore inventory at that line's original unit cost. A corresponding credit reduces the job's material cost. Recalculate the remaining average from quantity and carrying value.
- Damaged returns are recorded separately and do not increase usable stock. They do not automatically create a customer credit; any credit requires a separately recorded decision.
- Missing acquisition costs are visibly unresolved and block final material-cost posting; they must not silently become zero. Demo prices are clearly labeled sample data.
- Keep calculation precision internally and round displayed currency to two decimal places. Prevent negative quantities and negative carrying value caused by posting logic.
- Customer-facing billing, if shown, separates net material cost from configured fees, markup, and tax. Inventory valuation does not establish the client's customer pricing policy. Payment collection is outside this prototype's scope.

Source: https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/

## Returns, corrections, and reconciliation

Returns record condition, date, original RIS/release, job, quantities, and acceptance. Adjustments retain investigation findings, reason, supporting document, user, date, and applicable authorization reference. Corrections append linked transactions instead of overwriting history.

Physical-count worksheets snapshot recorded quantity, capture counted quantity, calculate variance, and retain findings. An explicitly confirmed, documented correction creates one linked adjustment. Recording a count or investigation alone does not change inventory.

## Screens and data boundaries

Add navigation for Material Requests, Procurement, Inspection & Acceptance, RIS & Issuance, Material Charges, and Reconciliation. Stock In becomes an accepted-IAR posting flow; Stock Out becomes a linked actual-release flow. Keep item detail, Stock Card history, and reports connected to document and job references. Property Card records preserve applicable item identity and related movements without claiming an official client form template has been supplied.

Separate workflow calculations and posting validation from UI components. Store linked document IDs, release/receipt posting IDs, quantities, valuation snapshots, acknowledgments, and correction references. Browser persistence supports prototype continuity across refreshes. Production authentication, multi-user concurrency, secured document storage, official signature verification, and regulatory reporting require a backend phase.

## Validation

Verify weighted-average receipts and issue snapshots, original-cost return credits, partial release balances, sequential IAR acknowledgments, accepted-only receipt limits, duplicate-post prevention, zero-cost handling, inactive-item restrictions, permissions at mutation boundaries, and physical-count corrections. Build the app and inspect the principal workflows at desktop and mobile widths. Preserve existing report-period tests.

## Outstanding client inputs

Official print layouts, production access roles, reservation policy, final release posting trigger, and any customer fee/tax schedules are not supplied. The prototype must label these assumptions and configurable inputs rather than present them as established client policies.
