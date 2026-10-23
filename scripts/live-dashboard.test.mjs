import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8')
for(const file of ['LiveDashboard','LiveMovementRegister','LiveReceiptRegister']){const source=await readFile(new URL(`../src/components/live/${file}.tsx`,import.meta.url),'utf8');assert.doesNotMatch(source,/localStorage|loadWorkflowState|workflow-storage/);assert.match(source,/useLiveInventoryResource/)}
const dashboard=await readFile(new URL('../src/components/live/LiveDashboard.tsx',import.meta.url),'utf8')
assert.match(dashboard,/getInventoryDashboard/);assert.doesNotMatch(dashboard,/listInventoryItems/);assert.match(dashboard,/slice\(0,5\)/);assert.match(dashboard,/slice\(0,6\)/)
assert.match(app,/<LiveDashboard/);assert.match(app,/<LiveMovementRegister/);assert.match(app,/<LiveReceiptRegister/)
console.log('Dashboard, Transactions and Stock In use live callable data without demo fallback.')
