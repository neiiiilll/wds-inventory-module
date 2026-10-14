import {useEffect,useRef,useState,type ChangeEvent,type InputHTMLAttributes} from "react";
import {displayDate,parseDisplayDate} from "../services/date-input";

export default function DateInput({value,onChange,type:_,min,max,maxLength:__,...props}:InputHTMLAttributes<HTMLInputElement>){
  const stored=String(value??"");const [text,setText]=useState(()=>displayDate(stored));const input=useRef<HTMLInputElement>(null);const calendar=useRef<HTMLInputElement>(null);
  useEffect(()=>setText(displayDate(stored)),[stored]);
  useEffect(()=>{const parsed=parseDisplayDate(text);const message=parsed===null?"Enter a valid date in MM/DD/YYYY format.":parsed&&min&&parsed<String(min)?`Date must be on or after ${displayDate(String(min))}.`:parsed&&max&&parsed>String(max)?`Date must be on or before ${displayDate(String(max))}.`:"";input.current?.setCustomValidity(message);},[text,min,max]);
  const change=(event:ChangeEvent<HTMLInputElement>)=>{
    const raw=event.target.value;setText(raw);const parsed=parseDisplayDate(raw);if(parsed===null)return;
    // Keep the existing ISO-date callbacks while the visible field uses the requested format.
    const target=new Proxy(event.target,{get:(node,key)=>key==="value"?parsed:Reflect.get(node,key,node)});
    onChange?.({...event,target,currentTarget:target});
  };
  const editable=!props.readOnly&&!props.disabled;
  return <div className="date-input-control">
    <input {...props} className={`${props.className??""} ${editable?"date-input-text":""}`} ref={input} type="text" inputMode="numeric" placeholder="MM/DD/YYYY" maxLength={10} value={text} onChange={change}/>
    {editable&&<>
      <input ref={calendar} className="date-input-native" type="date" tabIndex={-1} aria-hidden="true" min={min} max={max} value={parseDisplayDate(text)??stored} onChange={event=>{
        setText(displayDate(event.target.value));
        onChange?.(event);
        input.current?.focus();
      }}/>
      <button type="button" className="date-input-calendar" aria-label="Open calendar" onClick={()=>{
        const picker=calendar.current;
        if(!picker)return;
        if(typeof picker.showPicker==="function")picker.showPicker();
        else {picker.focus();picker.click();}
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/></svg>
      </button>
    </>}
  </div>;
}
