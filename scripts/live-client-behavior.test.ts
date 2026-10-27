import assert from "node:assert/strict"
import test from "node:test"
import type { DocumentDetail, DocumentLine } from "../functions/src/procurement/contracts"
import { formatDecimal } from "../src/services/format-decimal"
import { collectProcurementDocument, type DetailSection } from "../src/services/procurement-pagination"
import { matchesLiveInvalidation } from "../src/services/live-invalidation"

const line = (lineNo: number): DocumentLine => ({
  id: `line-${lineNo}`,
  itemId: `item-${lineNo}`,
  lineNo,
  quantity: "1",
  unitPrice: null,
  specification: null,
  snapshot: null,
})

const detail = (section: DetailSection, page: number): DocumentDetail => ({
  id: "document-1",
  kind: "purchase_order",
  reference: "PO-1",
  date: "2026-10-24",
  status: "dispatched",
  version: 1,
  revision: null,
  historical: false,
  availableActions: ["recordDelivery"],
  fields: {},
  lines: section === "lines" ? (page === 0 ? Array.from({ length: 100 }, (_, index) => line(index + 1)) : [line(101)]) : [],
  history: section === "history" ? [{ id: `event-${page + 1}` }] : [],
  related: section === "related" ? [{ id: `related-${page + 1}`, kind: "inspection", reference: `IR-${page + 1}` }] : [],
  reviewSteps: [],
  attachments: [],
  linesNextCursor: section === "lines" && page === 0 ? "lines-2" : null,
  historyNextCursor: section === "history" && page === 0 ? "history-2" : null,
  relatedNextCursor: section === "related" && page === 0 ? "related-2" : null,
})

test("complete document collection preserves every paged line, event, and related record", async () => {
  const result = await collectProcurementDocument(async (section, cursor) => detail(section, cursor ? 1 : 0))
  assert.equal(result.lines.length, 101)
  assert.deepEqual(result.lines.slice(-1).map((entry) => entry.id), ["line-101"])
  assert.deepEqual(result.history.map((entry) => entry.id), ["event-1", "event-2"])
  assert.deepEqual(result.related.map((entry) => entry.id), ["related-1", "related-2"])
})

test("complete document collection fails closed at its page bound", async () => {
  await assert.rejects(
    collectProcurementDocument(async (section) => ({ ...detail(section, 0), [`${section}NextCursor`]: "again" }), 1),
    /too large to edit safely/,
  )
})

test("decimal display keeps precision and invalidations match scoped resources", () => {
  assert.equal(formatDecimal("12345678901234567890.120000"), "12,345,678,901,234,567,890.12")
  assert.equal(formatDecimal("-0.000100"), "-0.0001")
  assert.equal(matchesLiveInvalidation("procurement:purchase_order:first", "procurement"), true)
  assert.equal(matchesLiveInvalidation("inventory:first", "procurement"), false)
})
