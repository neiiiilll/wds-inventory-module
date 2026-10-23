import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"

const server = await createServer({ appType: "custom", server: { middlewareMode: true } })

try {
  const { CapabilityGate, ReadOnlyAccessNotice } = await server.ssrLoadModule("/src/components/RoleAccess.tsx")

  const viewerNotice = renderToStaticMarkup(React.createElement(ReadOnlyAccessNotice, { role: "Viewer" }))
  assert.match(viewerNotice, /Read-only access/)
  assert.match(viewerNotice, /view, search, navigate, and print/i)
  assert.equal(renderToStaticMarkup(React.createElement(ReadOnlyAccessNotice, { role: "Inventory Staff" })), "")

  const action = React.createElement("button", null, "Update item")
  assert.equal(renderToStaticMarkup(React.createElement(CapabilityGate, {
    role: "Viewer", capability: "inventory.update", children: action,
  })), "")
  assert.match(renderToStaticMarkup(React.createElement(CapabilityGate, {
    role: "Inventory Staff", capability: "inventory.update", children: action,
  })), /Update item/)

  const print = React.createElement("button", null, "Print")
  assert.match(renderToStaticMarkup(React.createElement(CapabilityGate, {
    role: "Viewer", capability: "documents.print", children: print,
  })), /Print/)

  const mutationSources = await Promise.all([
    "InventoryWorkflow.tsx",
    "PurchaseDocuments.tsx",
    "Reconciliation.tsx",
    "MaterialCharges.tsx",
  ].map((name) => readFile(new URL(`../src/components/${name}`, import.meta.url), "utf8")))
  const [workflow, purchaseDocuments, reconciliation, materialCharges] = mutationSources
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8")
  assert.match(app, /const navigate = \(next: Page\)/, "The shell must centralize navigation.")
  assert.match(app, /canAccessPage\(role, next\)/, "Every shell navigation must enforce page capability.")
  assert.match(app, /canEdit && modal === "edit"/, "Role changes must immediately omit the App-owned item editor.")
  assert.match(app, /!canEdit && \(modal === "add" \|\| modal === "edit"\)/, "Role changes must clear stale App-owned mutation state.")
  for (const [name, source] of [
    ["InventoryWorkflow", workflow],
    ["PurchaseDocuments", purchaseDocuments],
    ["Reconciliation", reconciliation],
    ["MaterialCharges", materialCharges],
  ]) {
    assert.equal(/role\s*[!=]==?\s*["'](?:Administrator|Inventory Staff|Viewer)["']/.test(source), false, `${name} must use shared capability predicates.`)
  }
  assert.match(workflow, /canEdit && mode === "new"/, "Role changes must immediately omit an open workflow form.")
  for (const mode of ["ack", "cancel", "release"]) assert.match(workflow, new RegExp(`canEdit && mode === "${mode}"`))
  assert.match(workflow, /canEdit&&mode==="supplier-return"/)
  assert.match(purchaseDocuments, /canEdit&&\(mode==="new"\|\|mode==="revise"\)/, "Role changes must immediately omit open procurement editors.")
  for (const mode of ["review", "dispatch", "legacy-approve"]) assert.match(purchaseDocuments, new RegExp(`canEdit&&mode==="${mode}"`))
  assert.match(purchaseDocuments, /canEdit&&quoteFor!==null/)
  assert.match(reconciliation, /canEdit && mode &&/, "Role changes must immediately omit open reconciliation forms.")
  assert.match(materialCharges, /canEdit && edit &&/, "Role changes must immediately omit open billing configuration.")

  console.log("Role UI behavior checks passed.")
} finally {
  await server.close()
}
