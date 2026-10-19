import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import ts from "typescript"

const sourceUrl = new URL("../src/services/user-display.ts", import.meta.url)
let source = ""

try {
  source = await readFile(sourceUrl, "utf8")
} catch (error) {
  if (error?.code !== "ENOENT") throw error
}

const module = source
  ? await import(
      `data:text/javascript;base64,${Buffer.from(
        ts.transpileModule(source, {
          compilerOptions: { module: ts.ModuleKind.ESNext },
        }).outputText,
      ).toString("base64")}`
    )
  : {}

assert.equal(
  module.dashboardGreeting?.("Neil Christian"),
  "Good morning, Neil",
  "The dashboard greeting should use only the signed-in user's first name.",
)

assert.equal(
  module.dashboardGreeting?.("  Neil   Christian  "),
  "Good morning, Neil",
  "The dashboard greeting should ignore surrounding and repeated spaces.",
)

assert.equal(
  module.dashboardGreeting?.("neilchristiand17@gmail.com"),
  "Good morning, neilchristiand17",
  "The dashboard greeting should use the local part when only an email is available.",
)

assert.equal(
  module.userInitials?.("Tech Agent LI"),
  "TL",
  "The avatar should use the first and last initials of the Google display name.",
)

assert.equal(
  module.userInitials?.("Neil Christian"),
  "NC",
  "The avatar should reflect a different signed-in user's initials.",
)

assert.equal(
  module.userInitials?.("Neil"),
  "NE",
  "A single-word display name should use its first two letters.",
)

console.log("User display checks passed.")
