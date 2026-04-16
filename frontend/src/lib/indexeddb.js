import { openDB } from 'idb'

const DB_NAME = 'csv-sql-studio'
const DB_VERSION = 1
const STORE_TABLES = 'tables'

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_TABLES)) {
        db.createObjectStore(STORE_TABLES, { keyPath: 'name' })
      }
    },
  })
}

/**
 * Persist a CSV table's metadata and raw buffer to IndexedDB.
 */
export async function saveTable(name, buffer, columns, rowCount, sizeBytes) {
  const db = await getDB()
  await db.put(STORE_TABLES, {
    name,
    buffer,
    columns,
    rowCount,
    sizeBytes,
    createdAt: Date.now(),
  })
}

/**
 * Load all saved table metadata (without buffer) for the explorer.
 */
export async function loadTablesMeta() {
  const db = await getDB()
  const all = await db.getAll(STORE_TABLES)
  return all.map(({ name, columns, rowCount, sizeBytes, createdAt }) => ({
    name,
    columns,
    rowCount,
    sizeBytes,
    createdAt,
  }))
}

/**
 * Load a specific table's buffer for re-registration with DuckDB.
 */
export async function loadTableBuffer(name) {
  const db = await getDB()
  const record = await db.get(STORE_TABLES, name)
  return record ? record.buffer : null
}

/**
 * Delete a table record from IndexedDB.
 */
export async function deleteTable(name) {
  const db = await getDB()
  await db.delete(STORE_TABLES, name)
}

/**
 * Check if a table name already exists.
 */
export async function tableExists(name) {
  const db = await getDB()
  const record = await db.get(STORE_TABLES, name)
  return !!record
}
