import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../src/services/workflow.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createWorkflowState, applyWorkflowAction, requestStatus, requestFulfillmentStatus } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const items = [
  { id: "a", code: "A", name: "Pipe", unit: "pcs", quantity: 0, inventoryValue: 0, unitCost: 10, active: true },
  { id: "b", code: "B", name: "Meter", unit: "pcs", quantity: 0, inventoryValue: 0, unitCost: 40, costMethod: "Specific", assets: [], active: true },
];
const lines = [{ itemId: "a", quantity: 3, specification: "Pipe 1/2" }, { itemId: "b", quantity: 1, specification: "Meter 20mm" }];
const request = { type: "request", id: "mr", date: "2026-10-14", person: "Requester", job: "Repair", lines };
const apply = (state, action, role = "Administrator", personnel) => applyWorkflowAction(state, action, role, personnel);
function ready() {
  let state = createWorkflowState(items, [], false);
  for (const action of [request,
    { type: "approve-request", id: "mr", person: "GM", reference: "APP" },
    { type: "purchase-request", id: "pr", reference: "PR 2026-10-0001", requestId: "mr", date: request.date, person: "Requester", lines },
    { type: "approve-purchase-request", id: "pr", person: "GM", reference: "PR-APP" },
    { type: "order", id: "po", purchaseRequestId: "pr", requestId: "mr", reference: "PO 2026-10-0001", date: request.date, supplier: "Supplier", itemId: "a", quantity: 3, lines },
    { type: "delivery", id: "iar", orderId: "po", reference: "IAR 2026-10-0001", deliveryReference: "DR1", date: request.date, delivered: 4, accepted: 3, findings: "One damaged pipe", lines: [
      { itemId: "a", delivered: 3, accepted: 2, damaged: 1, unitCost: 10 },
      { itemId: "b", delivered: 1, accepted: 1, damaged: 0, unitCost: 40, assetTags: ["METER-1"] },
    ] }, { type: "inspect", id: "iar", person: "Inspector" }]) state = apply(state, action);
  return state;
}
const failures = [];
const check = (name, run) => { try { run(); console.log(`PASS ${name}`); } catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.message}`); } };

check("Acceptance posts only acceptable quantities across all lines exactly once", () => {
  const before = ready();
  const after = apply(before, { type: "accept", id: "iar", person: "Custodian" });
  assert.deepEqual(after.items.map(i => i.quantity), [2, 1]);
  assert.deepEqual(after.items.map(i => i.inventoryValue), [20, 40]);
  assert.equal(after.transactions.length, 2);
  assert.ok(after.iars[0].postingId);
  assert.equal(after.iars[0].acceptedAt, after.iars[0].postedAt);
  assert.deepEqual(after.items[1].assets, [{ tag: "METER-1", cost: 40 }]);
  assert.deepEqual(before.items.map(i => i.quantity), [0, 0]);
  assert.throws(() => apply(after, { type: "accept", id: "iar", person: "Custodian" }), /already/i);
  assert.throws(() => apply(after, { type: "receipt", id: "iar", person: "Custodian", postingId: "repeat" }), /posted|duplicate/i);
});
check("Invalid cost on a later line leaves acceptance and inventory unchanged", () => {
  const state = ready(); delete state.iars[0].lines[1].unitCost;
  const before = structuredClone(state);
  assert.throws(() => apply(state, { type: "accept", id: "iar", person: "Custodian" }), /cost/i);
  assert.deepEqual(state, before);
});
check("Missing accepted asset tags block acceptance without a partial receipt", () => {
  const state = ready(); state.iars[0].lines[1].assetTags = [];
  assert.throws(() => apply(state, { type: "accept", id: "iar", person: "Custodian" }), /asset tag/i);
  assert.equal(state.iars[0].acceptedBy, undefined);
  assert.equal(state.transactions.length, 0);
});
check("All-rejected inspection can be acknowledged without adding usable stock", () => {
  const state = ready(); state.iars[0].lines.forEach(l => { l.accepted = 0; l.damaged = l.delivered; }); state.iars[0].accepted = 0;
  const after = apply(state, { type: "accept", id: "iar", person: "Custodian" });
  assert.equal(after.iars[0].acceptedBy, "Custodian");
  assert.deepEqual(after.items.map(i => i.quantity), [0, 0]);
  assert.equal(after.transactions.length, 0);
});
check("Earlier accepted unposted IARs retain a single recovery posting", () => {
  const state = ready(); state.iars[0].acceptedBy = "Earlier Custodian";
  const after = apply(state, { type: "receipt", id: "iar", person: "Custodian", postingId: "legacy-receipt" });
  assert.deepEqual(after.items.map(i => i.quantity), [2, 1]);
  assert.throws(() => apply(after, { type: "receipt", id: "iar", person: "Custodian", postingId: "repeat" }), /posted/i);
});
check("Staff requester uses session identity and cannot impersonate another person", () => {
  const state = createWorkflowState(items, [], false);
  const after = apply(state, { ...request, person: "" }, "Inventory Staff", "Juan Dela Cruz");
  assert.equal(after.requests[0].person, "Juan Dela Cruz");
  assert.throws(() => apply(state, request, "Inventory Staff", "Juan Dela Cruz"), /requester|personnel/i);
  const administered = apply(state, request, "Administrator", "Juan Dela Cruz");
  assert.equal(administered.requests[0].person, "Requester");
  assert.equal(administered.requests[0].history[0].actor, "Juan Dela Cruz");
  assert.throws(() => apply(after, { type: "edit-request", id: "mr", person: "Other", job: "Repair", lines, actor: "Juan", reason: "Rename", expectedVersion: 0 }, "Inventory Staff", "Juan Dela Cruz"), /admin|requester|personnel/i);
});
check("Follow-up quantities require editing the original before PR and a linked MR after PR", () => {
  let state = apply(createWorkflowState(items, [], false), request);
  const followup = { ...request, id: "extra", parentId: "mr", lines: [{ ...lines[0], quantity: 1 }] };
  assert.throws(() => apply(state, followup), /edit.*original|before.*PR/i);
  state = apply(state, { type: "approve-request", id: "mr", person: "GM", reference: "APP" });
  assert.throws(() => apply(state, followup), /edit.*original|before.*PR/i);
  state = apply(state, { type: "edit-request", id: "mr", person: "Requester", job: "Repair", lines: [{ ...lines[0], quantity: 4 }, lines[1]], actor: "Clerk", reason: "One additional pipe", expectedVersion: 0 });
  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].lines[0].quantity, 4);
  assert.equal(state.requests[0].approvedBy, undefined);
  const after = apply(ready(), followup);
  assert.equal(after.requests.find(r => r.id === "extra").parentId, "mr");
});
check("Procurement status is independent of inventory issuance", () => {
  const state = ready();
  assert.equal(requestStatus(state, state.requests[0]), "Awaiting acceptance");
  assert.equal(requestFulfillmentStatus(state, state.requests[0]), "Not issued");
  state.ris = [{ id: "ris", requestId: "mr" }];
  state.releases = [{ risId: "ris", itemId: "a", quantity: 1 }];
  assert.equal(requestStatus(state, state.requests[0]), "Awaiting acceptance");
  assert.equal(requestFulfillmentStatus(state, state.requests[0]), "Partially issued");
  state.releases = [{ risId: "ris", itemId: "a", quantity: 3 }, { risId: "ris", itemId: "b", quantity: 1 }];
  assert.equal(requestStatus(state, state.requests[0]), "Awaiting acceptance");
  assert.equal(requestFulfillmentStatus(state, state.requests[0]), "Fully issued");
});
assert.deepEqual(failures, []);
console.log("Request controls passed: requester identity, follow-up locks, separate statuses and atomic acceptance receipts.");
