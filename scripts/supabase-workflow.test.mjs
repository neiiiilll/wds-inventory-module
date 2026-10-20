import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import ts from "typescript"

const repositoryUrl = new URL("../src/services/workflow-repository.ts", import.meta.url)
let repositorySource = ""
try {
  repositorySource = await readFile(repositoryUrl, "utf8")
} catch (error) {
  if (error?.code !== "ENOENT") throw error
}

const compiledRepository = repositorySource
  ? ts.transpileModule(repositorySource, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText
      .replace('import { supabase } from "./supabase";', "const supabase = null;")
  : "export const createWorkflowRepository = undefined"
const repositoryModule = await import(
  `data:text/javascript;base64,${Buffer.from(compiledRepository).toString("base64")}`
)

function createFakeClient({ selected, selectError, upsertError } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      calls.push(["from", table])
      return {
        select(columns) {
          calls.push(["select", columns])
          return {
            eq(column, value) {
              calls.push(["eq", column, value])
              return {
                async maybeSingle() {
                  calls.push(["maybeSingle"])
                  return { data: selected, error: selectError ?? null }
                },
              }
            },
          }
        },
        async upsert(value, options) {
          calls.push(["upsert", value, options])
          return { error: upsertError ?? null }
        },
      }
    },
  }
}

assert.equal(
  typeof repositoryModule.createWorkflowRepository,
  "function",
  "A workflow repository factory must be exported.",
)

const missingClient = repositoryModule.createWorkflowRepository(null)
assert.equal(await missingClient.loadRemoteWorkflow(), null)
await assert.rejects(
  () => missingClient.saveRemoteWorkflow({ revision: 1 }),
  /Supabase is not configured/,
)

const state = { version: 1, revision: 7, items: [] }
const loadClient = createFakeClient({ selected: { state } })
const loaded = await repositoryModule
  .createWorkflowRepository(loadClient)
  .loadRemoteWorkflow()
assert.deepEqual(loaded, state)
assert.deepEqual(loadClient.calls, [
  ["from", "workflow_snapshots"],
  ["select", "state"],
  ["eq", "id", "default"],
  ["maybeSingle"],
])

const writeClient = createFakeClient()
await repositoryModule
  .createWorkflowRepository(writeClient)
  .saveRemoteWorkflow(state)
const upsertCall = writeClient.calls.find(([name]) => name === "upsert")
assert.equal(upsertCall[1].id, "default")
assert.deepEqual(upsertCall[1].state, state)
assert.match(upsertCall[1].updated_at, /^\d{4}-\d{2}-\d{2}T/)
assert.deepEqual(upsertCall[2], { onConflict: "id" })

const databaseError = new Error("database unavailable")
await assert.rejects(
  () =>
    repositoryModule
      .createWorkflowRepository(createFakeClient({ selectError: databaseError }))
      .loadRemoteWorkflow(),
  databaseError,
)
await assert.rejects(
  () =>
    repositoryModule
      .createWorkflowRepository(createFakeClient({ upsertError: databaseError }))
      .saveRemoteWorkflow(state),
  databaseError,
)

const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8")
assert.match(appSource, /loadRemoteWorkflow/)
assert.match(appSource, /saveRemoteWorkflow/)
assert.match(appSource, /createSerialQueue/)
assert.match(appSource, /Loading shared inventory/)
assert.match(appSource, /Record saved to the shared inventory/)

console.log("Supabase workflow checks passed.")
