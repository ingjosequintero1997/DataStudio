const fs = require('fs')

const layout = `import { useState, useRef, useCallback, useEffect } from 'react'
import { signOut } from 'firebase/auth'
import { motion, AnimatePresence } from 'framer-motion'
import { auth } from '../firebase'
import { initDuckDB, executeQuery, dropTable, registerCSVAsTable } from '../lib/duckdb'
import { loadTablesMeta, loadTableBuffer, deleteTable } from '../lib/indexeddb'
import { parseCommand } from '../lib/nlp'
import { ToastContainer } from './Toast'
import Toolbar from './Toolbar'
import ObjectExplorer from './ObjectExplorer'
import CommandBar from './CommandBar'
import ResultsTable from './ResultsTable'
import FileUploader from './FileUploader'
import RightSidebar from './RightSidebar'

const spring = { type: 'spring', stiffness: 300, damping: 30 }

// ── Skeleton row ─────────────────────────────────────────────────────────────
function SkeletonRow({ cols = 5 }) {
  return (
    <div className="flex gap-3 px-4 py-2.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="h-3 rounded flex-1 animate-pulse" style={{ background: 'rgba(255,255,255,0.07)', maxWidth: i === 0 ? 80 : 140 }} />
      ))}
    </div>
  )
}

function SkeletonTable() {
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* header */}
      <div className="flex gap-3 px-4 py-2.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(0,120,212,0.06)' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-3 rounded flex-1 animate-pulse" style={{ background: 'rgba(0,120,212,0.2)', maxWidth: i === 0 ? 80 : 140 }} />
        ))}
      </div>
      {Array.from({ length: 12 }).map((_, i) => <SkeletonRow key={i} />)}
    </div>
  )
}

let _toastId = 0
export default function Layout({ user }) {
  const [tables, setTables] = useState([])
  const [queryResult, setQueryResult] = useState(null)
  const [queryError, setQueryError] = useState(null)
  const [isExecuting, setIsExecuting] = useState(false)
  const [statusMessage, setStatusMessage] = useState('Listo')
  const [showUploader, setShowUploader] = useState(false)
  const [dbReady, setDbReady] = useState(false)
  const [showRightSidebar, setShowRightSidebar] = useState(false)
  const [injectedCommand, setInjectedCommand] = useState(null)
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const [rightSidebarWidth, setRightSidebarWidth] = useState(260)
  const [editorHeight, setEditorHeight] = useState(42)
  const [crossLeft, setCrossLeft] = useState(null)
  const [crossRight, setCrossRight] = useState(null)
  const [columnToggles, setColumnToggles] = useState({})
  const [selectedTable, setSelectedTable] = useState(null)
  const [lastResult, setLastResult] = useState(null)
  const [toasts, setToasts] = useState([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const containerRef = useRef(null)

  const addToast = useCallback((message, type = 'info', title) => {
    const id = ++_toastId
    setToasts(prev => [...prev, { id, message, type, title }])
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  useEffect(() => {
    async function init() {
      setStatusMessage('Iniciando motor DuckDB-Wasm...')
      await initDuckDB()
      setDbReady(true)
      const savedTables = await loadTablesMeta()
      if (savedTables.length > 0) {
        setStatusMessage('Restaurando tablas guardadas...')
        const restored = []
        for (const meta of savedTables) {
          try {
            const buffer = await loadTableBuffer(meta.name)
            if (buffer) { await registerCSVAsTable(meta.name, buffer); restored.push(meta) }
          } catch(e) {}
        }
        setTables(restored)
        setStatusMessage(restored.length + ' tabla(s) restaurada(s). Listo.')
        if (restored.length > 0) addToast(restored.length + ' tabla(s) cargadas desde sesión anterior', 'success', 'Datos restaurados')
      } else {
        setStatusMessage('Motor listo. Carga un archivo para comenzar.')
        addToast('Motor DuckDB listo', 'success', 'Sistema iniciado')
      }
    }
    init()
  }, [])

  const handleTableLoaded = useCallback((meta) => {
    setTables(prev => [...prev.filter(t => t.name !== meta.name), meta])
    addToast(meta.rowCount.toLocaleString() + ' filas cargadas', 'success', '"' + meta.name + '" listo')
  }, [])

  const handleDeleteTable = useCallback(async (name) => {
    await dropTable(name)
    await deleteTable(name)
    setTables(prev => prev.filter(t => t.name !== name))
    setStatusMessage('Tabla "' + name + '" eliminada.')
    addToast('Tabla eliminada del motor', 'info', '"' + name + '"')
  }, [])

  const handleExportCSV = useCallback((resOverride) => {
    const res = resOverride || lastResult || queryResult
    if (!res?.rows?.length) { setStatusMessage('No hay resultados para exportar.'); return }
    const header = res.columns.join(',')
    const dataRows = res.rows.map(row =>
      res.columns.map(col => {
        const val = row[col]
        if (val === null || val === undefined) return ''
        const s = String(val)
        return s.includes(',') || s.includes('"') || s.includes('\\n') ? '"' + s.replace(/"/g, '""') + '"' : s
      }).join(',')
    )
    const csv = [header, ...dataRows].join('\\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a'); a.href = url; a.download = 'resultado_' + Date.now() + '.csv'; a.click()
    URL.revokeObjectURL(url)
    addToast(res.rowCount.toLocaleString() + ' filas exportadas', 'success', 'CSV generado')
  }, [queryResult, lastResult])

  const handleExecuteCommand = useCallback(async (input) => {
    setIsExecuting(true)
    setQueryError(null)
    setQueryResult(null)
    setStatusMessage('Interpretando comando...')
    const parsed = parseCommand(input, tables)
    if (parsed.error) {
      setQueryError(parsed.error)
      setIsExecuting(false)
      setStatusMessage('No se pudo interpretar el comando.')
      addToast(parsed.error, 'error', 'Comando no reconocido')
      return
    }
    if (parsed.action === 'export') { handleExportCSV(); setIsExecuting(false); return }
    if (parsed.action === 'help') {
      setQueryError('Comandos disponibles: cruzar, consolidar, mostrar columnas, quitar columna, contar registros, mostrar tabla, exportar.')
      setIsExecuting(false)
      return
    }
    setStatusMessage(parsed.description + '...')
    const start = performance.now()
    try {
      const result = await executeQuery(parsed.sql)
      const duration = ((performance.now() - start) / 1000).toFixed(3)
      const final = { ...result, duration }
      setQueryResult(final)
      setLastResult(final)
      setStatusMessage(parsed.description + ' — ' + result.rowCount.toLocaleString() + ' fila(s) en ' + duration + 's')
      addToast(result.rowCount.toLocaleString() + ' filas · ' + duration + 's', 'success', parsed.description)
    } catch (err) {
      setQueryError('Error de motor: ' + err.message)
      setStatusMessage('Error al procesar.')
      addToast(err.message, 'error', 'Error de procesamiento')
    } finally {
      setIsExecuting(false)
    }
  }, [tables, handleExportCSV])

  const handleCrossViaToolbar = () => {
    if (tables.length < 2) { addToast('Carga al menos 2 archivos para cruzar.', 'info'); return }
    setShowRightSidebar(true)
    setInjectedCommand('Cruza ' + tables[0].name + ' con ' + tables[1].name)
  }
  const handleConsolidate = () => {
    if (tables.length < 2) { addToast('Carga al menos 2 archivos para consolidar.', 'info'); return }
    setInjectedCommand('Consolida todos los archivos')
  }
  const handleCleanColumns = () => {
    if (!selectedTable) { addToast('Selecciona un archivo primero.', 'info'); return }
    setInjectedCommand('Quita columnas de ' + selectedTable)
  }
  const handleCrossFromSidebar = (left, right, col) => {
    const cmd = col ? 'Cruza ' + left + ' con ' + right + ' por ' + col : 'Cruza ' + left + ' con ' + right
    setInjectedCommand(cmd)
    handleExecuteCommand(cmd)
  }

  const visibleCols = queryResult?.columns?.filter(col => {
    const key = Object.keys(columnToggles).find(k => k.endsWith('.' + col))
    return key ? columnToggles[key] !== false : true
  })

  const onMouseDownLeft = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX; const startW = sidebarWidth
    const move = ev => setSidebarWidth(Math.max(180, Math.min(450, startW + ev.clientX - startX)))
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up) }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
  }, [sidebarWidth])

  const onMouseDownRight = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX; const startW = rightSidebarWidth
    const move = ev => setRightSidebarWidth(Math.max(200, Math.min(400, startW - ev.clientX + startX)))
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up) }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
  }, [rightSidebarWidth])

  const onMouseDownY = useCallback((e) => {
    e.preventDefault()
    const container = containerRef.current; if (!container) return
    const rect = container.getBoundingClientRect()
    const move = ev => setEditorHeight(Math.max(25, Math.min(75, ((ev.clientY - rect.top) / rect.height) * 100)))
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up) }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
  }, [])

  return (
    <div className="flex flex-col h-full select-none" style={{ background: 'radial-gradient(ellipse 140% 60% at 50% -5%, #0d1b3e 0%, #060913 60%, #030508 100%)' }}>
      <Toolbar
        user={user}
        onExport={handleExportCSV}
        onOpenUploader={() => setShowUploader(true)}
        onCrossTable={handleCrossViaToolbar}
        onConsolidate={handleConsolidate}
        onCleanColumns={handleCleanColumns}
        isExecuting={isExecuting}
        hasResults={!!(queryResult?.rows?.length)}
        dbReady={dbReady}
        onSignOut={() => signOut(auth)}
        onToggleDrawer={() => setDrawerOpen(p => !p)}
      />

      {/* Status bar */}
      <motion.div layout
        className="flex items-center px-4 py-1 text-[11px] shrink-0 gap-2 font-medium"
        style={{ background: 'rgba(0,78,160,0.5)', borderBottom: '1px solid rgba(0,120,212,0.15)', color: '#93c5fd' }}>
        <motion.span key={statusMessage} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="truncate">
          {statusMessage}
        </motion.span>
        {isExecuting && <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
          className="w-3 h-3 border border-blue-300 border-t-transparent rounded-full shrink-0 inline-block" />}
      </motion.div>

      <div className="flex flex-1 overflow-hidden relative">

        {/* ── Mobile drawer backdrop ── */}
        <AnimatePresence>
          {drawerOpen && (
            <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 z-30" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
              onClick={() => setDrawerOpen(false)} />
          )}
        </AnimatePresence>

        {/* ── LEFT sidebar: Drawer on mobile, fixed on md+ ── */}
        <AnimatePresence initial={false}>
          {/* Mobile drawer */}
          <motion.div
            key="drawer-mobile"
            initial={{ x: -280 }}
            animate={{ x: drawerOpen ? 0 : -280 }}
            transition={spring}
            className="md:hidden fixed left-0 top-0 bottom-0 z-40 flex flex-col"
            style={{ width: 280, paddingTop: 96 }}
          >
            <ObjectExplorer tables={tables} onInsertCommand={cmd => { setInjectedCommand(cmd); setDrawerOpen(false) }}
              onDeleteTable={handleDeleteTable} onOpenUploader={() => { setShowUploader(true); setDrawerOpen(false) }}
              onSelectTable={n => { setSelectedTable(n); setDrawerOpen(false) }} selectedTable={selectedTable} />
          </motion.div>
        </AnimatePresence>

        {/* Desktop sidebar */}
        <div style={{ width: sidebarWidth }} className="hidden md:flex flex-col shrink-0 overflow-hidden">
          <ObjectExplorer tables={tables} onInsertCommand={cmd => setInjectedCommand(cmd)}
            onDeleteTable={handleDeleteTable} onOpenUploader={() => setShowUploader(true)}
            onSelectTable={setSelectedTable} selectedTable={selectedTable} />
        </div>

        <div className="hidden md:block resize-handle-x shrink-0" onMouseDown={onMouseDownLeft} />

        {/* ── CENTER ── */}
        <div ref={containerRef} className="flex flex-col flex-1 overflow-hidden min-w-0">
          <div style={{ height: editorHeight + '%' }} className="flex flex-col overflow-hidden">
            <CommandBar onExecute={handleExecuteCommand} isExecuting={isExecuting}
              injectedValue={injectedCommand} onClear={() => setInjectedCommand(null)} />
          </div>
          <div className="resize-handle-y shrink-0" onMouseDown={onMouseDownY} />
          <div className="flex flex-col flex-1 overflow-hidden">
            {isExecuting && !queryResult ? (
              <SkeletonTable />
            ) : (
              <ResultsTable result={queryResult} error={queryError} isExecuting={isExecuting}
                visibleColumns={visibleCols?.length ? visibleCols : undefined} />
            )}
          </div>
        </div>

        {/* ── RIGHT sidebar toggle ── */}
        {!showRightSidebar && (
          <motion.button onClick={() => setShowRightSidebar(true)} title="Configuración de cruce"
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} transition={spring}
            className="flex flex-col items-center justify-center w-6 transition-colors shrink-0"
            style={{ borderLeft: '1px solid rgba(255,255,255,0.05)', background: 'rgba(8,12,26,0.8)', color: '#1e293b' }}
          >
            <span className="text-[10px] font-bold" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: '0.12em', color: '#1e3a5f' }}>CONFIG</span>
          </motion.button>
        )}

        {showRightSidebar && (
          <>
            <div className="resize-handle-x shrink-0" onMouseDown={onMouseDownRight} />
            <div style={{ width: rightSidebarWidth }} className="flex flex-col shrink-0 overflow-hidden">
              <RightSidebar tables={tables} selectedLeft={crossLeft} selectedRight={crossRight}
                onSelectLeft={setCrossLeft} onSelectRight={setCrossRight}
                columnToggles={columnToggles}
                onToggleColumn={key => setColumnToggles(p => ({ ...p, [key]: p[key] === false ? true : false }))}
                onCross={handleCrossFromSidebar} onClose={() => setShowRightSidebar(false)} />
            </div>
          </>
        )}
      </div>

      {showUploader && (
        <FileUploader onClose={() => setShowUploader(false)}
          onTableLoaded={handleTableLoaded} setStatusMessage={setStatusMessage} />
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
`

fs.writeFileSync('src/components/Layout.jsx', layout)
console.log('Layout.jsx escrito.')
