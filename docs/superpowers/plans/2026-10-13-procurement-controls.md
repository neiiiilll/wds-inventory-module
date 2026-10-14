# Procurement controls implementation

Execute in the existing live-preview workspace, inline, as requested by the user. The repeated instruction to update the system confirms proceeding with the prepared design. Keep existing document IDs and financial postings intact.

1. Extend pure workflow actions and migration: MR references/history/edit locks; PR snapshots and approval; monthly MR/PR/PO numbering; PO line allocations; IAR line comparisons and supplier return/replacement tracking. Verify service tests before UI integration.
2. Group sidebar Procurement children and implement PR/PO interfaces. Extend MR creation/edit/add-quantity forms and show history. Separate RIS navigation from purchasing steps.
3. Extend delivery entry and comparison tables to multiple ordered items, partial/replacement receipts, rejected and damaged quantities. Preserve atomic accepted-only warehouse posting and existing valuation tests.
4. Verify browser flows, permissions, reload/migration, TypeScript and build; perform independent final review; update README and implementation notes.

Review focus: existing records without PRs; approval invalidation; stale edit forms; multi-line receipt atomicity; replacement deliveries exceeding rejected quantities; stock issuance without PR; historical timestamps unavailable on legacy requests.

Ruling: legacy POs are retained without fabricated PR approvals. New POs require approved PRs. Historical request creation displays the original recorded date when its exact creation timestamp is unavailable.
