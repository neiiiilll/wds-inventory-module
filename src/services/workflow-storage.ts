import { initialItems, initialTransactions } from "./inventory"
import { createWorkflowState, migrateFormReferences, migrateProcurement, migrateProcurementCompletion, type WorkflowState } from "./workflow"
import { firebaseAuth } from "./firebase"
import { isSupabaseConfigured, supabase } from "./supabase"
import { createSerialQueue } from "./async-queue"

const storageKey = "wds-inventory-workflow-v1"
const saveQueue = createSerialQueue()
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

/**
 * Loads the current local state and hydrates it from Supabase when
 * the migration has been applied. The UI remains usable if Supabase is not
 * configured or temporarily unavailable.
 */
export async function loadWorkflowStateFromSupabase(): Promise<WorkflowState | null> {
  if (!isSupabaseConfigured || !supabase || !firebaseAuth?.currentUser) return null
  const { data, error } = await supabase
    .from("workflow_snapshots")
    .select("state")
    .eq("id", "default")
    .maybeSingle()
  if (error) throw new Error(`Supabase load failed: ${error.message}`)
  if (!data?.state) return null
  return migrateState(validateWorkflowState(data.state as WorkflowState))
}

export async function saveWorkflowStateToSupabase(state: WorkflowState): Promise<void> {
  const client = supabase
  if (!isSupabaseConfigured || !client || !firebaseAuth?.currentUser) return
  await saveQueue(async () => {
    const { error } = await client.from("workflow_snapshots").upsert({
      id: "default",
      state,
      updated_at: new Date().toISOString(),
    })
    if (error) throw new Error(`Supabase save failed: ${error.message}`)
  })
}
