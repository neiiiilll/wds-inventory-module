import {useState} from "react";
import {canQuoteRequest,money,newId,requestReference,type Attachment,type WorkflowAction,type WorkflowState} from "../services/workflow";
import {AttachmentInput,WField,WForm,WInput,WSelect,WText,itemName,today} from "./WorkflowUI";

export default function QuotationEditor({state,initialRequestId,onAction,onClose}:{state:WorkflowState;initialRequestId?:string;onAction:(action:WorkflowAction)=>boolean;onClose:()=>void}) {
  const makeRows=(id:string)=>state.requests.find(r=>r.id===id)?.lines.map(l=>({...l,price:""}))??[];
  const [requestId,setRequestId]=useState(initialRequestId??"");
  const [rows,setRows]=useState(()=>makeRows(initialRequestId??""));
  const [supplier,setSupplier]=useState("");const [reference,setReference]=useState("");const [date,setDate]=useState(today());const [validUntil,setValidUntil]=useState("");const [terms,setTerms]=useState("");const [attachments,setAttachments]=useState<Attachment[]>([]);
  const complete=rows.some(l=>l.quantity>0)&&rows.filter(l=>l.quantity>0).every(l=>Number(l.price)>0);
  return <WForm onClose={onClose} submit="Record quotation" disabled={!complete} onSubmit={()=>{
    if(onAction({type:"quotation",id:newId("quote"),requestId,supplier,reference,date,validUntil:validUntil||undefined,terms,attachments,lines:rows.filter(l=>l.quantity>0).map(l=>({itemId:l.itemId,quantity:l.quantity,unitPrice:Number(l.price)}))}))onClose();
  }}>
    <WField label="Material Request"><WSelect required value={requestId} onChange={e=>{setRequestId(e.target.value);setRows(makeRows(e.target.value));}}><option value="">Select an approved request</option>{state.requests.filter(r=>canQuoteRequest(state,r)).map(r=><option key={r.id} value={r.id}>{requestReference(r)} · {r.job}</option>)}</WSelect></WField>
    <WField label="Supplier"><WInput required value={supplier} onChange={e=>setSupplier(e.target.value)}/></WField>
    <WField label="Supplier quotation reference"><WInput required value={reference} onChange={e=>setReference(e.target.value)}/></WField>
    <WField label="Quotation date"><WInput required type="date" value={date} onChange={e=>setDate(e.target.value)}/></WField>
    <WField label="Valid until"><WInput type="date" min={date} value={validUntil} onChange={e=>setValidUntil(e.target.value)}/></WField>
    <WField label="Price basis / delivery and payment terms"><WText value={terms} onChange={e=>setTerms(e.target.value)} placeholder="Record whether the supplier's prices include taxes or delivery charges."/></WField>
    {!!rows.length&&<div className="workflow-full table-wrap"><table><thead><tr><th>Requested material</th><th>Unit</th><th>Approved quantity</th><th>Quoted quantity</th><th>Unit price (PHP)</th><th>Quoted amount</th></tr></thead><tbody>{rows.map((line,index)=>{
      const original=state.requests.find(r=>r.id===requestId)!.lines.find(l=>l.itemId===line.itemId)!;
      const name=itemName(state,line.itemId);
      return <tr key={line.itemId}><td>{name}<small className="cell-sub">{line.specification}</small></td><td>{state.items.find(i=>i.id===line.itemId)?.unit}</td><td>{original.quantity}</td><td><WInput aria-label={`Quoted quantity ${name}`} type="number" min="0" max={original.quantity} step="any" value={line.quantity} onChange={e=>setRows(rows=>rows.map((row,n)=>n===index?{...row,quantity:Number(e.target.value)}:row))}/></td><td><WInput aria-label={`Quoted unit price ${name}`} required={line.quantity>0} type="number" min="0.00000001" step="any" value={line.price} onChange={e=>setRows(rows=>rows.map((row,n)=>n===index?{...row,price:e.target.value}:row))}/></td><td>{line.price?money(line.quantity*Number(line.price)):"—"}</td></tr>;
    })}</tbody><tfoot><tr><td colSpan={5}><strong>Quoted items total</strong></td><td>{complete?money(rows.reduce((n,l)=>n+l.quantity*Number(l.price),0)):"—"}</td></tr></tfoot></table></div>}
    <AttachmentInput value={attachments} onChange={setAttachments}/>
  </WForm>;
}
