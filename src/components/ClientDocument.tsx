import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkflowAction, WorkflowState } from "../services/workflow";
import type { IARFormFields, RISFormFields, StockCardFormFields } from "../services/client-form-types";
import { blankDocument, buildIarDocument, buildRisDocument, buildStockCardDocument, formTitle, PAPER_SIZES, renderDocumentHtml } from "../services/client-forms";
import { WButton, WField, WInput, WModal, WNote, WSelect } from "./WorkflowUI";

type Kind="iar"|"ris"|"stock-card";
type Fields=IARFormFields & RISFormFields & StockCardFormFields;
type FieldDefinition={key:keyof Fields;label:string;date?:boolean;long?:boolean};
const common:FieldDefinition[]=[{key:"entityName",label:"Entity name"},{key:"fundCluster",label:"Fund cluster"}];
const definitions:Record<Kind,FieldDefinition[]>={
  iar:[{key:"office",label:"Requisitioning office / department"},{key:"responsibilityCode",label:"Responsibility center code"},{key:"poReference",label:"PO number"},{key:"poDate",label:"PO date",date:true},{key:"invoiceNumber",label:"Invoice number"},{key:"invoiceDate",label:"Invoice date",date:true},{key:"inspectionDate",label:"Date inspected",date:true},{key:"receivedDate",label:"Date received",date:true}],
  ris:[{key:"division",label:"Division"},{key:"office",label:"Office"},{key:"responsibilityCode",label:"Responsibility center code"},{key:"purpose",label:"Purpose",long:true},{key:"requestedDesignation",label:"Requested by · designation"},{key:"approvedDesignation",label:"Approved by · designation"},{key:"issuedDesignation",label:"Issued by · designation"},{key:"receivedDesignation",label:"Received by · designation"},{key:"requestedDate",label:"Requested by · date",date:true},{key:"approvedDate",label:"Approved by · date",date:true},{key:"issuedDate",label:"Issued by · date",date:true},{key:"receivedDate",label:"Received by · date",date:true}],
  "stock-card":[{key:"unitLabel",label:"Unit measurement label"}],
};

export default function ClientDocument({kind,id,state,role,onAction,onClose}:{kind:Kind;id:string;state:WorkflowState;role:string;onAction:(a:WorkflowAction)=>boolean;onClose:()=>void}) {
  const [saved,setSaved]=useState<Fields>({});
  const [draft,setDraft]=useState<Fields>(saved);
  const [editing,setEditing]=useState(false);const [width,setWidth]=useState(800);const [ready,setReady]=useState(false);const [printError,setPrintError]=useState("");
  const frame=useRef<HTMLIFrameElement>(null);const container=useRef<HTMLDivElement>(null);const fieldRoot=useRef<HTMLDivElement>(null);const canEdit=role!=="Viewer";
  const linkedDoc=useMemo(()=>kind==="iar"?buildIarDocument(state,id,draft):kind==="ris"?buildRisDocument(state,id,draft):buildStockCardDocument(state,id,draft),[kind,id,state,draft]);

  const doc=useMemo(()=>{
    const form=blankDocument(linkedDoc);
    for(const [key,value] of Object.entries(draft))if(key in form&&key!=="kind"&&key!=="lines"&&key!=="signatures")Object.assign(form,{[key]:value});
    if(form.kind==="stock-card")form.unit=draft.unitLabel??"";
    if(form.kind==="ris")for(const [index,prefix] of ["requested","approved","issued","received"].entries()){
      form.signatures[index].designation=String(draft[`${prefix}Designation` as keyof Fields]??"");
      form.signatures[index].date=String(draft[`${prefix}Date` as keyof Fields]??"");
      form.signatures[index].name=draft.signatures?.[prefix]?.name??"";
    }
    if(form.kind==="iar"){
      form.inspector=draft.signatures?.inspection?.name??"";form.custodian=draft.signatures?.acceptance?.name??"";
    }
    return form;
  },[linkedDoc,draft]);
  const html=useMemo(()=>renderDocumentHtml(doc),[doc]);
  const [pageHeight,setPageHeight]=useState(PAPER_SIZES[doc.paper].height*96/25.4);
  const paperWidth=PAPER_SIZES[doc.paper].width*96/25.4;const scale=Math.min(1,(width-2)/paperWidth);
  const dirty=JSON.stringify(draft)!==JSON.stringify(saved);
  useEffect(()=>{const node=container.current;if(!node)return;const observer=new ResizeObserver(entries=>setWidth(entries[0].contentRect.width));observer.observe(node);return()=>observer.disconnect();},[]);
  useEffect(()=>setReady(false),[html]);
  const slots=kind==="iar"?[{id:"inspection",label:"Inspection Officer",dateKey:"inspectionDate"},{id:"acceptance",label:"Supply / Property Custodian",dateKey:"receivedDate"}]:kind==="ris"?[{id:"requested",label:"Requested by",dateKey:"requestedDate"},{id:"approved",label:"Approved by",dateKey:"approvedDate"},{id:"issued",label:"Issued by",dateKey:"issuedDate"},{id:"received",label:"Received by",dateKey:"receivedDate"}]:[];
  const set=(key:keyof Fields,value:unknown)=>setDraft(f=>{const slot=slots.find(s=>s.dateKey===key);return {...f,[key]:value,...(slot&&f.signatures?.[slot.id]?{signatures:{...f.signatures,[slot.id]:{...f.signatures[slot.id],date:String(value)}}}:{})};});
  const fallback=(key:keyof Fields):string=>{
    if(key==="unitLabel"&&doc.kind==="stock-card")return doc.unit;
    if(doc.kind==="ris") {const signatureFields=["requested","approved","issued","received"];for(let index=0;index<signatureFields.length;index++){if(key===`${signatureFields[index]}Designation`)return doc.signatures[index].designation;if(key===`${signatureFields[index]}Date`)return doc.signatures[index].date;}}
    return String((doc as unknown as Record<string,unknown>)[key]??"");
  };
  const validateFields=()=>{const invalid=Array.from(fieldRoot.current?.querySelectorAll<HTMLInputElement>("input")??[]).find(input=>!input.checkValidity());if(invalid){invalid.reportValidity();return false;}return true;};
  const save=()=>{if(validateFields()&&onAction({type:"form-fields",kind,id,fields:draft}))setSaved(draft);};
  const print=()=>{if(!validateFields())return;setPrintError("");try {const target=frame.current?.contentWindow;if(!target)throw Error("Print preview is still loading.");target.focus();target.print();}catch{setPrintError("Printing is unavailable in this preview. Open the system in your regular browser, then use Print / Save as PDF.");}};
  return <WModal title={formTitle(kind)} onClose={onClose}>
    <div className="client-document-tools"><div className="client-document-reference"><strong>{doc.reference}</strong><span>Client workbook format</span></div><WButton secondary onClick={()=>setEditing(!editing)}>{editing?"Hide form fields":"Edit form fields"}</WButton><WButton disabled={!ready} onClick={print}>Print / Save as PDF</WButton></div>
    {printError&&<div role="alert" className="workflow-note workflow-error">{printError}</div>}
    {dirty&&<div className="client-document-draft" role="status">{canEdit?"Preview includes unsaved form fields. Save them to retain these details on this record.":"Preview contains unsaved changes."}</div>}
    {editing&&<section className="client-document-fields"><h3>Document fields</h3><p>Enter the details to include in this form.</p><div className="form-grid" ref={fieldRoot}>{[...common,...definitions[kind]].map(def=>{const raw=String(draft[def.key]??fallback(def.key));const value=def.date&&raw.includes(",")?"":raw;return <WField key={def.key} label={def.label} hint={def.date?"MM/DD/YYYY":undefined}><WInput disabled={!canEdit} type={def.date?"date":"text"} maxLength={def.long?500:160} value={value} onChange={e=>set(def.key,e.target.value)}/></WField>;})}
      {doc.kind==="iar"&&<><WField label="Inspection statement checkbox"><WSelect disabled={!canEdit} value={doc.inspectionConforms?"yes":"no"} onChange={e=>set("inspectionConforms",e.target.value==="yes")}><option value="yes">Inspected, verified and found in order</option><option value="no">Not checked</option></WSelect></WField><WField label="Acceptance checkbox"><WSelect disabled={!canEdit} value={doc.acceptance} onChange={e=>set("acceptance",e.target.value)}><option value="">Not checked</option><option>Complete</option><option>Partial</option></WSelect></WField></>}
      {slots.map(slot=><div className="workflow-full" key={slot.id}><WField label={`${slot.label} · printed name`}><WInput disabled={!canEdit} maxLength={160} value={draft.signatures?.[slot.id]?.name??""} onChange={e=>set("signatures",{...draft.signatures,[slot.id]:{name:e.target.value,date:String(draft[slot.dateKey as keyof Fields]??"")}})}/></WField></div>)}
    </div>
      <div className="workflow-form-actions"><WButton secondary onClick={()=>{setDraft(saved);setEditing(false);}}>Discard field edits</WButton><WButton disabled={!canEdit||!dirty} onClick={save}>Save form fields</WButton></div>
    </section>}
    <div className="client-preview" ref={container}><div style={{width:paperWidth*scale,height:pageHeight*scale,position:"relative",margin:"0 auto"}}><iframe ref={frame} title={`${formTitle(kind)} print preview`} srcDoc={html} sandbox="allow-same-origin allow-modals" style={{width:paperWidth,height:pageHeight,transform:`scale(${scale})`,transformOrigin:"top left",border:0,position:"absolute",left:0,top:0}} onLoad={()=>{const content=frame.current?.contentDocument;const pages=Array.from(content?.querySelectorAll<HTMLElement>(".form-page")??[]);const height=pages.reduce((total,page)=>total+page.getBoundingClientRect().height+parseFloat(content?.defaultView?.getComputedStyle(page).marginBottom??"0"),0);setPageHeight(Math.ceil(Math.max(PAPER_SIZES[doc.paper].height*96/25.4,height))+2);setReady(true);}}/></div></div>
  </WModal>;
}
