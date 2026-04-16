const fs = require('fs')

const layout = `import { useState, useRef, useCallback, useEffect } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { initDuckDB, executeQuery, dropTable, registerCSVAsTable } from '../lib/duckdb'
import { loadTablesMeta, loadTableBuffer, deleteTable } from '../lib/indexeddb'
import { parseCommand } from '../lib/nlp'
import Toolbar from './Toolbar'
import ObjectExplorer from './ObjectExplorer'
import CommandBar from './CommandBar'
import ResultsTable from './ResultsTable'
import FileUploader from './FileUploader'
import RightSidebar from './RightSidebar'

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
  const [editorHeight, setEditorHeight] = useState(45)
  const [crossLeft, setCrossLeft] = useState(null)
  const [crossRight, setCrossRight] = useState(null)
  const [columnToggles, setColumnToggles] = useState({})
  const [selectedTable, setSelectedTable] = useState(null)
  const [lastResult, setLastResult] = useState(null)
  const containerRef = useRef(null)

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
      } else {
        setStatusMessage('Motor listo. Carga un archivo CSV para comenzar.')
      }
    }
    init()
  }, [])

  const handleTableLoaded = useCallback((meta) => {
    setTables(prev => [...prev.filter(t => t.name !== meta.name), meta])
  }, [])

  const handleDeleteTable = useCallback(async (name) => {
    await dropTable(name)
    await deleteTable(name)
    setTables(prev => prev.filter(t => t.name !== name))
    setStatusMessage('Tabla "' + name + '" eliminada.')
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
        return s.includes(',') || s.includes('"') || s.includes('\\n')
          ? '"' + s.replace(/"/g, '""') + '"'
          : s
      }).join(',')
    )
    const csv = [header, ...dataRows].join('\\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a'); a.href = url; a.download = 'resultado_' + Date.now() + '.csv'; a.click()
    URL.revokeObjectURL(url)
    setStatusMessage('CSV exportado.')
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
    } catch (err) {
      setQueryError('Error de motor: ' + err.message)
      setStatusMessage('Error al procesar.')
    } finally {
      setIsExecuting(false)
    }
  }, [tables, handleExportCSV])

  const handleCrossViaToolbar = () => {
    if (tables.length < 2) { setStatusMessage('Carga al menos 2 archivos para cruzar.'); return }
    setShowRightSidebar(true)
    setInjectedCommand('Cruza ' + tables[0].name + ' con ' + tables[1].name)
  }
  const handleConsolidate = () => {
    if (tables.length < 2) { setStatusMessage('Carga al menos 2 archivos para consolidar.'); return }
    setInjectedCommand('Consolida todos los archivos')
  }
  const handleCleanColumns = () => {
    if (!selectedTable) { setStatusMessage('Selecciona un archivo en el panel izquierdo primero.'); return }
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
    <div className="flex flex-col h-full bg-ssms-bg select-none">
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
      />

      <div className="flex items-center px-4 py-0.5 bg-[#007acc] text-white text-[11px] shrink-0 gap-2">
        <span className="opacity-90 truncate">{statusMessage}</span>
        {isExecuting && <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin shrink-0" />}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div style={{ width: sidebarWidth }} className="flex flex-col shrink-0 overflow-hidden">
          <ObjectExplorer
            tables={tables}
            onInsertCommand={cmd => setInjectedCommand(cmd)}
            onDeleteTable={handleDeleteTable}
            onOpenUploader={() => setShowUploader(true)}
            onSelectTable={setSelectedTable}
            selectedTable={selectedTable}
          />
        </div>

        <div className="resize-handle-x shrink-0" onMouseDown={onMouseDownLeft} />

        <div ref={containerRef} className="flex flex-col flex-1 overflow-hidden">
          <div style={{ height: editorHeight + '%' }} className="flex flex-col overflow-hidden">
            <CommandBar
              onExecute={handleExecuteCommand}
              isExecuting={isExecuting}
              injectedValue={injectedCommand}
              onClear={() => setInjectedCommand(null)}
            />
          </div>
          <div className="resize-handle-y shrink-0" onMouseDown={onMouseDownY} />
          <div className="flex flex-col flex-1 overflow-hidden">
            <ResultsTable
              result={queryResult}
              error={queryError}
              isExecuting={isExecuting}
              visibleColumns={visibleCols?.length ? visibleCols : undefined}
            />
          </div>
        </div>

        {!showRightSidebar && (
          <button
            onClick={() => setShowRightSidebar(true)}
            title="Configuración de cruce"
            className="flex flex-col items-center justify-center w-6 bg-[#1a1a2e] border-l border-ssms-border text-ssms-textDim hover:text-ssms-text hover:bg-ssms-inputBg transition-colors shrink-0"
          >
            <span className="text-[10px] [writing-mode:vertical-rl] rotate-180 tracking-widest py-3">CONFIG</span>
          </button>
        )}

        {showRightSidebar && (
          <>
            <div className="resize-handle-x shrink-0" onMouseDown={onMouseDownRight} />
            <div style={{ width: rightSidebarWidth }} className="flex flex-col shrink-0 overflow-hidden">
              <RightSidebar
                tables={tables}
                selectedLeft={crossLeft}
                selectedRight={crossRight}
                onSelectLeft={setCrossLeft}
                onSelectRight={setCrossRight}
                columnToggles={columnToggles}
                onToggleColumn={key => setColumnToggles(p => ({ ...p, [key]: p[key] === false ? true : false }))}
                onCross={handleCrossFromSidebar}
                onClose={() => setShowRightSidebar(false)}
              />
            </div>
          </>
        )}
      </div>

      {showUploader && (
        <FileUploader
          onClose={() => setShowUploader(false)}
          onTableLoaded={handleTableLoaded}
          setStatusMessage={setStatusMessage}
        />
      )}
    </div>
  )
}
`

fs.writeFileSync('src/components/Layout.jsx', layout)
console.log('Layout.jsx escrito correctamente.')
