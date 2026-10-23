import { useEffect, useState } from "react"
import ClientDocument from "./ClientDocument";
import {OrderComparison} from "./PurchaseDocuments";
import DeliveryEditor from "./DeliveryEditor";
import ProcurementSteps from "./ProcurementSteps";
import ExpectedDeliveries from "./ExpectedDeliveries";
import RequesterField from "./RequesterField";
import { canChangeRequester, canMutateWorkflow, type AppRole } from "../services/access-control"

import {
  availability,
  issuedFor,
  money,
  nextFormReference,
  nextProcurementReference,requestReference,requestLockReason,orderLines,deliveryLines,orderLineTotals,
  type MaterialRequest,
  orderTotals,
  requestStatus,
  requestFulfillmentStatus,
  risStatus,
  type Attachment,
  type RequestLine,
  type WorkflowAction,
  type WorkflowState,
} from "../services/workflow"

import {
  AttachmentInput,
  AttachmentLinks,
  controlNumber,
  itemName,
  today,
  WBadge,
  WButton,
  WDetail,
  WEmpty,
  WField,
  WForm,
  WInput,
  WModal,
  WNote,
  WSelect,
  WSummary,
  WText,
} from "./WorkflowUI"

export type WorkflowSection = "requests" | "procurement" | "inspection" | "stock-in" | "stock-out"

type Props = {
  currentPersonnel: string;
  initialOrderId?: string;
  section: WorkflowSection
  state: WorkflowState
  role: AppRole
  onAction: (action: WorkflowAction) => boolean
  onNavigate: (section: WorkflowSection|"purchase-requests") => void
}

const config: Record<WorkflowSection, {
  title: string
  description: string
  create: string
}> = {
  requests: {
    title: "Material Requests",
    description:
      "From maintenance requirements to approved materials, with every job connected.",
    create: "New request",
  },

  procurement: {
    title: "Procurement",
    description:
      "Purchase request shortages and track every delivery against its order.",
    create: "New purchase order",
  },

  inspection: {
    title: "Inspection & Acceptance",
    description:
      "Inspect deliveries, record findings, and acknowledge acceptance in sequence.",
    create: "Record delivery / IAR",
  },

  "stock-in": {
    title: "Accepted Receipts",
    description:
      "Accepted items enter stock automatically. Review receipts and recover earlier unposted records.",
    create: "Go to Inspection and Acceptance",
  },

  "stock-out": {
    title: "RIS & Material Issuance",
    description:
      "Document requested materials and acknowledge each actual release.",
    create: "Prepare RIS",
  },
}

const sections: WorkflowSection[] = [
  "requests",
  "procurement",
  "inspection",
  "stock-in",
  "stock-out",
]

export default function InventoryWorkflow({
  section,
  state,
  role,
  onAction,
  onNavigate,
  initialOrderId,
  currentPersonnel,
}: Props) {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState("")
  const [mode, setMode] = useState<"" | "new" | "edit" | "additional" | "release" | "ack" | "cancel" | "print" | "supplier-return">(
    initialOrderId ? "new" : "",
  )
  const [deliveryOrderId,setDeliveryOrderId]=useState(initialOrderId??"");

  const [ack, setAck] = useState({ person: "", reference: "" })
  const canEdit = canMutateWorkflow(role)

  useEffect(() => {
    if (!canEdit && mode && mode !== "print") setMode("")
  }, [canEdit, mode])

  const cfg = config[section]

  const close = () => {
    setSelected("")
    setMode("")
  }

  const perform = (action: WorkflowAction) => {
    if (!canEdit) return false
    const result = onAction(action)
    if (result) setMode("")
    return result
  }

  const filtered = <T,>(rows: T[]) =>
    rows.filter((r) =>
      JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
    )

  const requests = filtered(state.requests)
  const orders = filtered(
    state.orders.map((o) => ({
      ...o,
      itemName: itemName(state, o.itemId),
      job: state.requests.find((r) => r.id === o.requestId)?.job,
    })),
  )

  const iars = filtered(
    state.iars.filter(i=>section!=="stock-in"||!!i.acceptedBy).map((i) => ({
      ...i,
    itemName:deliveryLines(state,i).map(l=>itemName(state,l.itemId)).join(", "),
    })),
  )

  const slips = filtered(
    state.ris.map((s) => ({
      ...s,
      job: state.requests.find((r) => r.id === s.requestId)?.job,
    })),
  )

  const record =
    section === "requests"
      ? state.requests.find((r) => r.id === selected)
      : section === "procurement"
        ? state.orders.find((r) => r.id === selected)
        : section === "inspection" || section === "stock-in"
          ? state.iars.find((r) => r.id === selected)
          : state.ris.find((r) => r.id === selected)

  const openAck = (id: string) => {
    setSelected(id)
    setAck({ person: "", reference: "" })
    setMode("ack")
  }

  return (
    <>
      <div className="page-header">
        <div>
          <span className="eyebrow">{section==="requests"||section==="inspection"||section==="procurement"?"PROCUREMENT":"INVENTORY"}</span>
          <h1>{cfg.title}</h1>
          <p>{cfg.description}</p>
        </div>
        <div className="page-actions">
          {(section === "stock-in" || canEdit) && <WButton onClick={() => {if(section==="stock-in"){onNavigate("inspection");return;}setDeliveryOrderId("");setMode("new");}}>
            {section==="stock-in"?"": "＋ "}{cfg.create}
          </WButton>}
        </div>
      </div>
      {(section==="requests"||section==="procurement"||section==="inspection")&&<ProcurementSteps current={section} onNavigate={onNavigate}/>}
      <WSummary
        values={
          section === "requests"
            ? [
                {
                  label: "Material requests",
                  value: state.requests.length,
                  hint: "Linked to service connections & projects",
                },

                {
                  label: "Awaiting approval",
                  value: state.requests.filter((r) => !r.approvedBy).length,
                  hint: "Existing Management / GM arrangement",
                },

                {
                  label: "Requests with shortages",
                  value: state.requests.filter((r) =>
                    r.lines.some(
                      (l) => availability(state, l, r.id).shortage > 0,
                    ),
                  ).length,
                  hint: "Checking availability does not deduct stock",
                },

                {
                  label: "Fulfilled",
                  value: state.requests.filter(
                    (r) => requestFulfillmentStatus(state, r) === "Fully issued",
                  ).length,
                  hint: "All requested quantities released",
                },
              ]
            : section === "procurement"
              ? [
                  {
                    label: "Purchase orders",
                    value: state.orders.length,
                    hint: "Linked to original requirements",
                  },

                  {
                    label: "Awaiting deliveries",
                    value: state.orders.filter(
                      (o) => orderTotals(state, o).outstanding > 0,
                    ).length,
                    hint: "Includes partially delivered orders",
                  },

                  {
                    label: "Delivery records",
                    value: state.iars.length,
                    hint: "Delivered and accepted kept separate",
                  },

                  {
                    label: "Suppliers",
                    value: new Set(state.orders.map((o) => o.supplier)).size,
                    hint: "Supporting documents attached to orders",
                  },
                ]
              : section === "inspection" || section === "stock-in"
                ? [
                    {
                      label: "IAR records",
                      value: state.iars.length,
                      hint: "Every delivery has a control number",
                    },

                    {
                      label: "Awaiting inspection",
                      value: state.iars.filter((i) => !i.inspectedBy).length,
                      hint: "Inspection Officer acknowledges first",
                    },

                    {
                      label: "Awaiting acceptance",
                      value: state.iars.filter(
                        (i) => i.inspectedBy && !i.acceptedBy,
                      ).length,
                      hint: "Supply & Property Custodian follows",
                    },

                    {
                      label: "Ready to post",
                      value: state.iars.filter(
                        (i) => i.acceptedBy && !i.postingId && i.accepted > 0,
                      ).length,
                      hint: "Accepted quantities only",
                    },
                  ]
                : [
                    {
                      label: "RIS records",
                      value: state.ris.length,
                      hint: "Linked to approved material requests",
                    },

                    {
                      label: "Pending / partial",
                      value: state.ris.filter((s) =>
                        ["Pending", "Partially issued"].includes(
                          risStatus(state, s),
                        ),
                      ).length,
                      hint: "Outstanding quantities remain visible",
                    },

                    {
                      label: "Actual releases",
                      value: state.releases.length,
                      hint: "Each release deducts stock once",
                    },

                    {
                      label: "Material cost issued",
                      value: money(
                        state.releases.reduce((v, r) => v + r.value, 0),
                      ),
                      hint: state.sampleCosts
                        ? "Demo uses sample acquisition prices"
                        : "Issue costs locked at posting",
                    },
                  ]
        }
      />
      {!canEdit && (
        <WNote>
          Viewer access · You can inspect records and print documents. Changes
          require Inventory Staff or Administrator access.
        </WNote>
      )}
      {section==="inspection"&&<ExpectedDeliveries onOpenOrders={()=>onNavigate("procurement")} state={state} search={search} canEdit={canEdit} onRecord={orderId=>{setDeliveryOrderId(orderId);setMode("new");}}/>}
      <section className="panel">
        <div className="panel-head workflow-register-header">
          <div>
            <h2>{cfg.title} register</h2>
            <p>Select a record to view its links and next action.</p>
          </div>
          <div className="search-field">
            <WInput
              aria-label="Search workflow records"
              placeholder="Search document, item, job…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="table-wrap">
          <table className="workflow-register">
            <thead>
              <tr>
                {section === "requests" ? (
                  <>
                    <th>REQUEST / DATE</th>
                    <th>JOB / SERVICE CONNECTION</th>
                    <th>REQUESTED BY</th>
                    <th>MATERIALS</th>
                    <th>PROCUREMENT STATUS</th>
                    <th>STOCK ISSUANCE</th>
                  </>
                ) : section === "procurement" ? (
                  <>
                    <th>PURCHASE / REQUEST</th>
                    <th>ITEM / SUPPLIER</th>
                    <th>ORDERED</th>
                    <th>DELIVERED</th>
                    <th>ACCEPTED</th>
                    <th>OUTSTANDING</th>
                  </>
                ) : section === "inspection" || section === "stock-in" ? (
                  <>
                    <th>IAR / DELIVERY</th>
                    <th>ITEM</th>
                    <th>DELIVERED</th>
                    <th>ACCEPTABLE</th>
                    <th>REJECTED</th>
                    <th>STATUS</th>
                  </>
                ) : (
                  <>
                    <th>RIS / DATE</th>
                    <th>REQUEST</th>
                    <th>JOB / PROJECT</th>
                    <th>RELEASES</th>
                    <th>STATUS</th>
                  </>
                )}
                <th />
              </tr>
            </thead>
            <tbody>
              {section === "requests" &&
                requests.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{requestReference(r)}</strong>
                      <small className="cell-sub">{r.date}</small>
                    </td>
                    <td>
                      {r.job}
                      {r.parentId && (
                        <small className="cell-sub">
                          Additional to {requestReference(state.requests.find(parent=>parent.id===r.parentId)!)}
                        </small>
                      )}
                    </td>
                    <td>{r.person}</td>
                    <td>
                      {r.lines.length} line{r.lines.length !== 1 ? "s" : ""}
                    </td>
                    <td>
                      <WBadge>{requestStatus(state, r)}</WBadge>
                    </td>
                    <td><WBadge>{requestFulfillmentStatus(state, r)}</WBadge></td>
                    <td>
                      <WButton secondary onClick={() => setSelected(r.id)}>
                        Open →
                      </WButton>
                    </td>
                  </tr>
                ))}
              {section === "procurement" &&
                orders.map((o) => {
                  const t = orderTotals(state, o)
                  return (
                    <tr key={o.id}>
                      <td>
                        <strong>{o.reference}</strong>
                        <small className="cell-sub">{o.requestId}</small>
                      </td>
                      <td>
                        <strong>{itemName(state, o.itemId)}</strong>
                        <small className="cell-sub">{o.supplier}</small>
                      </td>
                      <td>{o.quantity}</td>
                      <td>{t.delivered}</td>
                      <td>{t.accepted}</td>
                      <td>
                        <WBadge>{t.outstanding}</WBadge>
                      </td>
                      <td>
                        <WButton secondary onClick={() => setSelected(o.id)}>
                          Open →
                        </WButton>
                      </td>
                    </tr>
                  )
                })}
              {(section === "inspection" || section === "stock-in") &&
                iars.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.reference}</strong>
                      <small className="cell-sub">{i.deliveryReference}</small>
                    </td>
                    <td>{i.itemName}</td>
                    <td>{i.delivered}</td>
                    <td>{i.accepted}</td>
                    <td className={i.delivered > i.accepted ? "negative" : ""}>
                      {i.delivered - i.accepted}
                    </td>
                    <td>
                      <WBadge>
                        {i.postingId
                          ? "Posted to stock"
                          : i.acceptedBy
                            ? i.accepted > 0 ? "Accepted" : "Rejected · no stock posted"
                            : i.inspectedBy
                              ? "Inspected"
                              : "Awaiting inspection"}
                      </WBadge>
                    </td>
                    <td>
                      <WButton secondary onClick={() => setSelected(i.id)}>
                        Open →
                      </WButton>
                    </td>
                  </tr>
                ))}
              {section === "stock-out" &&
                slips.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.reference}</strong>
                      <small className="cell-sub">{s.date}</small>
                    </td>
                    <td>{requestReference(state.requests.find(r=>r.id===s.requestId)!)}</td>
                    <td>{s.job}</td>
                    <td>
                      {state.releases.filter((r) => r.risId === s.id).length}
                    </td>
                    <td>
                      <WBadge>{risStatus(state, s)}</WBadge>
                    </td>
                    <td>
                      <WButton secondary onClick={() => setSelected(s.id)}>
                        Open →
                      </WButton>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {(section === "requests"
          ? requests
          : section === "procurement"
            ? orders
            : section === "inspection" || section === "stock-in"
              ? iars
              : slips
        ).length === 0 && <WEmpty />}
      </section>
      {canEdit && mode === "new" && (
        <WModal title={cfg.create} onClose={close}>
          <CreateDocument
            section={section}
            initialOrderId={deliveryOrderId}
            role={role}
            currentPersonnel={currentPersonnel}
            state={state}
            onClose={close}
            onAction={(a) => {
              if (onAction(a)) close()
            }}
          />
        </WModal>
      )}
      {selected && record && mode === "print" && <ClientDocument kind={section==="stock-out"?"ris":"iar"} id={selected} state={state} role={role} onAction={onAction} onClose={()=>setMode("")}/>}
      {canEdit&&(mode==="edit"||mode==="additional")&&selected&&<WModal title={mode==="edit"?"Edit Material Request / Add Quantities":"Additional Material Request"} onClose={()=>setMode("")}><CreateDocument section="requests" state={state} role={role} currentPersonnel={currentPersonnel} initialRequest={mode==="edit"?state.requests.find(r=>r.id===selected):undefined} additionalTo={mode==="additional"?state.requests.find(r=>r.id===selected):undefined} onClose={()=>setMode("")} onAction={a=>{if(perform(a))setMode("");}}/></WModal>}
      {selected && record && mode !== "new" && mode !== "print" && mode!=="edit" && mode!=="additional" && (
        <WModal
          title={("reference" in record ? record.reference : record.id)??record.id}
          onClose={close}
        >
          <div className="document-preview">
            <div className="document-heading">
              <div>
                <span className="eyebrow">WDS · INVENTORY</span>
                <h2>
                  {section === "requests"
                    ? "Material Request"
                    : section === "procurement"
                      ? "Purchase Order"
                      : section === "stock-out"
                        ? "Requisition and Issue Slip"
                        : "Inspection and Acceptance Report"}
                </h2>
              </div>
              <WBadge>
                {("reference" in record ? record.reference : record.id)??record.id}
              </WBadge>
            </div>
            <p className="document-layout-note">
              {section === "requests" || section === "procurement" ? "Workflow summary" : "Use Client form · Print / Save as PDF for the supplied workbook layout."}
            </p>
            {section === "requests" &&
              (() => {
                const r = state.requests.find((r) => r.id === selected)!
                return (
                  <>
                    <div className="workflow-details">
                      <WDetail label="Job / service connection" value={r.job} />
                      <WDetail label="Requesting personnel" value={r.person} />
                      <WDetail label="Date" value={r.date} />
                      <WDetail label="Procurement status" value={requestStatus(state, r)} />
                      <WDetail label="Stock issuance" value={requestFulfillmentStatus(state, r)}/>
                      <WDetail
                        label="Management / GM approval"
                        value={r.approvedBy}
                      />
                      <WDetail
                        label="Approval reference"
                        value={r.approvalReference}
                      />
                      {r.parentId && (
                        <WDetail label="Original request" value={requestReference(state.requests.find(parent=>parent.id===r.parentId)!)} />
                      )}
                    </div>
                    <MaterialLines state={state} requestId={r.id} />
                    <WNote>{requestLockReason(state,r.id)||"You can edit items, specifications and quantities until this request progresses to PR, PO or RIS. Changing an approved request requires approval again."}</WNote>
                    <div className="workflow-form-actions">{canEdit&&<WButton secondary disabled={!!requestLockReason(state,r.id)} onClick={()=>setMode("edit")}>Edit / Add quantities</WButton>}{canEdit&&requestLockReason(state,r.id)&&<WButton secondary onClick={()=>setMode("additional")}>Additional request</WButton>}{r.approvedBy&&!requestLockReason(state,r.id)&&<WButton onClick={()=>{close();onNavigate("purchase-requests");}}>Prepare Purchase Request →</WButton>}</div>
                    <h3 className="workflow-subtitle">Request history</h3><div className="request-history">{(r.history??[]).map((event,index)=><div className="history-event" key={index}><strong>{event.kind} · {event.actor}</strong><small>{event.legacy?`${event.at} · original recorded date; exact timestamp unavailable`:new Date(event.at).toLocaleString("en-PH",{timeZone:"Asia/Manila"})}</small>{event.reason&&<p>{event.reason}</p>}{event.changes.map((change,n)=><p key={n}>{change.itemId?`${change.itemName??itemName(state,change.itemId)} · `:""}{change.field}: {String(change.before??"—")} → {String(change.after??"—")}</p>)}</div>)}</div>
                    <WNote>
                      Availability is a live stock comparison. No stock is
                      reserved or deducted by this request.
                    </WNote>
                    <h3 className="workflow-subtitle">Connected documents</h3>
                    <div className="workflow-linked">
                      {(state.purchaseRequests??[]).filter(p=>p.requestId===r.id).map(p=><span key={p.id}>{p.reference} · {p.approvedBy?"Approved":"Pending PR approval"}</span>)}
                      {state.orders
                        .filter((o) => o.requestId === r.id)
                        .map((o) => (
                          <span key={o.id}>
                            {o.reference} · {o.supplier}
                          </span>
                        ))}
                      {state.ris
                        .filter((s) => s.requestId === r.id)
                        .map((s) => (
                          <span key={s.id}>
                            {s.reference} · {risStatus(state, s)}
                          </span>
                        ))}
                      {!state.orders.some((o) => o.requestId === r.id) &&
                        !state.ris.some((s) => s.requestId === r.id) && (
                          <p>No linked documents yet.</p>
                        )}
                    </div>
                  </>
                )
              })()}
            {section === "procurement" &&
              (() => {
                const o = state.orders.find((o) => o.id === selected)!
                const t = orderTotals(state, o)
                return (
                  <>
                    <div className="workflow-details">
                      <WDetail label="Original request" value={requestReference(state.requests.find(r=>r.id===o.requestId)!)} />
                      <WDetail label="Item" value={orderLines(o).map(l=>itemName(state,l.itemId)).join(", ")} />
                      <WDetail
                        label="Job"
                        value={
                          state.requests.find((r) => r.id === o.requestId)?.job
                        }
                      />
                      <WDetail label="Supplier" value={o.supplier} />
                      <WDetail label="Ordered" value={o.quantity} />
                      <WDetail
                        label="Delivered / accepted"
                        value={`${t.delivered} / ${t.accepted}`}
                      />
                      <WDetail
                        label="Still awaiting delivery"
                        value={String(t.outstanding)}
                      />
                      <WDetail
                        label="Posted to warehouse"
                        value={String(t.posted)}
                      />
                    </div>
                    <AttachmentLinks values={o.attachments} />
                    <h3 className="workflow-subtitle">
                      Deliveries and inspections
                    </h3>
                    {state.iars
                      .filter((i) => i.orderId === o.id)
                      .map((i) => (
                        <div key={i.id} className="workflow-detail">
                          <span>
                            {i.reference} · {i.deliveryReference}
                          </span>
                          <strong>
                            {i.delivered} delivered · {i.accepted} acceptable ·{" "}
                            {i.postingId
                              ? "posted"
                              : i.acceptedBy
                                ? "accepted"
                                : "pending"}
                          </strong>
                        </div>
                      ))}
                  </>
                )
              })()}
            {(section === "inspection" || section === "stock-in") &&
              (() => {
                const i = state.iars.find((i) => i.id === selected)!
                const o = state.orders.find((o) => o.id === i.orderId)!
                return (
                  <>
                    <div className="workflow-details">
                      <WDetail label="Purchase reference" value={o.reference} />
                      <WDetail label="Supplier" value={o.supplier}/>
                      <WDetail label="Ordered items" value={orderLines(o).length}/>
                      <WDetail
                        label="Delivery reference"
                        value={i.deliveryReference}
                      />
                      <WDetail label="Item" value={deliveryLines(state,i).map(l=>itemName(state,l.itemId)).join(", ")} />
                      <WDetail label="Date received" value={i.date} />
                      <WDetail
                        label="Delivered / acceptable"
                        value={`${i.delivered} / ${i.accepted}`}
                      />
                      <WDetail
                        label="Rejected / damaged"
                        value={String(i.delivered - i.accepted)}
                      />
                      <WDetail
                        label="Acquisition unit cost"
                        value={
                          deliveryLines(state,i).some(l=>l.accepted>0&&!l.unitCost)?"Unresolved — posting blocked":deliveryLines(state,i).filter(l=>l.accepted>0).map(l=>`${itemName(state,l.itemId)}: ${money(l.unitCost??0)}`).join(" · ")
                        }
                      />
                      <WDetail
                        label="Receipt value"
                        value={
                          deliveryLines(state,i).some(l=>l.accepted>0&&!l.unitCost)?"Unresolved":money(deliveryLines(state,i).reduce((n,l)=>n+l.accepted*(l.unitCost??0),0))
                        }
                      />
                    </div>
                    <h3 className="workflow-subtitle">Ordered items and delivery comparison</h3><OrderComparison state={state} order={o}/>
                    <h3 className="workflow-subtitle">This delivery</h3><div className="table-wrap"><table><thead><tr><th>Material</th><th>Expected on PO</th><th>Delivered</th><th>Acceptable</th><th>Damaged</th><th>Other rejected</th><th>Return required</th></tr></thead><tbody>{deliveryLines(state,i).map(l=>{const returned=(state.supplierReturns??[]).filter(r=>r.iarId===i.id&&r.itemId===l.itemId).reduce((n,r)=>n+r.quantity,0);return <tr key={l.itemId}><td>{l.snapshot?.description??itemName(state,l.itemId)}<small className="cell-sub">{l.snapshot?.stockNo??state.items.find(item=>item.id===l.itemId)?.code} · {l.snapshot?.unit??state.items.find(item=>item.id===l.itemId)?.unit}</small></td><td>{orderLines(o).find(n=>n.itemId===l.itemId)?.quantity}</td><td>{l.delivered}</td><td>{l.accepted}</td><td>{l.damaged??"Not separately classified"}</td><td>{l.damaged===undefined?"See findings":l.delivered-l.accepted-l.damaged}</td><td>{Math.max(0,l.delivered-l.accepted-returned)}</td></tr>})}</tbody></table></div>
                    {i.replacesIarId&&<WNote>Replacement for {state.iars.find(r=>r.id===i.replacesIarId)?.reference}</WNote>}
                    {canEdit&&i.inspectedBy&&deliveryLines(state,i).some(l=>l.delivered>l.accepted)&&<div className="workflow-form-actions"><WButton secondary onClick={()=>setMode("supplier-return")}>Record return to supplier</WButton></div>}
                    {canEdit&&mode==="supplier-return"&&<SupplierReturnForm state={state} iarId={i.id} onClose={()=>setMode("")} onAction={perform}/>}
                    <WNote>{i.findings}</WNote>
                    <div className="signature-grid">
                      <div>
                        <span>1 · Inspection Officer</span>
                        <strong>
                          {i.inspectedBy || "Awaiting inspection signature"}
                        </strong>
                        <small>
                          {i.inspectedAt?.slice(0, 10) ||
                            "Signature: __________________"}
                        </small>
                      </div>
                      <div>
                        <span>2 · Supply & Property Custodian</span>
                        <strong>
                          {i.acceptedBy || "Awaiting acceptance signature"}
                        </strong>
                        <small>
                          {i.acceptedAt?.slice(0, 10) ||
                            "Signature: __________________"}
                        </small>
                      </div>
                    </div>
                    {i.postingId && (
                      <WNote>
                        Receipt posted once · {i.postedAt?.slice(0, 10)} ·{" "}
                        {i.postingId}
                      </WNote>
                    )}
                    <AttachmentLinks values={i.attachments} />
                  </>
                )
              })()}
            {section === "stock-out" &&
              (() => {
                const s = state.ris.find((s) => s.id === selected)!
                return (
                  <>
                    <div className="workflow-details">
                      <WDetail label="Original request" value={requestReference(state.requests.find(r=>r.id===s.requestId)!)} />
                      <WDetail
                        label="Project / service connection"
                        value={
                          state.requests.find((r) => r.id === s.requestId)?.job
                        }
                      />
                      <WDetail label="Requesting personnel" value={s.person} />
                      <WDetail
                        label="Applicable approval reference"
                        value={s.approvalReference}
                      />
                      <WDetail label="Status" value={risStatus(state, s)} />
                      <WDetail label="Date" value={s.date} />
                    </div>
                    <MaterialLines state={state} requestId={s.requestId} />
                    <h3 className="workflow-subtitle">
                      Actual releases & recipient acknowledgment
                    </h3>
                    {state.releases
                      .filter((r) => r.risId === s.id)
                      .map((r) => (
                        <div className="release-card" key={r.id}>
                          <div>
                            <strong>
                              {itemName(state, r.itemId)} · {r.quantity}{" "}
                              released
                            </strong>
                            <small>
                              {r.date} · Released by {r.person} · Received by{" "}
                              {r.recipient}
                            </small>
                            <small>
                              {r.assetTag && `${r.assetTag} · `}
                              {r.id}
                            </small>
                          </div>
                          <div><strong>{money(r.value)}</strong></div>
                        </div>
                      ))}
                    {!state.releases.some((r) => r.risId === s.id) && (
                      <p className="workflow-muted">
                        No actual releases recorded.
                      </p>
                    )}
                    <WNote>
                      Prototype posting trigger: confirmation of an actual
                      release with recipient acknowledgment. Charging and
                      printing do not deduct stock.
                    </WNote>
                  </>
                )
              })()}
          </div>
          {canEdit && mode === "ack" && (
            <div className="workflow-action-box">
              <WForm
                onClose={() => setMode("")}
                submit={
                  section === "requests"
                    ? "Record existing approval"
                    : section === "stock-in"
                      ? "Post accepted receipt"
                      : state.iars.find(i=>i.id===selected)?.inspectedBy
                        ? state.iars.find(i=>i.id===selected)?.accepted ? "Accept and post to inventory" : "Record acceptance / rejection"
                        : "Record inspection"
                }
                onSubmit={() => {
                  if (section === "requests")
                    perform({
                      type: "approve-request",
                      id: selected,
                      person: ack.person,
                      reference: ack.reference,
                    })
                  else {
                    const i = state.iars.find((i) => i.id === selected)!
                    perform(
                      section === "stock-in"
                        ? {
                            type: "receipt",
                            id: selected,
                            postingId: controlNumber("RCPT"),
                            person: ack.person,
                          }
                        : {
                            type: i.inspectedBy ? "accept" : "inspect",
                            id: selected,
                            person: ack.person,
                          },
                    )
                  }
                }}
              >
                <WField
                  label={
                    section === "requests"
                      ? "Management / GM name"
                      : section === "stock-in"
                        ? "Received by"
                        : state.iars.find((i) => i.id === selected)?.inspectedBy
                          ? "Supply & Property Custodian"
                          : "Inspection Officer"
                  }
                >
                  <WInput
                    autoFocus
                    required
                    value={ack.person}
                    onChange={(e) => setAck({ ...ack, person: e.target.value })}
                  />
                </WField>
                {section === "requests" && (
                  <WField label="Existing approval reference">
                    <WInput
                      required
                      value={ack.reference}
                      onChange={(e) =>
                        setAck({ ...ack, reference: e.target.value })
                      }
                    />
                  </WField>
                )}
              </WForm>
            </div>
          )}
          {canEdit && mode === "cancel" && (
            <div className="workflow-action-box">
              <WNote>
                Cancel the outstanding quantities on this RIS? All earlier
                releases and charges remain recorded.
              </WNote>
              <div className="workflow-form-actions">
                <WButton secondary onClick={() => setMode("")}>
                  Keep RIS
                </WButton>
                <WButton
                  onClick={() => perform({ type: "cancel-ris", id: selected })}
                >
                  Confirm cancellation
                </WButton>
              </div>
            </div>
          )}
          {canEdit && mode === "release" && (
            <div className="workflow-action-box">
              <ReleaseForm
                state={state}
                risId={selected}
                onClose={() => setMode("")}
                onAction={perform}
              />
            </div>
          )}
          {!mode && (
            <div className="workflow-form-actions no-print">
              <WButton secondary onClick={() => {if(section==="stock-out"||section==="inspection"||section==="stock-in")setMode("print");else window.print();}}>
                {section==="stock-out"||section==="inspection"||section==="stock-in"?"Client form · Print / Save as PDF":"Print document"}
              </WButton>
              {canEdit && section === "requests" &&
                !state.requests.find((r) => r.id === selected)?.approvedBy && (
                  <WButton
                    onClick={() => openAck(selected)}
                  >
                    Record Management / GM approval
                  </WButton>
                )}
              {section === "requests" &&
                state.requests.find((r) => r.id === selected)?.approvedBy && (
                  <>
                    <WButton
                      secondary
                      onClick={() => onNavigate("purchase-requests")}
                    >
                      Purchase Request →
                    </WButton>
                    <WButton onClick={() => onNavigate("stock-out")}>
                      Prepare / view RIS →
                    </WButton>
                  </>
                )}
              {section === "procurement" && (
                <WButton onClick={() => onNavigate("inspection")}>
                  Record / inspect delivery →
                </WButton>
              )}
              {canEdit && section === "inspection" &&
                !state.iars.find((i) => i.id === selected)?.acceptedBy && (
                  <WButton
                    onClick={() => openAck(selected)}
                  >
                    {state.iars.find((i) => i.id === selected)?.inspectedBy
                      ? state.iars.find(i=>i.id===selected)?.accepted ? "Accept and post to inventory" : "Record acceptance / rejection"
                      : "Acknowledge inspection"}
                  </WButton>
                )}
              {section === "inspection" &&
                state.iars.find((i) => i.id === selected)?.acceptedBy &&
                !!state.iars.find((i) => i.id === selected)?.accepted &&
                !state.iars.find((i) => i.id === selected)?.postingId && (
                  <WButton onClick={() => onNavigate("stock-in")}>
                    View / recover stock receipt →
                  </WButton>
                )}
              {canEdit && section === "stock-in" &&
                (() => {
                  const i = state.iars.find((i) => i.id === selected)!
                  return (
                    <WButton
                      disabled={
                        !i.acceptedBy ||
                        !!i.postingId ||
                        !i.accepted ||
                        deliveryLines(state,i).some(l=>l.accepted>0&&!l.unitCost)
                      }
                      onClick={() => openAck(selected)}
                    >
                      {i.postingId
                        ? "Already posted"
                        : !i.acceptedBy
                          ? "Awaiting acceptance"
                          : !i.accepted
                            ? "No accepted quantity"
                            : deliveryLines(state,i).some(l=>l.accepted>0&&!l.unitCost)
                              ? "Acquisition cost required"
                              : "Post accepted receipt"}
                    </WButton>
                  )
                })()}
              {section === "stock-in" &&
                !state.iars.find((i) => i.id === selected)?.acceptedBy && (
                  <WButton secondary onClick={() => onNavigate("inspection")}>
                    Inspection & acceptance →
                  </WButton>
                )}
              {canEdit && section === "stock-out" &&
                !state.ris.find((s) => s.id === selected)?.cancelled && (
                  <>
                    <WButton
                      secondary
                      onClick={() => setMode("cancel")}
                    >
                      Cancel outstanding RIS
                    </WButton>
                    <WButton
                      disabled={
                        risStatus(
                          state,
                          state.ris.find((s) => s.id === selected)!,
                        ) === "Fully issued"
                      }
                      onClick={() => setMode("release")}
                    >
                      Record actual release
                    </WButton>
                  </>
                )}
            </div>
          )}
        </WModal>
      )}
    </>
  )
}

function MaterialLines({
  state,
  requestId,
}: {
  state: WorkflowState
  requestId: string
}) {
  const request = state.requests.find((r) => r.id === requestId)!

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>MATERIAL / SPECIFICATIONS</th>
            <th>UNIT</th>
            <th>REQUESTED</th>
            <th>ISSUED</th>
            <th>OUTSTANDING</th>
            <th>ON HAND</th>
            <th>SHORTAGE</th>
          </tr>
        </thead>
        <tbody>
          {request.lines.map((l) => {
            const a = availability(state, l, request.id)
            return (
              <tr key={l.itemId}>
                <td>
                  <strong>{itemName(state, l.itemId)}</strong>
                  <small className="cell-sub">{l.specification}</small>
                </td>
                <td>{state.items.find((i) => i.id === l.itemId)?.unit}</td>
                <td>{l.quantity}</td>
                <td>{a.issued}</td>
                <td>{a.outstanding}</td>
                <td>{a.stock}</td>
                <td className={a.shortage ? "negative" : "positive"}>
                  {a.shortage}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SupplierReturnForm({state,iarId,onClose,onAction}:{state:WorkflowState;iarId:string;onClose:()=>void;onAction:(a:WorkflowAction)=>boolean}){
  const [itemId,setItemId]=useState("");const [quantity,setQuantity]=useState("");const [person,setPerson]=useState("");const [reference,setReference]=useState("");const [date,setDate]=useState(today());const iar=state.iars.find(i=>i.id===iarId)!;
  const available=(id:string)=>{const l=deliveryLines(state,iar).find(l=>l.itemId===id);const returned=(state.supplierReturns??[]).filter(r=>r.iarId===iarId&&r.itemId===id).reduce((n,r)=>n+r.quantity,0);return Math.max(0,(l?l.delivered-l.accepted:0)-returned);};
  return <div className="workflow-action-box"><WForm onClose={onClose} onSubmit={()=>onAction({type:"supplier-return",id:controlNumber("SR"),iarId,itemId,quantity:Number(quantity),date,person,reference})} submit="Record supplier return"><WField label="Rejected material"><WSelect required value={itemId} onChange={e=>setItemId(e.target.value)}><option value="">Select material</option>{deliveryLines(state,iar).filter(l=>available(l.itemId)>0).map(l=><option key={l.itemId} value={l.itemId}>{itemName(state,l.itemId)} · {available(l.itemId)} to return</option>)}</WSelect></WField><WField label="Quantity returned"><WInput required type="number" min="0.00000001" step="any" max={available(itemId)} value={quantity} onChange={e=>setQuantity(e.target.value)}/></WField><WField label="Returned by"><WInput required value={person} onChange={e=>setPerson(e.target.value)}/></WField><WField label="Supplier return reference"><WInput required value={reference} onChange={e=>setReference(e.target.value)}/></WField><WField label="Return date"><WInput required type="date" value={date} onChange={e=>setDate(e.target.value)}/></WField></WForm></div>;
}

function CreateDocument({
  section,
  state,
  onClose,
  onAction,
  initialRequest,
  additionalTo,
  initialOrderId,
  role,
  currentPersonnel,
}: {
  section: WorkflowSection
  state: WorkflowState
  onClose: () => void
  onAction: (a: WorkflowAction) => void
  initialOrderId?:string;
  role: AppRole;
  currentPersonnel: string;
  initialRequest?:MaterialRequest;
  additionalTo?:MaterialRequest;
}) {
  const kind =
    section === "requests"
      ? "request"
      : section === "procurement"
        ? "order"
        : section === "stock-out"
          ? "ris"
          : "delivery"

  const [form, setForm] = useState({
    date: initialRequest?.date??today(),
    person: initialRequest?.person??currentPersonnel,
    job: initialRequest?.job??additionalTo?.job??"",
    parentId: initialRequest?.parentId??additionalTo?.id??"",
    requestId: "",
    itemId: "",
    supplier: "",
    reference: initialRequest?requestReference(initialRequest):kind==="delivery"||kind==="ris"?nextFormReference(state,kind==="ris"?"RIS":"IAR",today()):nextProcurementReference(state,kind==="request"?"MR":"PO",today()),
    orderId: "",
    deliveryReference: "",
    quantity: "",
    delivered: "",
    accepted: "",
    unitCost: "",
    findings: "",
    approvalReference: "",
    assetTags: "",
  })

  const [lines, setLines] = useState<RequestLine[]>(initialRequest?structuredClone(initialRequest.lines):[
    { itemId: "", quantity: 1, specification: "" },
  ])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [editVersion]=useState(initialRequest?.editVersion??0);
  const [actor,setActor]=useState(currentPersonnel);const [reason,setReason]=useState("");

  useEffect(()=>{if(!canChangeRequester(role))setForm(f=>({...f,person:initialRequest?.person??currentPersonnel}));},[role,currentPersonnel,initialRequest?.id]);

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value,...(key==="date"&&!initialRequest?{reference:value?(kind==="delivery"||kind==="ris"?nextFormReference(state,kind==="ris"?"RIS":"IAR",value):nextProcurementReference(state,kind==="request"?"MR":"PO",value)):""}:{}) }))

  const request = state.requests.find((r) => r.id === form.requestId)
  const order = state.orders.find((o) => o.id === form.orderId)
  const line = request?.lines.find((l) => l.itemId === form.itemId)

  const overlap = state.orders.filter(
    (o) =>
      o.requestId === form.requestId &&
      o.itemId === form.itemId &&
      orderTotals(state, o).outstanding > 0,
  )

  const duplicateRequest =
    kind === "request" &&
    state.requests.some(
      (r) =>
        r.id!==initialRequest?.id&&r.job === form.job &&
        r.lines.some((l) => lines.some((n) => n.itemId === l.itemId)),
    )

  const submit = () => {
    if(initialRequest){onAction({type:"edit-request",id:initialRequest.id,person:form.person,job:form.job,lines,actor,reason,expectedVersion:editVersion});return;}
    if (kind === "request")
      onAction({
        type: "request",
        id: form.reference,
        reference:form.reference,
        date: form.date,
        person: form.person,
        job: form.job,
        lines,
        parentId: form.parentId || undefined,
      })

    if (kind === "order")
      onAction({
        type: "order",
        id: form.reference,
        requestId: form.requestId,
        itemId: form.itemId,
        quantity: Number(form.quantity),
        supplier: form.supplier,
        reference: form.reference,
        date: form.date,
        attachments,
      })

    if (kind === "delivery")
      onAction({
        type: "delivery",
        id: form.reference,
        orderId: form.orderId,
        reference: form.reference,
        deliveryReference: form.deliveryReference,
        date: form.date,
        delivered: Number(form.delivered),
        accepted: Number(form.accepted),
        unitCost: form.unitCost ? Number(form.unitCost) : undefined,
        findings: form.findings,
        attachments,
        assetTags: form.assetTags
          ? form.assetTags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : undefined,
      })

    if (kind === "ris")
      onAction({
        type: "ris",
        id: form.reference,
        requestId: form.requestId,
        reference: form.reference,
        date: form.date,
        person: form.person,
        approvalReference: form.approvalReference,
      })
  }

  if(kind==="delivery")return <DeliveryEditor state={state} initialOrderId={initialOrderId} onAction={onAction} onClose={onClose}/>;
  return (
    <WForm
      onSubmit={submit}
      onClose={onClose}
      submit={
        kind === "request"
          ? initialRequest?"Save request changes":"Submit material request"
          : kind === "order"
            ? "Create purchase order"
            : kind === "ris"
              ? "Prepare RIS"
              : "Record delivery for inspection"
      }
    >
      <WField
        label="Control number"
      >
        <WInput
          required
          value={form.reference}
          readOnly
          onChange={(e) => set("reference", e.target.value)}
        />
      </WField>
      <WField label="Date">
        <WInput
          type="date"
          required
          readOnly={!!initialRequest}
          value={form.date}
          onChange={(e) => set("date", e.target.value)}
        />
      </WField>
      {kind === "request" && (
        <>
          {initialRequest&&<><WField label="Recorded by"><WInput required readOnly value={actor} onChange={e=>setActor(e.target.value)}/></WField><WField label="Reason for changes / additional quantities"><WInput required value={reason} onChange={e=>setReason(e.target.value)}/></WField><WNote>Changing this request clears its approval and requires approval again.</WNote></>}
          <RequesterField value={form.person} role={role} personnel={[currentPersonnel,...state.requests.map(r=>r.person)]} onChange={name=>set("person",name)}/>
          <WField label="Project / service connection">
            <WInput
              required
              value={form.job}
              onChange={(e) => set("job", e.target.value)}
              placeholder="e.g. SC-2026-042 · Customer connection"
            />
          </WField>
          <WField label="Additional request linked to">
            <WSelect
              disabled={!!initialRequest||!!additionalTo}
              value={form.parentId}
              onChange={(e) => {
                const p = state.requests.find((r) => r.id === e.target.value)
                setForm((f) => ({
                  ...f,
                  parentId: e.target.value,
                  job: p?.job ?? f.job,
                }))
              }}
            >
              <option value="">New / original request</option>
              {state.requests.filter(r=>!!requestLockReason(state,r.id)||r.id===initialRequest?.parentId).map((r) => (
                <option value={r.id} key={r.id}>
                  {requestReference(r)} · {r.job}
                </option>
              ))}
            </WSelect>
          </WField>
          <div className="workflow-full request-lines">
            <div className="workflow-line-heading">
              <h3>Requested materials</h3>
              <WButton
                secondary
                onClick={() =>
                  setLines([
                    ...lines,
                    { itemId: "", quantity: 1, specification: "" },
                  ])
                }
              >
                ＋ Add material
              </WButton>
            </div>
            {lines.map((l, index) => (
              <div className="request-line" key={index}>
                <WField label={`Material ${index + 1}`}>
                  <WSelect
                    required
                    value={l.itemId}
                    onChange={(e) =>
                      setLines(
                        lines.map((r, i) =>
                          i === index ? { ...r, itemId: e.target.value } : r,
                        ),
                      )
                    }
                  >
                    <option value="">Select item</option>
                    {state.items
                      .filter((i) => i.active)
                      .map((i) => (
                        <option value={i.id} key={i.id}>
                          {i.code} · {i.name}
                        </option>
                      ))}
                  </WSelect>
                </WField>
                <WField
                  label={`Quantity (${state.items.find((i) => i.id === l.itemId)?.unit ?? "units"})`}
                >
                  <WInput
                    type="number"
                    min="0.00000001"
                    step="any"
                    required
                    value={l.quantity}
                    onChange={(e) =>
                      setLines(
                        lines.map((r, i) =>
                          i === index
                            ? { ...r, quantity: Number(e.target.value) }
                            : r,
                        ),
                      )
                    }
                  />
                </WField>
                <WField label="Specifications">
                  <WInput
                    required
                    value={l.specification}
                    onChange={(e) =>
                      setLines(
                        lines.map((r, i) =>
                          i === index
                            ? { ...r, specification: e.target.value }
                            : r,
                        ),
                      )
                    }
                  />
                </WField>
                <WButton
                  secondary
                  disabled={lines.length === 1}
                  onClick={() => setLines(lines.filter((_, i) => i !== index))}
                >
                  Remove
                </WButton>
                {l.itemId && (
                  <small className="workflow-full">
                    On hand:{" "}
                    {state.items.find((i) => i.id === l.itemId)?.quantity} ·
                    Shortage:{" "}
                    {Math.max(
                      0,
                      l.quantity -
                        (state.items.find((i) => i.id === l.itemId)?.quantity ??
                          0),
                    )}
                  </small>
                )}
              </div>
            ))}
          </div>
          {duplicateRequest && (
            <div className="workflow-full">
              <WNote>
                This job already has a request for these materials. Edit that
                request while it is editable; use a linked additional MR after
                it has progressed.
              </WNote>
            </div>
          )}
        </>
      )}
      {(kind === "order" || kind === "ris") && (
        <WField label="Approved material request">
          <WSelect
            required
            value={form.requestId}
            onChange={(e) => {
              const r = state.requests.find((r) => r.id === e.target.value)
              setForm((f) => ({
                ...f,
                requestId: e.target.value,
                itemId: "",
                approvalReference: r?.approvalReference ?? "",
                person: r?.person ?? "",
              }))
            }}
          >
            <option value="">Select approved request</option>
            {state.requests
              .filter((r) => r.approvedBy)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {requestReference(r)} · {r.job}
                </option>
              ))}
          </WSelect>
        </WField>
      )}
      {kind === "order" && (
        <>
          <WField label="Requested material">
            <WSelect
              required
              disabled={!request}
              value={form.itemId}
              onChange={(e) => {
                const l = request?.lines.find(
                  (l) => l.itemId === e.target.value,
                )
                setForm((f) => ({
                  ...f,
                  itemId: e.target.value,
                  quantity: l
                    ? String(availability(state, l, request!.id).shortage)
                    : "",
                }))
              }}
            >
              <option value="">Select requested item</option>
              {request?.lines.map((l) => (
                <option key={l.itemId} value={l.itemId}>
                  {itemName(state, l.itemId)}
                </option>
              ))}
            </WSelect>
          </WField>
          <WField label="Supplier">
            <WInput
              required
              value={form.supplier}
              onChange={(e) => set("supplier", e.target.value)}
            />
          </WField>
          <WField label="Quantity ordered">
            <WInput
              required
              type="number"
              min="0.00000001"
              step="any"
              value={form.quantity}
              onChange={(e) => set("quantity", e.target.value)}
            />
          </WField>
          {line && (
            <div className="workflow-full">
              <WNote>
                Current shortage:{" "}
                {availability(state, line, request!.id).shortage}.{" "}
                {overlap.length > 0
                  ? `Review ${overlap.length} existing order(s) with outstanding deliveries before ordering again.`
                  : "No overlapping outstanding orders for this request and item."}
              </WNote>
            </div>
          )}
          <AttachmentInput value={attachments} onChange={setAttachments} />
        </>
      )}
      {kind === "ris" && (
        <>
          <WField label="Requesting personnel">
            <WInput
              required
              value={form.person}
              onChange={(e) => set("person", e.target.value)}
            />
          </WField>
          <WField label="Applicable approval reference">
            <WInput
              required
              value={form.approvalReference}
              onChange={(e) => set("approvalReference", e.target.value)}
            />
          </WField>
          {request && (
            <div className="workflow-full">
              <MaterialLines state={state} requestId={request.id} />
              <WNote>
                Preparing a RIS does not deduct inventory. Only actual
                acknowledged releases are posted.
              </WNote>
            </div>
          )}
        </>
      )}
    </WForm>
  )
}

function ReleaseForm({
  state,
  risId,
  onClose,
  onAction,
}: {
  state: WorkflowState
  risId: string
  onClose: () => void
  onAction: (a: WorkflowAction) => boolean
}) {
  const ris = state.ris.find((r) => r.id === risId)!
  const request = state.requests.find((r) => r.id === ris.requestId)!

  const [form, setForm] = useState({
    itemId: "",
    quantity: "",
    recipient: "",
    person: "",
    date: today(),
    assetTag: "",
  })
  const item = state.items.find((i) => i.id === form.itemId)

  const line = request.lines.find((l) => l.itemId === form.itemId)
  const outstanding = line
    ? line.quantity - issuedFor(state, request.id, line.itemId)
    : 0
  const qty = Number(form.quantity)
  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }))

  const specific = item?.costMethod === "Specific"
  const unitCost = specific
    ? item?.assets?.find((a) => a.tag === form.assetTag)?.cost
    : item?.unitCost

  return (
    <>
      <h3 className="workflow-subtitle">Confirm an actual release</h3>
      <WForm
        submit="Confirm release & post stock-out"
        onClose={onClose}
        onSubmit={() =>
          onAction({
            type: "release",
            id: controlNumber("ISS"),
            risId,
            itemId: form.itemId,
            quantity: qty,
            person: form.person,
            recipient: form.recipient,
            date: form.date,
            assetTag: form.assetTag || undefined,
          })
        }
      >
        <WField label="Requested material">
          <WSelect
            required
            value={form.itemId}
            onChange={(e) => {
              setForm((f) => ({
                ...f,
                itemId: e.target.value,
                quantity: "",
                assetTag: "",
              }))
            }}
          >
            <option value="">Select material</option>
            {request.lines
              .filter(
                (l) => l.quantity > issuedFor(state, request.id, l.itemId),
              )
              .map((l) => (
                <option key={l.itemId} value={l.itemId}>
                  {itemName(state, l.itemId)}
                </option>
              ))}
          </WSelect>
        </WField>
        <WField label="Actual quantity released">
          <WInput
            required
            type="number"
            min="0.00000001"
            step="any"
            max={Math.min(
              item?.quantity ?? 0,
              outstanding,
              specific ? 1 : Infinity,
            )}
            value={form.quantity}
            onChange={(e) => set("quantity", e.target.value)}
          />
        </WField>
        {specific && (
          <WField label="Asset tag / specific acquisition cost">
            <WSelect
              required
              value={form.assetTag}
              onChange={(e) => {
                setForm((f) => ({
                  ...f,
                  assetTag: e.target.value,
                  quantity: "1",
                }))
              }}
            >
              <option value="">Select available asset</option>
              {item?.assets?.map((a) => (
                <option key={a.tag} value={a.tag}>
                  {a.tag} · {money(a.cost)}
                </option>
              ))}
            </WSelect>
          </WField>
        )}
        <WField label="Date of actual release">
          <WInput
            required
            type="date"
            value={form.date}
            onChange={(e) => set("date", e.target.value)}
          />
        </WField>
        <WField label="Released by">
          <WInput
            required
            value={form.person}
            onChange={(e) => set("person", e.target.value)}
          />
        </WField>
        <WField
          label="Recipient acknowledgment"
          hint="Enter the recipient's name."
        >
          <WInput
            required
            value={form.recipient}
            onChange={(e) => set("recipient", e.target.value)}
          />
        </WField>
        {item && (
          <div className="workflow-full">
            <div className="release-preview">
              <div>
                <span>On hand / outstanding</span>
                <strong>
                  {item.quantity} / {outstanding} {item.unit}
                </strong>
              </div>
              <div>
                <span>Stock after release</span>
                <strong>
                  {item.quantity - (qty || 0)} {item.unit}
                </strong>
              </div>
              <div>
                <span>Issue material cost</span>
                <strong>
                  {unitCost === undefined
                    ? "Unresolved"
                    : money((qty || 0) * unitCost)}
                </strong>
              </div>
            </div>
            <WNote>
              The unit cost is locked on this release. The same RIS and job will
              appear in Material Charges.
            </WNote>
          </div>
        )}
      </WForm>
    </>
  )
}
