import { readFileSync } from "node:fs"
import assert from "node:assert/strict"
import ts from "typescript"
const source = readFileSync(
  new URL("../src/services/workflow.ts", import.meta.url),
  "utf8",
)
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
})
const {
  createWorkflowState,
  applyWorkflowAction,
  materialCostForJob,
  availability,
  risStatus,
  newId,
  nextFormReference,
  migrateFormReferences,
} = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`
)
const originalCrypto=globalThis.crypto;
const numbering={iars:[{reference:"IAR 2026-10-0001"},{reference:"IAR 2026-10-0003"},{reference:"IAR 2026-09-0018"}],ris:[{reference:"RIS 2026-10-0001",cancelled:true}]};
assert.equal(nextFormReference(numbering,"IAR","2026-10-13"),"IAR 2026-10-0004");
assert.equal(nextFormReference(numbering,"RIS","2026-10-13"),"RIS 2026-10-0002");
assert.equal(nextFormReference(numbering,"IAR","2026-11-01"),"IAR 2026-11-0001");
assert.equal(nextFormReference({iars:[],ris:[]},"RIS","2026-10-13"),"RIS 2026-10-0001");
try {
  Object.defineProperty(globalThis,"crypto",{configurable:true,value:{getRandomValues:originalCrypto.getRandomValues.bind(originalCrypto)}});
  const networkIds=Array.from({length:1000},()=>newId("MR"));
  assert.equal(new Set(networkIds).size,networkIds.length,"Network preview IDs must remain unique without randomUUID");
  assert.match(networkIds[0],/^MR-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
} finally {
  Object.defineProperty(globalThis,"crypto",{configurable:true,value:originalCrypto});
}
const item = {
  id: "x",
  code: "X",
  name: "Pipe",
  unit: "pcs",
  quantity: 10,
  active: true,
  unitCost: 10,
  inventoryValue: 100,
}
let state = createWorkflowState([item], [], false)
const legacy={...structuredClone(state),iars:[{id:"newer",reference:"IAR-DEMO",date:"2026-10-13"},{id:"older",reference:"IAR-OLD",date:"2026-10-01"},{id:"september",reference:"IAR-SEP",date:"2026-09-20"}],ris:[{id:"ris-old",reference:"RIS-OLD",date:"2026-10-01",cancelled:true}],transactions:[{id:"tx",documentId:"older",reference:"IAR-OLD",remarks:"Accepted IAR IAR-OLD; purchase PO-01",quantity:3,previous:0,next:3},{id:"return-tx",documentId:"ris-old",reference:"RIS-OLD",remarks:"Returned unused material",quantity:1,previous:2,next:3}],releases:[{id:"release-old",risId:"ris-old",quantity:2,value:20}]};
const unchangedLegacy=structuredClone(legacy);
const migrated=migrateFormReferences(legacy);
assert.deepEqual(migrated.iars.map(r=>r.reference),["IAR 2026-10-0002","IAR 2026-10-0001","IAR 2026-09-0001"]);
assert.equal(migrated.ris[0].reference,"RIS 2026-10-0001");
assert.equal(migrated.iars[1].previousReference,"IAR-OLD");
assert.equal(migrated.transactions[0].reference,"IAR 2026-10-0001");
assert.equal(migrated.transactions[0].remarks,"Accepted IAR IAR 2026-10-0001; purchase PO-01");
assert.equal(migrated.transactions[1].reference,"RIS 2026-10-0001");
assert.deepEqual(migrated.releases,legacy.releases,"Renumbering preserves internal links, quantities and costs");
assert.deepEqual(migrated.items,legacy.items);
assert.deepEqual(legacy,unchangedLegacy,"Renumbering does not mutate its input");
assert.equal(migrateFormReferences(migrated),migrated,"Migration runs once, preserving future reference numbers");
const doAction = (action) => {
  state = applyWorkflowAction(state, action, "Inventory Staff")
}
const fails = (action, pattern) =>
  assert.throws(
    () => applyWorkflowAction(state, action, "Inventory Staff"),
    pattern,
  )
const line = { itemId: "x", quantity: 30, specification: "20 mm" }
doAction({
  type: "request",
  id: "req",
  date: "2026-10-13",
  person: "Maintenance",
  job: "JOB-1",
  lines: [line],
})
assert.equal(availability(state, state.requests[0].lines[0]).shortage, 20)
assert.equal(state.items[0].quantity, 10)
fails(
  {
    type: "request",
    id: "bad",
    date: "2026-10-13",
    person: "",
    job: "",
    lines: [],
  },
  /required|line/i,
)
doAction({
  type: "approve-request",
  id: "req",
  person: "GM",
  reference: "GM-01",
})
doAction({
  type: "order",
  id: "po",
  requestId: "req",
  itemId: "x",
  quantity: 10,
  supplier: "Supplier",
  reference: "PO-01",
  date: "2026-10-13",
})
fails(
  {
    type: "order",
    id: "po2",
    requestId: "req",
    itemId: "x",
    quantity: 10,
    supplier: "Supplier",
    reference: "PO-01",
    date: "2026-10-13",
  },
  /duplicate/i,
)
doAction({
  type: "delivery",
  id: "iar",
  orderId: "po",
  reference: "IAR-01",
  deliveryReference: "DR-01",
  date: "2026-10-13",
  delivered: 10,
  accepted: 10,
  unitCost: 20,
  findings: "All conform",
})
fails({ type: "accept", id: "iar", person: "Custodian" }, /inspect/i)
fails(
  { type: "receipt", id: "iar", postingId: "receipt", person: "Custodian" },
  /accept/i,
)
doAction({ type: "inspect", id: "iar", person: "Inspection Officer" })
doAction({ type: "accept", id: "iar", person: "Custodian" })
assert.ok(state.iars.find(i=>i.id==="iar").postingId, "Acceptance must post the receipt automatically")
assert.equal(state.items[0].quantity, 20)
assert.equal(state.items[0].inventoryValue, 300)
assert.equal(state.items[0].unitCost, 15)
fails(
  { type: "receipt", id: "iar", postingId: "receipt", person: "Custodian" },
  /posted|duplicate/i,
)
doAction({
  type: "ris",
  id: "ris",
  requestId: "req",
  reference: "RIS-01",
  date: "2026-10-13",
  person: "Maintenance",
  approvalReference: "GM-01",
})
doAction({
  type: "release",
  id: "rel",
  risId: "ris",
  itemId: "x",
  quantity: 4,
  person: "Custodian",
  recipient: "Technician",
  date: "2026-10-13",
})
assert.equal(state.items[0].quantity, 16)
assert.equal(state.items[0].inventoryValue, 240)
assert.equal(materialCostForJob(state, "JOB-1"), 60)
assert.equal(risStatus(state, state.ris[0]), "Partially issued")
fails(
  {
    type: "release",
    id: "rel",
    risId: "ris",
    itemId: "x",
    quantity: 4,
    person: "Custodian",
    recipient: "Technician",
    date: "2026-10-13",
  },
  /duplicate/i,
)
doAction({
  type: "return",
  id: "ret",
  releaseId: "rel",
  quantity: 2,
  condition: "Usable",
  person: "Custodian",
  date: "2026-10-13",
  reason: "Unused",
  accepted: true,
})
assert.equal(state.items[0].quantity, 18)
assert.equal(state.items[0].inventoryValue, 270)
assert.equal(materialCostForJob(state, "JOB-1"), 30)
fails(
  {
    type: "return",
    id: "ret2",
    releaseId: "rel",
    quantity: 3,
    condition: "Usable",
    person: "Custodian",
    date: "2026-10-13",
    reason: "Unused",
    accepted: true,
  },
  /exceed/i,
)
doAction({
  type: "return",
  id: "damage",
  releaseId: "rel",
  quantity: 1,
  condition: "Damaged",
  person: "Custodian",
  date: "2026-10-13",
  reason: "Broken",
  accepted: true,
})
assert.equal(state.items[0].quantity, 18)
assert.equal(materialCostForJob(state, "JOB-1"), 30)
doAction({
  type: "count",
  id: "count",
  itemId: "x",
  counted: 15,
  person: "Counter",
  date: "2026-10-13",
})
assert.equal(state.counts[0].variance, -3)
assert.equal(state.items[0].quantity, 18)
fails(
  {
    type: "correct-count",
    id: "count",
    person: "Custodian",
    reason: "",
    reference: "AUTH-01",
  },
  /required/i,
)
doAction({
  type: "correct-count",
  id: "count",
  person: "Custodian",
  reason: "Investigated missing issue",
  reference: "AUTH-01",
})
assert.equal(state.items[0].quantity, 15)
assert.equal(state.transactions[0].quantity, -3)
fails(
  {
    type: "correct-count",
    id: "count",
    person: "Custodian",
    reason: "Investigated",
    reference: "AUTH-01",
  },
  /corrected/i,
)
assert.throws(
  () => applyWorkflowAction(state, { type: "cancel-ris", id: "ris" }, "Viewer"),
  /permission/i,
)
doAction({ type: "cancel-ris", id: "ris" })
fails(
  {
    type: "release",
    id: "new",
    risId: "ris",
    itemId: "x",
    quantity: 1,
    person: "Custodian",
    recipient: "Technician",
    date: "2026-10-13",
  },
  /cancel/i,
)
assert.equal(state.releases[0].unitCost, 15)
// Invalid quantities never reach inventory.
for (const quantity of [NaN, Infinity, -1, 0])
  fails(
    {
      type: "request",
      id: "invalid",
      date: "2026-10-13",
      person: "Maintenance",
      job: "J",
      lines: [{ ...line, quantity }],
    },
    /quantity/i,
  )
// Additional controls and later receipts retain earlier issue cost.
state = createWorkflowState([item], [], false)
doAction({
  type: "request",
  id: "req",
  date: "2026-10-13",
  person: "Maintenance",
  job: "JOB-1",
  lines: [line],
})
doAction({
  type: "approve-request",
  id: "req",
  person: "GM",
  reference: "GM-1",
})
doAction({
  type: "order",
  id: "po",
  requestId: "req",
  itemId: "x",
  quantity: 10,
  supplier: "S",
  reference: "PO-1",
  date: "2026-10-13",
})
fails(
  {
    type: "delivery",
    id: "iar",
    orderId: "po",
    reference: "IAR-1",
    deliveryReference: "DR-1",
    date: "2026-10-13",
    delivered: 3,
    accepted: 4,
    findings: "Test",
  },
  /accepted/i,
)
doAction({
  type: "delivery",
  id: "iar",
  orderId: "po",
  reference: "IAR-1",
  deliveryReference: "DR-1",
  date: "2026-10-13",
  delivered: 3,
  accepted: 2,
  findings: "One rejected",
})
doAction({ type: "inspect", id: "iar", person: "IO" })
fails({ type: "accept", id: "iar", person: "SPC" }, /cost/i)
fails(
  { type: "receipt", id: "iar", postingId: "receipt", person: "SPC" },
  /accept/i,
)
doAction({
  type: "ris",
  id: "ris",
  requestId: "req",
  reference: "RIS-1",
  date: "2026-10-13",
  person: "M",
  approvalReference: "GM-1",
})
doAction({
  type: "release",
  id: "original",
  risId: "ris",
  itemId: "x",
  quantity: 3,
  person: "SPC",
  recipient: "M",
  date: "2026-10-13",
})
doAction({
  type: "count",
  id: "stale",
  itemId: "x",
  counted: 6,
  person: "C",
  date: "2026-10-13",
})
doAction({
  type: "delivery",
  id: "iar2",
  orderId: "po",
  reference: "IAR-2",
  deliveryReference: "DR-2",
  date: "2026-10-13",
  delivered: 7,
  accepted: 7,
  unitCost: 30,
  findings: "Accepted",
})
doAction({ type: "inspect", id: "iar2", person: "IO" })
doAction({ type: "accept", id: "iar2", person: "SPC" })
assert.ok(state.iars.find(i=>i.id==="iar2").postingId)
assert.equal(state.items[0].quantity, 14)
assert.equal(state.items[0].unitCost, 20)
assert.equal(state.releases[0].unitCost, 10)
fails(
  {
    type: "correct-count",
    id: "stale",
    person: "C",
    reason: "Missing",
    reference: "AUTH",
  },
  /changed/i,
)
doAction({
  type: "return",
  id: "late-return",
  releaseId: "original",
  quantity: 1,
  condition: "Usable",
  person: "SPC",
  date: "2026-10-13",
  reason: "Unused",
  accepted: true,
})
assert.equal(materialCostForJob(state, "JOB-1"), 20)
assert.equal(state.items[0].inventoryValue, 290)
assert.equal(state.items[0].quantity, 15)
const before = state.items[0].quantity
doAction({ type: "billing", job: "JOB-1", markup: 10, fees: 100, tax: 12 })
assert.equal(state.items[0].quantity, before)
state = createWorkflowState([{ ...item, active: false }], [], false)
fails(
  {
    type: "request",
    id: "req",
    date: "2026-10-13",
    person: "M",
    job: "J",
    lines: [line],
  },
  /inactive/i,
)
state = createWorkflowState(
  [{ ...item, category: "Pipes", minimum: 1 }],
  [],
  false,
)
fails(
  { type: "item", item: { ...state.items[0], id: "new", quantity: 0 } },
  /duplicate/i,
)
// Specific identification retains the individual asset's acquisition cost.
state = createWorkflowState(
  [
    {
      ...item,
      costMethod: "Specific",
      quantity: 2,
      inventoryValue: 30,
      unitCost: 15,
      assets: [
        { tag: "A", cost: 10 },
        { tag: "B", cost: 20 },
      ],
    },
  ],
  [],
  false,
)
doAction({
  type: "request",
  id: "req",
  date: "2026-10-13",
  person: "M",
  job: "J",
  lines: [{ ...line, quantity: 2 }],
})
doAction({
  type: "approve-request",
  id: "req",
  person: "GM",
  reference: "GM-1",
})
doAction({
  type: "ris",
  id: "ris",
  requestId: "req",
  reference: "RIS-1",
  date: "2026-10-13",
  person: "M",
  approvalReference: "GM-1",
})
doAction({
  type: "release",
  id: "specific",
  risId: "ris",
  itemId: "x",
  quantity: 1,
  assetTag: "B",
  person: "SPC",
  recipient: "M",
  date: "2026-10-13",
})
assert.equal(state.releases[0].value, 20)
assert.equal(state.items[0].inventoryValue, 10)
doAction({
  type: "return",
  id: "specific-return",
  releaseId: "specific",
  quantity: 1,
  condition: "Usable",
  accepted: true,
  person: "SPC",
  date: "2026-10-13",
  reason: "Unused",
})
assert.equal(state.items[0].assets.find((a) => a.tag === "B").cost, 20)
const regressions = []
function regression(name, run) {
  try {
    run()
    console.log(`PASS ${name}`)
  } catch (e) {
    regressions.push(name)
    console.error(`FAIL ${name}: ${e.message}`)
  }
}
regression(
  "a count is stale even if stock later returns to the snapshot quantity",
  () => {
    state = createWorkflowState([item], [], false)
    doAction({
      type: "count",
      id: "first",
      itemId: "x",
      counted: 7,
      person: "C",
      date: "2026-10-13",
    })
    doAction({
      type: "count",
      id: "second",
      itemId: "x",
      counted: 7,
      person: "C",
      date: "2026-10-13",
    })
    doAction({
      type: "correct-count",
      id: "second",
      person: "C",
      reason: "Missing",
      reference: "AUTH",
    })
    state.requests.push({
      id: "req",
      date: "2026-10-13",
      person: "M",
      job: "J",
      approvedBy: "GM",
      lines: [line],
    })
    state.orders.push({
      id: "po",
      requestId: "req",
      itemId: "x",
      quantity: 3,
      supplier: "S",
      reference: "PO",
      date: "2026-10-13",
    })
    state.iars.push({
      id: "iar",
      orderId: "po",
      reference: "IAR",
      deliveryReference: "DR",
      date: "2026-10-13",
      delivered: 3,
      accepted: 3,
      unitCost: 10,
      findings: "Accepted",
      inspectedBy: "IO",
      acceptedBy: "SPC",
    })
    doAction({
      type: "receipt",
      id: "iar",
      postingId: "restore",
      person: "SPC",
    })
    assert.equal(state.items[0].quantity, 10)
    fails(
      {
        type: "correct-count",
        id: "first",
        person: "C",
        reason: "Missing",
        reference: "AUTH",
      },
      /changed/i,
    )
  },
)
function prepareSpecific() {
  state = createWorkflowState(
    [
      {
        ...item,
        costMethod: "Specific",
        quantity: 1,
        inventoryValue: 10,
        unitCost: 10,
        assets: [{ tag: "A", cost: 10 }],
      },
    ],
    [],
    false,
  )
  doAction({
    type: "request",
    id: "req",
    date: "2026-10-13",
    person: "M",
    job: "J",
    lines: [{ ...line, quantity: 2 }],
  })
  doAction({
    type: "approve-request",
    id: "req",
    person: "GM",
    reference: "GM",
  })
  doAction({
    type: "ris",
    id: "ris",
    requestId: "req",
    reference: "RIS",
    date: "2026-10-13",
    person: "M",
    approvalReference: "GM",
  })
  doAction({
    type: "release",
    id: "issued-A",
    risId: "ris",
    itemId: "x",
    quantity: 1,
    assetTag: "A",
    person: "SPC",
    recipient: "M",
    date: "2026-10-13",
  })
}
regression("an issued asset tag cannot be acquired a second time", () => {
  prepareSpecific()
  state.orders.push({
    id: "po",
    requestId: "req",
    itemId: "x",
    quantity: 1,
    supplier: "S",
    reference: "PO",
    date: "2026-10-13",
  })
  state.iars.push({
    id: "iar",
    orderId: "po",
    reference: "IAR",
    deliveryReference: "DR",
    date: "2026-10-13",
    delivered: 1,
    accepted: 1,
    unitCost: 20,
    findings: "Accepted",
    inspectedBy: "IO",
    acceptedBy: "SPC",
    assetTags: ["A"],
  })
  fails(
    { type: "receipt", id: "iar", postingId: "duplicate-asset", person: "SPC" },
    /unique|tag|asset/i,
  )
})
regression(
  "fractional asset returns are rejected before consuming return capacity",
  () => {
    prepareSpecific()
    fails(
      {
        type: "return",
        id: "half",
        releaseId: "issued-A",
        quantity: 0.5,
        condition: "Usable",
        accepted: false,
        person: "SPC",
        date: "2026-10-13",
        reason: "Unused",
      },
      /asset|whole|one/i,
    )
    doAction({
      type: "return",
      id: "whole",
      releaseId: "issued-A",
      quantity: 1,
      condition: "Usable",
      accepted: true,
      person: "SPC",
      date: "2026-10-13",
      reason: "Unused",
    })
    assert.equal(state.items[0].quantity, 1)
  },
)
assert.deepEqual(regressions, [], "Review regressions must pass")
state = createWorkflowState([item], [], false);
doAction({type:"form-fields",kind:"stock-card",id:"x",fields:{entityName:"Taysan Water District",days:{opening:"10"}}});
assert.equal(state.items[0].stockCardForm.days.opening,"10");
assert.equal(state.items[0].quantity,10,"Saving print fields does not alter inventory");
assert.equal(state.transactions.length,0);
fails({type:"form-fields",kind:"stock-card",id:"x",fields:{quantity:900}},/field/i);
fails({type:"form-fields",kind:"stock-card",id:"x",fields:{days:{opening:"-1"}}},/days/i);
fails({type:"form-fields",kind:"stock-card",id:"x",fields:{paper:"Invalid"}},/paper/i);
doAction({type:"request",id:"req",date:"2026-10-13",person:"M",job:"J",lines:[line]});
doAction({type:"approve-request",id:"req",person:"GM",reference:"GM"});
doAction({type:"ris",id:"ris",requestId:"req",reference:"RIS",date:"2026-10-13",person:"M",approvalReference:"GM"});
assert.equal(state.ris[0].availableQuantities.x,10);
assert.equal(state.ris[0].lineSnapshots.x.description,item.name,"RIS creation snapshots item print identity");
assert.equal(state.ris[0].requestedQuantities.x,30);
doAction({type:"form-fields",kind:"ris",id:"ris",fields:{office:"Engineering and Operations",purpose:"Leak Repair",paper:"A4"}});
assert.equal(state.ris[0].form.office,"Engineering and Operations");
assert.equal(state.ris[0].availableQuantities.x,10);
assert.doesNotThrow(()=>createWorkflowState([item,{...item,id:"y"},{...item,id:"z"}],[],true),"Initial demo forms initialize after their linked requests");
console.log(
  "Workflow checks passed: weighted/specific cost, partial flows, acknowledgments, duplicate posting, returns, counts, and permissions.",
)
