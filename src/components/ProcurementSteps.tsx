import { procurementSteps, type ProcurementSection } from "../services/workflow";

export default function ProcurementSteps({ current, onNavigate }: {
  current: ProcurementSection;
  onNavigate: (section: ProcurementSection) => void;
}) {
  return <nav className="workflow-steps" aria-label="Procurement process">
    {procurementSteps.map((step, index) => <button
      type="button"
      key={step.id}
      className={current === step.id ? "current" : ""}
      aria-current={current === step.id ? "step" : undefined}
      onClick={() => onNavigate(step.id)}
    ><span>{index + 1}</span>{step.label}</button>)}
  </nav>;
}
