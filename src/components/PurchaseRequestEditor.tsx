import {useState} from "react";
import {availability,defaultApprovalRoute,money,newId,nextProcurementReference,quotationIsCurrent,requestLockReason,requestReference,type OrderLine,type PRApprovalStep,type PurchaseRequest,type WorkflowAction,type WorkflowState} from "../services/workflow";
import {WButton,WField,WForm,WInput,WNote,WSelect,WText,itemName,today} from "./WorkflowUI";

export default function PurchaseRequestEditor({state,initial,onAction,onClose,onQuotation}:{state:WorkflowState;initial?:PurchaseRequest;onAction:(a:WorkflowAction)=>boolean;onClose:()=>void;onQuotation:(requestId:string)=>void}) {
  const [requestId,setRequestId]=useState(initial?.requestId??"");const [date,setDate]=useState(initial?.date??today());const [quotationId,setQuotationId]=useState(initial?.quotationId??"");
  const [lines,setLines]=useState<OrderLine[]>(()=>structuredClone(initial?.lines??[]));const [route,setRoute]=useState<PRApprovalStep[]>(()=>initial?.approvalRoute?.map(({id,label,reviewer})=>({id,label,reviewer}))??defaultApprovalRoute());
  const [selectionReason,setSelectionReason]=useState(initial?.selectionReason??"");const [reason,setReason]=useState("");
  const request=state.requests.find(r=>r.id===requestId);
  const quotes=(state.quotations??[]).filter(q=>q.requestId===requestId&&quotationIsCurrent(state,q)&&q.date<=date&&(!q.validUntil||q.validUntil>=date));
  const quote=quotes.find(q=>q.id===quotationId);
  const selectQuote=(id:string)=>{setQuotationId(id);const q=quotes.find(q=>q.id===id);setLines(q?.lines.map(l=>({...l,quantity:Math.min(l.quantity,availability(state,request!.lines.find(n=>n.itemId===l.itemId)!,request!.id).shortage)}))??[]);};
  const total=quote?lines.reduce((n,l)=>n+l.quantity*(quote.lines.find(q=>q.itemId===l.itemId)?.unitPrice??0),0):0;
  const updateStep=(index:number,fields:Partial<PRApprovalStep>)=>setRoute(steps=>steps.map((step,n)=>n===index?{...step,...fields}:step));
  return <WForm onClose={onClose} submit={initial?"Save PR revision":"Create draft PR"} disabled={!quote||!lines.some(l=>l.quantity>0)} onSubmit={()=>{
    const chosen=lines.filter(l=>l.quantity>0);
    const action:WorkflowAction=initial?{type:"revise-purchase-request",id:initial.id,revision:initial.revision??0,date,quotationId,lines:chosen,approvalRoute:route,selectionReason,reason}:{type:"purchase-request",id:newId("pr"),reference:nextProcurementReference(state,"PR",date),requestId,date,person:request!.person,quotationId,lines:chosen,approvalRoute:route,selectionReason};
    if(onAction(action))onClose();
  }}>
    <WField label="PR reference"><WInput readOnly value={initial?.reference??(date?nextProcurementReference(state,"PR",date):"")}/></WField>
    <WField label="PR date"><WInput required type="date" value={date} onChange={e=>setDate(e.target.value)}/></WField>
    <WField label="Approved Material Request"><WSelect required disabled={!!initial} value={requestId} onChange={e=>{setRequestId(e.target.value);setQuotationId("");setLines([]);}}><option value="">Select a request</option>{state.requests.filter(r=>r.id===initial?.requestId||(r.approvedBy&&!requestLockReason(state,r.id))).map(r=><option key={r.id} value={r.id}>{requestReference(r)} · {r.job}</option>)}</WSelect></WField>
    <WField label="Requesting personnel"><WInput readOnly value={request?.person??""}/></WField>
    {request&&<div className="workflow-full"><div className="workflow-line-heading"><h3>Supplier quotation comparison</h3><WButton secondary onClick={()=>onQuotation(requestId)}>＋ Record quotation</WButton></div>
      <div className="table-wrap"><table><thead><tr><th>Supplier / quotation</th><th>Quoted quantities and unit prices</th><th>Terms / validity</th><th>Quoted items total</th></tr></thead><tbody>{quotes.map(q=><tr key={q.id}><td>{q.supplier}<small className="cell-sub">{q.reference}</small></td><td>{q.lines.map(l=><small key={l.itemId} className="cell-sub">{l.snapshot?.description} · {l.quantity} {l.snapshot?.unit} × {money(l.unitPrice!)}</small>)}</td><td>{q.terms||"Not specified"}<small className="cell-sub">{q.validUntil?`Valid until ${q.validUntil}`:"No expiry recorded"}</small></td><td>{money(q.lines.reduce((n,l)=>n+l.quantity*l.unitPrice!,0))}</td></tr>)}</tbody></table>{!quotes.length&&<p className="empty">Record a current supplier quotation for this request.</p>}</div>
    </div>}
    <WField label="Selected quotation"><WSelect required value={quotationId} onChange={e=>selectQuote(e.target.value)}><option value="">Select a supplier quotation</option>{quotes.map(q=><option key={q.id} value={q.id}>{q.supplier} · {q.reference}</option>)}</WSelect></WField>
    <WField label="Quotation selection reason"><WText required value={selectionReason} onChange={e=>setSelectionReason(e.target.value)}/></WField>
    {quote&&<div className="workflow-full table-wrap"><table><thead><tr><th>Material / specification</th><th>Approved requirement</th><th>On hand</th><th>To purchase</th><th>Approved unit price</th><th>Amount</th></tr></thead><tbody>{lines.map((line,index)=>{
      const approved=request!.lines.find(l=>l.itemId===line.itemId)!;const offered=quote.lines.find(l=>l.itemId===line.itemId)!;const limit=Math.min(offered.quantity,availability(state,approved,request!.id).outstanding);const name=line.snapshot?.description??itemName(state,line.itemId);
      return <tr key={line.itemId}><td>{name}<small className="cell-sub">{line.specification}</small></td><td>{approved.quantity} {line.snapshot?.unit}</td><td>{state.items.find(i=>i.id===line.itemId)?.quantity}</td><td><WInput aria-label={`PR quantity ${name}`} type="number" min="0" max={limit} step="any" value={line.quantity} onChange={e=>setLines(rows=>rows.map((row,n)=>n===index?{...row,quantity:Number(e.target.value)}:row))}/></td><td>{money(offered.unitPrice!)}</td><td>{money(line.quantity*offered.unitPrice!)}</td></tr>;
    })}</tbody><tfoot><tr><td colSpan={5}><strong>PR items total</strong></td><td>{money(total)}</td></tr></tfoot></table></div>}
    <div className="workflow-full"><div className="workflow-line-heading"><h3>Required review sequence</h3></div>
      <WNote>Requester submission starts the route. Each required reviewer acts in the order below.</WNote>
      {route.map((step,index)=><div className="procurement-route-row" key={step.id}><span>{index+1}</span><WField label={`Stage ${index+1}`}><WInput readOnly value={step.label}/></WField><WField label={`Assigned reviewer ${index+1}`}><WInput value={step.reviewer} onChange={e=>updateStep(index,{reviewer:e.target.value})}/></WField></div>)}
    </div>
    {initial&&<WField label="Reason for PR revision"><WText required value={reason} onChange={e=>setReason(e.target.value)}/></WField>}
  </WForm>;
}
