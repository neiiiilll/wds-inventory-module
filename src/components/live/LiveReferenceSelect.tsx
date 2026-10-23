import {useCallback} from 'react'
import {getProcurementReferenceData,type ReferenceKind} from '../../services/procurement-api'
import {useLiveInventoryResource} from '../../services/use-live-inventory'

export default function LiveReferenceSelect({kind,value,onChange,label,required=true}:{kind:ReferenceKind;value:string;onChange:(value:string)=>void;label:string;required?:boolean}){
 const loader=useCallback(()=>getProcurementReferenceData({kind,limit:100}),[kind]),resource=useLiveInventoryResource(`reference:${kind}`,loader)
 return <label className="form-field"><span>{label}{required&&' *'}</span><select className="field" value={value} onChange={event=>onChange(event.target.value)} required={required} disabled={resource.loading||!!resource.error}><option value="">{resource.loading?'Loading…':resource.error?'Unavailable — retry the page':'Select…'}</option>{resource.data?.items.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
}
