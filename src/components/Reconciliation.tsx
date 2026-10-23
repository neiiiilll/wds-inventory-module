import { useEffect, useState } from "react"
import { canMutateWorkflow, type AppRole } from "../services/access-control"

import {
  money,
  type WorkflowAction,
  type WorkflowState,
} from "../services/workflow"

import {
  controlNumber,
  itemName,
  today,
  WBadge,
  WButton,
  WEmpty,
  WField,
  WForm,
  WInput,
  WModal,
  WNote,
  WSelect,
  WSummary,
  WText,
} from "./WorkflowUI"

export default function Reconciliation({
  state,
  role,
  onAction,
}: {
  state: WorkflowState
  role: AppRole
  onAction: (a: WorkflowAction) => boolean
}) {
  const [tab, setTab] = useState<"counts" | "returns">("counts")
  const [mode, setMode] =
    useState<"" | "count" | "return" | "correct" | "accept-return">("")
  const [selected, setSelected] = useState("")
  const [search, setSearch] = useState("")

  const counts = state.counts.filter((c) =>
    `${itemName(state, c.itemId)} ${c.id} ${c.person} ${c.reference ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )

  const returns = state.returns.filter((r) =>
    `${r.id} ${r.releaseId} ${r.reason} ${itemName(state, state.releases.find((l) => l.id === r.releaseId)?.itemId ?? "")}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )

  const canEdit = canMutateWorkflow(role)
  useEffect(() => { if (!canEdit && mode) setMode("") }, [canEdit, mode])
  const close = () => setMode("")
  const submit = (a: WorkflowAction) => {
    if (!canEdit) return
    if (onAction(a)) close()
  }

  return (
    <>
      <div className="page-header">
        <div>
          <span className="eyebrow">INVENTORY CONTROL</span>
          <h1>Returns & Reconciliation</h1>
          <p>
            Account for returns, investigate count differences, and preserve
            each correction.
          </p>
        </div>
        <div className="page-actions">
          {canEdit && <>
            <WButton secondary onClick={() => setMode("return")}>
              ＋ Record return
            </WButton>
            <WButton onClick={() => setMode("count")}>
              ＋ Physical count
            </WButton>
          </>}
        </div>
      </div>
      <WSummary
        values={[
          {
            label: "Physical counts",
            value: state.counts.length,
            hint: "Recorded balances snapshotted at count",
          },
          {
            label: "Open discrepancies",
            value: state.counts.filter((c) => c.variance && !c.correctedBy)
              .length,
            hint: "Findings and authorization before correction",
          },
          {
            label: "Pending returns",
            value: state.returns.filter((r) => !r.accepted).length,
            hint: "No stock changes before acceptance",
          },
          {
            label: "Damaged returns",
            value: state.returns
              .filter((r) => r.condition === "Damaged")
              .reduce((s, r) => s + r.quantity, 0),
            hint: "Recorded separately from usable stock",
          },
        ]}
      />
      <section className="panel">
        <div className="filters">
          <div className="workflow-tabs">
            <button
              className={tab === "counts" ? "active" : ""}
              onClick={() => setTab("counts")}
            >
              Physical count worksheet
            </button>
            <button
              className={tab === "returns" ? "active" : ""}
              onClick={() => setTab("returns")}
            >
              Material returns
            </button>
          </div>
          <div className="search-field">
            <WInput
              aria-label="Search reconciliation records"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search item, reference, personnel…"
            />
          </div>
        </div>
        {tab === "counts" ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>COUNT / ITEM</th>
                    <th>RECORDED</th>
                    <th>COUNTED</th>
                    <th>VARIANCE</th>
                    <th>STATUS / FINDINGS</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {counts.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{itemName(state, c.itemId)}</strong>
                        <small className="cell-sub">
                          {c.id} · {c.date} · {c.person}
                        </small>
                      </td>
                      <td>{c.recorded}</td>
                      <td>{c.counted}</td>
                      <td className={c.variance ? "negative" : "positive"}>
                        {c.variance > 0 ? "+" : ""}
                        {c.variance}
                      </td>
                      <td>
                        <WBadge>
                          {c.correctedBy
                            ? "Corrected"
                            : c.variance
                              ? "Investigation required"
                              : "Matched"}
                        </WBadge>
                        {c.reason && (
                          <small className="cell-sub">
                            {c.reason} · {c.reference} · {c.correctedBy}
                          </small>
                        )}
                      </td>
                      <td>
                        {canEdit && <WButton
                          secondary
                          disabled={!c.variance || !!c.correctedBy}
                          onClick={() => {
                            setSelected(c.id)
                            setMode("correct")
                          }}
                        >
                          Investigate / correct
                        </WButton>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!counts.length && (
              <WEmpty text="Create a physical-count worksheet. Recording a count does not alter stock." />
            )}
          </>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>RETURN / MATERIAL</th>
                    <th>ORIGINAL RIS / JOB</th>
                    <th>QUANTITY</th>
                    <th>CONDITION</th>
                    <th>CREDIT</th>
                    <th>ACCEPTANCE</th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map((t) => {
                    const r = state.releases.find((r) => r.id === t.releaseId)!
                    const s = state.ris.find((s) => s.id === r.risId)!
                    const req = state.requests.find(
                      (q) => q.id === s.requestId,
                    )!
                    return (
                      <tr key={t.id}>
                        <td>
                          <strong>{itemName(state, r.itemId)}</strong>
                          <small className="cell-sub">
                            {t.id} · {t.date}
                          </small>
                          <small className="cell-sub">{t.reason}</small>
                        </td>
                        <td>
                          {s.reference}
                          <small className="cell-sub">{req.job}</small>
                          <small className="cell-sub">
                            Original release: {r.id}
                          </small>
                        </td>
                        <td>{t.quantity}</td>
                        <td>
                          <WBadge>{t.condition}</WBadge>
                        </td>
                        <td>{t.accepted ? money(t.credit) : "Pending"}</td>
                        <td>
                          {t.accepted ? (
                            <>
                              <WBadge>Accepted</WBadge>
                              <small className="cell-sub">By {t.person}</small>
                            </>
                          ) : (
                            canEdit ? <WButton
                              secondary
                              onClick={() => {
                                setSelected(t.id)
                                setMode("accept-return")
                              }}
                            >
                              Accept return
                            </WButton> : <WBadge>Pending</WBadge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {!returns.length && (
              <WEmpty text="Link returned materials to the original actual release and record their condition." />
            )}
          </>
        )}
      </section>
      <WNote>
        {tab === "counts"
          ? "Count differences do not change inventory until a documented correction is explicitly posted. Previous transactions are retained."
          : "Accepted usable returns restore stock and credit the original issue cost. Damaged returns do not increase usable stock or automatically credit customer charges."}
      </WNote>
      {canEdit && mode && (
        <WModal
          title={
            mode === "count"
              ? "Physical count worksheet"
              : mode === "return"
                ? "Record material return"
                : mode === "accept-return"
                  ? "Accept material return"
                  : "Investigate and correct discrepancy"
          }
          onClose={close}
        >
          {mode === "count" ? (
            <CountForm state={state} onClose={close} onAction={submit} />
          ) : mode === "return" ? (
            <ReturnForm state={state} onClose={close} onAction={submit} />
          ) : mode === "accept-return" ? (
            <AcceptanceForm
              state={state}
              id={selected}
              onClose={close}
              onAction={submit}
            />
          ) : (
            <CorrectionForm
              state={state}
              id={selected}
              onClose={close}
              onAction={submit}
            />
          )}
        </WModal>
      )}
    </>
  )
}

function CountForm({
  state,
  onClose,
  onAction,
}: {
  state: WorkflowState
  onClose: () => void
  onAction: (a: WorkflowAction) => void
}) {
  const [form, setForm] = useState({
    itemId: "",
    counted: "",
    person: "",
    date: today(),
  })
  const i = state.items.find((i) => i.id === form.itemId)
  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }))

  return (
    <WForm
      onClose={onClose}
      onSubmit={() =>
        onAction({
          type: "count",
          id: controlNumber("COUNT"),
          itemId: form.itemId,
          counted: Number(form.counted),
          person: form.person,
          date: form.date,
        })
      }
      submit="Save count · keep stock unchanged"
    >
      <WField label="Inventory item">
        <WSelect
          required
          value={form.itemId}
          onChange={(e) => set("itemId", e.target.value)}
        >
          <option value="">Select active item</option>
          {state.items
            .filter((i) => i.active)
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.code} · {i.name}
              </option>
            ))}
        </WSelect>
      </WField>
      <WField label="Physical quantity counted">
        <WInput
          required
          min="0"
          step="any"
          type="number"
          value={form.counted}
          onChange={(e) => set("counted", e.target.value)}
        />
      </WField>
      <WField label="Counted by">
        <WInput
          required
          value={form.person}
          onChange={(e) => set("person", e.target.value)}
        />
      </WField>
      <WField label="Count date">
        <WInput
          required
          type="date"
          value={form.date}
          onChange={(e) => set("date", e.target.value)}
        />
      </WField>
      {i && (
        <div className="workflow-full">
          <WNote>
            Recorded balance: {i.quantity} {i.unit}. Count variance:{" "}
            {form.counted ? Number(form.counted) - i.quantity : "—"}. Saving
            this worksheet does not post an adjustment.
          </WNote>
        </div>
      )}
    </WForm>
  )
}

function ReturnForm({
  state,
  onClose,
  onAction,
}: {
  state: WorkflowState
  onClose: () => void
  onAction: (a: WorkflowAction) => void
}) {
  const [form, setForm] = useState({
    releaseId: "",
    quantity: "",
    condition: "Usable" as "Usable" | "Damaged",
    person: "",
    date: today(),
    reason: "",
  })
  const r = state.releases.find((r) => r.id === form.releaseId)
  const max = r
    ? r.quantity -
      state.returns
        .filter((t) => t.releaseId === r.id)
        .reduce((s, t) => s + t.quantity, 0)
    : 0

  return (
    <WForm
      onClose={onClose}
      submit="Record return awaiting acceptance"
      onSubmit={() =>
        onAction({
          type: "return",
          id: controlNumber("RETURN"),
          ...form,
          quantity: Number(form.quantity),
          accepted: false,
        })
      }
    >
      <WField label="Original actual release">
        <WSelect
          required
          value={form.releaseId}
          onChange={(e) =>
            setForm({ ...form, releaseId: e.target.value, quantity: "" })
          }
        >
          <option value="">Select original release</option>
          {state.releases
            .filter(
              (r) =>
                r.quantity >
                state.returns
                  .filter((t) => t.releaseId === r.id)
                  .reduce((s, t) => s + t.quantity, 0),
            )
            .map((r) => (
              <option key={r.id} value={r.id}>
                {state.ris.find((s) => s.id === r.risId)?.reference} ·{" "}
                {itemName(state, r.itemId)} · {r.date} · {r.id}
              </option>
            ))}
        </WSelect>
      </WField>
      <WField label="Quantity returned">
        <WInput
          required
          type="number"
          min={r?.assetTag ? 1 : 0.00000001}
          step={r?.assetTag ? 1 : "any"}
          max={max}
          value={form.quantity}
          onChange={(e) => setForm({ ...form, quantity: e.target.value })}
        />
      </WField>
      <WField label="Condition">
        <WSelect
          value={form.condition}
          onChange={(e) =>
            setForm({
              ...form,
              condition: e.target.value as "Usable" | "Damaged",
            })
          }
        >
          <option>Usable</option>
          <option>Damaged</option>
        </WSelect>
      </WField>
      <WField label="Return received by">
        <WInput
          required
          value={form.person}
          onChange={(e) => setForm({ ...form, person: e.target.value })}
        />
      </WField>
      <WField label="Return date">
        <WInput
          required
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />
      </WField>
      <WField label="Reason / condition findings">
        <WText
          required
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
        />
      </WField>
      {r && (
        <div className="workflow-full">
          <WNote>
            Unreturned release quantity: {max}.{" "}
            {r.assetTag && `Original asset tag: ${r.assetTag}. `}
            {form.condition === "Usable"
              ? `Credit on acceptance: ${money((Number(form.quantity) || 0) * r.unitCost)} at original unit cost.`
              : "Damaged materials remain separate from usable stock; no automatic credit."}
          </WNote>
        </div>
      )}
    </WForm>
  )
}

function CorrectionForm({
  state,
  id,
  onClose,
  onAction,
}: {
  state: WorkflowState
  id: string
  onClose: () => void
  onAction: (a: WorkflowAction) => void
}) {
  const c = state.counts.find((c) => c.id === id)!
  const [form, setForm] = useState({ person: "", reason: "", reference: "" })
  const i = state.items.find((i) => i.id === c.itemId)!
  const stale =
    i.quantity !== c.recorded ||
    c.lastPostingId !==
      (state.transactions.find((t) => t.itemId === i.id)?.id ?? "")

  return (
    <>
      <WNote>
        {itemName(state, c.itemId)} · recorded {c.recorded}, counted {c.counted}
        , variance {c.variance}.{" "}
        {stale
          ? "Stock has changed since this count. Create a new count before posting."
          : "Posting appends a linked adjustment and preserves earlier entries."}
      </WNote>
      <WForm
        onClose={onClose}
        disabled={stale || i.costMethod === "Specific"}
        submit="Post documented correction"
        onSubmit={() => onAction({ type: "correct-count", id, ...form })}
      >
        <WField label="Investigation findings / correction reason">
          <WText
            required
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
        </WField>
        <WField label="Supporting / authorization reference">
          <WInput
            required
            value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
          />
        </WField>
        <WField label="Correction recorded by">
          <WInput
            required
            value={form.person}
            onChange={(e) => setForm({ ...form, person: e.target.value })}
          />
        </WField>
        {i.costMethod === "Specific" && (
          <div className="workflow-full">
            <WNote>
              Individually tracked assets require an asset-level investigation;
              bulk quantity corrections are blocked.
            </WNote>
          </div>
        )}
      </WForm>
    </>
  )
}

function AcceptanceForm({
  state,
  id,
  onClose,
  onAction,
}: {
  state: WorkflowState
  id: string
  onClose: () => void
  onAction: (a: WorkflowAction) => void
}) {
  const [person, setPerson] = useState("")
  const record = state.returns.find((r) => r.id === id)!
  const release = state.releases.find((r) => r.id === record.releaseId)!

  return (
    <>
      <WNote>
        {record.quantity}{" "}
        {state.items.find((i) => i.id === release.itemId)?.unit} of{" "}
        {itemName(state, release.itemId)} · {record.condition}.{" "}
        {record.condition === "Usable"
          ? `Acceptance restores stock and credits ${money(record.quantity * release.unitCost)} at the original issue cost.`
          : "Damaged materials are recorded separately; no usable stock increase or automatic charge credit."}
      </WNote>
      <WForm
        onClose={onClose}
        onSubmit={() => onAction({ type: "accept-return", id, person })}
        submit="Confirm return acceptance"
      >
        <WField label="Supply & Property Custodian">
          <WInput
            autoFocus
            required
            value={person}
            onChange={(e) => setPerson(e.target.value)}
          />
        </WField>
      </WForm>
    </>
  )
}
