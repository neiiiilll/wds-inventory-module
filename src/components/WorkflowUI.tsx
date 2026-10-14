import {
  cloneElement,
  isValidElement,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import DateInput from "./DateInput";
import type { Attachment, WorkflowState } from "../services/workflow"
import { randomId } from "../services/workflow"

export function WButton({
  children,
  secondary = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) {
  return (
    <button
      type="button"
      className={`btn btn-${secondary ? "secondary" : "primary"}`}
      {...props}
    >
      {children}
    </button>
  )
}
export function WField({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  const id = useId()
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(
            children as ReactElement<{
              id: string
              "aria-describedby"?: string
            }>,
            { id, "aria-describedby": hint ? `${id}-hint` : undefined },
          )
        : children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  )
}
export function WInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  if(props.type==="date")return <DateInput className="field" {...props}/>;
  return <input className="field" {...props} />
}
export function WSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="field" {...props} />
}
export function WText(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return <textarea className="field textarea" {...props} />
}
export function WBadge({ children }: { children: ReactNode }) {
  return <span className="workflow-badge">{children}</span>
}
export function WModal({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  return createPortal(
    <div
      className="modal-backdrop"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal modal-wide workflow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            <p>WDS · Inventory & material operations</p>
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </section>
    </div>,
    document.body,
  )
}
export function WForm({
  children,
  onSubmit,
  onClose,
  submit = "Save record",
  disabled = false,
}: {
  children: ReactNode
  onSubmit: () => void
  onClose: () => void
  submit?: string
  disabled?: boolean
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <div className="form-grid">{children}</div>
      <div className="workflow-form-actions">
        <WButton secondary onClick={onClose}>
          Cancel
        </WButton>
        <button type="submit" disabled={disabled} className="btn btn-primary">
          {submit}
        </button>
      </div>
    </form>
  )
}
export function WEmpty({
  text = "No records yet. Create a record to start this workflow.",
}: {
  text?: string
}) {
  return (
    <div className="workflow-empty">
      <strong>No records to display</strong>
      <p>{text}</p>
    </div>
  )
}
export function WSummary({
  values,
}: {
  values: { label: string; value: ReactNode; hint: string }[]
}) {
  return (
    <div className="report-kpis workflow-kpis">
      {values.map((v) => (
        <div key={v.label}>
          <span>{v.label}</span>
          <strong>{v.value}</strong>
          <small>{v.hint}</small>
        </div>
      ))}
    </div>
  )
}
export function WDetail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="workflow-detail">
      <span>{label}</span>
      <strong>{value === "" || value == null ? "—" : value}</strong>
    </div>
  )
}
export function WNote({ children }: { children: ReactNode }) {
  return <div className="workflow-note">{children}</div>
}
export function AttachmentInput({
  value,
  onChange,
}: {
  value: Attachment[]
  onChange: (v: Attachment[]) => void
}) {
  const [error, setError] = useState("")
  return (
    <div className="workflow-full">
      <WField
        label="Supporting documents"
        hint="PDF, images, or text. Maximum 2 MB per document; saved in this browser for the demo."
      >
        <WInput
          type="file"
          multiple
          accept="application/pdf,image/png,image/jpeg,text/plain"
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? [])
            setError("")
            try {
              if (files.some((f) => f.size > 2 * 1024 * 1024))
                throw Error("Each document must be under 2 MB.")
              if (
                files.some(
                  (f) =>
                    ![
                      "application/pdf",
                      "image/png",
                      "image/jpeg",
                      "text/plain",
                    ].includes(f.type),
                )
              )
                throw Error("Select PDF, PNG, JPEG, or plain text documents.")
              const attachments = await Promise.all(
                files.map(
                  (f) =>
                    new Promise<Attachment>((resolve, reject) => {
                      const reader = new FileReader()
                      reader.onload = () =>
                        resolve({ name: f.name, data: String(reader.result) })
                      reader.onerror = () =>
                        reject(Error("Could not read document."))
                      reader.readAsDataURL(f)
                    }),
                ),
              )
              onChange([...value, ...attachments])
            } catch (err) {
              setError((err as Error).message)
            }
            e.target.value = ""
          }}
        />
      </WField>
      {error && <p className="workflow-error">{error}</p>}
      {value.map((a, index) => (
        <div className="attachment-row" key={`${a.name}-${index}`}>
          <span>{a.name}</span>
          <button
            type="button"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  )
}
export function AttachmentLinks({ values = [] }: { values?: Attachment[] }) {
  return (
    <div className="workflow-attachments">
      {values.map((a, i) => (
        <a
          className="btn btn-secondary"
          key={i}
          href={a.data}
          download={a.name}
        >
          ↓ {a.name}
        </a>
      ))}
    </div>
  )
}
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
export const controlNumber = (prefix: string) =>
  `${prefix}-${new Date().getFullYear()}-${randomId().slice(0, 8).toUpperCase()}`
export const itemName = (state: WorkflowState, id: string) =>
  state.items.find((i) => i.id === id)?.name ?? id
