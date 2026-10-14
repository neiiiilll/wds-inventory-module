import {
  canReceiveOrder,orderLines, orderLineTotals, purchaseOrderDeliveryStatus, purchaseOrderProcessingStatus,
  type WorkflowState,
} from "../services/workflow";
import { WBadge, WButton, itemName } from "./WorkflowUI";

export default function ExpectedDeliveries({ state, search, canEdit, onRecord, onOpenOrders }: {
  state: WorkflowState;
  search: string;
  canEdit: boolean;
  onRecord: (orderId: string) => void;
  onOpenOrders: () => void;
}) {
  const orders = state.orders.filter(order => purchaseOrderProcessingStatus(state, order) !== "Completed")
    .filter(order => [order.reference, order.supplier, ...orderLines(order).map(l =>
      `${l.snapshot?.description ?? itemName(state, l.itemId)} ${l.snapshot?.stockNo ?? ""} ${l.specification ?? ""}`)
    ].join(" ").toLowerCase().includes(search.toLowerCase()));
  return <section className="panel workflow-register expected-deliveries">
    <div className="panel-head"><div><h2>Expected deliveries · Purchase Orders</h2><p>Check the ordered quantities before recording a delivery.</p></div></div>
    <div className="table-wrap"><table>
      <thead><tr><th>PO / Supplier</th><th>Ordered material / specification</th><th>Unit</th><th>Ordered</th><th>Previously delivered</th><th>Undelivered</th><th>Replacement due</th><th>Delivery / Processing</th><th></th></tr></thead>
      <tbody>{orders.flatMap(order => orderLines(order).map((line, index) => {
        const totals = orderLineTotals(state, order, line.itemId);
        const receivable = orderLines(order).some(l => {
          const t = orderLineTotals(state, order, l.itemId);
          return t.undelivered > 0 || t.replacementPending > 0;
        });
        return <tr key={`${order.id}-${line.itemId}`}>
          <td>{index === 0 && <><strong>{order.reference}</strong><small className="cell-sub">{order.supplier}</small></>}</td>
          <td><strong>{line.snapshot?.description ?? itemName(state, line.itemId)}</strong><small className="cell-sub">{line.snapshot?.stockNo}{line.specification ? ` · ${line.specification}` : ""}</small></td>
          <td>{line.snapshot?.unit ?? state.items.find(i => i.id === line.itemId)?.unit}</td>
          <td>{totals.ordered}</td><td>{totals.originalDelivered}</td><td>{totals.undelivered}</td><td>{totals.replacementPending}</td>
          <td>{index === 0 && <><WBadge>{purchaseOrderDeliveryStatus(state, order)}</WBadge><small className="cell-sub">{purchaseOrderProcessingStatus(state, order)}</small></>}</td>
          <td>{index === 0 && receivable && (canReceiveOrder(order) ? <WButton secondary disabled={!canEdit} onClick={() => onRecord(order.id)}>Record delivery</WButton>:<WButton secondary onClick={onOpenOrders}>Record dispatch →</WButton>)}</td>
        </tr>;
      }))}</tbody>
    </table>{!orders.length && <div className="empty">No outstanding purchase orders match.</div>}</div>
  </section>;
}
