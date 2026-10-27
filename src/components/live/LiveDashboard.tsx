import {useCallback} from 'react'
import {getInventoryDashboard} from '../../services/procurement-api'
import {useLiveInventoryResource} from '../../services/use-live-inventory'
import {formatDecimal as decimal} from '../../services/format-decimal'
export default function LiveDashboard({onNavigate}:{onNavigate:(page:'inventory'|'transactions'|'stock-in'|'requests')=>void}){
 const loader=useCallback(()=>getInventoryDashboard(),[]),resource=useLiveInventoryResource('dashboard',loader)
 if(resource.loading)return <section className="panel"><div className="empty"><strong>Loading live inventory…</strong></div></section>
 if(resource.error||!resource.data)return <section className="panel"><div className="empty live-error-state"><strong>The inventory service could not complete the request.</strong><button className="btn btn-secondary" onClick={resource.reload}>Retry</button></div></section>
 const d=resource.data
 return <>
  <section className="page-header"><div><span className="eyebrow">LIVE INVENTORY</span><h1>Dashboard</h1><p>Tenant-scoped balances and procurement activity from Supabase.</p></div><button className="btn btn-secondary" onClick={resource.reload}>Refresh</button></section>
  <section className="stat-grid live-stat-grid">
   <button className="stat-card live-stat-card" onClick={()=>onNavigate('inventory')}><span>Active items</span><strong>{d.activeItems}</strong><small>Catalog records →</small></button>
   <button className="stat-card live-stat-card" onClick={()=>onNavigate('inventory')}><span>Stock across locations</span><strong>{decimal(d.stockQuantity)}</strong><small>Location balances →</small></button>
   <button className="stat-card live-stat-card" onClick={()=>onNavigate('inventory')}><span>Low stock</span><strong>{d.lowStockItems}</strong><small>Below minimum →</small></button>
   <button className="stat-card live-stat-card" onClick={()=>onNavigate('inventory')}><span>Out of stock</span><strong>{d.outOfStockItems}</strong><small>Needs action →</small></button>
  </section>
  <div className="dashboard-grid">
   <section className="panel span-2"><div className="panel-head"><div><h2>Critical items</h2><p>Up to five live item balances.</p></div></div>{d.criticalItems.length?<div className="table-wrap"><table><thead><tr><th>Item</th><th>Balance</th><th>Minimum</th></tr></thead><tbody>{d.criticalItems.slice(0,5).map(item=><tr key={item.id}><td><strong>{item.name}</strong><small>{item.itemCode}</small></td><td>{decimal(item.quantity)} {item.unit}</td><td>{decimal(item.minimum)}</td></tr>)}</tbody></table></div>:<div className="empty"><strong>No critical items</strong><p>Current tenant balances are above their minimums.</p></div>}</section>
   <section className="panel"><div className="panel-head"><div><h2>Recent movements</h2><p>Six most recent posted ledger entries.</p></div><button className="link-button" onClick={()=>onNavigate('transactions')}>View all</button></div>{d.recentMovements.length?<div className="table-wrap"><table><tbody>{d.recentMovements.slice(0,6).map(row=><tr key={row.id}><td><strong>{row.itemName}</strong><small>{row.itemCode}</small></td><td>{row.movementType}</td><td>{decimal(row.quantity)}</td></tr>)}</tbody></table></div>:<div className="empty"><strong>No posted movements</strong></div>}</section>
  </div>
  <section className="panel workflow-overview"><div className="panel-head"><div><h2>Live procurement</h2><p>Counts come from tenant-scoped database records.</p></div></div><div className="workflow-overview-grid">
   <button onClick={()=>onNavigate('requests')}><span>Open material requests</span><strong>{d.workflow.openMaterialRequests}</strong><small>Review requirements →</small></button>
   <button onClick={()=>onNavigate('stock-in')}><span>Open purchase orders</span><strong>{d.workflow.openPurchaseOrders}</strong><small>Receiving workflow →</small></button>
   <button onClick={()=>onNavigate('stock-in')}><span>Pending inspections</span><strong>{d.workflow.pendingInspections}</strong><small>Inspection register →</small></button>
   <div><span>Issued net cost</span><strong>{d.workflow.issuedNetCost===null?'Unavailable':`₱${decimal(d.workflow.issuedNetCost)}`}</strong><small>{d.workflow.issuedNetCost===null?'Historical cost data is incomplete.':'Posted releases less usable returns.'}</small></div>
  </div></section>
 </>
}
