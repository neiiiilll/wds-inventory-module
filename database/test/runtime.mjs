// Test utilities only. Never connect to an existing service or cloud database.
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdir, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises"
import { createServer } from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"
const exec = promisify(execFile)
const root = fileURLToPath(new URL("../../", import.meta.url))

export function assertTestDatabaseUrl(value) {
  const url = new URL(value)
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !/^\/inventory_test_[a-z0-9_]+$/.test(url.pathname) || url.search) {
    throw new Error("Database tests require a disposable loopback database")
  }
  return value
}
async function availablePort() {
  const server = createServer()
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
export async function createTestDatabase() {
  if (process.env.INVENTORY_TEST_DATABASE_URL) {
    assertTestDatabaseUrl(process.env.INVENTORY_TEST_DATABASE_URL)
    throw new Error("This runner only creates its own ephemeral cluster; external databases are never modified")
  }
  const dir = await mkdtemp(path.join(root, ".tmp-inventory-db-"))
  const data = path.join(dir, "data")
  const bin = process.env.INVENTORY_TEST_PG_BIN ?? "C:/Program Files/PostgreSQL/18/bin"
  const binary = name => path.join(bin, process.platform === "win32" ? `${name}.exe` : name)
  const port = await availablePort()
  const options = { windowsHide: true, timeout: 60000, maxBuffer: 2 ** 20 }
  let started = false
  const clients = new Set()
  const close = async () => {
    for (const client of clients) await client.end().catch(() => {})
    if (started) await exec(binary("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], options)
    // Remove only a verified test-owned directory, never PG's installed data.
    const target = await realpath(dir)
    const workspace = await realpath(root)
    if (path.dirname(target) !== workspace || !path.basename(target).startsWith(".tmp-inventory-db-")) throw new Error("Unsafe test directory cleanup refused")
    await rm(target, { recursive: true })
  }
  try {
    console.error("[inventory-db-test] initializing isolated cluster")
    await exec(binary("initdb"), ["-D", data, "-U", "codex_test", "--auth=trust", "--encoding=UTF8", "--locale=C", "--no-sync"], options)
    console.error("[inventory-db-test] starting isolated cluster")
    await exec(binary("pg_ctl"), ["-D", data, "-l", path.join(dir, "server.log"), "-o", `-h 127.0.0.1 -p ${port} -F`, "-w", "start"], options)
    started = true
    console.error("[inventory-db-test] connecting to isolated cluster")
    const connect = async url => {
      const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, query_timeout: 15000 })
      clients.add(client); await client.connect(); return client
    }
    const owner = await connect(`postgres://codex_test@127.0.0.1:${port}/postgres`)
    console.error("[inventory-db-test] creating disposable database")
    const database = `inventory_test_${path.basename(dir).replace(/[^a-z0-9]/gi, "").toLowerCase()}`
    await owner.query(`CREATE DATABASE ${database}`)
    const url = assertTestDatabaseUrl(`postgres://codex_test@127.0.0.1:${port}/${database}`)
    const client = await connect(url)
    await client.query("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS")
    console.error("[inventory-db-test] applying disposable fixtures")
    const migrationRoot = path.join(root, "supabase/migrations")
    const files = (await readdir(migrationRoot)).filter(file => /^20261022000[1-5]00_/.test(file)).sort()
    for (const file of files) await client.query(await readFile(path.join(migrationRoot, file), "utf8"))
    await client.query(await readFile(new URL("./bootstrap.sql", import.meta.url), "utf8"))
    for (const file of (await readdir(migrationRoot)).filter(file => /^20261023\d+_inventory_procurement_/.test(file)).sort()) await client.query(await readFile(path.join(migrationRoot, file), "utf8"))
    return { client, connect: () => connect(url), close }
  } catch (error) { await close(); throw error }
}
