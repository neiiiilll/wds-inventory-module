import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const js=ts.transpileModule(readFileSync(new URL("../src/services/workflow.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const w=await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const items=[{id:"a",code:"A",name:"Pipe",unit:"pcs",active:true,quantity:0,unitCost:10,inventoryValue:0},{id:"b",code:"B",name:"Meter",unit:"pcs",active:true,quantity:0,unitCost:20,inventoryValue:0}];
const lines=[{itemId:"a",quantity:10,specification:"Pipe 1/2"},{itemId:"b",quantity:2,specification:"Meter 20mm"}];
const route=[{id:"head",label:"Department Head",reviewer:"Head"},{id:"budget",label:"Budget Review",reviewer:"Budget"},{id:"control",label:"Procurement/Internal Control",reviewer:"Control"},{id:"final",label:"Final Approver",reviewer:"GM"}];
const apply=(state,action,role="Inventory Staff")=>w.applyWorkflowAction(state,action,role,"Juan Dela Cruz");
function base(){
 let state={...w.migrateProcurement(w.createWorkflowState(items,[],false)),procurementCompletionVersion:1,quotations:[]};
 state=apply(state,{type:"request",id:"mr",date:"2026-10-14",person:"Juan Dela Cruz",job:"Repair",lines});
 return apply(state,{type:"approve-request",id:"mr",person:"GM",reference:"MR-APP"});
}
const quotation={type:"quotation",id:"q",requestId:"mr",supplier:"Supplier A",reference:"Q-1",date:"2026-10-14",validUntil:"2026-10-31",terms:"Delivered inclusive prices",lines:lines.map((l,i)=>({...l,unitPrice:i?20:10}))};
const draftAction={type:"purchase-request",id:"pr",reference:"PR 2026-10-0001",requestId:"mr",date:"2026-10-14",person:"Juan Dela Cruz",quotationId:"q",selectionReason:"Conforming quotation",approvalRoute:route,lines:lines.map(l=>({...l,unitPrice:999}))};
function draft(){return apply(apply(base(),quotation),draftAction);}
function submitted(){return apply(draft(),{type:"submit-purchase-request",id:"pr",revision:0});}
function approved(){let state=submitted();for(const step of route)state=apply(state,{type:"review-purchase-request",id:"pr",revision:0,stageId:step.id,person:step.reviewer,decision:"Approved",reason:"Reviewed requirements and price"});return state;}
const po={type:"order",id:"po",purchaseRequestId:"pr",requestId:"mr",reference:"PO 2026-10-0001",date:"2026-10-14",supplier:"Supplier A",itemId:"a",quantity:10,lines:lines.map(l=>({...l,unitPrice:999}))};
const delivery={type:"delivery",id:"iar",orderId:"po",reference:"IAR 2026-10-0001",date:"2026-10-14",deliveryReference:"DR-1",findings:"All items conform",delivered:12,accepted:12,lines:lines.map((l,i)=>({itemId:l.itemId,delivered:l.quantity,accepted:l.quantity,damaged:0,unitCost:i?20:10}))};
const failures=[];const check=(name,run)=>{try{run();console.log(`PASS ${name}`);}catch(error){failures.push(name);console.error(`FAIL ${name}: ${error.message}`);}};
check("Supplier quotation prices are recorded and copied instead of trusting PR prices",()=>{
 const state=draft();assert.equal(state.quotations.length,1);assert.deepEqual(state.purchaseRequests[0].lines.map(l=>l.unitPrice),[10,20]);assert.equal(w.procurementTotal(state.purchaseRequests[0].lines),140);assert.equal(state.purchaseRequests[0].supplier,"Supplier A");assert.equal(state.purchaseRequests[0].status,"Draft");
 assert.throws(()=>apply(base(),draftAction),/quotation/i);
 assert.throws(()=>apply(base(),{...quotation,lines:[{...quotation.lines[0],unitPrice:0}]}),/price|cost/i);
 assert.throws(()=>apply(apply(base(),quotation),quotation),/duplicate/i);
 assert.throws(()=>apply(apply(base(),quotation),{...draftAction,date:"2026-11-01"}),/expired|valid/i);
});
check("MR revisions invalidate quotations without deleting their history",()=>{
 let state=apply(base(),quotation);state=apply(state,{type:"edit-request",id:"mr",person:"Juan Dela Cruz",job:"Repair",lines:[{...lines[0],quantity:9},lines[1]],actor:"Juan",reason:"Correct quantity",expectedVersion:0});state=apply(state,{type:"approve-request",id:"mr",person:"GM",reference:"MR-APP-2"});
 assert.throws(()=>apply(state,{...draftAction,lines:[{...lines[0],quantity:9},lines[1]]}),/revision|changed|stale/i);assert.equal(state.quotations.length,1);
});
check("Submitted PRs are locked and approval cannot skip an assigned reviewer",()=>{
 const quoted=apply(base(),quotation);
 assert.throws(()=>apply(quoted,{...draftAction,approvalRoute:[route[3]]}),/required.*sequence/i);
 assert.throws(()=>apply(quoted,{...draftAction,approvalRoute:[route[1],route[0],route[2],route[3]]}),/required.*sequence/i);
 const tampered=submitted();tampered.purchaseRequests[0].approvalRoute=[route[3]];
 assert.throws(()=>apply(tampered,{type:"review-purchase-request",id:"pr",revision:0,stageId:"final",person:"GM",decision:"Approved",reason:"Skip required reviews"}),/required.*sequence/i);
 let state=submitted();assert.equal(w.purchaseRequestStatus(state,state.purchaseRequests[0]),"Awaiting Department Head");
 assert.throws(()=>apply(state,{type:"revise-purchase-request",id:"pr",revision:0,date:"2026-10-14",quotationId:"q",selectionReason:"Same",approvalRoute:route,lines,reason:"Change"}),/locked|submitted/i);
 assert.throws(()=>apply(state,{type:"approve-purchase-request",id:"pr",person:"GM",reference:"BYPASS"}),/stage|review|route/i);
 assert.throws(()=>apply(state,{type:"review-purchase-request",id:"pr",revision:0,stageId:"budget",person:"Budget",decision:"Approved",reason:"Skip"}),/order|current|next|stage/i);
 assert.throws(()=>apply(state,{type:"review-purchase-request",id:"pr",revision:0,stageId:"head",person:"Other",decision:"Approved",reason:"Wrong"}),/assigned|reviewer/i);
 state=apply(state,{type:"review-purchase-request",id:"pr",revision:0,stageId:"head",person:"Head",decision:"Approved",reason:"Need confirmed"});assert.equal(state.purchaseRequests[0].approvedBy,undefined);assert.equal(w.purchaseRequestStatus(state,state.purchaseRequests[0]),"Awaiting Budget Review");assert.throws(()=>apply(state,po),/approv/i);
 const done=approved().purchaseRequests[0];assert.equal(done.status,"Approved");assert.equal(done.approvedBy,"GM");assert.equal(done.approvalRoute.filter(s=>s.decision==="Approved").length,4);assert.ok(done.history.every(h=>h.at&&h.actor&&h.reason));
});
check("Returned PR requires a saved revision and resubmission with fresh approvals",()=>{
 let state=submitted();state=apply(state,{type:"review-purchase-request",id:"pr",revision:0,stageId:"head",person:"Head",decision:"Returned",reason:"Reduce pipe quantity"});
 assert.equal(state.purchaseRequests[0].status,"Returned");assert.throws(()=>apply(state,{type:"submit-purchase-request",id:"pr",revision:0}),/revision/i);
 state=apply(state,{type:"revise-purchase-request",id:"pr",revision:0,date:"2026-10-14",quotationId:"q",selectionReason:"Same conforming supplier",approvalRoute:route,lines:[{...lines[0],quantity:8},lines[1]],reason:"Reduced pipes as requested"});
 assert.equal(state.purchaseRequests[0].revision,1);assert.equal(state.purchaseRequests[0].status,"Draft");state=apply(state,{type:"submit-purchase-request",id:"pr",revision:1});
 assert.ok(state.purchaseRequests[0].approvalRoute.every(s=>!s.decision));assert.ok(state.purchaseRequests[0].history.some(h=>h.reason==="Reduce pipe quantity"));assert.ok(state.purchaseRequests[0].history.some(h=>h.reason==="Reduced pipes as requested"));
 assert.throws(()=>apply(state,{type:"review-purchase-request",id:"pr",revision:0,stageId:"head",person:"Head",decision:"Approved",reason:"Old form"}),/revision|changed/i);
});
check("Rejection is terminal and blocks PO creation and resubmission",()=>{
 const state=apply(submitted(),{type:"review-purchase-request",id:"pr",revision:0,stageId:"head",person:"Head",decision:"Rejected",reason:"Requirement not authorized"});
 assert.equal(w.purchaseRequestStatus(state,state.purchaseRequests[0]),"Rejected");assert.throws(()=>apply(state,po),/approv/i);assert.throws(()=>apply(state,{type:"submit-purchase-request",id:"pr",revision:0}),/rejected|draft/i);
});
check("PO prices and supplier match the approved PR and receiving waits for dispatch",()=>{
 let state=apply(approved(),po);const order=state.orders[0];assert.deepEqual(order.lines.map(l=>l.unitPrice),[10,20]);assert.equal(w.procurementTotal(order.lines),140);assert.equal(w.purchaseOrderDeliveryStatus(state,order),"Awaiting dispatch");assert.equal(w.canReceiveOrder(order),false);
 assert.throws(()=>apply(approved(),{...po,supplier:"Unapproved Supplier"}),/supplier/i);assert.throws(()=>apply(state,delivery),/dispatch|sent/i);
 state=apply(state,{type:"dispatch-order",id:"po",date:"2026-10-14",recipient:"Supplier A",method:"Email",reference:"MAIL-1",person:"Juan",reason:"Approved PO sent to supplier"});assert.equal(w.canReceiveOrder(state.orders[0]),true);assert.equal(w.purchaseOrderDeliveryStatus(state,state.orders[0]),"Awaiting delivery");assert.ok(state.orders[0].history.some(h=>h.kind==="Dispatched"));assert.throws(()=>apply(state,{type:"dispatch-order",id:"po",date:"2026-10-14",recipient:"Supplier A",method:"Email",reference:"MAIL-2",person:"Juan",reason:"Repeat"}),/already/i);
 state=apply(state,delivery);state=apply(state,{type:"inspect",id:"iar",person:"Inspector"});state=apply(state,{type:"accept",id:"iar",person:"Custodian"});assert.deepEqual(state.items.map(i=>i.quantity),[10,2]);assert.equal(w.purchaseOrderProcessingStatus(state,state.orders[0]),"Completed");assert.equal(w.requestStatus(state,state.requests[0]),"Procurement completed");
});
check("Completion migration preserves earlier approvals, costs and inventory without invented dispatch",()=>{
 const original=approved();delete original.procurementCompletionVersion;const previous=structuredClone(original);const migrated=w.migrateProcurementCompletion(original);assert.equal(migrated.procurementCompletionVersion,1);assert.deepEqual(migrated.items,previous.items);assert.deepEqual(migrated.purchaseRequests,previous.purchaseRequests);assert.equal(w.migrateProcurementCompletion(migrated),migrated);
 const legacyOrder={...po,type:undefined,dispatchRequired:undefined};const legacy={...base(),orders:[legacyOrder]};delete legacy.procurementCompletionVersion;const next=w.migrateProcurementCompletion(legacy);assert.equal(next.orders[0].dispatch,undefined);assert.equal(w.canReceiveOrder(next.orders[0]),true);assert.equal(w.procurementTotal([{itemId:"a",quantity:10}]),undefined);
 const earlier=base();earlier.purchaseRequests=[{id:"old-pr",requestId:"mr",reference:"PR 2026-10-0001",date:"2026-10-14",person:"Juan",job:"Repair",lines,approvedBy:"GM"}];
 assert.equal(w.requestStatus(earlier,earlier.requests[0]),"Earlier PR · new linked MR required");
});
assert.deepEqual(failures,[]);
console.log("Procurement completion checks passed: quotations, immutable pricing, staged reviews, return/revision/resubmission, rejection, dispatch gates, receipt completion and migration.");
