import {orderLines,purchaseRequestStatus,requestReference,type PurchaseOrder,type PurchaseRequest,type WorkflowState} from "../services/workflow";
import {PricedLines} from "./ProcurementDetails";
import {WButton,WDetail} from "./WorkflowUI";

export default function PurchasePrint({state,pr,order}:{state:WorkflowState;pr?:PurchaseRequest;order?:PurchaseOrder}) {
  const document=order??pr!;const request=state.requests.find(r=>r.id===document.requestId)!;
  return <><div className="workflow-form-actions purchase-print-toolbar"><WButton onClick={()=>window.print()}>Print / Save as PDF</WButton></div>
    <article className="purchase-print">
      <header><p>WDS</p><h1>{order?"PURCHASE ORDER":"PURCHASE REQUEST"}</h1><p>{document.reference} · {document.date}</p></header>
      <div className="workflow-details"><WDetail label="Material Request" value={requestReference(request)}/><WDetail label="Requesting personnel" value={pr?.person??request.person}/><WDetail label="Project / service connection" value={request.job}/><WDetail label="Supplier" value={order?.supplier??pr?.supplier??"Not recorded"}/>
        {order&&<WDetail label="Purchase Request" value={(state.purchaseRequests??[]).find(p=>p.id===order.purchaseRequestId)?.reference??"Earlier order"}/>}
        {pr&&<><WDetail label="Status" value={purchaseRequestStatus(state,pr)}/><WDetail label="Revision" value={pr.revision??0}/><WDetail label="Quotation reference" value={pr.quotationReference??"Not recorded"}/></>}
      </div>
      <PricedLines state={state} lines={order?orderLines(order):pr!.lines}/>
      {pr?.approvalRoute&&<><h3>Required reviews</h3><table><thead><tr><th>Stage</th><th>Assigned reviewer</th><th>Decision / date</th><th>Reason</th></tr></thead><tbody>{pr.approvalRoute.map(s=><tr key={s.id}><td>{s.label}</td><td>{s.reviewer}</td><td>{s.decision??"Pending"}{s.actedAt&&<small className="cell-sub">{new Date(s.actedAt).toLocaleDateString("en-PH",{timeZone:"Asia/Manila"})}</small>}</td><td>{s.reason??""}</td></tr>)}</tbody></table></>}
      {order?.dispatch&&<div className="workflow-details"><WDetail label="Dispatched on" value={order.dispatch.date}/><WDetail label="Supplier recipient" value={order.dispatch.recipient}/><WDetail label="Method / reference" value={`${order.dispatch.method} · ${order.dispatch.reference}`}/><WDetail label="Recorded by" value={order.dispatch.person}/></div>}
      <div className="purchase-print-signatures"><p>Prepared by: ________________________</p><p>Authorized by: ________________________</p><p>Supplier acknowledgment: ________________________</p></div>
    </article>
  </>;
}
