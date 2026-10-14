import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {mkdir,writeFile} from "node:fs/promises";
import ts from "typescript";
const source = readFileSync(new URL("../src/services/client-forms.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext }, reportDiagnostics: true });
assert.equal(compiled.diagnostics.length, 0, "Form service must have valid TypeScript syntax");
const { blankDocument, buildIarDocument, buildRisDocument, buildStockCardDocument, renderDocumentHtml } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`);
const item = {id:"valve",code:"VAL-100",name:"Brass Ball Valve with Lockwing 1/2",description:"Brass Ball Valve 1/2",unit:"pcs",quantity:50,minimum:10,location:"Warehouse",active:true};
const state = {
  items:[item], requests:[{id:"req",job:"Leak Repair/ Service Connection",person:"Maintenance",approvedBy:"General Manager",approvedAt:"2026-09-30T12:00:00",lines:[{itemId:item.id,quantity:50,specification:"Brass valve 1/2"}]}],
  orders:[{id:"po",requestId:"req",itemId:item.id,quantity:100,supplier:"VBF Enterprise",reference:"PO-01",date:"2026-09-01"}],
  iars:[{id:"iar",orderId:"po",reference:"2026-09-0001",deliveryReference:"0335",date:"2026-09-14",delivered:100,accepted:100,inspectedBy:"Inspector",inspectedAt:"2026-09-14T12:00:00",acceptedBy:"Custodian",acceptedAt:"2026-09-14T12:00:00",form:{invoiceNumber:"0335",invoiceDate:"2026-09-14",office:"Engineering and Operations"}}],
  ris:[{id:"ris",requestId:"req",reference:"2026-10-0002",person:"Maintenance",date:"2026-10-01",approvalReference:"GM-01",availableQuantities:{valve:100},requestedQuantities:{valve:50},form:{division:"Engineering and Operations",office:"Engineering and Operations",purpose:"Leak Repair/ Service Connection"}}],
  releases:[{id:"release",risId:"ris",itemId:item.id,quantity:50,unitCost:20,value:1000,person:"Custodian",recipient:"Maintenance",date:"2026-10-01"}],
  returns:[], counts:[], billing:[],
  transactions:[{id:"release",itemId:item.id,itemName:item.name,date:"2026-10-01T12:00:00",reference:"2026-10-0002",type:"Stock Out",quantity:-50,previous:100,next:50,documentId:"ris",office:"Engineering and Operations"},{id:"receipt",itemId:item.id,itemName:item.name,date:"2026-09-14T12:00:00",reference:"2026-09-0001",type:"Stock In",quantity:100,previous:0,next:100,documentId:"iar",office:"Warehouse"}]
};
const before=structuredClone(state);
const iar=buildIarDocument(state,"iar");
assert.equal(iar.entityName,"");
assert.equal(iar.lines[0].quantity,100);
assert.equal(iar.invoiceNumber,"0335");
assert.equal(iar.acceptance,"Complete");
const ris=buildRisDocument(state,"ris");
assert.equal(ris.lines[0].requested,50);
assert.equal(ris.lines[0].issued,50);
assert.equal(ris.lines[0].available,true);
state.items[0].quantity=0;
assert.equal(buildRisDocument(state,"ris").lines[0].available,true,"Printed availability uses saved quantities, not later on-hand stock");
state.items[0].quantity=50;
const card=buildStockCardDocument(state,"valve");
assert.equal(card.lines.length,2);
assert.deepEqual(card.lines.map(l=>[l.receipt,l.issue,l.balance]),[[100,"",100],["",50,50]]);
assert.equal(card.lines[0].reference,"IAR 2026-09-0001");
assert.equal(card.lines[1].reference,"RIS 2026-10-0002");
assert.equal(card.lines[1].office,"Engineering and Operations");
assert.equal(card.lines[1].days,"");
assert.deepEqual(state,before,"Building and printing documents must not change stock or records");
for(const doc of [iar,ris,card]){
  const html=renderDocumentHtml(doc);
  assert.match(html,/Times New Roman/);
  assert.match(html,/@page/);
  assert.match(html,/A4 portrait/);
  const blankHtml=renderDocumentHtml(blankDocument(doc));
  assert.ok(!blankHtml.includes("VBF Enterprise"));
  assert.ok(!blankHtml.includes("Brass Ball Valve"));
  assert.ok(!blankHtml.includes("2026-09-0001"));
  assert.equal(blankDocument(doc).lines.length,0);
}
assert.match(renderDocumentHtml(ris),/Requested by:/);
assert.match(renderDocumentHtml(ris),/Approved by:/);
assert.match(renderDocumentHtml(ris),/Issued by:/);
assert.match(renderDocumentHtml(ris),/Received by:/);
assert.match(renderDocumentHtml(iar),/Inspection Officer\/Inspection Committee/);
assert.match(renderDocumentHtml(iar),/Supply and\/or Property Custodian/);
const malicious={...iar,supplier:'<script>alert("unsafe")</script>'};
assert.ok(!renderDocumentHtml(malicious).includes('<script>alert'));
assert.ok(renderDocumentHtml(malicious).includes('&lt;script&gt;'));
const longCard={...card,lines:Array.from({length:75},(_,i)=>({...card.lines[0],id:String(i)}))};
assert.equal((renderDocumentHtml(longCard).match(/class="form-page"/g)??[]).length,3,"Long stock cards paginate with repeated headers");
const emptyCard=buildStockCardDocument({...state,transactions:[]},"valve");
assert.equal(emptyCard.lines[0].balance,50);
assert.equal(emptyCard.lines[0].reference,"Opening balance");
assert.match(renderDocumentHtml({...ris,paper:"Letter"}),/Letter portrait/);
const savedName=state.items[0].name;
const reviewFailures=[];
const checkReview=(name,run)=>{try{run();console.log(`PASS ${name}`);}catch(error){reviewFailures.push(name);console.error(`FAIL ${name}: ${error.message}`);}};
state.items[0].name="Renamed inventory item";
checkReview("IAR retains original name",()=>assert.equal(buildIarDocument(state,"iar").lines[0].description,savedName));
checkReview("RIS retains original name",()=>assert.equal(buildRisDocument(state,"ris").lines[0].description,savedName));
state.items[0].name=savedName;
state.transactions[0].office="";
state.ris[0].form.office="New office after release";
checkReview("Recorded blank office stays blank",()=>assert.equal(buildStockCardDocument(state,"valve").lines[1].office,""));
state.transactions[0].office="Engineering and Operations";
state.ris[0].form.office="Engineering and Operations";
state.iars[0].inspectedAt="2026-09-14T17:00:00Z";
checkReview("Acknowledgment dates use Manila timezone",()=>assert.equal(buildIarDocument(state,"iar").inspectionDate,"2026-09-15"));
state.iars[0].inspectedAt="2026-09-14T12:00:00";
assert.deepEqual(reviewFailures,[]);
if(process.env.FORM_QA_OUTPUT==="1") {
  const dir=new URL("../output/forms-qa/",import.meta.url);await mkdir(dir,{recursive:true});
  for(const [name,doc] of Object.entries({iar,ris,"stock-card":card,"stock-card-long":longCard}))await writeFile(new URL(`${name}.html`,dir),renderDocumentHtml(doc));
  const wide="W".repeat(160);
  const stressRis={...ris,entityName:wide,fundCluster:wide,division:wide,office:wide,responsibilityCode:wide,purpose:"W".repeat(500),signatures:ris.signatures.map(s=>({...s,designation:wide}))};
  const stressIar={...iar,entityName:wide,fundCluster:wide,office:wide,responsibilityCode:wide,invoiceNumber:wide,poReference:wide};
  for(const paper of ["A4","Letter"])for(const [kind,doc] of Object.entries({iar:stressIar,ris:stressRis,"stock-card":{...card,description:"W".repeat(500)}}))await writeFile(new URL(`${kind}-stress-${paper}.html`,dir),renderDocumentHtml({...doc,paper}));
}
console.log("Client form checks passed: workbook fields, quantities, stable RIS availability, stock balances, signatures, escaping, paper sizes and pagination.");
