import { useState } from "react";
import { canChangeRequester, type AppRole } from "../services/access-control";
import { WField, WInput, WSelect } from "./WorkflowUI";

export default function RequesterField({ value, role, personnel, onChange }: {
  value: string;
  role: AppRole;
  personnel: string[];
  onChange: (name: string) => void;
}) {
  const [manual, setManual] = useState(false);
  const names = [...new Set([...personnel, value].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (!canChangeRequester(role)) return <WField label="Requesting personnel"><WInput required readOnly value={value}/></WField>;
  return <>
    <WField label="Requesting personnel">
      <WSelect required value={manual ? "__custom__" : value} onChange={event => {
        const custom = event.target.value === "__custom__";
        setManual(custom);
        onChange(custom ? "" : event.target.value);
      }}>
        <option value="">Select requesting personnel</option>
        {names.map(name => <option key={name} value={name}>{name}</option>)}
        <option value="__custom__">Enter another name…</option>
      </WSelect>
    </WField>
    {manual && <WField label="Requester name"><WInput required autoFocus value={value} onChange={event => onChange(event.target.value)}/></WField>}
  </>;
}
