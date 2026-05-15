import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { signOut } from 'firebase/auth'
import { motion, AnimatePresence } from 'framer-motion'
import { auth } from '../firebase'
import { initDuckDB, executeQuery, dropTable, registerCSVAsTable, reorderTableColumns } from '../lib/duckdb'
import { loadTablesMeta, loadTableBuffer, deleteTable } from '../lib/indexeddb'
import { parseCommand } from '../lib/nlp'
import { rowsToDelimitedText } from '../lib/resultTableService'
import { runAiTask, isAiRuntimeConfigured } from '../services/ai/aiOrchestratorClient'
import { ToastContainer } from './Toast'
import Toolbar from './Toolbar'
import ObjectExplorer from './ObjectExplorer'
import CommandBar from './CommandBar'
import ResultsTable from './ResultsTable'
import FileUploader from './FileUploader'
import CrossWizard from './CrossWizard'
import KnowledgeBaseModal from '../modules/knowledgeBase/KnowledgeBaseModal'
import DashboardStudio from '../modules/dashboard/DashboardStudio'
import ChatEngine from './ChatEngine'

const spring = { type: 'spring', stiffness: 300, damping: 30 }

let _toastId = 0

const THEME = {
  dark: {
    appBg: '#070C07',
    panel: '#0D1511',
    panelSoft: '#101B15',
    border: 'rgba(16,185,129,0.22)',
    text: '#E2F5E2',
    dim: 'rgba(160,205,170,0.7)',
    accent: '#10B981',
  },
  light: {
    appBg: '#F4F7F4',
    panel: '#FFFFFF',
    panelSoft: '#F8FBF8',
    border: '#C8DCC8',
    text: '#1B3318',
    dim: '#4A6B4A',
    accent: '#2E7D32',
  },
}

const NOTICE = {
  info: {
    bgLight: '#E8F4FD',
    borderLight: '#BBDEFB',
    textLight: '#0D47A1',
    bgDark: 'rgba(59,130,246,0.16)',
    borderDark: 'rgba(147,197,253,0.35)',
    textDark: '#BFDBFE',
    icon: 'i',
  },
  warning: {
    bgLight: '#FFF8E1',
    borderLight: '#FFE082',
    textLight: '#E65100',
    bgDark: 'rgba(245,158,11,0.16)',
    borderDark: 'rgba(253,186,116,0.35)',
    textDark: '#FCD34D',
    icon: '!',
  },
  error: {
    bgLight: '#FFF3F3',
    borderLight: '#FFCDD2',
    textLight: '#B71C1C',
    bgDark: 'rgba(239,68,68,0.16)',
    borderDark: 'rgba(248,113,113,0.35)',
    textDark: '#FCA5A5',
    icon: 'x',
  },
}

function ContextualStatePanel({
  level = 'info',
  title,
  message,
  actionHint,
  ctaLabel,
  onCta,
  theme = 'light',
}) {
  const isDark = theme === 'dark'
  const cfg = NOTICE[level] || NOTICE.info
  return (
    <div className="h-full flex items-center justify-center p-6" style={{ background: isDark ? '#0D1511' : '#fff' }}>
      <div
        style={{
          width: '100%',
          maxWidth: 620,
          borderRadius: 14,
          border: `1px solid ${isDark ? cfg.borderDark : cfg.borderLight}`,
          background: isDark ? cfg.bgDark : cfg.bgLight,
          padding: 20,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.78rem',
              fontWeight: 800,
              background: isDark ? 'rgba(255,255,255,0.12)' : '#fff',
              color: isDark ? cfg.textDark : cfg.textLight,
              textTransform: 'uppercase',
            }}>
            {cfg.icon}
          </div>
          <span style={{ fontSize: '0.92rem', fontWeight: 800, color: isDark ? cfg.textDark : cfg.textLight, fontFamily: 'Inter,sans-serif' }}>{title}</span>
        </div>
        <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.62, color: isDark ? cfg.textDark : cfg.textLight, fontFamily: 'Inter,sans-serif' }}>{message}</p>
        {!!actionHint && (
          <p style={{ margin: '10px 0 0', fontSize: '0.76rem', lineHeight: 1.6, color: isDark ? cfg.textDark : cfg.textLight, opacity: 0.95, fontFamily: 'Inter,sans-serif' }}>
            <strong>Acción sugerida:</strong> {actionHint}
          </p>
        )}
        {!!ctaLabel && !!onCta && (
          <button
            onClick={onCta}
            style={{
              marginTop: 14,
              padding: '8px 14px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #10B981, #047857)',
              color: '#fff',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'Inter,sans-serif',
            }}>
            {ctaLabel}
          </button>
        )}
      </div>
    </div>
  )
}

function isMutatingSql(sql = '') {
  return /^(\s)*(update|insert|delete|alter|create|drop|truncate|merge|replace)\b/i.test(sql)
}

function extractTargetTable(sql = '', tables = []) {
  const patterns = [
    /\bupdate\s+"([^"]+)"/i,
    /\binto\s+"([^"]+)"/i,
    /\bfrom\s+"([^"]+)"/i,
    /\btable\s+"([^"]+)"/i,
  ]

  for (const pattern of patterns) {
    const m = sql.match(pattern)
    if (m?.[1]) return m[1]
  }

  const lower = sql.toLowerCase()
  const found = tables.find((t) => lower.includes(`"${t.name.toLowerCase()}"`) || lower.includes(` ${t.name.toLowerCase()} `))
  return found?.name || null
}

export default function Layout({ user, theme = 'light', onToggleTheme }) {
  const T = THEME[theme] || THEME.light
  const sqlSplitRef = useRef(null)
  const [activeModule, setActiveModule] = useState('files')
  const [tables, setTables] = useState([])
  const [selectedTable, setSelectedTable] = useState(null)
  const [previewResult, setPreviewResult] = useState(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [crossResult, setCrossResult] = useState(null)
  const [sqlResult, setSqlResult] = useState(null)
  const [sqlError, setSqlError] = useState(null)
  const [sqlPrompt, setSqlPrompt] = useState('')
  const [sqlBusy, setSqlBusy] = useState(false)
  const [statusMessage, setStatusMessage] = useState('Iniciando...')
  const [showUploader, setShowUploader] = useState(false)
  const [dbReady, setDbReady] = useState(false)
  const [showCrossWizard, setShowCrossWizard] = useState(false)
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false)
  const [showDashboardStudio, setShowDashboardStudio] = useState(false)
  const [toasts, setToasts] = useState([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [newQuerySignal, setNewQuerySignal] = useState(0)
  const [sqlEditorHeightPct, setSqlEditorHeightPct] = useState(30)
  const [isResizingSql, setIsResizingSql] = useState(false)
  const [sqlConversationHistory, setSqlConversationHistory] = useState([])
  const [sqlRecentQueries, setSqlRecentQueries] = useState([])

  const addToast = useCallback((message, type = 'info', title) => {
    const id = ++_toastId
    setToasts(prev => [...prev, { id, message, type, title }])
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  useEffect(() => {
    async function init() {
      try {
        setStatusMessage('Iniciando motor DuckDB-Wasm...')
        await initDuckDB()
        setDbReady(true)

        const savedTables = await loadTablesMeta()
        if (savedTables.length > 0) {
          setStatusMessage('Restaurando archivos cargados...')
          const restored = []
          for (const meta of savedTables) {
            try {
              const buffer = await loadTableBuffer(meta.name)
              if (buffer) {
                await registerCSVAsTable(meta.name, buffer)
                restored.push(meta)
              }
            } catch {}
          }
          setTables(restored)
          if (restored[0]) setSelectedTable(restored[0].name)
          setStatusMessage(restored.length + ' archivo(s) restaurado(s).')
          if (restored.length > 0) addToast(restored.length + ' archivo(s) recuperados', 'success', 'Sesión restaurada')
        } else {
          setStatusMessage('Motor listo. Carga un archivo para comenzar.')
          addToast('Motor DuckDB listo', 'success', 'Sistema iniciado')
        }
      } catch (e) {
        setDbReady(false)
        setStatusMessage('No se pudo iniciar el motor. Recarga la página.')
        addToast((e?.message || 'Fallo al iniciar DuckDB').slice(0, 120), 'error', 'Inicialización')
      }
    }
    init()
  }, [addToast])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && activeModule === 'sql') {
        setActiveModule('files')
        setStatusMessage('Modo normal activado')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeModule])

  useEffect(() => {
    if (!isResizingSql) return

    function onMouseMove(e) {
      const container = sqlSplitRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const next = ((e.clientY - rect.top) / rect.height) * 100
      const clamped = Math.max(18, Math.min(72, next))
      setSqlEditorHeightPct(clamped)
    }

    function onMouseUp() {
      setIsResizingSql(false)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isResizingSql])

  const handleTableLoaded = useCallback((meta) => {
    setTables(prev => {
      const next = [...prev.filter(t => t.name !== meta.name), meta]
      if (!selectedTable) setSelectedTable(meta.name)
      return next
    })
    if (!selectedTable) setSelectedTable(meta.name)
    setActiveModule('files')
    addToast(meta.rowCount?.toLocaleString() + ' filas cargadas', 'success', '"' + meta.name + '" listo')
  }, [addToast, selectedTable])

  const handleDeleteTable = useCallback(async (name) => {
    await dropTable(name)
    await deleteTable(name)
    setTables(prev => {
      const next = prev.filter(t => t.name !== name)
      if (selectedTable === name) setSelectedTable(next[0]?.name || null)
      return next
    })
    setStatusMessage('Tabla "' + name + '" eliminada.')
    addToast('Archivo eliminado del motor', 'info', '"' + name + '"')
  }, [addToast, selectedTable])

  const handleDeleteAllTables = useCallback(async () => {
    if (!tables.length) return
    const ok = window.confirm('Se borrarán todos los archivos cargados. ¿Deseas continuar?')
    if (!ok) return
    for (const t of tables) {
      await dropTable(t.name)
      await deleteTable(t.name)
    }
    setTables([])
    setSelectedTable(null)
    setPreviewResult(null)
    setCrossResult(null)
    setSqlResult(null)
    setStatusMessage('Todos los archivos cargados fueron eliminados.')
    addToast('Se eliminaron ' + tables.length + ' archivo(s)', 'info', 'Archivos cargados')
  }, [tables, addToast])

  useEffect(() => {
    async function refreshPreview() {
      if (!selectedTable) {
        setPreviewResult(null)
        return
      }
      setPreviewBusy(true)
      try {
        const start = performance.now()
        const result = await executeQuery(`SELECT * FROM "${selectedTable}" LIMIT 300;`)
        setPreviewResult({ ...result, duration: ((performance.now() - start) / 1000).toFixed(3) })
      } catch (e) {
        setPreviewResult(null)
        addToast((e?.message || 'No se pudo previsualizar').slice(0, 100), 'error', 'Vista previa')
      } finally {
        setPreviewBusy(false)
      }
    }
    refreshPreview()
  }, [selectedTable, tables.length, addToast])

  const activeResult = useMemo(() => {
    if (activeModule === 'sql') return sqlResult
    if (activeModule === 'cross') return crossResult
    return previewResult
  }, [activeModule, sqlResult, crossResult, previewResult])

  const aiContextPayload = useMemo(() => {
    const schema = tables.map((t) => ({
      name: t.name,
      rowCount: t.rowCount || 0,
      columns: (t.columns || []).map((c) => ({ name: c.name, type: c.type || 'TEXT' })),
    }))
    return {
      schema,
      recentQueries: sqlRecentQueries.slice(-5),
      selectedTable,
      latestResultPreview: sqlResult?.rows?.slice(0, 3) || null,
    }
  }, [tables, sqlRecentQueries, selectedTable, sqlResult])

  const exportCSV = useCallback((res = activeResult, fileName = 'resultado') => {
    if (!res?.rows?.length) {
      addToast('No hay resultados para exportar.', 'info')
      return
    }
    const csv = rowsToDelimitedText(res.columns, res.rows, ',')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = fileName + '.csv'
    a.click()
    URL.revokeObjectURL(url)
    addToast(res.rowCount?.toLocaleString() + ' filas exportadas', 'success', 'CSV generado')
  }, [activeResult, addToast])

  const exportExcel = useCallback((res = activeResult, fileName = 'resultado') => {
    if (!res?.rows?.length) {
      addToast('No hay resultados para exportar.', 'info')
      return
    }
    import('xlsx').then(XLSX => {
      const ws = XLSX.utils.json_to_sheet(res.rows.map(row => {
        const obj = {}
        res.columns.forEach(col => { obj[col] = row[col] ?? '' })
        return obj
      }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Resultado')
      XLSX.writeFile(wb, fileName + '.xlsx')
      addToast(res.rowCount?.toLocaleString() + ' filas exportadas', 'success', 'Excel generado')
    })
  }, [activeResult, addToast])

  const handleChatResult = useCallback(({ result, sql, targetTable }) => {
    if (!result) return
    setPreviewResult(result)
    setCrossResult(null)
    setSqlResult(null)
    setSqlError(null)
    if (targetTable) setSelectedTable(targetTable)
    setActiveModule('files')
    if (sql) {
      setStatusMessage('Resultado actualizado desde el chat')
    }
  }, [])

  const runNaturalQuery = useCallback(async (prompt) => {
    const clean = (prompt || '').trim()
    if (!clean || !tables.length) return

    setActiveModule('sql')
    setSqlBusy(true)
    setSqlError(null)
    setStatusMessage('Analizando instruccion y contexto...')

    try {
      let sql = null
      let explanation = ''

      if (isAiRuntimeConfigured()) {
        const ai = await runAiTask({
          task: 'sql.generate',
          prompt: clean,
          tables,
          history: sqlConversationHistory,
          context: aiContextPayload,
        })
        sql = ai?.sql
        explanation = ai?.explanation || ''
      }

      if (!sql) {
        const parsed = parseCommand(clean, tables)
        if (parsed?.error) {
          const contextualError = new Error(parsed.error)
          contextualError.contextual = {
            level: 'warning',
            title: 'No pude interpretar la instruccion',
            actionHint: 'Escribe una accion y una tabla objetivo, por ejemplo: "Muestra 20 filas de resultado_1".',
          }
          throw contextualError
        }
        if (parsed?.action === 'reorderColumns') {
          await reorderTableColumns(parsed.tableName, parsed.orderedColumns || [])
          const preview = await executeQuery(`SELECT * FROM "${parsed.tableName}" LIMIT 300;`)
          setSqlResult({ ...preview, duration: '0.000' })
          setSelectedTable(parsed.tableName)
          setStatusMessage('Columnas reordenadas en ' + parsed.tableName)
          addToast(parsed.description || 'Columnas reordenadas', 'success', 'SQL Pro IA')
          return
        }
        sql = parsed?.sql
        explanation = parsed?.description || ''
      }

      if (!sql) throw new Error('No pude convertir tu instrucción en consulta.')

      setStatusMessage('Ejecutando SQL en DuckDB...')
      const start = performance.now()
      const result = await executeQuery(sql)
      const duration = ((performance.now() - start) / 1000).toFixed(3)

      const interaction = {
        prompt: clean,
        sql,
        rowCount: result?.rowCount || 0,
        duration,
        at: new Date().toISOString(),
      }
      setSqlRecentQueries((prev) => [...prev.slice(-4), interaction])
      setSqlConversationHistory((prev) => [
        ...prev.slice(-9),
        { role: 'user', content: clean },
        { role: 'assistant', content: `${explanation || 'Consulta procesada'}\n\n\`\`\`sql\n${sql}\n\`\`\`` },
      ])

      if (isMutatingSql(sql)) {
        const targetTable = extractTargetTable(sql, tables)
        if (targetTable) {
          const preview = await executeQuery(`SELECT * FROM "${targetTable}" LIMIT 300;`)
          setSqlResult({ ...preview, duration })
          setSelectedTable(targetTable)
          setStatusMessage('Cambios aplicados en ' + targetTable + ' en ' + duration + 's')
          addToast('Cambios guardados en ' + targetTable, 'success', explanation || 'Actualizacion aplicada')
        } else {
          setSqlResult({ ...result, duration })
          setStatusMessage('Cambios aplicados en ' + duration + 's')
          addToast('Cambios aplicados', 'success', explanation || 'Actualizacion ejecutada')
        }
      } else {
        setSqlResult({ ...result, duration })
        setStatusMessage('Consulta lista en ' + duration + 's')
        addToast(result.rowCount?.toLocaleString() + ' filas', 'success', explanation || 'Consulta ejecutada')
      }
      setSqlError(null)
    } catch (e) {
      const msg = e?.message || String(e)
      setSqlError({
        level: e?.contextual?.level || 'error',
        title: e?.contextual?.title || 'No pude ejecutar la instruccion',
        message: msg,
        actionHint: e?.contextual?.actionHint || 'Verifica que la tabla exista en "Archivos cargados" y vuelve a ejecutar.',
      })
      setSqlResult(null)
      setStatusMessage('Error al ejecutar instrucción')
      addToast(msg.slice(0, 100), 'error', 'SQL Pro IA')
    } finally {
      setSqlBusy(false)
    }
  }, [tables, addToast, sqlConversationHistory, aiContextPayload])

  return (
    <div className="flex flex-col h-full select-none" style={{ background: T.appBg, color: T.text }}>
      <Toolbar
        user={user}
        dbReady={dbReady}
        onSignOut={() => signOut(auth)}
        onToggleDrawer={() => setDrawerOpen(p => !p)}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      <motion.div layout className="flex items-center px-4 py-1.5 text-[11px] shrink-0 gap-2 font-medium"
        style={{ background: T.panelSoft, borderBottom: `1px solid ${T.border}`, color: T.dim }}>
        <span className="truncate flex-1">{statusMessage}</span>
        {sqlBusy && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', color: T.accent }}>
            <span className="animate-spin" style={{ width: 12, height: 12, border: `2px solid ${T.accent}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block' }} />
            Ejecutando
          </span>
        )}
      </motion.div>
      {sqlBusy && (
        <div style={{ height: 2, background: theme === 'dark' ? 'rgba(16,185,129,0.2)' : '#D9EBDD' }}>
          <motion.div
            initial={{ width: '10%' }}
            animate={{ width: ['10%', '88%', '28%'] }}
            transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }}
            style={{ height: '100%', background: 'linear-gradient(90deg, #10B981, #34D399)' }}
          />
        </div>
      )}

      <div className="flex flex-1 overflow-hidden relative">
        <AnimatePresence>
          {drawerOpen && (
            <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 z-30"
              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
              onClick={() => setDrawerOpen(false)} />
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          <motion.div
            key="drawer-mobile"
            initial={{ x: -280 }}
            animate={{ x: drawerOpen ? 0 : -280 }}
            transition={spring}
            className="md:hidden fixed left-0 top-0 bottom-0 z-40 flex flex-col"
            style={{ width: 280, paddingTop: 86 }}>
            <ObjectExplorer
              tables={tables}
              onInsertCommand={(cmd) => { setSqlPrompt(cmd); setActiveModule('sql'); setDrawerOpen(false); runNaturalQuery(cmd) }}
              onDeleteTable={handleDeleteTable}
              onOpenUploader={() => { setShowUploader(true); setDrawerOpen(false) }}
              onDeleteAllTables={handleDeleteAllTables}
              onSelectTable={(n) => { setSelectedTable(n); setActiveModule('files'); setDrawerOpen(false) }}
              selectedTable={selectedTable}
              theme={theme}
            />
          </motion.div>
        </AnimatePresence>

        <div style={{ width: 280 }} className="hidden md:flex flex-col shrink-0 overflow-hidden">
          <ObjectExplorer
            tables={tables}
            onInsertCommand={(cmd) => { setSqlPrompt(cmd); setActiveModule('sql') }}
            onDeleteTable={handleDeleteTable}
            onOpenUploader={() => setShowUploader(true)}
            onDeleteAllTables={handleDeleteAllTables}
            onSelectTable={(n) => { setSelectedTable(n); setActiveModule('files') }}
            selectedTable={selectedTable}
            theme={theme}
          />
        </div>

        <div className="hidden md:block" style={{ width: 1, background: T.border }} />

        <div className="flex flex-col flex-1 min-w-0" style={{ background: T.panel }}>
          <div className="flex items-center gap-2 px-3 py-2 shrink-0 overflow-x-auto" style={{ borderBottom: `1px solid ${T.border}` }}>
            {[
              { key: 'files', label: 'Archivo' },
              { key: 'cross', label: 'Cruces' },
              { key: 'dashboard', label: 'Dashboard' },
              { key: 'sql', label: 'Modo SQL Pro' },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveModule(tab.key)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: activeModule === tab.key ? `1px solid ${T.accent}` : `1px solid ${T.border}`,
                  background: activeModule === tab.key ? (theme === 'dark' ? 'rgba(16,185,129,0.16)' : '#E8F5E9') : 'transparent',
                  color: activeModule === tab.key ? T.accent : T.dim,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  fontFamily: 'Inter,sans-serif',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}>
                {tab.label}
              </button>
            ))}

            <div className="flex-1" />

            <button onClick={() => exportCSV(activeResult, 'resultado_' + Date.now())}
              disabled={!activeResult?.rows?.length}
              style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: activeResult?.rows?.length ? 'transparent' : (theme === 'dark' ? 'rgba(255,255,255,0.03)' : '#f3f3f3'), color: T.dim, fontSize: '0.73rem', fontWeight: 700, cursor: activeResult?.rows?.length ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', opacity: activeResult?.rows?.length ? 1 : 0.45 }}>
              Exportar CSV
            </button>
            <button onClick={() => exportExcel(activeResult, 'resultado_' + Date.now())}
              disabled={!activeResult?.rows?.length}
              style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: activeResult?.rows?.length ? 'transparent' : (theme === 'dark' ? 'rgba(255,255,255,0.03)' : '#f3f3f3'), color: T.dim, fontSize: '0.73rem', fontWeight: 700, cursor: activeResult?.rows?.length ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', opacity: activeResult?.rows?.length ? 1 : 0.45 }}>
              Exportar Excel
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            {activeModule === 'files' && (
              <div className="h-full">
                {!tables.length ? (
                  <ContextualStatePanel
                    level="info"
                    title="No hay archivos cargados"
                    message="Este módulo muestra la vista previa del archivo principal con scroll y exportación."
                    actionHint="Carga un CSV o Excel para habilitar la previsualización."
                    ctaLabel="Cargar archivo"
                    onCta={() => setShowUploader(true)}
                    theme={theme}
                  />
                ) : !selectedTable ? (
                  <ContextualStatePanel
                    level="warning"
                    title="Selecciona un archivo para continuar"
                    message="Tienes archivos cargados, pero aún no has elegido cuál abrir en la vista principal."
                    actionHint="Haz clic en una tarjeta del panel izquierdo para abrir sus primeras filas."
                    theme={theme}
                  />
                ) : (
                  <ResultsTable
                    result={previewResult}
                    error={null}
                    isExecuting={previewBusy}
                    theme={theme}
                    onExport={() => exportCSV(previewResult, selectedTable || 'archivo')}
                    onExportExcel={() => exportExcel(previewResult, selectedTable || 'archivo')}
                    onClear={() => setPreviewResult(null)}
                  />
                )}
              </div>
            )}

            {activeModule === 'cross' && (
              <div className="h-full flex flex-col" style={{ background: theme === 'dark' ? '#0D1511' : '#fff' }}>
                <div style={{ padding: 14, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ color: T.text, fontWeight: 700, fontSize: '0.84rem' }}>Cruce inteligente de datos</div>
                    <div style={{ color: T.dim, fontSize: '0.72rem' }}>Combina archivos sin escribir SQL manualmente.</div>
                  </div>
                  <button onClick={() => setShowCrossWizard(true)}
                    disabled={tables.length < 2}
                    style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #10B981, #047857)', color: '#fff', fontSize: '0.74rem', fontWeight: 700, cursor: tables.length < 2 ? 'not-allowed' : 'pointer', opacity: tables.length < 2 ? 0.45 : 1 }}>
                    Abrir módulo de cruces
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  {tables.length < 2 ? (
                    <ContextualStatePanel
                      level="warning"
                      title="Faltan archivos para cruzar"
                      message="El cruce inteligente necesita dos tablas como mínimo para sugerir columnas de JOIN."
                      actionHint="Carga otro archivo y vuelve a abrir el módulo de cruces."
                      ctaLabel="Cargar otro archivo"
                      onCta={() => setShowUploader(true)}
                      theme={theme}
                    />
                  ) : !crossResult ? (
                    <ContextualStatePanel
                      level="info"
                      title="Sin resultado de cruce todavía"
                      message="Configura Tabla A, Tabla B y columnas de enlace para generar un preview antes de confirmar."
                      actionHint={'Pulsa "Abrir módulo de cruces" para iniciar el asistente paso a paso.'}
                      ctaLabel="Abrir módulo de cruces"
                      onCta={() => setShowCrossWizard(true)}
                      theme={theme}
                    />
                  ) : (
                    <ResultsTable
                      result={crossResult}
                      error={null}
                      isExecuting={false}
                      theme={theme}
                      onExport={() => exportCSV(crossResult, 'cruce_' + Date.now())}
                      onExportExcel={() => exportExcel(crossResult, 'cruce_' + Date.now())}
                      onClear={() => setCrossResult(null)}
                    />
                  )}
                </div>
              </div>
            )}

            {activeModule === 'dashboard' && (
              <div className="h-full flex items-center justify-center p-6" style={{ background: theme === 'dark' ? '#0D1511' : '#fff' }}>
                {!tables.length ? (
                  <ContextualStatePanel
                    level="info"
                    title="Dashboard esperando datos"
                    message="El editor de dashboard se alimenta de archivos cargados o resultados activos de consultas."
                    actionHint="Carga al menos un archivo para habilitar métricas y gráficos."
                    ctaLabel="Cargar archivo"
                    onCta={() => setShowUploader(true)}
                    theme={theme}
                  />
                ) : (
                <div style={{ width: '100%', maxWidth: 600, border: `1px solid ${T.border}`, borderRadius: 14, padding: 24, background: theme === 'dark' ? 'rgba(16,185,129,0.06)' : '#F8FBF8' }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: '1.05rem', color: T.text, fontFamily: 'Inter,sans-serif' }}>Dashboard Studio</h3>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: T.dim, lineHeight: 1.6, fontFamily: 'Inter,sans-serif' }}>
                    Genera visualizaciones y métricas desde tus resultados actuales. Puedes lanzar preguntas desde el dashboard y enviarlas al chat automáticamente.
                  </p>
                  <button onClick={() => setShowDashboardStudio(true)}
                    style={{ marginTop: 16, padding: '9px 14px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #10B981, #047857)', color: '#fff', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                    Abrir Dashboard Studio
                  </button>
                </div>
                )}
              </div>
            )}

            {activeModule === 'sql' && (
              <div ref={sqlSplitRef} className="h-full flex flex-col" style={{ background: theme === 'dark' ? 'radial-gradient(circle at top right, rgba(16,185,129,0.12), transparent 32%), #0B140F' : '#fff' }}>
                <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}`, background: theme === 'dark' ? 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(7,94,72,0.12))' : '#F8FBF8', boxShadow: theme === 'dark' ? 'inset 0 -1px 0 rgba(16,185,129,0.2)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ marginBottom: 4, color: T.text, fontSize: '1.12rem', fontWeight: 800, fontFamily: 'Inter,sans-serif', letterSpacing: '-0.01em' }}>SQL Pro + IA</div>
                      <div style={{ color: T.dim, fontSize: '0.8rem', fontFamily: 'Inter,sans-serif' }}>
                        Editor de consultas y acciones sobre tus tablas.
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveModule('files')}
                      style={{ padding: '8px 12px', borderRadius: 10, border: `1px solid ${T.border}`, background: theme === 'dark' ? '#12271C' : '#fff', color: T.text, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                      Salir de SQL Pro
                    </button>
                  </div>
                </div>

                <div style={{ height: `${sqlEditorHeightPct}%`, minHeight: 170, borderBottom: `1px solid ${T.border}`, boxShadow: theme === 'dark' ? '0 10px 24px rgba(0,0,0,0.25)' : 'none' }}>
                  <CommandBar
                    onExecute={(cmd) => runNaturalQuery(cmd)}
                    isExecuting={sqlBusy}
                    injectedValue={sqlPrompt}
                    onClear={() => setSqlPrompt('')}
                    tables={tables}
                    activeTableName={selectedTable}
                    newTabSignal={newQuerySignal}
                    theme={theme}
                  />
                </div>

                <div
                  onMouseDown={() => setIsResizingSql(true)}
                  title="Arrastra para redimensionar"
                  style={{
                    height: 9,
                    cursor: 'row-resize',
                    borderBottom: `1px solid ${T.border}`,
                    background: theme === 'dark'
                      ? 'linear-gradient(180deg, rgba(16,185,129,0.12), rgba(16,185,129,0.03))'
                      : 'linear-gradient(180deg, rgba(46,125,50,0.14), rgba(46,125,50,0.04))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <div style={{ width: 68, height: 3, borderRadius: 999, background: theme === 'dark' ? 'rgba(16,185,129,0.65)' : 'rgba(46,125,50,0.55)' }} />
                </div>

                <div className="flex-1 overflow-hidden">
                  {!tables.length ? (
                    <ContextualStatePanel
                      level="warning"
                      title="SQL Pro necesita archivos cargados"
                      message="El editor puede generar y ejecutar SQL natural, pero no hay datasets activos todavía."
                      actionHint="Carga un archivo y luego vuelve a esta pestaña para ejecutar consultas."
                      ctaLabel="Cargar archivo"
                      onCta={() => setShowUploader(true)}
                      theme={theme}
                    />
                  ) : (
                    <ResultsTable
                      result={sqlResult}
                      error={sqlError || (!sqlResult && !sqlBusy ? {
                        level: 'info',
                        title: 'Listo para ejecutar',
                        message: 'Escribe una instruccion en lenguaje natural o SQL directo para comenzar.',
                        actionHint: 'Prueba: "Muestra los primeros 20 registros de resultado_1"',
                      } : null)}
                      isExecuting={sqlBusy}
                      theme={theme}
                      density="large"
                      onExport={() => exportCSV(sqlResult, 'sql_' + Date.now())}
                      onExportExcel={() => exportExcel(sqlResult, 'sql_' + Date.now())}
                      onClear={() => { setSqlResult(null); setSqlError(null) }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {activeModule !== 'sql' && <div className="hidden lg:block" style={{ width: 1, background: T.border }} />}

        {activeModule !== 'sql' && (
          <div className="hidden lg:flex flex-col shrink-0" style={{ width: 340, minWidth: 340, maxWidth: 340, background: T.panelSoft }}>
            <ChatEngine
              tables={tables}
              activeTableName={selectedTable}
              onExport={exportCSV}
              onExportExcel={exportExcel}
              onResult={handleChatResult}
              addToast={addToast}
              onOpenCrossWizard={() => setShowCrossWizard(true)}
              onOpenDashboard={() => setShowDashboardStudio(true)}
              onOpenUploader={() => setShowUploader(true)}
              showActionBar={false}
              theme={theme}
            />
          </div>
        )}
      </div>

      {showUploader && (
        <FileUploader
          onClose={() => setShowUploader(false)}
          onTableLoaded={handleTableLoaded}
          setStatusMessage={setStatusMessage}
          onNewQuery={() => setShowUploader(false)}
        />
      )}

      <AnimatePresence>
        {showCrossWizard && (
          <CrossWizard
            tables={tables}
            onClose={() => setShowCrossWizard(false)}
            onAskAssistant={(prompt) => {
              setShowCrossWizard(false)
              window.dispatchEvent(new CustomEvent('ds-chat-prompt', { detail: { prompt } }))
            }}
            onResult={async (res) => {
              setCrossResult(res)
              setActiveModule('cross')
              setStatusMessage('Cruce ejecutado — ' + res.rowCount?.toLocaleString() + ' fila(s)')
              addToast(res.rowCount?.toLocaleString() + ' filas', 'success', 'Cruce completado')
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showKnowledgeBase && (
          <KnowledgeBaseModal
            open={showKnowledgeBase}
            userEmail={user?.email}
            onClose={() => setShowKnowledgeBase(false)}
            addToast={addToast}
            onUseCommand={(cmd) => {
              setSqlPrompt(cmd)
              setActiveModule('sql')
            }}
            onRunCommand={(cmd) => runNaturalQuery(cmd)}
            tables={tables}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDashboardStudio && (
          <DashboardStudio
            open={showDashboardStudio}
            onClose={() => setShowDashboardStudio(false)}
            tables={tables}
            result={activeResult}
            addToast={addToast}
            theme={theme}
            onAskAssistant={(prompt) => {
              setShowDashboardStudio(false)
              window.dispatchEvent(new CustomEvent('ds-chat-prompt', { detail: { prompt } }))
            }}
          />
        )}
      </AnimatePresence>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
