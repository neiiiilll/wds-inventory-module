import {money,procurementTotal,type OrderLine,type ProcurementEvent,type WorkflowState} from "../services/workflow";
import {itemName} from "./WorkflowUI";

export function PricedLines({state,lines}:{state:WorkflowState;lines:OrderLine[]}) {
  const total=procurementTotal(lines);
  return <div className="table-wrap"><table><thead><tr><th>Material / specification</th><th>Unit</th><th>Quantity</th><th>Unit price (PHP)</th><th>Amount (PHP)</th></tr></thead>
    <tbody>{lines.map(line=><tr key={line.itemId}><td><strong>{line.snapshot?.description??itemName(state,line.itemId)}</strong><small className="cell-sub">{line.snapshot?.stockNo}{line.specification?` · ${line.specification}`:""}</small></td><td>{line.snapshot?.unit??state.items.find(i=>i.id===line.itemId)?.unit}</td><td>{line.quantity}</td><td>{line.unitPrice===undefined?"Not recorded":money(line.unitPrice)}</td><td>{line.unitPrice===undefined?"Not recorded":money(line.quantity*line.unitPrice)}</td></tr>)}</tbody>
    <tfoot><tr><td colSpan={4}><strong>Items total</strong></td><td><strong>{total===undefined?"Not recorded":money(total)}</strong></td></tr></tfoot>
  </table></div>;
}

export function ProcurementHistory({events}:{events?:ProcurementEvent[]}) {
  return <div className="request-history">{events?.length?events.map((event,index)=><div className="history-event" key={index}><strong>{event.kind} · {event.actor}</strong><small>{new Date(event.at).toLocaleString("en-PH",{timeZone:"Asia/Manila"})}{event.revision!==undefined?` · Revision ${event.revision}`:""}</small><p>{event.reason}</p>{event.details&&<p>{event.details}</p>}{event.recordedBy&&event.recordedBy!==event.actor&&<small>Recorded by {event.recordedBy}</small>}</div>):<p>No additional history was recorded for this earlier document.</p>}</div>;
}
