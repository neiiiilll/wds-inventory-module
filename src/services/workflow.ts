import type { InventoryItem, InventoryTransaction } from "./inventory"
import type { IARFormFields, RISFormFields, StockCardFormFields, DocumentItemSnapshot } from "./client-form-types";
import type { AppRole } from "./access-control"

export interface Attachment {
  name: string
  data: string
}
export interface RequestLine {
  itemId: string
  quantity: number
  specification: string
}
export interface MaterialRequest {
  reference?:string;
  previousReference?:string;
  editVersion?:number;
  history?:RequestEvent[];
  id: string
  date: string
  person: string
  job: string
  lines: RequestLine[]
  parentId?: string
  approvedBy?: string
  approvalReference?: string
  approvedAt?: string
}
export interface PurchaseOrder {
  dispatchRequired?: boolean;
  dispatch?: {date:string;recipient:string;method:string;reference:string;person:string;at:string;reason:string};
  history?: ProcurementEvent[];
  purchaseRequestId?:string;
  lines?:OrderLine[];
  previousReference?:string;
  id: string
  requestId: string
  itemId: string
  quantity: number
  supplier: string
  reference: string
  date: string
  attachments?: Attachment[]
}
export interface IAR {
  lines?:DeliveryLine[];
  damaged?:number;
  replacesIarId?:string;
  previousReference?: string;
  lineSnapshot?: DocumentItemSnapshot;
  form?: IARFormFields;
  id: string
  orderId: string
  reference: string
  deliveryReference: string
  date: string
  delivered: number
  accepted: number
  unitCost?: number
  findings: string
  attachments?: Attachment[]
  inspectedBy?: string
  inspectedAt?: string
  acceptedBy?: string
  acceptedAt?: string
  postingId?: string
  postedAt?: string
  assetTags?: string[]
}
export interface RIS {
  previousReference?: string;
  lineSnapshots?: Record<string,DocumentItemSnapshot>;
  form?: RISFormFields;
  availableQuantities?: Record<string, number>;
  requestedQuantities?: Record<string, number>;
  id: string
  requestId: string
  reference: string
  date: string
  person: string
  approvalReference: string
  cancelled?: boolean
}
export interface Release {
  id: string
  risId: string
  itemId: string
  quantity: number
  unitCost: number
  value: number
  person: string
  recipient: string
  date: string
  assetTag?: string
}
export interface MaterialReturn {
  id: string
  releaseId: string
  quantity: number
  condition: "Usable" | "Damaged"
  accepted: boolean
  person: string
  date: string
  reason: string
  credit: number
}
export interface Count {
  id: string
  itemId: string
  recorded: number
  counted: number
  variance: number
  person: string
  date: string
  correctedBy?: string
  correctedAt?: string
  reason?: string
  reference?: string
  lastPostingId?: string
}
export interface Billing {
  job: string
  markup: number
  fees: number
  tax: number
}
export interface WorkflowState {
  procurementCompletionVersion?: 1;
  quotations?: SupplierQuotation[];
  procurementVersion?:1;
  purchaseRequests?:PurchaseRequest[];
  supplierReturns?:SupplierReturn[];
  referenceNumberingVersion?: 1;
  version: 1
  revision: number
  items: InventoryItem[]
  transactions: InventoryTransaction[]
  requests: MaterialRequest[]
  orders: PurchaseOrder[]
  iars: IAR[]
  ris: RIS[]
  releases: Release[]
  returns: MaterialReturn[]
  counts: Count[]
  billing: Billing[]
  sampleCosts: boolean
}
export interface RequestEvent {kind:string;at:string;actor:string;reason?:string;legacy?:boolean;changes:{field:string;itemId?:string;itemName?:string;before:unknown;after:unknown}[]}
export interface OrderLine {itemId:string;quantity:number;unitPrice?:number;snapshot?:DocumentItemSnapshot;specification?:string}
export interface DeliveryLine {itemId:string;delivered:number;accepted:number;damaged?:number;unitCost?:number;assetTags?:string[];snapshot?:DocumentItemSnapshot}
export interface ProcurementEvent {kind:string;at:string;actor:string;reason:string;revision?:number;stageId?:string;recordedBy?:string;details?:string}
export interface PRApprovalStep {id:string;label:string;reviewer:string;decision?:"Approved"|"Returned"|"Rejected";actedAt?:string;reason?:string;actedBy?:string}
export interface SupplierQuotation {id:string;requestId:string;requestVersion:number;supplier:string;reference:string;date:string;validUntil?:string;terms?:string;lines:OrderLine[];attachments?:Attachment[];recordedBy:string;recordedAt:string}
export interface PurchaseRequest {id:string;reference:string;requestId:string;date:string;person:string;job:string;lines:OrderLine[];approvedBy?:string;approvedAt?:string;approvalReference?:string;workflowVersion?:1;status?:"Draft"|"Submitted"|"Returned"|"Rejected"|"Approved";revision?:number;quotationId?:string;quotationReference?:string;supplier?:string;selectionReason?:string;approvalRoute?:PRApprovalStep[];history?:ProcurementEvent[]}
export interface SupplierReturn {id:string;iarId:string;itemId:string;quantity:number;date:string;person:string;reference:string}
export type WorkflowAction = ({type:"edit-request";id:string;person:string;job:string;lines:RequestLine[];actor:string;reason:string;expectedVersion:number}
| ({type:"quotation"}&Omit<SupplierQuotation,"requestVersion"|"recordedBy"|"recordedAt">)
| {type:"submit-purchase-request";id:string;revision:number}
| {type:"review-purchase-request";id:string;revision:number;stageId:string;person:string;decision:"Approved"|"Returned"|"Rejected";reason:string;reference?:string}
| {type:"revise-purchase-request";id:string;revision:number;date:string;quotationId:string;selectionReason:string;approvalRoute:PRApprovalStep[];lines:OrderLine[];reason:string}
| {type:"dispatch-order";id:string;date:string;recipient:string;method:string;reference:string;person:string;reason:string}
| ({type:"purchase-request"}&Omit<PurchaseRequest,"job"|"approvedBy"|"approvedAt"|"approvalReference">)
| {type:"approve-purchase-request";id:string;person:string;reference:string}
| ({type:"supplier-return"}&SupplierReturn)
| {type:"form-fields";kind:"iar"|"ris"|"stock-card";id:string;fields:IARFormFields|RISFormFields|StockCardFormFields} | {
  type: "request"
} & Omit<MaterialRequest, "approvedBy" | "approvalReference" | "approvedAt"> | {
  type: "approve-request"
  id: string
  person: string
  reference: string
} | { type: "order" } & PurchaseOrder | {
  type: "delivery"
} & Omit<IAR, "inspectedBy" | "acceptedBy" | "postingId"> | {
  type: "inspect" | "accept"
  id: string
  person: string
} | { type: "receipt"; id: string; postingId: string; person: string } | {
  type: "ris"
} & RIS | { type: "release" } & Omit<Release, "unitCost" | "value"> | {
  type: "cancel-ris"
  id: string
} | { type: "return" } & Omit<MaterialReturn, "credit"> | {
  type: "accept-return"
  id: string
  person: string
} | {
  type: "count"
  id: string
  itemId: string
  counted: number
  person: string
  date: string
} | {
  type: "correct-count"
  id: string
  person: string
  reason: string
  reference: string
} | { type: "item"; item: InventoryItem } | { type: "billing" } & Billing)

export const money = (n: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    n,
  )
export function randomId():string {
  if(typeof globalThis.crypto?.randomUUID==="function")return globalThis.crypto.randomUUID();
  // getRandomValues also works on HTTP LAN previews where randomUUID is unavailable.
  const bytes=globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64;
  bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export const newId = (prefix: string) => `${prefix}-${randomId()}`
export const requestReference=(request:MaterialRequest)=>request.reference??request.id;
function preserveApprovalHistory(r:MaterialRequest){
  r.history??=[];
  if(r.approvedBy&&!r.history.some(h=>h.kind==="Approved"&&h.actor===r.approvedBy&&h.reason===r.approvalReference))r.history.push({kind:"Approved",at:r.approvedAt??r.date,actor:r.approvedBy,reason:r.approvalReference,legacy:!r.approvedAt||!r.approvedAt.includes("T"),changes:[]});
}
export const orderLines=(order:PurchaseOrder):OrderLine[]=>order.lines??[{itemId:order.itemId,quantity:order.quantity}];
export const deliveryLines=(state:WorkflowState,iar:IAR):DeliveryLine[]=>iar.lines??[{itemId:get(state.orders,iar.orderId).itemId,delivered:iar.delivered,accepted:iar.accepted,damaged:iar.damaged,unitCost:iar.unitCost,assetTags:iar.assetTags,snapshot:iar.lineSnapshot}];
export function requestLockReason(state:WorkflowState,id:string):string {
  const pr=state.purchaseRequests?.find(p=>p.requestId===id);if(pr)return `Locked after progression to ${pr.reference}. Create an additional request for extra requirements.`;
  const po=state.orders.find(p=>p.requestId===id);if(po)return `Locked after progression to ${po.reference}. Create an additional request.`;
  const ris=state.ris.find(p=>p.requestId===id);return ris?`Locked after progression to ${ris.reference}. Create an additional request.`:"";
}
export function nextProcurementReference(state:WorkflowState,kind:"MR"|"PR"|"PO",date:string):string {
  dateRequired(date);const month=date.slice(0,7);const pattern=new RegExp(`^${kind}[ -]${month}-(\\d+)$`,"i");
  const references=kind==="MR"?state.requests.map(requestReference):kind==="PR"?(state.purchaseRequests??[]).map(p=>p.reference):state.orders.map(p=>p.reference);
  const max=references.reduce((n,r)=>Math.max(n,Number(r.match(pattern)?.[1]??0)),0);return `${kind} ${month}-${String(max+1).padStart(4,"0")}`;
}
export function migrateProcurement(state:WorkflowState):WorkflowState {
  if(state.procurementVersion===1){const missing=state.requests.some(r=>r.approvedBy&&!r.history?.some(h=>h.kind==="Approved"&&h.actor===r.approvedBy&&h.reason===r.approvalReference));if(!missing)return state;const healed=structuredClone(state);healed.requests.forEach(preserveApprovalHistory);healed.revision++;return healed;}
  const next=structuredClone(state);next.purchaseRequests??=[];next.supplierReturns??=[];
  for(const kind of ["MR","PO"] as const){const records=kind==="MR"?next.requests:next.orders;const counts=new Map<string,number>();
    for(const {record} of records.map((record,index)=>({record,index})).sort((a,b)=>a.record.date.localeCompare(b.record.date)||b.index-a.index)){
      const previous=record.reference??record.id;const month=record.date.slice(0,7);const count=(counts.get(month)??0)+1;counts.set(month,count);record.reference=`${kind} ${month}-${String(count).padStart(4,"0")}`;
      if(previous!==record.reference)record.previousReference??=previous;
      if(kind==="PO")for(const tx of next.transactions)if(tx.remarks.includes(`purchase ${previous}`))tx.remarks=tx.remarks.replace(`purchase ${previous}`,`purchase ${record.reference}`);
    }
  }
  for(const r of next.requests){r.editVersion??=0;r.history??=[{kind:"Created",at:r.date,actor:r.person,legacy:true,changes:r.lines.flatMap(l=>[{field:"Item",itemId:l.itemId,itemName:get(next.items,l.itemId).name,before:null,after:l.quantity},{field:"Specification",itemId:l.itemId,itemName:get(next.items,l.itemId).name,before:null,after:l.specification}])}];preserveApprovalHistory(r);}
  next.procurementVersion=1;next.revision++;return next;
}
export function orderLineTotals(state:WorkflowState,order:PurchaseOrder,itemId:string){
  const rows=state.iars.filter(i=>i.orderId===order.id).flatMap(i=>deliveryLines(state,i).filter(l=>l.itemId===itemId).map(l=>({...l,iar:i})));
  const ordered=orderLines(order).find(l=>l.itemId===itemId)?.quantity??0;
  const delivered=rows.reduce((n,l)=>n+l.delivered,0);const original=rows.filter(l=>!l.iar.replacesIarId).reduce((n,l)=>n+l.delivered,0);
  const acceptable=rows.reduce((n,l)=>n+l.accepted,0);const accepted=rows.filter(l=>l.iar.acceptedBy).reduce((n,l)=>n+l.accepted,0);
  const rejected=rows.reduce((n,l)=>n+l.delivered-l.accepted,0);const replaced=rows.filter(l=>l.iar.replacesIarId).reduce((n,l)=>n+l.delivered,0);
  const returned=(state.supplierReturns??[]).filter(r=>r.itemId===itemId&&state.iars.some(i=>i.id===r.iarId&&i.orderId===order.id)).reduce((n,r)=>n+r.quantity,0);
  return {ordered,delivered,originalDelivered:original,acceptable,accepted,rejected,damaged:rows.reduce((n,l)=>n+(l.damaged??0),0),returned,returnRequired:Math.max(0,rejected-returned),replacementPending:Math.max(0,rejected-replaced),undelivered:Math.max(0,ordered-original),posted:rows.filter(l=>l.iar.postingId).reduce((n,l)=>n+l.accepted,0)};
}
export const procurementSteps = [
  { id: "requests", label: "Material Request", icon: "edit" },
  { id: "purchase-requests", label: "Purchase Request", icon: "edit" },
  { id: "procurement", label: "Purchase Order", icon: "box" },
  { id: "inspection", label: "Inspection and Acceptance", icon: "shield" },
] as const;
export type ProcurementSection = (typeof procurementSteps)[number]["id"];

export function migrateProcurementCompletion(state: WorkflowState): WorkflowState {
  if (state.procurementCompletionVersion === 1) return state;
  const next = structuredClone(state);
  next.quotations ??= [];
  // Earlier records have no known quotation, route or dispatch evidence.
  // Retain them as earlier records; do not invent prices or acknowledgments.
  next.procurementCompletionVersion = 1;
  next.revision++;
  return next;
}

export function defaultApprovalRoute(): PRApprovalStep[] {
  return ["Department Head", "Budget Review", "Procurement/Internal Control", "Final Approver"]
    .map((label, index) => ({ id: `stage-${index + 1}`, label, reviewer: "" }));
}
function requireApprovalSequence(route: PRApprovalStep[] | undefined) {
  const requiredStages = defaultApprovalRoute();
  if (route?.length !== requiredStages.length || route.some((step, index) => step.label.trim() !== requiredStages[index].label))
    throw Error("The required approval sequence is Department Head → Budget Review → Procurement/Internal Control → Final Approver.");
}
export function procurementTotal(lines: OrderLine[]): number | undefined {
  if (!lines.length || lines.some(l => !Number.isFinite(l.unitPrice) || l.unitPrice! <= 0)) return undefined;
  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice!, 0);
  return Number.isFinite(total) ? clean(total) : undefined;
}
export const canReceiveOrder = (order: PurchaseOrder) => order.dispatchRequired !== true || !!order.dispatch;
export const currentPRReviewer = (request: PurchaseRequest) => request.status === "Submitted"
  ? request.approvalRoute?.find(step => !step.decision) : undefined;
export function canQuoteRequest(state: WorkflowState, request: MaterialRequest) {
  if (!request.approvedBy) return false;
  if (!requestLockReason(state, request.id)) return true;
  return !state.orders.some(o => o.requestId === request.id) &&
    !!state.purchaseRequests?.some(p => p.requestId === request.id && p.workflowVersion === 1 && (p.status === "Draft" || p.status === "Returned"));
}
export function quotationIsCurrent(state: WorkflowState, quote: SupplierQuotation) {
  const request = state.requests.find(r => r.id === quote.requestId);
  return !!request?.approvedBy && quote.requestVersion === (request.editVersion ?? 0) &&
    quote.lines.every(l => l.snapshot?.unit === state.items.find(i => i.id === l.itemId)?.unit);
}

export function purchaseRequestStatus(state: WorkflowState, request: PurchaseRequest) {
  if (request.workflowVersion === 1 && request.status !== "Approved") {
    if (request.status === "Submitted") return `Awaiting ${currentPRReviewer(request)?.label ?? "review"}`;
    return request.status ?? "Draft";
  }
  if (!request.approvedBy) return "Pending approval";
  const allocations = state.orders.filter(o => o.purchaseRequestId === request.id).flatMap(orderLines);
  if (!allocations.length) return "Approved";
  return request.lines.every(l => allocations.filter(a => a.itemId === l.itemId).reduce((n, a) => n + a.quantity, 0) >= l.quantity)
    ? "Ordered" : "Partially ordered";
}

export function purchaseOrderDeliveryStatus(state: WorkflowState, order: PurchaseOrder) {
  if (!canReceiveOrder(order)) return "Awaiting dispatch";
  const totals = orderLines(order).map(l => orderLineTotals(state, order, l.itemId));
  if (!totals.some(t => t.originalDelivered > 0)) return "Awaiting delivery";
  if (totals.some(t => t.undelivered > 0)) return "Partially delivered";
  if (totals.some(t => t.replacementPending > 0)) return "Replacement pending";
  return "Fully delivered";
}

export function purchaseOrderProcessingStatus(state: WorkflowState, order: PurchaseOrder) {
  if (!canReceiveOrder(order)) return "Awaiting dispatch";
  const receipts = state.iars.filter(i => i.orderId === order.id);
  if (!receipts.length) return "Not received";
  if (receipts.some(i => !i.inspectedBy)) return "Awaiting inspection";
  if (receipts.some(i => !i.acceptedBy)) return "Awaiting acceptance";
  const totals = orderLines(order).map(l => orderLineTotals(state, order, l.itemId));
  if (totals.some(t => t.returnRequired > 0)) return "Return to supplier pending";
  if (receipts.some(i => !i.postingId && deliveryLines(state, i).some(l => l.accepted > 0))) return "Awaiting stock posting";
  if (totals.some(t => t.undelivered > 0 || t.replacementPending > 0 || t.posted < t.ordered)) return "Delivery outstanding";
  return "Completed";
}
export function nextFormReference(state:Pick<WorkflowState,"iars"|"ris">,kind:"IAR"|"RIS",date:string):string {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error("Select a document date to generate its reference number.");
  const month=date.slice(0,7);
  const pattern=new RegExp(`^${kind}[ -]${month}-(\\d+)$`,"i");
  const records=kind==="IAR"?state.iars:state.ris;
  const maximum=records.reduce((max,record)=>{const match=record.reference.trim().match(pattern);return match?Math.max(max,Number(match[1])):max;},0);
  return `${kind} ${month}-${String(maximum+1).padStart(4,"0")}`;
}
export function migrateFormReferences(state:WorkflowState):WorkflowState {
  if(state.referenceNumberingVersion===1)return state;
  const next=structuredClone(state);
  const changes=new Map<string,{previous:string;reference:string}>();
  for(const kind of ["IAR","RIS"] as const){
    const records=kind==="IAR"?next.iars:next.ris;
    const counts=new Map<string,number>();
    const ordered=records.map((record,index)=>({record,index})).sort((a,b)=>a.record.date.localeCompare(b.record.date)||b.index-a.index);
    for(const {record} of ordered){
      dateRequired(record.date);
      const month=record.date.slice(0,7);const count=(counts.get(month)??0)+1;counts.set(month,count);
      const reference=`${kind} ${month}-${String(count).padStart(4,"0")}`;
      if(record.reference!==reference){changes.set(record.id,{previous:record.reference,reference});record.previousReference??=record.reference;record.reference=reference;}
    }
  }
  for(const transaction of next.transactions){
    const change=transaction.documentId?changes.get(transaction.documentId):undefined;
    if(change){transaction.reference=change.reference;transaction.remarks=transaction.remarks.split(change.previous).join(change.reference);}
  }
  next.referenceNumberingVersion=1;
  next.revision++;
  return next;
}
const required = (value: string | undefined, name: string) => {
  if (!value?.trim()) throw Error(`${name} is required.`)
}
const quantity = (value: number, zero = false) => {
  if (!Number.isFinite(value) || (zero ? value < 0 : value <= 0))
    throw Error("Enter a valid quantity.")
}
const cost = (value: number | undefined) => {
  if (value === undefined || !Number.isFinite(value) || value <= 0)
    throw Error(
      "An acquisition cost greater than zero is required before posting.",
    )
}
const get = <T extends { id: string }>(rows: T[], id: string): T => {
  const row = rows.find((r) => r.id === id)
  if (!row) throw Error("The linked record was not found.")
  return row
}
const unique = (rows: { id: string }[], id: string) => {
  required(id, "Record ID")
  if (rows.some((r) => r.id === id))
    throw Error(
      "Duplicate record or posting. This action has already been recorded.",
    )
}
const dateRequired = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)))
    throw Error("A valid date is required.")
}
const writableItem = (state: WorkflowState, id: string) => {
  const item = get(state.items, id)
  if (!item.active)
    throw Error("Inactive items cannot be used in transactions.")
  return item
}
const clean = (n: number) => Math.round(n * 1e8) / 1e8
const printIdentity = (item:InventoryItem, name=item.name):DocumentItemSnapshot => ({stockNo:item.code,description:name,unit:item.unit});

function validateFormFields(kind:"iar"|"ris"|"stock-card",fields:IARFormFields|RISFormFields|StockCardFormFields) {
  const common=["entityName","fundCluster","paper"];
  const specific=kind==="iar"?["office","responsibilityCode","poReference","poDate","invoiceNumber","invoiceDate","inspectionDate","receivedDate","acceptance","inspectionConforms"]:kind==="ris"?["division","office","responsibilityCode","purpose","requestedDesignation","approvedDesignation","issuedDesignation","receivedDesignation","requestedDate","approvedDate","issuedDate","receivedDate","remarks"]:["unitLabel","offices","days"];
  const valid=new Set([...common,...specific,...(kind!=="stock-card"?["signatures"]:[])]);
  for(const [key,value] of Object.entries(fields)) {
    if(!valid.has(key))throw Error("Only document form fields may be changed here.");
    if(key==="signatures") {
      if(!value||typeof value!=="object"||Array.isArray(value))throw Error("Invalid printed-name fields.");
      const slots=kind==="iar"?["inspection","acceptance"]:["requested","approved","issued","received"];
      for(const [slot,entry] of Object.entries(value)) {
        if(!slots.includes(slot)||!entry||typeof entry!=="object")throw Error("Invalid printed-name slot.");
        const s=entry as {name:string;date:string};
        if(typeof s.name!=="string"||s.name.length>160||typeof s.date!=="string")throw Error("Invalid printed name/date.");
        if(s.date)dateRequired(s.date);
      }
    }
    else if(key==="paper") {if(!["A4","Letter","Legal"].includes(String(value)))throw Error("Choose a valid paper size.");}
    else if(key==="inspectionConforms") {if(typeof value!=="boolean")throw Error("Invalid inspection checkbox field.");}
    else if(key==="acceptance") {if(!["","Complete","Partial"].includes(String(value)))throw Error("Choose a valid acceptance field.");}
    else if(["offices","days","remarks"].includes(key)) {
      if(!value||typeof value!=="object"||Array.isArray(value))throw Error("Invalid document row fields.");
      for(const entry of Object.values(value)) {
        if(typeof entry!=="string"||entry.length>500)throw Error("Document row fields must contain text up to 500 characters.");
        if(key==="days"&&entry!==""&&(!Number.isFinite(Number(entry))||Number(entry)<0))throw Error("Days to consume must be blank or a nonnegative number.");
      }
    } else if(typeof value!=="string"||value.length>(key==="purpose"?500:160))throw Error("Document fields must contain text within the displayed length limit.");
    else if(/Date$/.test(key)&&value)dateRequired(value);
  }
  return structuredClone(fields);
}

export function createWorkflowState(
  items: InventoryItem[],
  transactions: InventoryTransaction[],
  demo = true,
): WorkflowState {
  const state: WorkflowState = {
    version: 1,
    revision: 0,
    items: items.map((i, index) => {
      const unitCost =
        i.unitCost ??
        (demo
          ? [85, 18, 1250, 2800, 1650, 22, 1850, 480, 12, 650][index % 10]
          : undefined)
      return {
        ...i,
        unitCost,
        inventoryValue:
          i.inventoryValue ??
          (unitCost === undefined ? undefined : i.quantity * unitCost),
        costMethod: i.costMethod ?? "Average",
      }
    }),
    transactions: [...transactions],
    requests: [],
    orders: [],
    iars: [],
    ris: [],
    releases: [],
    returns: [],
    counts: [],
    billing: [],
    sampleCosts: demo,
  }
  if (demo && items.length >= 3) {
    const day = "2026-10-13"
    state.requests = [
      {
        id: "MR-2026-001",
        date: day,
        person: "Maintenance · Maria Santos",
        job: "SC-2026-041 · Zone 4 connection",
        approvedBy: "General Manager",
        approvalReference: "GM-2026-041",
        approvedAt: day,
        lines: [
          {
            itemId: items[0].id,
            quantity: 20,
            specification: "PVC 1/2 inch, service connection",
          },
          {
            itemId: items[2].id,
            quantity: 5,
            specification: "20 mm multijet meter",
          },
        ],
      },
      {
        id: "MR-2026-002",
        date: day,
        person: "Maintenance · Pedro Reyes",
        job: "JOB-2026-018 · North line repair",
        lines: [
          {
            itemId: items[1].id,
            quantity: 30,
            specification: "Standard pressure-rated fitting",
          },
        ],
      },
    ]
    state.orders = [
      {
        id: "PO-2026-001",
        requestId: state.requests[0].id,
        itemId: items[2].id,
        quantity: 5,
        supplier: "Metro Waterworks Supply",
        reference: "PO-2026-001",
        date: day,
      },
    ]
    state.iars = [
      {
        id: "IAR-2026-001",
        lineSnapshot: printIdentity(get(state.items,state.orders[0].itemId)),
        orderId: state.orders[0].id,
        reference: `IAR ${day.slice(0,7)}-0001`,
        deliveryReference: "DR-2026-076",
        date: day,
        delivered: 3,
        accepted: 3,
        unitCost: 1250,
        findings: "3 meters conform; remaining 2 units awaiting delivery.",
      },
    ]
    state.ris = [
      {
        id: "RIS-2026-001",
        lineSnapshots: Object.fromEntries(state.requests[0].lines.map(l=>[l.itemId,printIdentity(get(state.items,l.itemId))])),
        requestId: state.requests[0].id,
        reference: `RIS ${day.slice(0,7)}-0001`,
        date: day,
        person: "Maria Santos",
        approvalReference: "GM-2026-041",
        availableQuantities: Object.fromEntries(state.requests[0].lines.map(l=>[l.itemId,get(state.items,l.itemId).quantity])),
        requestedQuantities: Object.fromEntries(state.requests[0].lines.map(l=>[l.itemId,l.quantity])),
      },
    ]
  }
  return state
}

export function issuedFor(
  state: WorkflowState,
  requestId: string,
  itemId: string,
) {
  const ids = state.ris
    .filter((r) => r.requestId === requestId)
    .map((r) => r.id)
  return state.releases
    .filter((r) => ids.includes(r.risId) && r.itemId === itemId)
    .reduce((s, r) => s + r.quantity, 0)
}
export function availability(
  state: WorkflowState,
  line: RequestLine,
  requestId?: string,
) {
  const stock = get(state.items, line.itemId).quantity
  const issued = requestId ? issuedFor(state, requestId, line.itemId) : 0
  const outstanding = Math.max(0, line.quantity - issued)
  return {
    stock,
    issued,
    outstanding,
    shortage: Math.max(0, outstanding - stock),
  }
}
export function orderTotals(state: WorkflowState, order: PurchaseOrder) {
  const iars = state.iars.filter((i) => i.orderId === order.id)
  const totals=orderLines(order).map(l=>orderLineTotals(state,order,l.itemId));
  return {
    delivered: totals.reduce((n,t)=>n+t.delivered,0),
    accepted: iars
      .filter((i) => i.acceptedBy)
      .reduce((s, i) => s + deliveryLines(state,i).reduce((n,l)=>n+l.accepted,0), 0),
    posted: totals.reduce((n,t)=>n+t.posted,0),
    outstanding: totals.reduce((n,t)=>n+t.undelivered,0),
    replacementPending:totals.reduce((n,t)=>n+t.replacementPending,0),
  }
}
export function risStatus(state: WorkflowState, ris: RIS) {
  if (ris.cancelled) return "Cancelled"
  const request = get(state.requests, ris.requestId)
  const releases = state.releases.filter((r) => r.risId === ris.id)
  if (!releases.length) return "Pending"
  return request.lines.every(
    (l) => issuedFor(state, request.id, l.itemId) >= l.quantity,
  )
    ? "Fully issued"
    : "Partially issued"
}
export function requestFulfillmentStatus(state: WorkflowState, request: MaterialRequest) {
  if (request.lines.every(l => issuedFor(state, request.id, l.itemId) >= l.quantity)) return "Fully issued";
  return request.lines.some(l => issuedFor(state, request.id, l.itemId) > 0) ? "Partially issued" : "Not issued";
}

export function requestStatus(state: WorkflowState, request: MaterialRequest) {
  if (!request.approvedBy) return "Pending MR approval";
  const pr = state.purchaseRequests?.find(p => p.requestId === request.id);
  const orders = state.orders.filter(o => o.requestId === request.id);
  if(pr?.workflowVersion===1&&pr.status!=="Approved")return purchaseRequestStatus(state,pr);
  if (pr && !pr.approvedBy) return "Awaiting PR approval";
  if (!orders.length) return pr ? (state.procurementCompletionVersion===1&&pr.workflowVersion!==1?"Earlier PR · new linked MR required":"Ready for PO") : "MR approved";
  const processing = orders.map(o => purchaseOrderProcessingStatus(state, o));
  const fullyOrdered = !pr || purchaseRequestStatus(state, pr) === "Ordered";
  if (fullyOrdered && processing.every(status => status === "Completed")) return "Procurement completed";
  for (const status of ["Awaiting inspection", "Awaiting acceptance", "Return to supplier pending", "Awaiting stock posting"] as const)
    if (processing.includes(status)) return status;
  if (!fullyOrdered) return "Partially ordered";
  if(processing.includes("Awaiting dispatch"))return "Awaiting PO dispatch";
  const totals = orders.flatMap(o => orderLines(o).map(l => orderLineTotals(state, o, l.itemId)));
  if (!totals.some(t => t.originalDelivered > 0)) return "Awaiting delivery";
  if (totals.some(t => t.undelivered > 0)) return "Partially delivered";
  if (totals.some(t => t.replacementPending > 0)) return "Replacement pending";
  return "In procurement";
}
export function materialCostForJob(state: WorkflowState, job: string) {
  const risIds = state.ris
    .filter((r) => get(state.requests, r.requestId).job === job)
    .map((r) => r.id)
  const releases = state.releases.filter((r) => risIds.includes(r.risId))
  return clean(
    releases.reduce((s, r) => s + r.value, 0) -
      state.returns
        .filter((r) => releases.some((l) => l.id === r.releaseId))
        .reduce((s, r) => s + r.credit, 0),
  )
}

export function applyWorkflowAction(
  state: WorkflowState,
  action: WorkflowAction,
  role: AppRole,
  currentPersonnel?: string,
): WorkflowState {
  if (role === "Viewer")
    throw Error("You do not have permission to change inventory records.")
  const next = structuredClone(state)
  next.purchaseRequests??=[];next.supplierReturns??=[];next.quotations??=[];
  const now = new Date().toISOString()
  function movement(
    item: InventoryItem,
    signed: number,
    value: number,
    type: string,
    reference: string,
    person: string,
    date: string,
    documentId: string,
    postingId: string,
    job?: string,
    remarks = "",
    office?: string,
  ) {
    unique(next.transactions, postingId)
    if (next.transactions.some((t) => t.postingId === postingId))
      throw Error("Duplicate stock posting.")
    const previous = item.quantity
    if (previous + signed < -1e-8)
      throw Error("Insufficient stock for this transaction.")
    if (item.inventoryValue === undefined && previous > 0)
      throw Error(
        "Opening inventory cost is unresolved. Record a documented opening valuation first.",
      )
    const valuation = clean((item.inventoryValue ?? 0) + value)
    if (valuation < -1e-6)
      throw Error("This posting would create a negative inventory value.")
    item.quantity = clean(previous + signed)
    item.inventoryValue = item.quantity === 0 ? 0 : Math.max(0, valuation)
    item.unitCost = item.quantity
      ? item.inventoryValue / item.quantity
      : item.unitCost
    next.transactions.unshift({
      office: office ?? (signed > 0 ? item.location : ""),
      id: postingId,
      postingId,
      date: `${date}T12:00:00`,
      reference,
      itemId: item.id,
      itemName: item.name,
      type,
      quantity: signed,
      previous,
      next: item.quantity,
      performedBy: person,
      remarks,
      job,
      documentId,
      unitCost: signed ? Math.abs(value / signed) : 0,
      value,
    })
  }
  function postAcceptedReceipt(i: IAR, postingId: string, person: string) {
      if (!i.acceptedBy)
        throw Error("An accepted IAR is required for stock-in.")
      if (i.postingId)
        throw Error("This accepted receipt has already been posted.")
      required(person, "Received by")
      const o = get(next.orders, i.orderId)
      const receiptLines=deliveryLines(next,i).filter(l=>l.accepted>0);if(!receiptLines.length)throw Error("No acceptable quantity to post.");
      for(let index=0;index<receiptLines.length;index++){
      const line=receiptLines[index];
      quantity(line.accepted);cost(line.unitCost);
      const item = writableItem(next, line.itemId)
      if (item.costMethod === "Specific") {
        if (
          !Number.isInteger(line.accepted) ||
          line.assetTags?.length !== line.accepted ||
          new Set(line.assetTags).size !== line.accepted ||
          line.assetTags.some(
            (t) =>
              !t.trim() ||
              next.items.some((x) => x.assets?.some((a) => a.tag === t)) ||
              next.releases.some((r) => r.assetTag === t) ||
              next.iars.some((r) => r.postingId && r.assetTags?.includes(t)),
          )
        )
          throw Error(
            "Provide one unique, previously unused asset tag for each accepted unit.",
          )
        item.assets = [
          ...(item.assets ?? []),
          ...line.assetTags.map((tag) => ({ tag, cost: line.unitCost! })),
        ]
        item.serials = item.assets.map((a) => a.tag)
      }
      movement(
        item,
        line.accepted,
        line.accepted * line.unitCost!,
        "Stock In",
        i.reference,
        person,
        i.date,
        i.id,
        index===0?postingId:`${postingId}-${index+1}`,
        get(next.requests, o.requestId).job,
        `Accepted IAR ${i.reference}; purchase ${o.reference}`,
      )
      }
      i.postingId = postingId
      i.postedAt = now
  }
  function checkedPR(id: string, revision: number) {
    const pr = get(next.purchaseRequests!, id);
    if (pr.workflowVersion !== 1) throw Error("This earlier PR has no staged route. Use a new linked Material Request for new procurement.");
    if ((pr.revision ?? 0) !== revision) throw Error("This PR revision changed. Reopen the record before acting.");
    return pr;
  }
  function pricedPRDetails(requestId: string, date: string, quotationId: string | undefined, lines: OrderLine[], selectionReason: string | undefined, route: PRApprovalStep[] | undefined) {
    dateRequired(date);required(quotationId,"Supplier quotation");required(selectionReason,"Quotation selection reason");
    const request = get(next.requests, requestId);
    const quote = next.quotations!.find(q => q.id === quotationId);
    if (!quote) throw Error("The selected supplier quotation was not found.");
    if (quote.requestId !== request.id) throw Error("Quotation must belong to this Material Request.");
    if (!quotationIsCurrent(next, quote)) throw Error("The quotation is stale after a request revision or item unit change. Record an updated quotation.");
    if (date < quote.date || (quote.validUntil && date > quote.validUntil)) throw Error("Quotation is not valid for the PR date or has expired.");
    if (!lines.length) throw Error("Select at least one procurement item.");
    const ids = new Set<string>();
    const priced = lines.map(line => {
      quantity(line.quantity);
      const requested = request.lines.find(l => l.itemId === line.itemId);
      const offered = quote.lines.find(l => l.itemId === line.itemId);
      if (!requested || !offered || line.quantity > offered.quantity || line.quantity > availability(next, requested, request.id).outstanding)
        throw Error("PR quantity exceeds the quoted quantity or remaining approved requirement.");
      if (ids.has(line.itemId)) throw Error("Duplicate procurement item.");ids.add(line.itemId);cost(offered.unitPrice);
      return {itemId:line.itemId,quantity:line.quantity,unitPrice:offered.unitPrice,specification:requested.specification,snapshot:structuredClone(offered.snapshot!)};
    });
    if (procurementTotal(priced) === undefined) throw Error("The quotation total is invalid or too large.");
    const stageIds = new Set<string>();
    const approvalRoute = (route ?? []).map(step => {
      required(step.id,"Approval stage ID");required(step.label,"Approval stage");
      if (stageIds.has(step.id)) throw Error("Duplicate approval stage.");stageIds.add(step.id);
      return {id:step.id,label:step.label.trim(),reviewer:step.reviewer.trim()};
    });
    requireApprovalSequence(approvalRoute);
    return {lines:priced,quotationId:quote.id,quotationReference:quote.reference,supplier:quote.supplier,selectionReason:selectionReason!,approvalRoute};
  }
  function prEvent(pr: PurchaseRequest, kind: string, actor: string, reason: string, stageId?: string, details?: string) {
    pr.history ??= [];
    pr.history.push({kind,at:now,actor,reason,revision:pr.revision ?? 0,stageId,details,recordedBy:currentPersonnel ?? actor});
  }
  switch (action.type) {
    case "quotation": {
      unique(next.quotations!, action.id);
      const request = get(next.requests, action.requestId);
      if (!canQuoteRequest(next, request)) throw Error("Record quotations for an approved editable MR, or a draft/returned PR with no PO.");
      required(action.supplier,"Supplier");required(action.reference,"Quotation reference");dateRequired(action.date);
      if (action.validUntil) {dateRequired(action.validUntil);if(action.validUntil<action.date)throw Error("Quotation validity must not end before its date.");}
      if (next.quotations!.some(q=>q.requestId===request.id&&q.supplier.trim().toLowerCase()===action.supplier.trim().toLowerCase()&&q.reference.trim().toLowerCase()===action.reference.trim().toLowerCase()))throw Error("Duplicate supplier quotation reference for this request.");
      if (!action.lines.length)throw Error("Enter at least one quoted item.");
      const ids = new Set<string>();
      const lines = action.lines.map(line=>{
        const requested=request.lines.find(l=>l.itemId===line.itemId);
        quantity(line.quantity);cost(line.unitPrice);
        if(!requested||line.quantity>requested.quantity)throw Error("Quoted quantity exceeds the approved MR requirement.");
        if(ids.has(line.itemId))throw Error("Duplicate quoted item.");ids.add(line.itemId);
        return {itemId:line.itemId,quantity:line.quantity,unitPrice:line.unitPrice,specification:requested.specification,snapshot:printIdentity(writableItem(next,line.itemId))};
      });
      if(procurementTotal(lines)===undefined)throw Error("Quotation total is invalid or too large.");
      next.quotations!.unshift({id:action.id,requestId:request.id,requestVersion:request.editVersion??0,supplier:action.supplier.trim(),reference:action.reference.trim(),date:action.date,validUntil:action.validUntil,terms:action.terms,lines,attachments:action.attachments,recordedBy:currentPersonnel??request.person,recordedAt:now});
      request.history??=[];request.history.push({kind:"Supplier quotation recorded",at:now,actor:currentPersonnel??request.person,reason:`${action.supplier} · ${action.reference}`,changes:[]});break;
    }
    case "revise-purchase-request": {
      const pr=checkedPR(action.id,action.revision);
      if(pr.status!=="Draft"&&pr.status!=="Returned")throw Error("Submitted PR details are locked. A reviewer must return it for revision.");
      if(next.orders.some(o=>o.purchaseRequestId===pr.id))throw Error("A PR with a PO cannot be revised.");
      required(action.reason,"Revision reason");
      const details=pricedPRDetails(pr.requestId,action.date,action.quotationId,action.lines,action.selectionReason,action.approvalRoute);
      const before=JSON.stringify({date:pr.date,lines:pr.lines,quotationId:pr.quotationId,approvalRoute:pr.approvalRoute?.map(({id,label,reviewer})=>({id,label,reviewer})),selectionReason:pr.selectionReason});
      const after=JSON.stringify({date:action.date,lines:details.lines,quotationId:details.quotationId,approvalRoute:details.approvalRoute,selectionReason:details.selectionReason});
      if(before===after)throw Error("No PR changes to save. Save the requested revision before resubmitting.");
      const oldLines=`${pr.supplier} · ${pr.quotationReference} · `+pr.lines.map(l=>`${l.snapshot?.description??l.itemId}: ${l.quantity} × ${l.unitPrice}`).join("; ");
      Object.assign(pr,details,{date:action.date,status:"Draft",revision:(pr.revision??0)+1});delete pr.approvedBy;delete pr.approvedAt;delete pr.approvalReference;
      prEvent(pr,"Revised",currentPersonnel??pr.person,action.reason,undefined,`${oldLines} → ${pr.supplier} · ${pr.quotationReference} · ${pr.lines.map(l=>`${l.snapshot?.description??l.itemId}: ${l.quantity} × ${l.unitPrice}`).join("; ")}`);break;
    }
    case "submit-purchase-request": {
      const pr=checkedPR(action.id,action.revision);
      if(pr.status==="Returned")throw Error("Save the requested revision before resubmission.");
      if(pr.status!=="Draft")throw Error("Only a draft PR can be submitted. Rejected PRs require a new linked request.");
      if(!pr.approvalRoute?.length)throw Error("Configure the required approval sequence.");
      pr.approvalRoute.forEach(step=>required(step.reviewer,`Assigned reviewer for ${step.label}`));
      const details=pricedPRDetails(pr.requestId,pr.date,pr.quotationId,pr.lines,pr.selectionReason,pr.approvalRoute);
      Object.assign(pr,details,{status:"Submitted"});
      prEvent(pr,"Submitted",currentPersonnel??pr.person,`Forwarded to ${pr.approvalRoute![0].label}: ${pr.approvalRoute![0].reviewer}`);break;
    }
    case "review-purchase-request": {
      const pr=checkedPR(action.id,action.revision);
      requireApprovalSequence(pr.approvalRoute);
      const step=currentPRReviewer(pr);
      if(!step||step.id!==action.stageId)throw Error("Only the current pending review stage can act, in order.");
      if(action.person.trim()!==step.reviewer.trim())throw Error("The decision must name the assigned reviewer.");
      if(!["Approved","Returned","Rejected"].includes(action.decision))throw Error("Invalid review decision.");
      required(action.reason,"Decision reason");
      Object.assign(step,{decision:action.decision,actedAt:now,reason:action.reason,actedBy:action.person});
      prEvent(pr,action.decision,action.person,action.reason,step.id,`${step.label}${action.reference?` · ${action.reference}`:""}`);
      if(action.decision==="Returned"||action.decision==="Rejected")pr.status=action.decision;
      else if(pr.approvalRoute!.every(s=>s.decision==="Approved")){
        pr.status="Approved";pr.approvedBy=action.person;pr.approvedAt=now;pr.approvalReference=action.reference??action.reason;
        prEvent(pr,"Approval completed",action.person,"All required review stages approved this revision.");
      }else{
        const pending=currentPRReviewer(pr)!;
        prEvent(pr,"Forwarded",currentPersonnel??action.person,`Forwarded to ${pending.label}: ${pending.reviewer}`);
      }
      break;
    }
    case "dispatch-order": {
      const order=get(next.orders,action.id);
      if(order.dispatch)throw Error("This purchase order has already been dispatched.");
      dateRequired(action.date);if(action.date<order.date)throw Error("Dispatch date cannot precede the PO date.");
      required(action.recipient,"Supplier recipient");required(action.method,"Dispatch method");required(action.reference,"Dispatch reference");required(action.person,"Dispatched by");required(action.reason,"Dispatch note");
      if(next.iars.some(i=>i.orderId===order.id&&i.date<action.date))throw Error("Dispatch date cannot follow an already recorded delivery.");
      order.dispatch={date:action.date,recipient:action.recipient,method:action.method,reference:action.reference,person:currentPersonnel??action.person,at:now,reason:action.reason};
      order.history??=[];order.history.push({kind:"Dispatched",at:now,actor:currentPersonnel??action.person,reason:action.reason,details:`${action.method} · ${action.recipient} · ${action.reference}`});
      const request=get(next.requests,order.requestId);request.history??=[];request.history.push({kind:"Purchase Order dispatched",at:now,actor:currentPersonnel??action.person,reason:`${order.reference} · ${action.reference}`,changes:[]});break;
    }
    case "edit-request": {
      const r=get(next.requests,action.id);const lock=requestLockReason(next,r.id);if(lock)throw Error(lock);
      if((r.editVersion??0)!==action.expectedVersion)throw Error("This request changed while you were editing. Reopen it before saving.");
      if(role!=="Administrator"&&action.person!==r.person)throw Error("Only an administrator can change the requesting personnel.");
      required(action.person,"Requesting personnel");required(action.job,"Project");required(action.actor,"Recorded by");required(action.reason,"Revision reason");
      if(r.parentId&&get(next.requests,r.parentId).job!==action.job)throw Error("Additional requests must use the original job reference.");
      if(r.job!==action.job&&next.requests.some(child=>child.parentId===r.id))throw Error("The job cannot change after an additional request is linked. Create a new request for the new job.");
      if(!action.lines.length)throw Error("At least one material is required.");const ids=new Set<string>();
      for(const l of action.lines){writableItem(next,l.itemId);quantity(l.quantity);required(l.specification,"Specifications");if(ids.has(l.itemId))throw Error("Duplicate material; combine quantities.");ids.add(l.itemId);}
      const changes:RequestEvent["changes"]=[];
      for(const l of r.lines){const revised=action.lines.find(n=>n.itemId===l.itemId);if(!revised){changes.push({field:"Removed item",itemId:l.itemId,before:l.quantity,after:null});changes.push({field:"Specification",itemId:l.itemId,before:l.specification,after:null});}else {if(revised.quantity!==l.quantity)changes.push({field:"Quantity",itemId:l.itemId,before:l.quantity,after:revised.quantity});if(revised.specification!==l.specification)changes.push({field:"Specification",itemId:l.itemId,before:l.specification,after:revised.specification});}}
      for(const l of action.lines)if(!r.lines.some(n=>n.itemId===l.itemId)){changes.push({field:"Added item",itemId:l.itemId,before:null,after:l.quantity});changes.push({field:"Specification",itemId:l.itemId,before:null,after:l.specification});}
      if(r.person!==action.person)changes.push({field:"Requesting personnel",before:r.person,after:action.person});if(r.job!==action.job)changes.push({field:"Job",before:r.job,after:action.job});
      if(!changes.length)throw Error("No changes to save.");if(r.approvedBy)changes.push({field:"Approval reset",before:r.approvalReference,after:"Pending reapproval"});
      preserveApprovalHistory(r);changes.forEach(c=>{if(c.itemId)c.itemName=get(next.items,c.itemId).name;});
      r.person=action.person;r.job=action.job;r.lines=structuredClone(action.lines);delete r.approvedBy;delete r.approvedAt;delete r.approvalReference;r.editVersion=(r.editVersion??0)+1;
      r.history??=[];r.history.push({kind:"Updated",at:now,actor:currentPersonnel??action.actor,reason:action.reason,changes});break;
    }
    case "purchase-request": {
      unique(next.purchaseRequests,action.id);required(action.reference,"PR reference");dateRequired(action.date);required(action.person,"Requesting personnel");const r=get(next.requests,action.requestId);if(!r.approvedBy)throw Error("Approve the Material Request before preparing a Purchase Request.");
      if(requestLockReason(next,r.id))throw Error("This request has already progressed. Use its existing documents or create an additional request.");
      if(!action.lines.length)throw Error("Select at least one procurement item.");const ids=new Set<string>();
      const lines=action.lines.map(l=>{quantity(l.quantity);const requested=r.lines.find(n=>n.itemId===l.itemId);if(!requested||l.quantity>availability(next,requested,r.id).outstanding)throw Error("PR quantity exceeds the remaining approved requirement.");if(ids.has(l.itemId))throw Error("Duplicate procurement item.");ids.add(l.itemId);return {...l,snapshot:printIdentity(writableItem(next,l.itemId)),specification:requested.specification};});
      if(next.purchaseRequests.some(p=>p.reference.toLowerCase()===action.reference.toLowerCase()))throw Error("Duplicate PR number.");
      const full=next.procurementCompletionVersion===1?pricedPRDetails(r.id,action.date,action.quotationId,action.lines,action.selectionReason,action.approvalRoute):undefined;
      const record:PurchaseRequest={id:action.id,reference:action.reference,date:action.date,person:r.person,requestId:r.id,job:r.job,lines,...full};
      if(full){record.workflowVersion=1;record.status="Draft";record.revision=0;record.history=[{kind:"Created",at:now,actor:currentPersonnel??r.person,reason:full.selectionReason,revision:0,details:`${full.supplier} · ${full.quotationReference}`}];}
      next.purchaseRequests.unshift(record);r.history??=[];r.history.push({kind:"Progressed to Purchase Request",at:now,actor:action.person,reason:action.reference,changes:[]});break;
    }
    case "approve-purchase-request": {const p=get(next.purchaseRequests,action.id);if(p.workflowVersion===1)throw Error("Use each required stage in the PR review route.");if(p.approvedBy)throw Error("PR approval already recorded.");required(action.person,"Approver");required(action.reference,"Approval reference");p.approvedBy=action.person;p.approvedAt=now;p.approvalReference=action.reference;break;}
    case "supplier-return": {unique(next.supplierReturns,action.id);const i=get(next.iars,action.iarId);if(!i.inspectedBy)throw Error("Acknowledge inspection before returning rejected items.");const line=deliveryLines(next,i).find(l=>l.itemId===action.itemId);quantity(action.quantity);dateRequired(action.date);required(action.person,"Returned by");required(action.reference,"Return reference");const returned=next.supplierReturns.filter(r=>r.iarId===i.id&&r.itemId===action.itemId).reduce((n,r)=>n+r.quantity,0);if(!line||action.quantity>line.delivered-line.accepted-returned)throw Error("Return quantity exceeds unreturned rejected items.");next.supplierReturns.unshift({...action});break;}
    case "form-fields": {
      const fields=validateFormFields(action.kind,action.fields);
      if(action.kind==="iar") {const record=get(next.iars,action.id);const item=get(next.items,get(next.orders,record.orderId).itemId);record.lineSnapshot??=printIdentity(item,next.transactions.find(t=>t.documentId===record.id)?.itemName??item.name);record.form=fields as IARFormFields;}
      else if(action.kind==="ris") {const record=get(next.ris,action.id);record.lineSnapshots??=Object.fromEntries(get(next.requests,record.requestId).lines.map(l=>{const item=get(next.items,l.itemId);const tx=next.transactions.slice().reverse().find(t=>t.documentId===record.id&&t.itemId===item.id);return [item.id,printIdentity(item,tx?.itemName??item.name)];}));record.form=fields as RISFormFields;}
      else get(next.items,action.id).stockCardForm=fields as StockCardFormFields;
      break;
    }
    case "request": {
      unique(next.requests, action.id)
      if(next.requests.some(r=>requestReference(r).toLowerCase()===(action.reference??action.id).toLowerCase()))throw Error("Duplicate Material Request number.");
      if(currentPersonnel&&role!=="Administrator"&&action.person&&action.person!==currentPersonnel)
        throw Error("The requesting personnel must match the current requester. An administrator can request for another person.");
      const requester = currentPersonnel&&role!=="Administrator" ? currentPersonnel : action.person;
      required(requester, "Requesting personnel")
      required(action.job, "Project / service reference")
      dateRequired(action.date)
      if (!action.lines.length)
        throw Error("At least one material line is required.")
      const ids = new Set<string>()
      action.lines.forEach((l) => {
        writableItem(next, l.itemId)
        quantity(l.quantity)
        required(l.specification, "Specifications")
        if (ids.has(l.itemId))
          throw Error("Duplicate item in request; combine its quantities.")
        ids.add(l.itemId)
      })
      if (
        action.parentId &&
        get(next.requests, action.parentId).job !== action.job
      )
        throw Error("Additional requests must use the original job reference.")
      if(action.parentId&&!requestLockReason(next,action.parentId))
        throw Error("Edit the original Material Request for additional quantities before it progresses to PR.");
      next.requests.unshift({
        id: action.id,
        date: action.date,
        person: requester,
        job: action.job,
        lines: action.lines,
        parentId: action.parentId,
        reference:action.reference??action.id,
        editVersion:0,
        history:[{kind:"Created",at:now,actor:currentPersonnel??requester,changes:action.lines.flatMap(l=>[{field:"Item",itemId:l.itemId,itemName:get(next.items,l.itemId).name,before:null,after:l.quantity},{field:"Specification",itemId:l.itemId,itemName:get(next.items,l.itemId).name,before:null,after:l.specification}])}],
      })
      break
    }
    case "approve-request": {
      const r = get(next.requests, action.id)
      if (r.approvedBy) throw Error("Request approval already recorded.")
      required(action.person, "Approver")
      required(action.reference, "Approval reference")
      r.approvedBy = action.person
      r.approvalReference = action.reference
      r.approvedAt = now
      r.history??=[];r.history.push({kind:"Approved",at:now,actor:action.person,reason:action.reference,changes:[]});
      break
    }
    case "order": {
      unique(next.orders, action.id)
      const r = get(next.requests, action.requestId)
      const pr=action.purchaseRequestId?get(next.purchaseRequests,action.purchaseRequestId):undefined;
      if(next.procurementVersion===1&&!pr)throw Error("Select an approved Purchase Request before creating a PO.");
      if(pr&&(!pr.approvedBy||pr.requestId!==r.id))throw Error("The linked Purchase Request must be approved and belong to this Material Request.");
      if(pr?.workflowVersion===1&&(pr.status!=="Approved"||!pr.approvalRoute?.length||pr.approvalRoute.some(s=>s.decision!=="Approved")))throw Error("All required PR approvals must be complete before PO creation.");
      if(pr?.workflowVersion===1)requireApprovalSequence(pr.approvalRoute);
      if(next.procurementCompletionVersion===1&&pr?.workflowVersion!==1)throw Error("This earlier PR has no approved quotation and review route. Use a linked additional MR for new procurement.");
      if(pr?.workflowVersion===1&&action.supplier.trim()!==pr.supplier)throw Error("PO supplier must match the approved quotation supplier.");
      if (!r.approvedBy)
        throw Error("Record the existing request approval before procurement.")
      writableItem(next, action.itemId)
      if (!r.lines.some((l) => l.itemId === action.itemId))
        throw Error("Item must belong to the linked request.")
      quantity(action.quantity)
      required(action.supplier, "Supplier")
      required(action.reference, "Purchase reference")
      dateRequired(action.date)
      const orderedLines=action.lines??[{itemId:action.itemId,quantity:action.quantity}];const ids=new Set<string>();
      for(const l of orderedLines){writableItem(next,l.itemId);quantity(l.quantity);if(ids.has(l.itemId))throw Error("Duplicate ordered item.");ids.add(l.itemId);if(!r.lines.some(n=>n.itemId===l.itemId))throw Error("Ordered item must belong to the request.");if(pr){const allowed=pr.lines.find(n=>n.itemId===l.itemId)?.quantity??0;const allocated=next.orders.filter(o=>o.purchaseRequestId===pr.id).flatMap(orderLines).filter(n=>n.itemId===l.itemId).reduce((n,l)=>n+l.quantity,0);if(l.quantity>allowed-allocated)throw Error("Ordered quantity exceeds the remaining PR allocation.");}}
      if(!orderedLines.length)throw Error("At least one ordered item is required.");
      if (
        next.orders.some(
          (o) =>
            o.reference.trim().toLowerCase() ===
            action.reference.trim().toLowerCase(),
        )
      )
        throw Error("Duplicate purchase reference; review the existing order.")
      next.orders.unshift({
        id: action.id,
        requestId: action.requestId,
        itemId: orderedLines[0].itemId,
        quantity: orderedLines[0].quantity,
        supplier: action.supplier,
        reference: action.reference,
        date: action.date,
        attachments: action.attachments,
        purchaseRequestId:action.purchaseRequestId,
        dispatchRequired:next.procurementCompletionVersion===1,
        history:[{kind:"Created",at:now,actor:currentPersonnel??"Procurement",reason:"Prepared from the approved PR."}],
        lines:orderedLines.map(l=>({...l,unitPrice:pr?.lines.find(n=>n.itemId===l.itemId)?.unitPrice,snapshot:structuredClone(pr?.lines.find(n=>n.itemId===l.itemId)?.snapshot??printIdentity(get(next.items,l.itemId))),specification:pr?.lines.find(n=>n.itemId===l.itemId)?.specification??r.lines.find(n=>n.itemId===l.itemId)?.specification})),
      })
      r.history??=[];r.history.push({kind:"Purchase Order created",at:now,actor:currentPersonnel??"Procurement",reason:action.reference,changes:[]});
      break
    }
    case "delivery": {
      unique(next.iars, action.id)
      const o = get(next.orders, action.orderId)
      if(!canReceiveOrder(o))throw Error("Record PO dispatch to the supplier before receiving this order.");
      if(o.dispatch&&action.date<o.dispatch.date)throw Error("Delivery date cannot precede PO dispatch.");
      writableItem(next, o.itemId)
      quantity(action.delivered)
      quantity(action.accepted, true)
      dateRequired(action.date)
      required(action.reference, "IAR control number")
      required(action.deliveryReference, "Delivery reference")
      required(action.findings, "Inspection findings")
      if (
        next.iars.some(
          (i) =>
            i.reference.trim().toLowerCase() ===
            action.reference.trim().toLowerCase(),
        )
      )
        throw Error("Duplicate IAR control number.")
      if (!action.lines && action.delivered > orderTotals(next, o).outstanding)
        throw Error("Delivered quantity exceeds the outstanding order.")
      if (action.accepted > action.delivered)
        throw Error("Accepted quantity cannot exceed delivered quantity.")
      if (action.unitCost !== undefined) cost(action.unitCost)
      const receiptLines=action.lines??[{itemId:o.itemId,delivered:action.delivered,accepted:action.accepted,damaged:action.damaged,unitCost:action.unitCost,assetTags:action.assetTags}];const ids=new Set<string>();
      for(const l of receiptLines){writableItem(next,l.itemId);quantity(l.delivered);quantity(l.accepted,true);quantity(l.damaged??0,true);if(ids.has(l.itemId)||!orderLines(o).some(n=>n.itemId===l.itemId))throw Error("Invalid or duplicate delivered item.");ids.add(l.itemId);if(l.accepted>l.delivered||(l.damaged??0)>l.delivered-l.accepted)throw Error("Accepted and damaged quantities cannot exceed delivered quantity.");if(l.unitCost!==undefined)cost(l.unitCost);
        let maximum=orderLineTotals(next,o,l.itemId).undelivered;
        if(action.replacesIarId){const original=get(next.iars,action.replacesIarId);if(original.orderId!==o.id||!original.inspectedBy)throw Error("Replacement must link to an inspected delivery on this PO.");const originalLine=deliveryLines(next,original).find(n=>n.itemId===l.itemId);const replaced=next.iars.filter(i=>i.replacesIarId===original.id).flatMap(i=>deliveryLines(next,i)).filter(n=>n.itemId===l.itemId).reduce((n,l)=>n+l.delivered,0);maximum=originalLine?originalLine.delivered-originalLine.accepted-replaced:0;}
        if(l.delivered>maximum)throw Error("Delivered quantity exceeds the remaining order or replacement quantity.");
      }
      if(!receiptLines.length)throw Error("Enter at least one delivered item.");
      next.iars.unshift({
        id: action.id,
        orderId: action.orderId,
        reference: action.reference,
        deliveryReference: action.deliveryReference,
        date: action.date,
        delivered: receiptLines.reduce((n,l)=>n+l.delivered,0),
        accepted: receiptLines.reduce((n,l)=>n+l.accepted,0),
        unitCost:receiptLines.length===1?receiptLines[0].unitCost:undefined,
        findings: action.findings,
        attachments: action.attachments,
        assetTags: action.assetTags,
        lineSnapshot: printIdentity(get(next.items,o.itemId)),
        form: action.form ? validateFormFields("iar",action.form) as IARFormFields : undefined,
        lines:action.lines?receiptLines.map(l=>({...l,snapshot:structuredClone(orderLines(o).find(n=>n.itemId===l.itemId)?.snapshot??printIdentity(get(next.items,l.itemId)))})):undefined,
        damaged:action.damaged,
        replacesIarId:action.replacesIarId,
      })
      break
    }
    case "inspect": {
      const i = get(next.iars, action.id)
      if (i.inspectedBy) throw Error("Inspection already acknowledged.")
      required(action.person, "Inspection Officer")
      i.inspectedBy = action.person
      i.inspectedAt = now
      break
    }
    case "accept": {
      const i = get(next.iars, action.id)
      if (!i.inspectedBy)
        throw Error("Inspection Officer must complete inspection before acceptance.")
      if (i.acceptedBy) throw Error("Acceptance already acknowledged.")
      required(action.person, "Supply and Property Custodian")
      i.acceptedBy = action.person
      i.acceptedAt = now
      if (deliveryLines(next, i).some(l => l.accepted > 0))
        postAcceptedReceipt(i, `RCPT-${i.id}`, action.person);
      break
    }
    case "receipt": {
      postAcceptedReceipt(get(next.iars, action.id), action.postingId, action.person);
      break;
    }
    case "ris": {
      unique(next.ris, action.id)
      const r = get(next.requests, action.requestId)
      if (!r.approvedBy)
        throw Error(
          "Record the request's applicable approval before preparing RIS.",
        )
      required(action.reference, "RIS control number")
      required(action.person, "Requesting personnel")
      required(action.approvalReference, "Applicable approval reference")
      dateRequired(action.date)
      if (
        next.ris.some(
          (s) =>
            s.reference.trim().toLowerCase() ===
            action.reference.trim().toLowerCase(),
        )
      )
        throw Error("Duplicate RIS control number.")
      if (next.ris.some((s) => s.requestId === r.id && !s.cancelled))
        throw Error(
          "A live RIS already exists for this request. Use partial releases or cancel it before creating a replacement.",
        )
      next.ris.unshift({
        id: action.id,
        requestId: action.requestId,
        reference: action.reference,
        date: action.date,
        person: action.person,
        approvalReference: action.approvalReference,
        lineSnapshots: Object.fromEntries(r.lines.map(l=>[l.itemId,printIdentity(get(next.items,l.itemId))])),
        form: action.form ? validateFormFields("ris",action.form) as RISFormFields : undefined,
        availableQuantities: Object.fromEntries(r.lines.map(l=>[l.itemId,get(next.items,l.itemId).quantity])),
        requestedQuantities: Object.fromEntries(r.lines.map(l=>[l.itemId,availability(next,l,r.id).outstanding])),
      })
      break
    }
    case "release": {
      unique(next.releases, action.id)
      const s = get(next.ris, action.risId)
      if (s.cancelled) throw Error("Cannot release against a cancelled RIS.")
      const request = get(next.requests, s.requestId)
      const line = request.lines.find((l) => l.itemId === action.itemId)
      if (!line) throw Error("Item must be requested on the linked RIS.")
      quantity(action.quantity)
      required(action.person, "Released by")
      required(action.recipient, "Recipient acknowledgment")
      dateRequired(action.date)
      if (action.quantity > availability(next, line, request.id).outstanding)
        throw Error("Release exceeds the requested outstanding quantity.")
      const item = writableItem(next, action.itemId)
      let unitCost = item.unitCost
      if (item.costMethod === "Specific") {
        const asset = item.assets?.find((a) => a.tag === action.assetTag)
        if (action.quantity !== 1 || !asset)
          throw Error(
            "Select one available asset tag for a specifically valued release.",
          )
        unitCost = asset.cost
        item.assets = item.assets!.filter((a) => a.tag !== asset.tag)
        item.serials = item.assets.map((a) => a.tag)
      }
      cost(unitCost)
      const value = action.quantity * unitCost!
      movement(
        item,
        -action.quantity,
        -value,
        "Stock Out",
        s.reference,
        action.person,
        action.date,
        s.id,
        action.id,
        request.job,
        `Recipient acknowledged: ${action.recipient}`,
        s.form?.office ?? s.form?.division ?? "",
      )
      next.releases.unshift({
        id: action.id,
        risId: s.id,
        itemId: item.id,
        quantity: action.quantity,
        unitCost: unitCost!,
        value,
        person: action.person,
        recipient: action.recipient,
        date: action.date,
        assetTag: action.assetTag,
      })
      break
    }
    case "cancel-ris": {
      get(next.ris, action.id).cancelled = true
      break
    }
    case "return": {
      unique(next.returns, action.id)
      const r = get(next.releases, action.releaseId)
      quantity(action.quantity)
      required(action.person, "Return received by")
      required(action.reason, "Return reason")
      dateRequired(action.date)
      if (r.assetTag && action.quantity !== 1)
        throw Error(
          "Return one whole individually tracked asset; fractional asset returns are not allowed.",
        )
      const returned = next.returns
        .filter((t) => t.releaseId === r.id)
        .reduce((s, t) => s + t.quantity, 0)
      if (action.quantity > r.quantity - returned)
        throw Error("Return quantity exceeds the unreturned release quantity.")
      if (!["Usable", "Damaged"].includes(action.condition))
        throw Error("A valid return condition is required.")
      const record: MaterialReturn = {
        id: action.id,
        releaseId: r.id,
        quantity: action.quantity,
        condition: action.condition,
        accepted: false,
        person: action.person,
        date: action.date,
        reason: action.reason,
        credit: 0,
      }
      next.returns.unshift(record)
      if (action.accepted) acceptReturn(record, action.person)
      break
    }
    case "accept-return": {
      const r = get(next.returns, action.id)
      if (r.accepted) throw Error("Return already accepted.")
      required(action.person, "Accepted by")
      acceptReturn(r, action.person)
      break
    }
    case "count": {
      unique(next.counts, action.id)
      const i = writableItem(next, action.itemId)
      quantity(action.counted, true)
      required(action.person, "Counted by")
      dateRequired(action.date)
      next.counts.unshift({
        id: action.id,
        itemId: i.id,
        recorded: i.quantity,
        counted: action.counted,
        variance: clean(action.counted - i.quantity),
        person: action.person,
        date: action.date,
        lastPostingId:
          next.transactions.find((t) => t.itemId === i.id)?.id ?? "",
      })
      break
    }
    case "correct-count": {
      const c = get(next.counts, action.id)
      if (c.correctedBy) throw Error("This count was already corrected.")
      required(action.person, "Correction recorded by")
      required(action.reason, "Investigation findings")
      required(action.reference, "Authorization reference")
      const i = writableItem(next, c.itemId)
      if (
        i.quantity !== c.recorded ||
        c.lastPostingId !==
          (next.transactions.find((t) => t.itemId === i.id)?.id ?? "")
      )
        throw Error(
          "Stock has changed since this count. Record a new physical count.",
        )
      if (!c.variance) throw Error("No discrepancy to correct.")
      if (i.costMethod === "Specific")
        throw Error(
          "Individually tracked assets require asset-level investigation; do not post a bulk count correction.",
        )
      cost(i.unitCost)
      movement(
        i,
        c.variance,
        c.variance * i.unitCost!,
        "Adjustment",
        action.reference,
        action.person,
        c.date,
        c.id,
        `COR-${c.id}`,
        undefined,
        action.reason,
      )
      c.correctedBy = action.person
      c.correctedAt = now
      c.reason = action.reason
      c.reference = action.reference
      break
    }
    case "item": {
      const i = action.item
      required(i.code, "Item code")
      required(i.name, "Item name")
      required(i.category, "Category")
      required(i.unit, "Unit")
      quantity(i.minimum, true)
      if (
        next.items.some(
          (x) =>
            x.id !== i.id &&
            x.code.trim().toLowerCase() === i.code.trim().toLowerCase(),
        )
      )
        throw Error("Duplicate item code; use the existing inventory record.")
      const existing = next.items.find((x) => x.id === i.id)
      if (existing) {
        if (
          i.unit !== existing.unit &&
          (next.transactions.some((t) => t.itemId === i.id)||next.purchaseRequests?.some(p=>p.lines.some(l=>l.itemId===i.id))||next.orders.some(o=>orderLines(o).some(l=>l.itemId===i.id))||next.ris.some(r=>r.lineSnapshots?.[i.id]))
        )
          throw Error("Unit of measure cannot change after procurement progression or recorded movements.")
        Object.assign(existing, {
          ...i,
          quantity: existing.quantity,
          unitCost: existing.unitCost,
          inventoryValue: existing.inventoryValue,
          assets: existing.assets,
          costMethod: existing.costMethod,
          serials: existing.serials,
          stockCardForm: existing.stockCardForm,
        })
      } else {
        if (i.quantity !== 0)
          throw Error(
            "Create new items with zero stock, then receive them through an accepted IAR.",
          )
        next.items.unshift({
          ...i,
          inventoryValue: 0,
          unitCost: undefined,
          assets: [],
          serials: [],
        })
      }
      break
    }
    case "billing": {
      required(action.job, "Job")
      quantity(action.markup, true)
      quantity(action.fees, true)
      quantity(action.tax, true)
      if (action.markup > 100 || action.tax > 100)
        throw Error("Percentage rates must be between 0 and 100.")
      next.billing = next.billing.filter((b) => b.job !== action.job)
      next.billing.push({
        job: action.job,
        markup: action.markup,
        fees: action.fees,
        tax: action.tax,
      })
      break
    }
  }
  function acceptReturn(record: MaterialReturn, person: string) {
    const release = get(next.releases, record.releaseId)
    const ris = get(next.ris, release.risId)
    const job = get(next.requests, ris.requestId).job
    if (record.condition === "Usable") {
      const item = writableItem(next, release.itemId)
      if (item.costMethod === "Specific") {
        if (!release.assetTag || record.quantity !== 1)
          throw Error("Return the originally issued asset tag.")
        if (item.assets?.some((a) => a.tag === release.assetTag))
          throw Error("Asset tag already in stock.")
        item.assets = [
          ...(item.assets ?? []),
          { tag: release.assetTag, cost: release.unitCost },
        ]
        item.serials = item.assets.map((a) => a.tag)
      }
      record.credit = record.quantity * release.unitCost
      movement(
        item,
        record.quantity,
        record.credit,
        "Return",
        ris.reference,
        person,
        record.date,
        record.id,
        `RET-${record.id}`,
        job,
        `${record.reason}; original release ${release.id}`,
      )
    }
    record.accepted = true
    record.person = person
  }
  next.revision++
  return next
}
