import {useCallback,useState} from 'react'
import type {AppRole} from '../../services/access-control'
import {listProcurementDocuments,type DocumentKind,type DocumentSummary} from '../../services/procurement-api'
import {useLiveInventoryResource} from '../../services/use-live-inventory'
import MaterialRequestForm from './MaterialRequestForm'
import InventorySetup from './InventorySetup'
import ProcurementDocument from './ProcurementDocument'
import ProcurementRegister from './ProcurementRegister'

const KINDS:Array<{kind:DocumentKind;label:string}>=[{kind:'material_request',label:'Requests'},{kind:'quotation',label:'Quotations'},{kind:'purchase_request',label:'Purchase requests'},{kind:'purchase_order',label:'Purchase orders'},{kind:'inspection',label:'Receiving'}]
export default function LiveProcurement({initialKind,role}:{initialKind:DocumentKind;role:AppRole}){
 const [kind,setKind]=useState(initialKind),[cursor,setCursor]=useState<string|undefined>(),[selected,setSelected]=useState<DocumentSummary|null>(null),[creating,setCreating]=useState(false),[setup,setSetup]=useState(false),canMutate=role!=='Viewer'
 const loader=useCallback(()=>listProcurementDocuments({kind,limit:50,...(cursor?{cursor}:{})}),[kind,cursor]),resource=useLiveInventoryResource(`procurement:${kind}:${cursor??'first'}`,loader)
 const chooseKind=(next:DocumentKind)=>{setKind(next);setCursor(undefined);setSelected(null);setCreating(false)}
 const changed=()=>{setCursor(undefined);resource.reload()}
 return <><section className="page-header"><div><span className="eyebrow">LIVE PROCUREMENT</span><h1>Procurement workflow</h1><p>Tenant-scoped requests, sourcing, approvals, orders, delivery, and acceptance.</p></div><div className="page-actions">{role==='Administrator'&&<button className="btn btn-secondary" onClick={()=>setSetup(value=>!value)}>{setup?'Close setup':'Inventory setup'}</button>}{canMutate&&kind==='material_request'&&<button className="btn btn-primary" onClick={()=>setCreating(value=>!value)}>{creating?'Close form':'New material request'}</button>}</div></section><div className="workspace-note"><span>LIVE</span>Firebase authentication → Inventory callable → tenant-scoped Supabase transactions. Browser demo state is not used here.</div>{setup&&<InventorySetup onClose={()=>setSetup(false)} onSaved={changed}/>}<nav className="workflow-tabs" aria-label="Procurement document types">{KINDS.map(tab=><button key={tab.kind} className={kind===tab.kind?'active':''} onClick={()=>chooseKind(tab.kind)}>{tab.label}</button>)}</nav>{creating&&<MaterialRequestForm onCancel={()=>setCreating(false)} onSaved={()=>{setCreating(false);changed()}}/>}<ProcurementRegister kind={kind} items={resource.data?.items??[]} loading={resource.loading} error={!!resource.error} nextCursor={resource.data?.nextCursor??null} onSelect={setSelected} onRefresh={resource.reload} onNext={()=>{if(resource.data?.nextCursor)setCursor(resource.data.nextCursor)}}/>{selected&&<ProcurementDocument summary={selected} canMutate={canMutate} isAdmin={role==='Administrator'} onClose={()=>setSelected(null)} onChanged={changed}/>}</>
}
