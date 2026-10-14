import type { WorkflowState } from "./workflow";
import type { IARFormFields, RISFormFields, StockCardFormFields, PaperSize } from "./client-form-types";

export const PAPER_SIZES = {A4:{width:210,height:297},Letter:{width:215.9,height:279.4},Legal:{width:215.9,height:355.6}};
type Base = {entityName:string;fundCluster:string;paper:PaperSize;reference:string};
export interface IARDocument extends Base {
  kind:"iar";supplier:string;poReference:string;poDate:string;date:string;office:string;responsibilityCode:string;
  invoiceNumber:string;invoiceDate:string;inspectionDate:string;receivedDate:string;inspector:string;custodian:string;
  inspectionConforms:boolean;acceptance:""|"Complete"|"Partial";acceptedQuantity:number;
  lines:{stockNo:string;description:string;unit:string;quantity:number}[];
}
export interface RISDocument extends Base {
  kind:"ris";division:string;office:string;responsibilityCode:string;date:string;purpose:string;
  signatures:{name:string;designation:string;date:string}[];
  lines:{stockNo:string;description:string;unit:string;requested:number;available:boolean|null;issued:number|"";remarks:string}[];
}
export interface StockCardDocument extends Base {
  kind:"stock-card";item:string;description:string;unit:string;stockNumber:string;reorderPoint:number|"";
  lines:{id:string;date:string;reference:string;receipt:number|"";issue:number|"";balance:number;office:string;days:string}[];
}
export type ClientFormDocument = IARDocument | RISDocument | StockCardDocument;
export const formTitle = (kind:ClientFormDocument["kind"]) => kind==="iar"?"INSPECTION AND ACCEPTANCE REPORT":kind==="ris"?"REQUISITION AND ISSUE SLIP":"STOCK CARD";
const find = <T extends {id:string}>(rows:T[],id:string):T => {const row=rows.find(r=>r.id===id);if(!row)throw Error("The document's linked record could not be found.");return row;};
const base = (fields:IARFormFields|RISFormFields|StockCardFormFields,reference:string):Base => ({entityName:fields.entityName??"",fundCluster:fields.fundCluster??"",paper:fields.paper??"A4",reference});
const names = (values:string[]) => [...new Set(values.filter(Boolean))].join(", ");
const acknowledgmentDate = (value?:string) => !value?"":/^\d{4}-\d{2}-\d{2}$/.test(value)?value:new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));

export function buildIarDocument(state:WorkflowState,id:string,override:IARFormFields={}):IARDocument {
  const iar=find(state.iars,id);const order=find(state.orders,iar.orderId);const item=find(state.items,order.itemId);
  const fields={...iar.form,...override};
  return {...base(fields,iar.reference),kind:"iar",supplier:order.supplier,poReference:fields.poReference??order.reference,poDate:fields.poDate??order.date,date:iar.date,
    office:fields.office??"",responsibilityCode:fields.responsibilityCode??"",invoiceNumber:fields.invoiceNumber??"",invoiceDate:fields.invoiceDate??"",
    inspectionDate:fields.inspectionDate??acknowledgmentDate(iar.inspectedAt),receivedDate:fields.receivedDate??acknowledgmentDate(iar.acceptedAt),
    inspector:fields.signatures?.inspection?.name??iar.inspectedBy??"",custodian:fields.signatures?.acceptance?.name??iar.acceptedBy??"",inspectionConforms:fields.inspectionConforms??!!(iar.inspectedBy&&iar.accepted===iar.delivered),
    acceptance:fields.acceptance??(iar.acceptedBy?(iar.accepted===iar.delivered?"Complete":"Partial"):""),acceptedQuantity:iar.accepted,
    lines:iar.lines?iar.lines.map(l=>{const current=find(state.items,l.itemId);return {stockNo:l.snapshot?.stockNo??current.code,description:l.snapshot?.description??current.name,unit:l.snapshot?.unit??current.unit,quantity:l.delivered};}):[{stockNo:iar.lineSnapshot?.stockNo??item.code,description:iar.lineSnapshot?.description??state.transactions.find(t=>t.documentId===iar.id)?.itemName??item.name,unit:iar.lineSnapshot?.unit??item.unit,quantity:iar.delivered}]};
}
export function buildRisDocument(state:WorkflowState,id:string,override:RISFormFields={}):RISDocument {
  const ris=find(state.ris,id);const request=find(state.requests,ris.requestId);const releases=state.releases.filter(r=>r.risId===id).slice().reverse();const fields={...ris.form,...override};
  const dates=names(releases.map(r=>r.date));
  const form:RISDocument={...base(fields,ris.reference),kind:"ris",division:fields.division??"",office:fields.office??"",responsibilityCode:fields.responsibilityCode??"",date:ris.date,purpose:fields.purpose??request.job,
    signatures:[{name:ris.person,designation:fields.requestedDesignation??"",date:fields.requestedDate??ris.date},{name:request.approvedBy??"",designation:fields.approvedDesignation??"",date:fields.approvedDate??acknowledgmentDate(request.approvedAt)},{name:names(releases.map(r=>r.person)),designation:fields.issuedDesignation??"",date:fields.issuedDate??dates},{name:names(releases.map(r=>r.recipient)),designation:fields.receivedDesignation??"",date:fields.receivedDate??dates}],
    lines:request.lines.map(line=>{
      const item=find(state.items,line.itemId);const actual=releases.filter(r=>r.itemId===item.id);const first=actual[0];
      const recordedStock=ris.availableQuantities?.[item.id]??(first?state.transactions.find(t=>t.id===first.id)?.previous:undefined);
      const requested=ris.requestedQuantities?.[item.id]??line.quantity;const issued=actual.reduce((s,r)=>s+r.quantity,0);
      const identity=ris.lineSnapshots?.[item.id];const recordedName=first?state.transactions.find(t=>t.id===first.id)?.itemName:undefined;
      return {stockNo:identity?.stockNo??item.code,description:identity?.description??recordedName??item.name,unit:identity?.unit??item.unit,requested,available:recordedStock===undefined?null:recordedStock>=requested,issued:issued||"",remarks:fields.remarks?.[item.id]??""};
    })};
  form.signatures=form.signatures.map((s,index)=>{const slot=["requested","approved","issued","received"][index];return {...s,name:fields.signatures?.[slot]?.name??s.name,date:fields.signatures?.[slot]?.date??s.date};});
  return form;
}
export function buildStockCardDocument(state:WorkflowState,id:string,override:StockCardFormFields={}):StockCardDocument {
  const item=find(state.items,id);const fields={...item.stockCardForm,...override};
  // Stored transactions are newest-posted first. Preserve posting order and its recorded balances, including backdated entries.
  const history=state.transactions.filter(t=>t.itemId===id).slice().reverse();
  const lines:StockCardDocument["lines"]=[];
  const opening=history[0]?.previous??item.quantity;
  if(opening>0||!history.length)lines.push({id:"opening",date:"",reference:"Opening balance",receipt:"",issue:"",balance:opening,office:fields.offices?.opening??item.location,days:fields.days?.opening??""});
  for(const tx of history){
    const iar=state.iars.find(r=>r.id===tx.documentId);const ris=state.ris.find(r=>r.id===tx.documentId);
    const prefix=iar?"IAR":ris?"RIS":"";const reference=prefix&&!new RegExp(`^${prefix}[ -]`).test(tx.reference)?`${prefix} ${tx.reference}`:tx.reference;
    const office=fields.offices?.[tx.id]??tx.office??(tx.quantity>0?item.location:ris?.form?.office??ris?.form?.division??"");
    lines.push({id:tx.id,date:tx.date.slice(0,10),reference,receipt:tx.quantity>0?tx.quantity:"",issue:tx.quantity<0?-tx.quantity:"",balance:tx.next,office,days:fields.days?.[tx.id]??""});
  }
  return {...base(fields,item.code),kind:"stock-card",item:item.name,description:item.description,unit:fields.unitLabel??item.unit,stockNumber:item.code,reorderPoint:item.minimum,lines};
}

export const escapeHtml=(value:unknown)=>String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
export function blankDocument(doc:ClientFormDocument):ClientFormDocument {
  const common={entityName:"",fundCluster:"",reference:"",paper:doc.paper};
  if(doc.kind==="iar")return {...common,kind:"iar",supplier:"",poReference:"",poDate:"",date:"",office:"",responsibilityCode:"",invoiceNumber:"",invoiceDate:"",inspectionDate:"",receivedDate:"",inspector:"",custodian:"",inspectionConforms:false,acceptance:"",acceptedQuantity:0,lines:[]};
  if(doc.kind==="ris")return {...common,kind:"ris",division:"",office:"",responsibilityCode:"",date:"",purpose:"",signatures:Array.from({length:4},()=>({name:"",designation:"",date:""})),lines:[]};
  return {...common,kind:"stock-card",item:"",description:"",unit:"",stockNumber:"",reorderPoint:"",lines:[]};
}
const e=escapeHtml;
const date=(value:string)=>value.split(", ").map(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)?`${v.slice(5,7)}-${v.slice(8,10)}-${v.slice(2,4)}`:v).join(", ");
const check=(checked:boolean)=>`<span class="check-box">${checked?"✓":""}</span>`;
const meta=(label:string,value:unknown,span=1)=>`<td colspan="${span}"><span class="label">${e(label)}</span> ${e(value)}</td>`;
const characterWidth=(char:string)=>/[MW@%]/.test(char)?1:/[ilI.,' :;!|]/.test(char)?.3:/[A-Z]/.test(char)?.72:.55;
const textHeight=(text:string,width:number,font=11,min=6.5)=>Math.max(min,Math.ceil(Array.from(text).reduce((sum,c)=>sum+characterWidth(c),0)*font*25.4/72/width*1.1)*font*25.4/72*1.15+2.6);
function rowBudget(doc:ClientFormDocument,paper:{width:number;height:number}):number {
  const width=paper.width-24;const left=doc.kind==="stock-card"?.7:.58;
  const pairs=doc.kind==="iar"?[[`Entity Name: ${doc.entityName}`,`Fund Cluster: ${doc.fundCluster}`],[`Supplier: ${doc.supplier}`,`IAR No.: ${doc.reference}`],[`PO No./Date: ${doc.poReference} ${doc.poDate}`,`Date: ${doc.date}`],[`Requisitioning Office/Dept.: ${doc.office}`,`Invoice No.: ${doc.invoiceNumber}`],[`Responsibility Center Code: ${doc.responsibilityCode}`,`Date: ${doc.invoiceDate}`]]:doc.kind==="ris"?[[`Entity Name: ${doc.entityName}`,`Fund Cluster: ${doc.fundCluster}`],[`Division: ${doc.division}`,`Responsibility Center Code: ${doc.responsibilityCode}`],[`Office: ${doc.office}`,`RIS No.: ${doc.reference}`]]:[[`Entity Name: ${doc.entityName}`,`Fund Cluster: ${doc.fundCluster}`],[`Item: ${doc.item}`,`Stock No.: ${doc.stockNumber}`],[`Description: ${doc.description}`,`Re-order Point: ${doc.reorderPoint}`],[`Unit Measurement: ${doc.unit}`,""]];
  const metadata=pairs.reduce((sum,pair)=>sum+Math.max(textHeight(pair[0],width*left),textHeight(pair[1],width*(1-left))),3);
  const footer=doc.kind==="iar"?8+8+21+Math.max(16,textHeight(doc.inspector,width/2-8),textHeight(doc.custodian,width/2-8))+10:doc.kind==="ris"?textHeight(doc.purpose,width-22,11,11)+2+7+10+["name","designation","date"].reduce((sum,key)=>sum+Math.max(6,...doc.signatures.map(s=>textHeight(s[key as "name"|"designation"|"date"],width/5-3,10,6))),0):0;
  return Math.max(1,Math.min(doc.kind==="iar"?21:30,Math.floor((paper.height-24-17-metadata-footer-(doc.kind==="iar"?10:14)-12)/(doc.kind==="iar"?5.3:doc.kind==="ris"?5:6))));
}
function parts(text:unknown,limit:number):string[]{
  const chars=Array.from(String(text??""));if(!chars.length)return [""];const output:string[]=[];
  while(chars.length){let count=0,width=0;while(count<chars.length&&width+characterWidth(chars[count])*2<=limit){width+=characterWidth(chars[count])*2;count++;}count=Math.max(1,count);if(count<chars.length){const space=chars.slice(0,count).lastIndexOf(" ");if(space>count/2)count=space+1;}output.push(chars.splice(0,count).join("").trimEnd());}
  return output;
}
function expanded(lines:Record<string,unknown>[],limits:Record<string,number>):Record<string,unknown>[] {
  return lines.flatMap(line=>{const segments=Object.fromEntries(Object.entries(limits).map(([key,n])=>[key,parts(line[key],n)]));const count=Math.max(1,...Object.values(segments).map(s=>s.length));return Array.from({length:count},(_,index)=>Object.fromEntries(Object.entries(line).map(([key,value])=>[key,segments[key]?segments[key][index]??"":index?"":value])));});
}
export function renderDocumentHtml(doc:ClientFormDocument):string {
  const paper=PAPER_SIZES[doc.paper]??PAPER_SIZES.A4;const paperName=doc.paper in PAPER_SIZES?doc.paper:"A4";
  const max=rowBudget(doc,paper);
  const rows=expanded(doc.lines as unknown as Record<string,unknown>[],doc.kind==="iar"?{stockNo:14,description:46,unit:7}:doc.kind==="ris"?{stockNo:14,description:26,unit:6,remarks:23}:{reference:22,office:22,days:10});
  const chunks:Record<string,unknown>[][]=[];for(let start=0;start<Math.max(1,rows.length);start+=max)chunks.push(rows.slice(start,start+max));
  const pages=chunks.map((chunk,pageIndex)=>{
    const filled=[...chunk,...Array.from({length:Math.max(0,max-chunk.length)},()=>({} as Record<string,unknown>))];
    let body="";
    if(doc.kind==="iar")body=`<table class="metadata"><colgroup><col style="width:58%"><col style="width:42%"></colgroup><tbody><tr>${meta("Entity Name :",doc.entityName)}${meta("Fund Cluster :",doc.fundCluster)}</tr><tr>${meta("Supplier :",doc.supplier)}${meta("IAR No. :",doc.reference)}</tr><tr>${meta("PO No./Date :",`${doc.poReference}${doc.poDate?` / ${date(doc.poDate)}`:""}`)}${meta("Date :",date(doc.date))}</tr><tr>${meta("Requisitioning Office/Dept. :",doc.office)}${meta("Invoice No. :",doc.invoiceNumber)}</tr><tr>${meta("Responsibility Center Code :",doc.responsibilityCode)}${meta("Date :",date(doc.invoiceDate))}</tr></tbody></table>
      <table class="form-grid-table iar-table"><colgroup><col style="width:17%"><col style="width:57%"><col style="width:12%"><col style="width:14%"></colgroup><thead><tr><th>Stock/ Property No.</th><th>Description</th><th>Unit</th><th>Quantity</th></tr></thead><tbody>${filled.map(r=>`<tr><td>${e(r.stockNo)}</td><td class="left">${e(r.description)}</td><td>${e(r.unit)}</td><td>${e(r.quantity)}</td></tr>`).join("")}</tbody></table>
      <table class="iar-signatures"><colgroup><col style="width:50%"><col style="width:50%"></colgroup><tbody><tr><th>INSPECTION</th><th>ACCEPTANCE</th></tr><tr><td><b>Date Inspected :</b> ${e(date(doc.inspectionDate))}</td><td><b>Date Received :</b> ${e(date(doc.receivedDate))}</td></tr><tr><td class="inspection-statement">${check(doc.inspectionConforms)} Inspected, verified and found in order as to quantity and specifications</td><td class="acceptance-options"><div>${check(doc.acceptance==="Complete")} Complete</div><div>${check(doc.acceptance==="Partial")} Partial (pls. specify quantity) ${doc.acceptance==="Partial"?e(doc.acceptedQuantity):"________________"}</div></td></tr><tr><td class="signature-space"><span>${e(doc.inspector)}</span></td><td class="signature-space"><span>${e(doc.custodian)}</span></td></tr><tr><td class="signature-caption">Inspection Officer/Inspection Committee</td><td class="signature-caption">Supply and/or Property Custodian</td></tr></tbody></table>`;
    if(doc.kind==="ris")body=`<table class="metadata"><colgroup><col style="width:58%"><col style="width:42%"></colgroup><tbody><tr>${meta("Entity Name:",doc.entityName)}${meta("Fund Cluster:",doc.fundCluster)}</tr><tr>${meta("Division:",doc.division)}${meta("Responsibility Center Code:",doc.responsibilityCode)}</tr><tr>${meta("Office:",doc.office)}${meta("RIS No.:",doc.reference)}</tr></tbody></table>
      <table class="form-grid-table ris-table"><colgroup><col style="width:12%"><col style="width:8%"><col style="width:25%"><col style="width:9%"><col style="width:6%"><col style="width:6%"><col style="width:9%"><col style="width:25%"></colgroup><thead><tr><th colspan="4">Requisition</th><th colspan="2">Stock Available?</th><th colspan="2">Issue</th></tr><tr><th>Stock No.</th><th>Unit</th><th>Description</th><th>Quantity</th><th>Yes</th><th>No</th><th>Quantity</th><th>Remarks</th></tr></thead><tbody>${filled.map(r=>`<tr><td>${e(r.stockNo)}</td><td>${e(r.unit)}</td><td class="left">${e(r.description)}</td><td>${e(r.requested)}</td><td>${r.available===true?"✓":""}</td><td>${r.available===false?"✓":""}</td><td>${e(r.issued)}</td><td class="left">${e(r.remarks)}</td></tr>`).join("")}</tbody></table>
      <div class="purpose"><span>Purpose:</span><span>${e(doc.purpose)}</span></div>
      <table class="form-grid-table ris-signatures"><colgroup><col style="width:20%">${Array.from({length:4},()=>'<col style="width:20%">').join("")}</colgroup><tbody><tr><th></th>${["Requested by:","Approved by:","Issued by:","Received by:"].map(t=>`<th>${t}</th>`).join("")}</tr><tr><td class="left">Signature:</td>${doc.signatures.map(()=>`<td class="signature-blank"></td>`).join("")}</tr><tr><td class="left">Printed Name:</td>${doc.signatures.map(s=>`<td>${e(s.name)}</td>`).join("")}</tr><tr><td class="left">Designation</td>${doc.signatures.map(s=>`<td>${e(s.designation)}</td>`).join("")}</tr><tr><td class="left">Date:</td>${doc.signatures.map(s=>`<td>${e(date(s.date))}</td>`).join("")}</tr></tbody></table>`;
    if(doc.kind==="stock-card")body=`<table class="metadata stock-meta"><colgroup><col style="width:70%"><col style="width:30%"></colgroup><tbody><tr>${meta("Entity Name:",doc.entityName)}${meta("Fund Cluster:",doc.fundCluster)}</tr><tr>${meta("Item:",doc.item)}${meta("Stock No.",doc.stockNumber)}</tr><tr>${meta("Description:",doc.description)}${meta("Re-order Point:",doc.reorderPoint)}</tr><tr>${meta("Unit Measurement:",doc.unit)}<td></td></tr></tbody></table>
      <table class="form-grid-table stock-table"><colgroup><col style="width:12%"><col style="width:17%"><col style="width:10%"><col style="width:10%"><col style="width:23%"><col style="width:10%"><col style="width:18%"></colgroup><thead><tr><th rowspan="2">Date</th><th rowspan="2">Reference</th><th>Receipt</th><th colspan="2">Issue</th><th>Balance</th><th rowspan="2">No. of Days to Consume</th></tr><tr><th>Qty.</th><th>Qty.</th><th>Office</th><th>Qty.</th></tr></thead><tbody>${filled.map(r=>`<tr><td>${e(date(String(r.date??"")))}</td><td>${e(r.reference)}</td><td>${e(r.receipt)}</td><td>${e(r.issue)}</td><td class="left">${e(r.office)}</td><td>${e(r.balance)}</td><td>${e(r.days)}</td></tr>`).join("")}</tbody></table>`;
    return `<section class="form-page"><h1>${formTitle(doc.kind)}</h1>${body}<div class="page-number">${chunks.length>1?`Page ${pageIndex+1} of ${chunks.length}`:""}</div></section>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(formTitle(doc.kind))} ${e(doc.reference)}</title><style>
    @page { size: ${paperName} portrait; margin: 0; }
    *{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:"Times New Roman",Times,serif;color:#000;background:#e8edf3;font-size:11pt;line-height:1.15}
    .form-page{width:${paper.width}mm;min-height:${paper.height}mm;padding:12mm;background:white;margin:0 auto 8mm;break-after:page;position:relative}.form-page:last-child{break-after:auto}h1{font-size:14pt;text-align:center;margin:3mm 0 8mm;font-weight:bold}
    table{border-collapse:collapse;width:100%;table-layout:fixed}td,th{overflow-wrap:anywhere;word-break:normal;font-weight:normal;vertical-align:middle}th{font-weight:bold}.metadata{margin-bottom:3mm;font-size:10.5pt}.metadata td{padding:1.3mm 0;height:6.5mm;vertical-align:top}.metadata .label{font-weight:normal}.metadata tr:first-child .label{font-weight:bold}
    .form-grid-table td,.form-grid-table th{border:.25mm solid #000;padding:.5mm .7mm;text-align:center}.form-grid-table thead th{height:6.5mm;font-size:10.5pt}.form-grid-table tbody td{height:5mm;line-height:1.05;font-size:9.5pt}.left{text-align:left!important}.iar-table thead th{height:10mm}.iar-table tbody td{height:5.3mm;font-size:10pt}
    .iar-signatures{border:.25mm solid #000;font-size:11pt;break-inside:avoid}.iar-signatures td,.iar-signatures th{border-right:.25mm solid #000;padding:1.3mm 2mm}.iar-signatures th{height:8mm;font-size:12pt}.iar-signatures .inspection-statement{height:21mm;vertical-align:top}.acceptance-options{vertical-align:top}.acceptance-options>div{margin:1mm 0 4mm}.check-box{border:.25mm solid #000;display:inline-block;width:3.5mm;height:3.5mm;line-height:3.2mm;text-align:center;margin-right:1mm;vertical-align:middle}.signature-space{height:16mm;vertical-align:bottom!important;text-align:center}.signature-space span{display:block;border-bottom:.25mm solid #000;margin:0 2mm;padding-bottom:1mm}.signature-caption{text-align:center;height:8mm}
    .purpose{display:flex;gap:3mm;border:.25mm solid #000;border-top:0;min-height:11mm;padding:2mm;font-size:11pt;overflow-wrap:anywhere;break-inside:avoid}.purpose span:first-child{flex-shrink:0}.ris-signatures{margin-top:2mm;break-inside:avoid}.ris-signatures th{height:6.5mm;font-size:11pt;text-align:left}.ris-signatures tbody td{font-size:10pt;height:6mm}.ris-signatures .signature-blank{height:10mm}.stock-table tbody td{height:6mm;font-size:10pt}.stock-meta .label{font-weight:normal!important}.page-number{text-align:right;font-size:8pt;margin-top:3mm}
    ${max===1?".metadata,.purpose,.iar-signatures{font-size:9pt}.ris-signatures tbody td{font-size:8pt}":""}
    @media print{body{background:white}.form-page{margin:0 auto;box-shadow:none}h1,.metadata,.iar-signatures,.purpose,.ris-signatures{break-inside:avoid}thead{display:table-header-group}tr{break-inside:avoid}}
  </style></head><body>${pages}</body></html>`;
}
