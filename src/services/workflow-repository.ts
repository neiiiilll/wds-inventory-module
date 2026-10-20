import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "./supabase"
import type { WorkflowState } from "./workflow"

type WorkflowSnapshotClient = Pick<SupabaseClient, "from">

export function createWorkflowRepository(client: WorkflowSnapshotClient | null) {
  return {
    async loadRemoteWorkflow(): Promise<WorkflowState | null> {
      if (!client) return null

      const { data, error } = await client
        .from("workflow_snapshots")
        .select("state")
        .eq("id", "default")
        .maybeSingle()

      if (error) throw error
      return (data?.state as WorkflowState | undefined) ?? null
    },

    async saveRemoteWorkflow(state: WorkflowState): Promise<void> {
      if (!client) throw new Error("Supabase is not configured.")

      const { error } = await client.from("workflow_snapshots").upsert(
        {
          id: "default",
          state,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      )

      if (error) throw error
    },
  }
}

export const { loadRemoteWorkflow, saveRemoteWorkflow } =
  createWorkflowRepository(supabase)
