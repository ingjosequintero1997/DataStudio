import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
import { registerCSVAsTable } from '../lib/duckdb'
import { saveTable, tableExists } from '../lib/indexeddb'

const SUPPORTED_EXTS = ['.csv', '.txt', '.xls', '.xlsx', '.xlsm', '.xlsb']

function isSupported(filename) {
  const lower = filename.toLowerCase()
  return SUPPORTED_EXTS.some(ext => lower.endsWith(ext))
}

function isExcel(filename) {
  const lower = filename.toLowerCase()
  return ['.xls', '.xlsx', '.xlsm', '.xlsb'].some(ext => lower.endsWith(ext))
}

function sanitizeName(filename) {
  return filename
    .replace(/\.(csv|txt|xlsx?|xlsm|xlsb)$/i, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1')
}

async function convertToCSV(file) {
  const buffer = await file.arrayBuffer()
  if (isExcel(file.name)) {
    const wb = XLSX.read(buffer, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    return XLSX.utils.sheet_to_csv(sheet)
  }
  // TXT / CSV: return as plain text
  return new TextDecoder('utf-8').decode(buffer)
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function FileUploader({ onClose, onTableLoaded, setStatusMessage }) {
  const [files, setFiles] = useState([]) // { file, tableName, status, progress, error, result }
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef(null)

  const addFiles = useCallback((newFiles) => {
    const entries = Array.from(newFiles)
      .filter(f => isSupported(f.name))
      .map(f => ({
        file: f,
        tableName: sanitizeName(f.name),
        status: 'pending',
        progress: 0,
        error: null,
        result: null,
      }))
    setFiles(prev => [...prev, ...entries])
  }, [])

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const updateEntry = (idx, patch) => {
    setFiles(prev => prev.map((e, i) => i === idx ? { ...e, ...patch } : e))
  }

  const processFile = async (idx) => {
    const entry = files[idx]
    updateEntry(idx, { status: 'loading', progress: 5, error: null })

    try {
      const exists = await tableExists(entry.tableName)
      if (exists) {
        updateEntry(idx, {
          status: 'error',
          error: `Ya existe una tabla llamada "${entry.tableName}". Cambia el nombre.`,
        })
        return
      }

      setStatusMessage(`Leyendo "${entry.file.name}"...`)
      const csvText = await convertToCSV(entry.file)
      const csvBlob = new Blob([csvText], { type: 'text/csv' })
      const rawBuffer = await csvBlob.arrayBuffer()
      // Copy before DuckDB-Wasm transfers/detaches the ArrayBuffer
      const bufferForIDB = rawBuffer.slice(0)
      updateEntry(idx, { progress: 20 })

      setStatusMessage(`Registrando tabla "${entry.tableName}"...`)
      const columns = await registerCSVAsTable(entry.tableName, rawBuffer, (p) => {
        updateEntry(idx, { progress: 20 + Math.round(p * 0.7) })
      })

      updateEntry(idx, { progress: 95 })

      // Count rows via DuckDB
      const { executeQuery } = await import('../lib/duckdb')
      const countResult = await executeQuery(`SELECT COUNT(*) as n FROM "${entry.tableName}"`)
      const rowCount = parseInt(countResult.rows[0]?.n || 0, 10)

      // Persist to IndexedDB (use the pre-copied buffer)
      await saveTable(entry.tableName, bufferForIDB, columns, rowCount, entry.file.size)

      updateEntry(idx, { status: 'done', progress: 100, result: { columns, rowCount } })
      setStatusMessage(`Tabla "${entry.tableName}" cargada (${rowCount.toLocaleString()} filas).`)

      onTableLoaded({
        name: entry.tableName,
        columns,
        rowCount,
        sizeBytes: entry.file.size,
      })
    } catch (err) {
      updateEntry(idx, { status: 'error', error: err.message })
      setStatusMessage('Error al cargar el archivo.')
    }
  }

  const processAll = async () => {
    for (let i = 0; i < files.length; i++) {
      if (files[i].status === 'pending' || files[i].status === 'error') {
        await processFile(i)
      }
    }
  }

  const hasPending = files.some(f => f.status === 'pending')
  const allDone = files.length > 0 && files.every(f => f.status === 'done')

  return (
    <div className="fixed inset-0 flex items-end sm:items-center justify-center z-50" onClick={onClose}
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="w-full max-w-lg mx-0 sm:mx-4 max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ background: 'rgba(8,12,26,0.92)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,120,212,0.1)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0078d4, #1d4ed8)', boxShadow: '0 0 12px rgba(0,120,212,0.35)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>Cargar archivos</span>
          </div>
          <motion.button onClick={onClose} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} style={{ color: '#475569' }}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </motion.button>
        </div>

        {/* Drop zone */}
        <div className="px-5 py-4 shrink-0">
          <motion.div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            animate={{ borderColor: dragging ? 'rgba(0,120,212,0.8)' : 'rgba(255,255,255,0.12)', background: dragging ? 'rgba(0,120,212,0.06)' : 'rgba(255,255,255,0.025)' }}
            transition={{ duration: 0.2 }}
            className="rounded-xl p-6 text-center cursor-pointer transition-colors border border-dashed"
          >
            <motion.div animate={{ y: dragging ? -4 : 0 }} transition={{ type: 'spring', stiffness: 300 }}>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 mx-auto mb-3" style={{ color: dragging ? '#60a5fa' : '#334155' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm font-medium" style={{ color: '#94a3b8' }}>Arrastra archivos aquí</p>
              <p className="text-xs mt-1" style={{ color: '#475569' }}>o haz clic para seleccionar</p>
              <div className="flex items-center justify-center gap-2 mt-3">
                {['CSV', 'TXT', 'XLSX', 'XLS'].map(fmt => (
                  <span key={fmt} className="px-2 py-0.5 rounded text-[10px] font-mono font-medium" style={{ background: 'rgba(0,120,212,0.1)', border: '1px solid rgba(0,120,212,0.2)', color: '#60a5fa' }}>{fmt}</span>
                ))}
              </div>
            </motion.div>
          </motion.div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".csv,.txt,.xls,.xlsx,.xlsm,.xlsb"
            className="hidden"
            onChange={e => addFiles(e.target.files)}
          />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="flex-1 overflow-y-auto px-5 pb-2 flex flex-col gap-2">
            <AnimatePresence>
              {files.map((entry, idx) => (
                <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-start gap-2">
                  {/* Status icon */}
                  <div className="mt-0.5 shrink-0">
                    {entry.status === 'done' && (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                    {entry.status === 'error' && (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    )}
                    {entry.status === 'loading' && (
                      <span className="w-4 h-4 border-2 border-ssms-accent border-t-transparent rounded-full animate-spin inline-block" />
                    )}
                    {entry.status === 'pending' && (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-ssms-textDim" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-ssms-text text-xs font-medium truncate">{entry.file.name}</span>
                      <span className="text-ssms-textDim text-[10px] shrink-0">{formatBytes(entry.file.size)}</span>
                    </div>

                    {/* Table name editor */}
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-ssms-textDim text-[10px]">Tabla:</span>
                      <input
                        value={entry.tableName}
                        onChange={e => updateEntry(idx, { tableName: sanitizeName(e.target.value) || entry.tableName })}
                        disabled={entry.status !== 'pending'}
                        className="bg-ssms-inputBg border border-ssms-border rounded px-2 py-0.5 text-ssms-text text-xs flex-1 focus:outline-none focus:border-ssms-accent disabled:opacity-60"
                      />
                    </div>

                    {/* Progress bar */}
                    {entry.status === 'loading' && (
                      <div className="mt-2 h-1 bg-ssms-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-ssms-accent rounded-full transition-all"
                          style={{ width: `${entry.progress}%` }}
                        />
                      </div>
                    )}

                    {/* Result info */}
                    {entry.status === 'done' && entry.result && (
                      <div className="mt-1 text-[10px] text-ssms-textDim">
                        {entry.result.rowCount.toLocaleString()} filas · {entry.result.columns.length} columnas
                      </div>
                    )}

                    {/* Error */}
                    {entry.status === 'error' && (
                      <p className="mt-1 text-[10px] text-red-400">{entry.error}</p>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
            </AnimatePresence>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={onClose}
            className="px-4 py-1.5 text-xs rounded-lg transition-colors" style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.05)' }}
          >
            {allDone ? 'Cerrar' : 'Cancelar'}
          </motion.button>
          {hasPending && (
            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
              onClick={processAll}
              className="px-4 py-1.5 text-xs text-white rounded-lg font-medium"
              style={{ background: 'linear-gradient(135deg, #0078d4, #1d4ed8)', boxShadow: '0 0 16px rgba(0,120,212,0.35)' }}
            >
              Cargar {files.filter(f => f.status === 'pending').length} archivo(s)
            </motion.button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
