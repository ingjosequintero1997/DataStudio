import { registerCSVAsTable } from './duckdb'
import { saveTable } from './indexeddb'

export function sanitizeTableName(name, fallback = 'tabla_generada') {
  const clean = (name || '').trim().replace(/[^a-zA-Z0-9_]/g, '_').replace(/_{2,}/g, '_')
  return clean || fallback
}

export function rowsToCsv(columns, rows) {
  const header = columns.join(',')
  const dataRows = rows.map(row =>
    columns.map(col => {
      const v = row[col]
      if (v === null || v === undefined) return ''
      const s = String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s
    }).join(',')
  )
  return [header, ...dataRows].join('\n')
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
