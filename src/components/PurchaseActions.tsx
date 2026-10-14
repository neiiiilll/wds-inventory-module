import {useState} from "react";
import {currentPRReviewer,money,newId,nextProcurementReference,orderLines,procurementTotal,type Attachment,type PurchaseOrder,type PurchaseRequest,type WorkflowAction,type WorkflowState} from "../services/workflow";
import {AttachmentInput,WField,WForm,WInput,WSelect,WText,today} from "./WorkflowUI";

export function PurchaseOrderEditor({state,onAction,onClose}:{state:WorkflowState;onAction:(a:WorkflowAction)=>boolean;onClose:()=>void}) {
  const [prId,setPrId]=useState("");const [date,setDate]=useState(today());const [lines,setLines]=useState<PurchaseRequest["lines"]>([]);const [attachments,setAttachments]=useState<Attachment[]>([]);
  const remaining=(pr:PurchaseRequest,itemId:string)=>Math.max(0,(pr.lines.find(l=>l.itemId===itemId)?.quantity??0)-state.orders.filter(o=>o.purchaseRequestId===pr.id).flatMap(orderLines).filter(l=>l.itemId===itemId).reduce((n,l)=>n+l.quantity,0));
  const eligible=(state.purchaseRequests??[]).filter(p=>p.workflowVersion===1&&p.status==="Approved"&&p.approvedBy&&p.lines.some(l=>remaining(p,l.itemId)>0));
  const pr=eligible.find(p=>p.id===prId);
  const total=procurementTotal(lines.filter(l=>l.quantity>0));
  return <WForm onClose={onClose} submit="Create purchase order" disabled={!pr||!lines.some(l=>l.quantity>0)} onSubmit={()=>{
    const chosen=lines.filter(l=>l.quantity>0);if(!pr||!chosen.length)return;
    if(onAction({type:"order",id:newId("po"),requestId:pr.requestId,purchaseRequestId:pr.id,reference:nextProcurementReference(state,"PO",date),date,supplier:pr.supplier!,itemId:chosen[0].itemId,quantity:chosen[0].quantity,lines:chosen,attachments}))onClose();
  }}>
    <WField label="PO reference"><WInput readOnly value={date?nextProcurementReference(state,"PO",date):""}/></WField>
    <WField label="PO date"><WInput required type="date" value={date} onChange={e=>setDate(e.target.value)}/></WField>
    <WField label="Approved Purchase Request"><WSelect required value={prId} onChange={e=>{setPrId(e.target.value);const p=eligible.find(p=>p.id===e.target.value);setLines(p?.lines.map(l=>({...l,quantity:remaining(p,l.itemId)}))??[]);}}><option value="">Select a fully approved PR</option>{eligible.map(p=><option key={p.id} value={p.id}>{p.reference} · {p.supplier} · {p.job}</option>)}</WSelect></WField>
    <WField label="Approved supplier"><WInput readOnly value={pr?.supplier??""}/></WField>
    {pr&&<div className="workflow-full table-wrap"><table><thead><tr><th>Approved item / specification</th><th>Unit</th><th>Available to order</th><th>Quantity ordered</th><th>Approved unit price</th><th>Amount</th></tr></thead><tbody>{lines.map((line,index)=><tr key={line.itemId}><td>{line.snapshot?.description}<small className="cell-sub">{line.specification}</small></td><td>{line.snapshot?.unit}</td><td>{remaining(pr,line.itemId)}</td><td><WInput aria-label={`PO quantity ${line.snapshot?.description}`} type="number" min="0" max={remaining(pr,line.itemId)} step="any" value={line.quantity} onChange={e=>setLines(rows=>rows.map((row,n)=>n===index?{...row,quantity:Number(e.target.value)}:row))}/></td><td>{money(line.unitPrice!)}</td><td>{money(line.quantity*line.unitPrice!)}</td></tr>)}</tbody><tfoot><tr><td colSpan={5}><strong>PO items total</strong></td><td>{total===undefined?"—":money(total)}</td></tr></tfoot></table></div>}
    {!eligible.length&&<p className="workflow-full">No priced PR has completed all required approvals with quantities remaining to order.</p>}
    <AttachmentInput value={attachments} onChange={setAttachments}/>
  </WForm>;
}

export function PRReviewForm({pr,onAction,onClose}:{pr:PurchaseRequest;onAction:(a:WorkflowAction)=>boolean;onClose:()=>void}) {
  const step=currentPRReviewer(pr);const [decision,setDecision]=useState<"Approved"|"Returned"|"Rejected">("Approved");const [reason,setReason]=useState("");const [reference,setReference]=useState("");
  if(!step)return <p>No review stage is currently awaiting a decision.</p>;
  return <WForm onClose={onClose} submit="Record review decision" onSubmit={()=>{if(onAction({type:"review-purchase-request",id:pr.id,revision:pr.revision??0,stageId:step.id,person:step.reviewer,decision,reason,reference:reference||undefined}))onClose();}}>
    <WField label="Current review stage"><WInput readOnly value={step.label}/></WField><WField label="Assigned reviewer"><WInput readOnly value={step.reviewer}/></WField>
    <WField label="Review decision"><WSelect value={decision} onChange={e=>setDecision(e.target.value as typeof decision)}><option value="Approved">Approve</option><option value="Returned">Return for revision</option><option value="Rejected">Reject</option></WSelect></WField>
    <WField label="Decision reference"><WInput value={reference} onChange={e=>setReference(e.target.value)}/></WField>
    <div className="workflow-full"><WField label="Reason for decision"><WText required autoFocus value={reason} onChange={e=>setReason(e.target.value)}/></WField></div>
  </WForm>;
}

export function PODispatchForm({order,person,onAction,onClose}:{order:PurchaseOrder;person:string;onAction:(a:WorkflowAction)=>boolean;onClose:()=>void}) {
  const [date,setDate]=useState(today());const [recipient,setRecipient]=useState(order.supplier);const [method,setMethod]=useState("Email");const [reference,setReference]=useState("");const [reason,setReason]=useState("");
  return <WForm onClose={onClose} submit="Record PO dispatch" onSubmit={()=>{if(onAction({type:"dispatch-order",id:order.id,date,recipient,method,reference,person,reason}))onClose();}}>
    <WField label="Dispatch date"><WInput required type="date" min={order.date} value={date} onChange={e=>setDate(e.target.value)}/></WField>
    <WField label="Supplier recipient / contact"><WInput required value={recipient} onChange={e=>setRecipient(e.target.value)}/></WField>
    <WField label="Dispatch method"><WSelect value={method} onChange={e=>setMethod(e.target.value)}>{["Email","Hand delivery","Courier","Supplier portal","Other"].map(m=><option key={m}>{m}</option>)}</WSelect></WField>
    <WField label="Dispatch reference / evidence"><WInput required value={reference} onChange={e=>setReference(e.target.value)}/></WField>
    <WField label="Recorded by"><WInput readOnly value={person}/></WField>
    <WField label="Dispatch note"><WText required value={reason} onChange={e=>setReason(e.target.value)}/></WField>
  </WForm>;
}
