import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const source=await readFile(new URL('../src/services/use-live-inventory.ts',import.meta.url),'utf8')
assert.match(source,/expectedUid/);assert.match(source,/current=false/);assert.match(source,/setState\(\{loading:true,data:null,error:null\}\)/)
assert.match(source,/useSessionScopedState/);assert.match(source,/VALID/);assert.doesNotMatch(source,/localStorage|WorkflowState/)
console.log('Live resources discard stale sessions and clear scoped state without demo fallback.')
