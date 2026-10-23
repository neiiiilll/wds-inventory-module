import type {DocumentDetail} from '../../services/procurement-api'

const value=(input:unknown)=>typeof input==='string'||typeof input==='number'?String(input):'—'
export default function ProcurementPrint({document}:{document:DocumentDetail}){return <article className="document-preview live-document-print">
 <div className="document-heading"><div><span className="eyebrow">LIVE INVENTORY DOCUMENT</span><h2>{document.reference}</h2></div><span className="workflow-badge">{document.status}</span></div>
 <p className="document-layout-note">Printed display fields are presentation only. Authorization comes from the authenticated database workflow.</p>
 <div className="workflow-details"><div className="workflow-detail"><span>Kind</span><strong>{document.kind.replace(/_/g,' ')}</strong></div><div className="workflow-detail"><span>Date</span><strong>{document.date??'—'}</strong></div><div className="workflow-detail"><span>Version</span><strong>v{document.version}</strong></div><div className="workflow-detail"><span>Revision</span><strong>{document.revision??'—'}</strong></div></div>
 <div className="table-wrap"><table><thead><tr><th>Line</th><th>Item snapshot</th><th>Quantity</th><th>Unit price</th><th>Specification</th></tr></thead><tbody>{document.lines.map(line=><tr key={line.id}><td>{line.lineNo}</td><td>{value(line.snapshot?.name??line.snapshot?.itemName??line.itemId)}</td><td>{line.quantity}</td><td>{line.unitPrice??'—'}</td><td>{line.specification??'—'}</td></tr>)}</tbody></table></div>
 </article>}
