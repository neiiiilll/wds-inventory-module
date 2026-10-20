import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(
  new URL("../src/components/MaterialCharges.tsx", import.meta.url),
  "utf8",
)

assert.equal(
  source.includes("Sample acquisition prices are used in this mockup"),
  false,
  "Material Charges must not display the sample-acquisition-price notice.",
)
assert.equal(
  source.includes("Moving weighted average values interchangeable stock"),
  false,
  "Material Charges must not display the valuation-method notice.",
)
assert.equal(
  source.includes("Issue costs remain locked after posting"),
  false,
  "Material Charges must not display the locked-cost notice.",
)

console.log("Material Charges UI checks passed.")
