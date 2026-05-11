import { executeQuery, registerCSVAsTable } from './duckdb'
import { saveTable } from './indexeddb'

export function sanitizeTableName(name, fallback = 'tabla_generada') {
  const clean = (name || '').trim().replace(/[^a-zA-Z0-9_]/g, '_').replace(/_{2,}/g, '_')
  return clean || fallback
}

function ensureUniqueColumns(columns = []) {
  const used = new Map()
  return columns.map((column, index) => {
    const base = String(column || `columna_${index + 1}`).trim() || `columna_${index + 1}`
    const seen = used.get(base) || 0
    used.set(base, seen + 1)
    return seen ? `${base}_${seen + 1}` : base
  })
}

function escapeDelimitedValue(value, delimiter) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  const mustQuote = text.includes(delimiter) || text.includes('"') || text.includes('\n') || text.includes('\r')
  return mustQuote ? `"${text.replace(/"/g, '""')}"` : text
}

export function rowsToDelimitedText(columns, rows, delimiter = ',') {
  const safeColumns = ensureUniqueColumns(columns)
  const header = safeColumns.map((column) => escapeDelimitedValue(column, delimiter)).join(delimiter)
  const dataRows = rows.map(row =>
    safeColumns.map((col, index) => {
      const sourceKey = columns[index]
      return escapeDelimitedValue(row[sourceKey], delimiter)
    }).join(delimiter)
  )
  return [header, ...dataRows].join('\n')
}

export function rowsToCsv(columns, rows) {
  return rowsToDelimitedText(columns, rows, ',')
}

export function csvToArrayBuffer(csv) {
  return new TextEncoder().encode(csv).buffer
}

export async function saveResultAsTable(tableName, result) {
  const name = sanitizeTableName(tableName)
  const csv = rowsToCsv(result.columns, result.rows)
  const buffer = csvToArrayBuffer(csv)
  const cols = await registerCSVAsTable(name, buffer)
  const sizeBytes = buffer.byteLength
  // Crear una copia del buffer para IndexedDB usando Uint8Array
  const bufferCopy = new Uint8Array(buffer).buffer
  await saveTable(name, bufferCopy, cols, result.rowCount, sizeBytes)
  return {
    name,
    columns: cols,
    rowCount: result.rowCount,
    sizeBytes,
    createdAt: Date.now(),
  }
}

function alignRowsToColumns(columns, rows) {
  return rows.map((row) => {
    const next = {}
    columns.forEach((column) => {
      next[column] = row[column] ?? null
    })
    return next
  })
}

export async function overwriteTableWithResult(tableName, result) {
  return saveResultAsTable(tableName, result)
}

export async function appendResultToTable(tableName, result) {
  const current = await executeQuery(`SELECT * FROM "${tableName}";`)
  const mergedColumns = Array.from(new Set([...(current.columns || []), ...(result.columns || [])]))
  const mergedRows = [
    ...alignRowsToColumns(mergedColumns, current.rows || []),
    ...alignRowsToColumns(mergedColumns, result.rows || []),
  ]
  return saveResultAsTable(tableName, {
    columns: mergedColumns,
    rows: mergedRows,
    rowCount: mergedRows.length,
    duration: result.duration || '0.000',
  })
}

export function projectResult(result, selectedColumns) {
  const cols = (selectedColumns?.length ? selectedColumns : result.columns).filter(Boolean)
  const rows = result.rows.map(row => {
    const out = {}
    cols.forEach(c => { out[c] = row[c] ?? null })
    return out
  })
  return {
    columns: cols,
    rows,
    rowCount: rows.length,
    duration: result.duration || '0.000',
  }
}
