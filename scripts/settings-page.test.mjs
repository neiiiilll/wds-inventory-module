import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8")
const settings = await readFile(new URL("../src/components/Settings.tsx", import.meta.url), "utf8").catch(() => "")

assert.ok(settings.includes("Account settings"), "Settings must identify the signed-in account section.")
assert.ok(settings.includes("currentUser.displayName"), "Settings must show the Google display name.")
assert.ok(settings.includes("currentUser.email"), "Settings must show the Google email address.")
assert.ok(settings.includes("currentUser.role"), "Settings must show the assigned application role.")
assert.ok(settings.includes("currentUser.tenantKey"), "Settings must show the assigned tenant key.")
assert.equal(settings.includes("<UserAccess"), false, "Settings must not expose direct shared-table role management.")
assert.ok(settings.includes("onSignOut"), "Settings must provide a working sign-out action.")

assert.ok(app.includes('"settings"'), "Settings must be an application route.")
assert.ok(app.includes('page === "settings"'), "The application must render the Settings route.")
assert.ok(app.includes("<Settings"), "The Settings route must render the account settings component.")
assert.ok(app.includes("setPage(\"settings\")"), "The sidebar Settings button must navigate to Settings.")
assert.equal(/canManageUsers\(role\)[\s\S]{0,180}setPage\("settings"\)/.test(app), false, "Settings navigation must be available to every active role.")

console.log("Settings page checks passed.")
