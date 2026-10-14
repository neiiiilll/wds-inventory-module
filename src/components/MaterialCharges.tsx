import { useState } from "react"
import {
  materialCostForJob,
  money,
  type WorkflowAction,
  type WorkflowState,
} from "../services/workflow"
import {
  itemName,
  WBadge,
  WButton,
  WDetail,
  WEmpty,
  WField,
  WForm,
  WInput,
  WNote,
  WSelect,
  WSummary,
} from "./WorkflowUI"

export default function MaterialCharges({
  state,
  role,
  onAction,
}: {
  state: WorkflowState
  role: string
  onAction: (a: WorkflowAction) => boolean
}) {
  const jobs = [...new Set(state.requests.map((r) => r.job))]
  const [job, setJob] = useState(jobs[0] ?? "")
  const [edit, setEdit] = useState(false)
  const slips = state.ris.filter(
    (s) => state.requests.find((r) => r.id === s.requestId)?.job === job,
  )
  const releases = state.releases.filter((r) =>
    slips.some((s) => s.id === r.risId),
  )
  const returns = state.returns.filter((r) =>
    releases.some((l) => l.id === r.releaseId),
  )
  const net = job ? materialCostForJob(state, job) : 0
  const config = state.billing.find((b) => b.job === job) ?? {
    job,
    markup: 0,
    fees: 0,
    tax: 0,
  }
  const markup = (net * config.markup) / 100
  const taxable = net + markup + config.fees
  const tax = (taxable * config.tax) / 100
  return (
    <>
      <div className="page-header">
        <div>
          <span className="eyebrow">PROJECT MATERIAL COSTS</span>
          <h1>Material Charges</h1>
          <p>
            Every actual issue and accepted return, connected to its RIS and
            job.
          </p>
        </div>
        <div className="page-actions">
          <WButton secondary disabled={!job} onClick={() => window.print()}>
            Print job cost sheet
          </WButton>
        </div>
      </div>
      <WNote>
        {state.sampleCosts
          ? "Sample acquisition prices are used in this mockup. "
          : ""}
        Moving weighted average values interchangeable stock; individually
        tracked assets use their acquisition cost. Issue costs remain locked
        after posting.
      </WNote>
      <div className="panel workflow-toolbar no-print">
        <WField label="Project / service connection">
          <WSelect
            value={job}
            onChange={(e) => {
              setJob(e.target.value)
              setEdit(false)
            }}
          >
            <option value="">Select job</option>
            {jobs.map((j) => (
              <option key={j}>{j}</option>
            ))}
          </WSelect>
        </WField>
        <span className="workflow-muted">
          Charges are derived from actual releases. Viewing or billing never
          changes stock.
        </span>
      </div>
      <WSummary
        values={[
          {
            label: "Issued material cost",
            value: money(releases.reduce((s, r) => s + r.value, 0)),
            hint: "Actual quantities × locked issue costs",
          },
          {
            label: "Accepted return credits",
            value: money(returns.reduce((s, r) => s + r.credit, 0)),
            hint: "Usable returns at original issue cost",
          },
          {
            label: "Net material cost",
            value: money(net),
            hint: "Issued material cost less return credits",
          },
          {
            label: "Related RIS records",
            value: slips.length,
            hint: "Includes partial & additional issuances",
          },
        ]}
      />
      <section className="panel document-preview charge-document">
        <div className="panel-head">
          <div>
            <h2>Job material cost sheet</h2>
            <p>{job || "Select a project to review its materials"}</p>
          </div>
          <WBadge>PHP · Cost basis</WBadge>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>DATE / DOCUMENT</th>
                <th>MATERIAL</th>
                <th>EVENT</th>
                <th>QUANTITY</th>
                <th>LOCKED UNIT COST</th>
                <th>VALUE / CREDIT</th>
              </tr>
            </thead>
            <tbody>
              {releases.flatMap((r) => {
                const slip = slips.find((s) => s.id === r.risId)!
                return [
                  <tr key={r.id}>
                    <td>
                      <strong>{slip.reference}</strong>
                      <small className="cell-sub">
                        {r.date} · {r.id}
                      </small>
                    </td>
                    <td>
                      {itemName(state, r.itemId)}
                      {r.assetTag && (
                        <small className="cell-sub">{r.assetTag}</small>
                      )}
                    </td>
                    <td>
                      <WBadge>Issue</WBadge>
                    </td>
                    <td>{r.quantity}</td>
                    <td>{money(r.unitCost)}</td>
                    <td>
                      <strong>{money(r.value)}</strong>
                    </td>
                  </tr>,
                  ...returns
                    .filter((t) => t.releaseId === r.id)
                    .map((t) => (
                      <tr key={t.id}>
                        <td>
                          <strong>{slip.reference}</strong>
                          <small className="cell-sub">
                            {t.date} · {t.id}
                          </small>
                        </td>
                        <td>{itemName(state, r.itemId)}</td>
                        <td>
                          <WBadge>
                            {!t.accepted
                              ? "Return pending"
                              : t.condition === "Usable"
                                ? "Usable return credit"
                                : "Damaged return · no auto-credit"}
                          </WBadge>
                        </td>
                        <td>{t.quantity}</td>
                        <td>{money(r.unitCost)}</td>
                        <td className="positive">
                          {t.credit ? `−${money(t.credit)}` : "—"}
                        </td>
                      </tr>
                    )),
                ]
              })}
            </tbody>
          </table>
        </div>
        {!releases.length && (
          <WEmpty text="Record an acknowledged actual release against a RIS to create a material charge." />
        )}
        <div className="charge-total">
          <span>Net material cost</span>
          <strong>{money(net)}</strong>
        </div>
      </section>
      <section className="panel billing-panel">
        <div className="panel-head">
          <div>
            <h2>Customer billing preview</h2>
            <p>
              Separately configured rates · inventory standards establish costs,
              not client tariffs
            </p>
          </div>
          <WButton
            secondary
            disabled={!job || role === "Viewer"}
            onClick={() => setEdit(!edit)}
          >
            {edit ? "Close rates" : "Configure rates"}
          </WButton>
        </div>
        <div className="billing-body">
          {edit && (
            <BillingForm
              key={job}
              config={config}
              onClose={() => setEdit(false)}
              onSave={(v) => {
                if (onAction({ type: "billing", ...v })) setEdit(false)
              }}
            />
          )}
          <div className="workflow-details">
            <WDetail label="Net material cost" value={money(net)} />
            <WDetail
              label={`Markup (${config.markup}%)`}
              value={money(markup)}
            />
            <WDetail
              label="Configured service / labor fees"
              value={money(config.fees)}
            />
            <WDetail
              label={`Configured tax (${config.tax}%)`}
              value={money(tax)}
            />
          </div>
          <div className="charge-total">
            <span>Preview total</span>
            <strong>{money(taxable + tax)}</strong>
          </div>
          <p className="workflow-muted">
            Preview convention: configured tax applies to net materials, markup,
            and fees. All additions default to zero. Confirm actual tariff and
            tax treatment before customer billing; this prototype does not issue
            invoices or collect payments.
          </p>
        </div>
      </section>
    </>
  )
}

function BillingForm({
  config,
  onClose,
  onSave,
}: {
  config: { job: string; markup: number; fees: number; tax: number }
  onClose: () => void
  onSave: (v: typeof config) => void
}) {
  const [form, setForm] = useState(config)
  return (
    <div className="workflow-action-box">
      <WForm
        onClose={onClose}
        onSubmit={() => onSave(form)}
        submit="Save billing inputs"
      >
        <WField label="Markup (%)">
          <WInput
            required
            type="number"
            min="0"
            max="100"
            step="any"
            value={form.markup}
            onChange={(e) =>
              setForm({ ...form, markup: Number(e.target.value) })
            }
          />
        </WField>
        <WField label="Service / labor fees (PHP)">
          <WInput
            required
            type="number"
            min="0"
            step="any"
            value={form.fees}
            onChange={(e) => setForm({ ...form, fees: Number(e.target.value) })}
          />
        </WField>
        <WField label="Configured tax (%)">
          <WInput
            required
            type="number"
            min="0"
            max="100"
            step="any"
            value={form.tax}
            onChange={(e) => setForm({ ...form, tax: Number(e.target.value) })}
          />
        </WField>
      </WForm>
    </div>
  )
}
