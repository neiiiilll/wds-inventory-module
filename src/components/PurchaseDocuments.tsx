import {useEffect,useState} from "react";
import {canQuoteRequest,canReceiveOrder,currentPRReviewer,money,orderLines,orderLineTotals,procurementTotal,purchaseOrderDeliveryStatus,purchaseOrderProcessingStatus,purchaseRequestStatus,quotationIsCurrent,requestReference,type WorkflowAction,type WorkflowState,type PurchaseOrder} from "../services/workflow";
import ProcurementSteps from "./ProcurementSteps";
import QuotationEditor from "./QuotationEditor";
import PurchaseRequestEditor from "./PurchaseRequestEditor";
import {PurchaseOrderEditor,PRReviewForm,PODispatchForm} from "./PurchaseActions";
import {PricedLines,ProcurementHistory} from "./ProcurementDetails";
import PurchasePrint from "./PurchasePrint";
import {AttachmentLinks,WBadge,WButton,WDetail,WField,WForm,WInput,WModal,WNote,itemName,today} from "./WorkflowUI";
import { canMutateWorkflow, type AppRole } from "../services/access-control";

export function OrderComparison({state,order}:{state:WorkflowState;order:PurchaseOrder}){
  return <div className="table-wrap"><table><thead><tr><th>Ordered material / specification</th><th>Unit</th><th>Ordered</th><th>Original delivered</th><th>Acceptable</th><th>Accepted</th><th>Undelivered</th><th>Damaged</th><th>Other rejected</th><th>Return required</th><th>Returned</th><th>Replacement pending</th><th>Posted</th></tr></thead><tbody>{orderLines(order).map(l=>{const t=orderLineTotals(state,order,l.itemId);return <tr key={l.itemId}><td><strong>{l.snapshot?.description??itemName(state,l.itemId)}</strong><small className="cell-sub">{l.snapshot?.stockNo}{l.specification?` · ${l.specification}`:""}</small></td><td>{l.snapshot?.unit??state.items.find(i=>i.id===l.itemId)?.unit}</td><td>{l.quantity}</td><td>{t.originalDelivered}{t.delivered>t.originalDelivered&&<small className="cell-sub">+ {t.delivered-t.originalDelivered} replacement</small>}</td><td>{t.acceptable}</td><td>{t.accepted}</td><td>{t.undelivered}</td><td>{t.damaged}</td><td>{t.rejected-t.damaged}</td><td>{t.returnRequired}</td><td>{t.returned}</td><td>{t.replacementPending}</td><td>{t.posted}</td></tr>})}</tbody></table></div>;
}

export default function PurchaseDocuments({kind,state,role,currentPersonnel,onAction,onNavigate,onInspectOrder}:{
  kind:"pr"|"po";state:WorkflowState;role:AppRole;currentPersonnel:string;onAction:(a:WorkflowAction)=>boolean;
  onNavigate:(section:"requests"|"purchase-requests"|"procurement"|"inspection")=>void;onInspectOrder:(orderId:string)=>void;
}) {
  const [mode,setMode]=useState<""|"new"|"view"|"revise"|"review"|"dispatch"|"print"|"legacy-approve">("");
  const [selected,setSelected]=useState("");const [quoteFor,setQuoteFor]=useState<string|null>(null);const [quoteView,setQuoteView]=useState("");
  const [legacyApprover,setLegacyApprover]=useState("");const [legacyReference,setLegacyReference]=useState("");
  const canEdit=canMutateWorkflow(role);const prs=state.purchaseRequests??[];
  useEffect(()=>{if(!canEdit){setQuoteFor(null);if(["new","revise","review","dispatch","legacy-approve"].includes(mode))setMode(selected?"view":"");}},[canEdit,mode,selected]);
  const pr=prs.find(p=>p.id===selected);const order=state.orders.find(o=>o.id===selected);const quotation=state.quotations?.find(q=>q.id===quoteView);
  const title=kind==="pr"?"Purchase Request":"Purchase Order";
  const open=(id:string)=>{setSelected(id);setMode("view");};
  const close=()=>setMode("");
  const hasOpenQuantity=order&&orderLines(order).some(l=>{const t=orderLineTotals(state,order,l.itemId);return t.undelivered>0||t.replacementPending>0;});
  const selectedQuote=pr&&state.quotations?.find(q=>q.id===pr.quotationId);
  return <>
    <div className="page-header"><div><span className="eyebrow">PROCUREMENT</span><h1>{title}</h1><p>{kind==="pr"?"Compare supplier quotations, submit priced requirements, and follow the required reviews.":"Prepare approved orders, record supplier dispatch, and track deliveries through acceptance."}</p></div><div className="page-actions">
      {canEdit&&kind==="pr"&&<WButton secondary disabled={!state.requests.some(r=>canQuoteRequest(state,r))} onClick={()=>setQuoteFor("")}>＋ Supplier quotation</WButton>}
      {canEdit&&<WButton onClick={()=>{setSelected("");setMode("new");}}>＋ New {title.toLowerCase()}</WButton>}
    </div></div>
    <ProcurementSteps current={kind==="pr"?"purchase-requests":"procurement"} onNavigate={onNavigate}/>
    <section className="panel workflow-register"><div className="panel-head"><div><h2>{title} register</h2><p>{kind==="pr"?`${prs.length} purchase requests`:`${state.orders.length} purchase orders`}</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Reference / date</th><th>Material Request</th><th>{kind==="pr"?"Requester / supplier":"Supplier"}</th><th>Ordered items / quantities</th><th>Items total</th><th>{kind==="pr"?"PR status":"Delivery status"}</th><th>{kind==="pr"?"Pending reviewer":"Processing status"}</th><th></th></tr></thead><tbody>
        {kind==="pr"?prs.map(p=>{
          const reviewer=currentPRReviewer(p);const total=procurementTotal(p.lines);
          return <tr key={p.id}><td><strong>{p.reference}</strong><small className="cell-sub">{p.date}{p.workflowVersion===1?` · Revision ${p.revision??0}`:" · Earlier record"}</small></td><td>{requestReference(state.requests.find(r=>r.id===p.requestId)!)}</td><td>{p.person}<small className="cell-sub">{p.supplier??"Supplier not recorded"}</small></td><td>{p.lines.map(l=><small className="cell-sub" key={l.itemId}>{l.snapshot?.description??itemName(state,l.itemId)} · {l.quantity} {l.snapshot?.unit}</small>)}</td><td>{total===undefined?"Not recorded":money(total)}</td><td><WBadge>{purchaseRequestStatus(state,p)}</WBadge></td><td>{reviewer?`${reviewer.label} · ${reviewer.reviewer}`:p.status==="Draft"?"Requester submission":p.status==="Returned"?"Requester revision":"—"}</td><td><WButton secondary onClick={()=>open(p.id)}>Open →</WButton></td></tr>;
        }):state.orders.map(o=>{
          const total=procurementTotal(orderLines(o));return <tr key={o.id}><td><strong>{o.reference}</strong><small className="cell-sub">{o.date}</small></td><td>{requestReference(state.requests.find(r=>r.id===o.requestId)!)}</td><td>{o.supplier}<small className="cell-sub">{o.dispatch?`Sent ${o.dispatch.date}`:o.dispatchRequired?"Not sent":"Earlier dispatch not recorded"}</small></td><td>{orderLines(o).map(l=><div key={l.itemId}><strong>{l.snapshot?.description??itemName(state,l.itemId)}</strong><small className="cell-sub">{l.quantity} {l.snapshot?.unit??state.items.find(i=>i.id===l.itemId)?.unit}</small></div>)}</td><td>{total===undefined?"Not recorded":money(total)}</td><td><WBadge>{purchaseOrderDeliveryStatus(state,o)}</WBadge></td><td>{purchaseOrderProcessingStatus(state,o)}</td><td><WButton secondary onClick={()=>open(o.id)}>Open →</WButton></td></tr>;
        })}
      </tbody></table>{!(kind==="pr"?prs.length:state.orders.length)&&<div className="empty">No records yet.</div>}</div>
    </section>
    {kind==="pr"&&<section className="panel workflow-register"><div className="panel-head"><div><h2>Supplier quotations</h2><p>Keep supplier offers linked to the approved material requirement.</p></div></div><div className="table-wrap"><table><thead><tr><th>Supplier / quotation</th><th>Material Request</th><th>Quoted items total</th><th>Validity</th><th>Requirement version</th><th></th></tr></thead><tbody>{(state.quotations??[]).map(q=><tr key={q.id}><td>{q.supplier}<small className="cell-sub">{q.reference} · {q.date}</small></td><td>{requestReference(state.requests.find(r=>r.id===q.requestId)!)}</td><td>{money(procurementTotal(q.lines)??0)}</td><td>{q.validUntil??"No expiry recorded"}{q.validUntil&&q.validUntil<today()&&<small className="cell-sub">Expired</small>}</td><td>{quotationIsCurrent(state,q)?"Current":"Earlier MR revision / unit"}</td><td><WButton secondary onClick={()=>setQuoteView(q.id)}>View quotation</WButton></td></tr>)}</tbody></table>{!state.quotations?.length&&<p className="empty">No quotations recorded.</p>}</div></section>}
    {canEdit&&(mode==="new"||mode==="revise")&&<WModal title={kind==="pr"?(mode==="revise"?`Revise ${pr!.reference}`:"New purchase request"):"New purchase order"} onClose={close}>
      {kind==="pr"?<PurchaseRequestEditor state={state} initial={mode==="revise"?pr:undefined} onAction={onAction} onClose={()=>setMode(mode==="revise"?"view":"")} onQuotation={setQuoteFor}/>:<PurchaseOrderEditor state={state} onAction={onAction} onClose={close}/>}
    </WModal>}
    {mode==="view"&&(pr||order)&&<WModal title={kind==="pr"?pr!.reference:order!.reference} onClose={close}>
      {kind==="pr"?<>
        <div className="workflow-details"><WDetail label="Requesting personnel" value={pr!.person}/><WDetail label="Job / service connection" value={pr!.job}/><WDetail label="Status" value={purchaseRequestStatus(state,pr!)}/><WDetail label="Revision" value={pr!.revision??"Earlier record"}/><WDetail label="Selected supplier" value={pr!.supplier??"Not recorded"}/><WDetail label="Quotation reference" value={pr!.quotationReference??"Not recorded"}/><WDetail label="Selection reason" value={pr!.selectionReason??"Not recorded"}/>{selectedQuote?.terms&&<WDetail label="Quotation terms / price basis" value={selectedQuote.terms}/>}</div>
        <PricedLines state={state} lines={pr!.lines}/>
        {pr!.workflowVersion===1?<><h3 className="workflow-subtitle">Approval sequence</h3><ol className="procurement-review-route"><li><strong>Requester submission</strong><span>{pr!.history?.some(h=>h.kind==="Submitted"&&h.revision===(pr!.revision??0))?"Submitted":"Draft · awaiting submission"}</span></li>{pr!.approvalRoute?.map(step=><li key={step.id} className={currentPRReviewer(pr!)?.id===step.id?"review-pending":""}><strong>{step.label}</strong><span>{step.reviewer||"Assign reviewer before submission"}</span><WBadge>{step.decision??(currentPRReviewer(pr!)?.id===step.id?"Pending review":"Waiting")}</WBadge>{step.actedAt&&<small>{new Date(step.actedAt).toLocaleString("en-PH",{timeZone:"Asia/Manila"})}</small>}{step.reason&&<p>{step.reason}</p>}</li>)}</ol><h3 className="workflow-subtitle">Decision and revision history</h3><ProcurementHistory events={pr!.history}/></>:<WNote>Earlier PR: staged reviews and quotation prices were not recorded. Existing approval: {pr!.approvedBy??"Pending"} · {pr!.approvalReference??"No reference recorded"}. Use a linked additional MR for new procurement.</WNote>}
        <div className="workflow-form-actions">
          {canEdit&&pr!.workflowVersion===1&&(pr!.status==="Draft"||pr!.status==="Returned")&&<WButton secondary onClick={()=>setMode("revise")}>Edit / revise PR</WButton>}
          {canEdit&&pr!.status==="Draft"&&<WButton onClick={()=>onAction({type:"submit-purchase-request",id:pr!.id,revision:pr!.revision??0})}>Submit for review</WButton>}
          {canEdit&&currentPRReviewer(pr!)&&<WButton onClick={()=>setMode("review")}>Record current review</WButton>}
          {canEdit&&!pr!.workflowVersion&&!pr!.approvedBy&&<WButton onClick={()=>{setLegacyApprover("");setLegacyReference("");setMode("legacy-approve");}}>Record earlier PR approval</WButton>}
          <WButton secondary onClick={()=>setMode("print")}>Print PR</WButton><WButton secondary onClick={()=>{close();onNavigate("procurement");}}>Purchase Orders →</WButton>
        </div>
      </>:<>
        <div className="workflow-details"><WDetail label="Supplier" value={order!.supplier}/><WDetail label="Purchase Request" value={prs.find(p=>p.id===order!.purchaseRequestId)?.reference??"Earlier order"}/><WDetail label="Dispatch status" value={order!.dispatch?"Sent to supplier":order!.dispatchRequired?"Awaiting dispatch":"Earlier dispatch not recorded"}/><WDetail label="Delivery status" value={purchaseOrderDeliveryStatus(state,order!)}/><WDetail label="Processing status" value={purchaseOrderProcessingStatus(state,order!)}/></div>
        <h3 className="workflow-subtitle">Approved order prices</h3><PricedLines state={state} lines={orderLines(order!)}/><AttachmentLinks values={order!.attachments}/>
        {order!.dispatch&&<div className="workflow-details"><WDetail label="Dispatched on" value={order!.dispatch.date}/><WDetail label="Supplier recipient" value={order!.dispatch.recipient}/><WDetail label="Dispatch method" value={order!.dispatch.method}/><WDetail label="Dispatch reference" value={order!.dispatch.reference}/><WDetail label="Recorded by" value={order!.dispatch.person}/></div>}
        <h3 className="workflow-subtitle">Ordered items and delivery comparison</h3><OrderComparison state={state} order={order!}/>
        <h3 className="workflow-subtitle">PO history</h3><ProcurementHistory events={order!.history}/>
        <div className="workflow-form-actions"><WButton secondary onClick={()=>setMode("print")}>Print purchase order</WButton>{canEdit&&!order!.dispatch&&order!.dispatchRequired&&<WButton onClick={()=>setMode("dispatch")}>Record dispatch to supplier</WButton>}{canEdit&&<WButton disabled={!hasOpenQuantity||!canReceiveOrder(order!)} onClick={()=>{close();onInspectOrder(order!.id);}}>Record delivery / IAR</WButton>}<WButton secondary onClick={()=>{close();onNavigate("inspection");}}>Inspection and Acceptance →</WButton></div>
      </>}
    </WModal>}
    {canEdit&&mode==="review"&&pr&&<WModal title={`Review ${pr.reference}`} onClose={()=>setMode("view")}><PRReviewForm pr={pr} onAction={onAction} onClose={()=>setMode("view")}/></WModal>}
    {canEdit&&mode==="dispatch"&&order&&<WModal title={`Dispatch ${order.reference}`} onClose={()=>setMode("view")}><PODispatchForm order={order} person={currentPersonnel} onAction={onAction} onClose={()=>setMode("view")}/></WModal>}
    {mode==="print"&&(pr||order)&&<WModal title={`Print ${kind==="pr"?pr!.reference:order!.reference}`} onClose={()=>setMode("view")}><PurchasePrint state={state} pr={kind==="pr"?pr:undefined} order={kind==="po"?order:undefined}/></WModal>}
    {canEdit&&quoteFor!==null&&<WModal title="Record supplier quotation" onClose={()=>setQuoteFor(null)}><QuotationEditor state={state} initialRequestId={quoteFor||undefined} onAction={onAction} onClose={()=>setQuoteFor(null)}/></WModal>}
    {quotation&&<WModal title={`Quotation ${quotation.reference}`} onClose={()=>setQuoteView("")}><div className="workflow-details"><WDetail label="Supplier" value={quotation.supplier}/><WDetail label="Quoted on" value={quotation.date}/><WDetail label="Valid until" value={quotation.validUntil??"Not specified"}/><WDetail label="Terms / price basis" value={quotation.terms??"Not specified"}/><WDetail label="Recorded by" value={quotation.recordedBy}/></div><PricedLines state={state} lines={quotation.lines}/><AttachmentLinks values={quotation.attachments}/></WModal>}
    {canEdit&&mode==="legacy-approve"&&pr&&<WModal title={`Earlier approval ${pr.reference}`} onClose={()=>setMode("view")}><WForm onClose={()=>setMode("view")} submit="Record earlier approval" onSubmit={()=>{if(onAction({type:"approve-purchase-request",id:pr.id,person:legacyApprover,reference:legacyReference}))setMode("view");}}><WField label="Approver"><WInput required value={legacyApprover} onChange={e=>setLegacyApprover(e.target.value)}/></WField><WField label="Approval reference"><WInput required value={legacyReference} onChange={e=>setLegacyReference(e.target.value)}/></WField></WForm></WModal>}
  </>;
}
