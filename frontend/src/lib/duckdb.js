import * as duckdb from '@duckdb/duckdb-wasm'

let db = null
let conn = null

const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles()

export async function initDuckDB() {
  if (db) return { db, conn }

  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES)

  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
  )

  const worker = new Worker(worker_url)
  const logger = new duckdb.ConsoleLogger()

  db = new duckdb.AsyncDuckDB(logger, worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)

  URL.revokeObjectURL(worker_url)

  conn = await db.connect()
  return { db, conn }
}

export async function getConnection() {
  if (!conn) await initDuckDB()
  return conn
}

/**
 * Register a CSV file (ArrayBuffer) with DuckDB and create a table from it.
 * @param {string} tableName - The SQL table name to create.
 * @param {ArrayBuffer} buffer - The raw CSV file bytes.
 * @param {function} onProgress - Optional progress callback (0-100).
 */
export async function registerCSVAsTable(tableName, buffer, onProgress) {
  const { db, conn } = await initDuckDB()

  const filename = `${tableName}.csv`

  if (onProgress) onProgress(10)

  await db.registerFileBuffer(filename, new Uint8Array(buffer))

  if (onProgress) onProgress(50)

  // Drop table if already exists
  await conn.query(`DROP TABLE IF EXISTS "${tableName}"`)

  await conn.query(
    `CREATE TABLE "${tableName}" AS SELECT * FROM read_csv_auto('${filename}', header=true, sample_size=-1)`
  )

  if (onProgress) onProgress(100)

  // Return column info
  const result = await conn.query(`DESCRIBE "${tableName}"`)
  return result.toArray().map(row => ({
    name: row.column_name,
    type: row.column_type,
  }))
}

/**
 * Drop a table from DuckDB.
 */
export async function dropTable(tableName) {
  const c = await getConnection()
  await c.query(`DROP TABLE IF EXISTS "${tableName}"`)
}

/**
 * Execute an arbitrary SQL query and return rows as plain JS objects.
 * @returns {{ columns: string[], rows: object[], rowCount: number }}
 */
export async function executeQuery(sql) {
  const c = await getConnection()
  const result = await c.query(sql)
  const arrowTable = result

  const columns = arrowTable.schema.fields.map(f => f.name)
  const rows = arrowTable.toArray().map(row => {
    const obj = {}
    for (const col of columns) {
      const val = row[col]
      obj[col] = val === null || val === undefined ? null : String(val)
    }
    return obj
  })

  return { columns, rows, rowCount: rows.length }
}

/**
 * List all user tables currently loaded in DuckDB.
 */
export async function listTables() {
  const c = await getConnection()
  const result = await c.query(`SHOW TABLES`)
  return result.toArray().map(row => row.name)
}

/**
 * Describe a table's columns.
 */
export async function describeTable(tableName) {
  const c = await getConnection()
  const result = await c.query(`DESCRIBE "${tableName}"`)
  return result.toArray().map(row => ({
    name: row.column_name,
    type: row.column_type,
  }))
}
