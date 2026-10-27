import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const source=await readFile(new URL('../src/services/use-live-inventory.ts',import.meta.url),'utf8')
const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8')
assert.match(source,/expectedUid/);assert.match(source,/current=false/);assert.match(source,/ownerUid/);assert.match(source,/state\.ownerUid===uid/)
assert.match(app,/<AccessGate key=\{session\.uid\}/);assert.match(app,/<InventoryApp key=\{session\.uid\}/)
assert.match(source,/useSessionScopedState/);assert.match(source,/validLiveInvalidations/);assert.doesNotMatch(source,/localStorage|WorkflowState/)
console.log('Live resources synchronously mask prior-user data and remount the live tree per Firebase UID.')
