import { spawnSync } from "node:child_process"
import { readdir } from "node:fs/promises"
const group = process.argv[2]
const files = (await readdir(new URL("../database/test/", import.meta.url)))
  .filter(name => name.endsWith(".test.mjs") && (!group || name.includes(group) || name === "runtime.test.mjs"))
if (!files.length) throw new Error("No database test group matched")
const result = spawnSync(process.execPath, ["--test", ...files.map(file => `database/test/${file}`)], { stdio: "inherit", windowsHide: true })
process.exitCode = result.status ?? 1
