import { initialItems, initialTransactions } from "./inventory"
import { createWorkflowState, migrateFormReferences, migrateProcurement, migrateProcurementCompletion, type WorkflowState } from "./workflow"

const storageKey = "wds-inventory-workflow-v1"
function validateWorkflowState(parsed: WorkflowState): WorkflowState {
  if (
    parsed.version !== 1 || (parsed.quotations!==undefined&&!Array.isArray(parsed.quotations)) ||
    !Number.isFinite(parsed.revision) ||
    ![
      parsed.items,
      parsed.transactions,
      parsed.requests,
      parsed.orders,
      parsed.iars,
      parsed.ris,
      parsed.releases,
      parsed.returns,
      parsed.counts,
      parsed.billing,
    ].every(Array.isArray)
  )
    throw Error(
      "Saved inventory data could not be loaded. Your existing browser data has been preserved.",
    )
  return parsed
}

function migrateState(parsed: WorkflowState): WorkflowState {
  const migrated=migrateProcurementCompletion(migrateProcurement(migrateFormReferences(parsed)))
  const raw=structuredClone(migrated) as unknown as Record<string, unknown>
  const removeSignatureData=(collection:string,keys:string[])=>{
    const rows=raw[collection]
    if(!Array.isArray(rows))return
    for(const row of rows){
      if(!row||typeof row!=="object")continue
      const record=row as Record<string,unknown>
      for(const key of keys)delete record[key]
      const form=record.form
      if(!form||typeof form!=="object"||Array.isArray(form))continue
      const signatures=(form as Record<string,unknown>).signatures
      if(!signatures||typeof signatures!=="object"||Array.isArray(signatures))continue
      ;(form as Record<string,unknown>).signatures=Object.fromEntries(
        Object.entries(signatures).map(([slot,value])=>{
          const entry=value&&typeof value==="object"?value as Record<string,unknown>:{}
          return [slot,{name:typeof entry.name==="string"?entry.name:"",date:typeof entry.date==="string"?entry.date:""}]
        }),
      )
    }
  }
  removeSignatureData("iars",["inspectionSignature","acceptanceSignature"])
  removeSignatureData("ris",["requestedSignature"])
  removeSignatureData("releases",["signature","recipientSignature"])
  return raw as unknown as WorkflowState
}

export function loadWorkflowState(): WorkflowState {
  const saved = localStorage.getItem(storageKey)
  if (!saved) return migrateProcurementCompletion(migrateProcurement(createWorkflowState(initialItems, initialTransactions)))
  const parsed = validateWorkflowState(JSON.parse(saved) as WorkflowState)
  const migrated=migrateState(parsed)
  if(JSON.stringify(migrated)!==JSON.stringify(parsed))saveWorkflowState(migrated);
  return migrated
}
export function saveWorkflowState(state: WorkflowState) {
  localStorage.setItem(storageKey, JSON.stringify(state))
}
