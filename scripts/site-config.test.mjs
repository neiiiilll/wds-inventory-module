import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const config = JSON.parse(
  await readFile(new URL("../.figma/make/site.json", import.meta.url), "utf8"),
)

assert.equal(
  config.title,
  "Inventory Management",
  "The browser tab title should identify the inventory application.",
)

console.log("Site configuration checks passed.")
