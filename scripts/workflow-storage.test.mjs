import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"

const source = readFileSync(new URL("../src/services/async-queue.ts", import.meta.url), "utf8")
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { createSerialQueue } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`)

const queue = createSerialQueue()
const order = []
let releaseFirst
const first = queue(async () => {
  order.push("first-start")
  await new Promise((resolve) => { releaseFirst = resolve })
  order.push("first-end")
  return 1
})
const second = queue(async () => {
  order.push("second")
  return 2
})

await Promise.resolve()
assert.deepEqual(order, ["first-start"])
releaseFirst()
assert.equal(await first, 1)
assert.equal(await second, 2)
assert.deepEqual(order, ["first-start", "first-end", "second"])
console.log("Workflow storage checks passed: asynchronous saves remain ordered.")
