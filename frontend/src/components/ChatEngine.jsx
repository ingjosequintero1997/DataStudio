/**
 * ChatEngine — Motor de conversación de datos
 * El usuario habla, la IA genera SQL, ejecuta y devuelve insight en lenguaje natural.
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { parseCommand } from '../lib/nlp'
import { executeQuery } from '../lib/duckdb'
import { checkAgentHealth, queryAgent } from '../lib/agentApi'

const G = {
  dark:    '#1B5E20',
  primary: '#43A047',
  light:   '#E8F5E9',
  border:  '#C8DCC8',
  text:    '#1B3318',
  text2:   '#4A6B4A',
  dim:     '#9EBB9E',
}

// ─── Mini tabla embebida en mensajes ────────────────────────────────────────
function MiniTable({ result }) {
  if (!result?.rows?.length) return null
  const { columns, rows } = result
  const display = rows.slice(0, 300)

  return (
    <div style={{ borderRadius: 10, border: `1px solid ${G.border}`, overflow: 'hidden', marginTop: 12 }}>
      <div style={{ display: 'flex', background: G.dark, overflowX: 'auto' }}>
        <div style={{ width: 36, flexShrink: 0, padding: '6px 8px', color: 'rgba(255,255,255,0.4)', fontSize: '0.63rem', borderRight: '1px solid rgba(255,255,255,0.1)', fontFamily: 'Inter,sans-serif' }}>#</div>
        {columns.map(col => (
          <div key={col} style={{ minWidth: 80, maxWidth: 220, padding: '6px 10px', color: 'white', fontSize: '0.68rem', fontWeight: 700, fontFamily: 'Inter,sans-serif', borderRight: '1px solid rgba(255,255,255,0.1)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={col}>{col}</div>
        ))}
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto', overflowX: 'auto', scrollbarWidth: 'thin', scrollbarColor: `${G.primary} ${G.light}` }}>
        {display.map((row, i) => (
          <div key={i} style={{ display: 'flex', background: i % 2 === 0 ? '#FAFCFA' : '#fff', borderBottom: `1px solid ${G.border}` }}>
            <div style={{ width: 36, flexShrink: 0, padding: '4px 8px', color: G.dim, fontSize: '0.61rem', textAlign: 'right', borderRight: `1px solid ${G.border}`, fontFamily: 'Inter,sans-serif' }}>{i + 1}</div>
            {columns.map(col => {
              const val = row[col]
              const isNull = val === null || val === undefined
              const str = isNull ? '' : String(val)
              const isNum = !isNull && str.trim() !== '' && !isNaN(Number(str))
              return (
                <div
                  key={col}
                  title={str}
                  style={{
                    minWidth: 80, maxWidth: 220, padding: '4px 10px',
                    fontSize: '0.72rem', fontFamily: 'JetBrains Mono, monospace',
                    borderRight: `1px solid ${G.border}`, flexShrink: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: isNull ? G.dim : isNum ? (Number(str) < 0 ? '#C62828' : '#1B5E20') : G.text,
                    fontStyle: isNull ? 'italic' : 'normal',
                  }}
                >
                  {isNull ? 'NULL' : str}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div style={{ padding: '5px 12px', background: G.light, borderTop: `1px solid ${G.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.67rem', color: G.text2, fontFamily: 'Inter,sans-serif' }}>
          {rows.length > 300 ? `Mostrando 300 de ${rows.length.toLocaleString()} filas` : `${rows.length.toLocaleString()} fila(s)`} · {columns.length} col(s)
        </span>
      </div>
    </div>
  )
}

// ─── Briefing card con severidades ─────────────────────────────────────────
const SEV = {
  critical: { label: 'CRÍTICO',  bg: '#FFF3F3', border: '#FFCDD2', text: '#C62828', dot: '#EF5350' },
  warning:  { label: 'ATENCIÓN', bg: '#FFFDE7', border: '#FFE082', text: '#E65100', dot: '#FFB300' },
  insight:  { label: 'INSIGHT',  bg: '#E8F4FD', border: '#BBDEFB', text: '#0D47A1', dot: '#1976D2' },
  ok:       { label: 'OK',       bg: '#E8F5E9', border: '#C8E6C9', text: '#1B5E20', dot: '#43A047' },
}

function BriefingCard({ briefing, onSuggest }) {
  const [open, setOpen] = useState(true)
  if (!briefing?.items?.length) return null
  return (
    <div style={{ borderRadius: 12, border: `1.5px solid ${G.border}`, overflow: 'hidden', marginTop: 10 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: `linear-gradient(135deg, ${G.dark}, #2E7D32)`, border: 'none', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'white' }}>◈</span>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'white', fontFamily: 'Inter,sans-serif', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Briefing — {briefing.tableName}</span>
          <span style={{ fontSize: '0.63rem', color: 'rgba(255,255,255,0.65)', fontFamily: 'Inter,sans-serif' }}>{briefing.rowCount?.toLocaleString()} filas · {briefing.colCount} cols</span>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
      </button>
      {open && (
        <div>
          {briefing.items.map((item, i) => {
            const cfg = SEV[item.severity] || SEV.insight
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 14px', background: cfg.bg, borderTop: `1px solid ${cfg.border}` }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, marginTop: 5, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '0.63rem', fontWeight: 700, color: cfg.text, fontFamily: 'Inter,sans-serif', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 7 }}>{cfg.label}</span>
                  <span style={{ fontSize: '0.76rem', color: cfg.text, fontFamily: 'Inter,sans-serif', lineHeight: 1.5 }}>{item.text}</span>
                </div>
              </div>
            )
          })}
          {briefing.suggestions?.length > 0 && (
            <div style={{ padding: '8px 14px', background: G.light, borderTop: `1px solid ${G.border}`, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: '0.62rem', color: G.dim, fontFamily: 'Inter,sans-serif', flexShrink: 0 }}>Preguntas sugeridas:</span>
              {briefing.suggestions.map((s, i) => (
                <motion.button key={i} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}
                  onClick={() => onSuggest?.(s)}
                  style={{ padding: '3px 10px', borderRadius: 20, border: `1px solid ${G.border}`, background: '#fff', color: G.text2, fontSize: '0.68rem', fontFamily: 'Inter,sans-serif', cursor: 'pointer', fontWeight: 500 }}
                >{s}</motion.button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Texto con **negrita** ───────────────────────────────────────────────────
function RichText({ text }) {
  if (!text) return null
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return (
    <span>
      {parts.map((p, i) =>
        i % 2 === 1
          ? <strong key={i} style={{ color: G.dark, fontWeight: 700 }}>{p}</strong>
          : p
      )}
    </span>
  )
}

// ─── Burbuja del asistente ───────────────────────────────────────────────────
function AssistantMessage({ msg, onExport, onExportExcel, onSuggest }) {
  const [sqlOpen, setSqlOpen] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 340, damping: 28 }}
      style={{ display: 'flex', gap: 10, alignItems: 'flex-start', maxWidth: '88%' }}
    >
      {/* Avatar */}
      <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg, ${G.primary}, ${G.dark})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2, fontSize: 15 }}>
        ◈
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ background: '#fff', borderRadius: '4px 14px 14px 14px', padding: '12px 16px', border: `1px solid ${G.border}`, boxShadow: '0 2px 10px rgba(0,0,0,0.07)' }}>

          {/* Texto insight */}
          {msg.text && (
            <p style={{ margin: 0, fontSize: '0.86rem', color: G.text, fontFamily: 'Inter,sans-serif', lineHeight: 1.65, marginBottom: (msg.sql || msg.result || msg.error) ? 10 : 0 }}>
              <RichText text={msg.text} />
            </p>
          )}

          {/* Error */}
          {msg.error && (
            <div style={{ background: '#FFF3F3', border: '1px solid #FFCDD2', borderRadius: 8, padding: '9px 13px', marginTop: msg.text ? 8 : 0 }}>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#C62828', fontFamily: 'Inter,sans-serif', lineHeight: 1.55 }}>{msg.error}</p>
            </div>
          )}

          {/* SQL colapsable */}
          {msg.sql && (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => setSqlOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: G.dim, fontSize: '0.71rem', fontFamily: 'Inter,sans-serif', padding: 0 }}
              >
                <span style={{ display: 'inline-block', transform: sqlOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.18s', fontSize: 9 }}>▶</span>
                {sqlOpen ? 'Ocultar SQL' : 'Ver SQL generado'}
              </button>
              <AnimatePresence>
                {sqlOpen && (
                  <motion.pre
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    style={{ margin: '6px 0 0', background: '#F4F7F4', border: `1px solid ${G.border}`, borderRadius: 8, padding: '8px 12px', fontSize: '0.71rem', color: G.text2, fontFamily: 'JetBrains Mono, monospace', overflowX: 'auto', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}
                  >
                    {msg.sql}
                  </motion.pre>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Briefing ejecutivo */}
          {msg.briefing && (
            <BriefingCard briefing={msg.briefing} onSuggest={onSuggest} />
          )}

          {/* Tabla inline */}
          {msg.result?.rows?.length > 0 && (
            <>
              <MiniTable result={msg.result} />
              <div style={{ display: 'flex', gap: 7, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  onClick={() => onExport?.(msg.result)}
                  style={{ padding: '4px 11px', borderRadius: 7, border: `1px solid ${G.border}`, background: '#fff', color: G.text2, fontSize: '0.7rem', fontFamily: 'Inter,sans-serif', cursor: 'pointer', fontWeight: 600 }}
                >
                  ⬇ CSV
                </button>
                <button
                  onClick={() => onExportExcel?.(msg.result)}
                  style={{ padding: '4px 11px', borderRadius: 7, border: `1px solid ${G.border}`, background: '#fff', color: G.text2, fontSize: '0.7rem', fontFamily: 'Inter,sans-serif', cursor: 'pointer', fontWeight: 600 }}
                >
                  ⬇ Excel
                </button>
                {msg.duration && (
                  <span style={{ fontSize: '0.66rem', color: G.dim, fontFamily: 'Inter,sans-serif', marginLeft: 2 }}>⏱ {msg.duration}s</span>
                )}
              </div>
            </>
          )}
        </div>
        <div style={{ fontSize: '0.61rem', color: G.dim, marginTop: 4, marginLeft: 4, fontFamily: 'Inter,sans-serif' }}>
          {msg.timestamp?.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Burbuja del usuario ─────────────────────────────────────────────────────
function UserMessage({ msg }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 340, damping: 28 }}
      style={{ display: 'flex', justifyContent: 'flex-end' }}
    >
      <div style={{ maxWidth: '78%' }}>
        <div style={{ background: `linear-gradient(135deg, ${G.primary}, ${G.dark})`, borderRadius: '14px 4px 14px 14px', padding: '10px 16px' }}>
          <p style={{ margin: 0, fontSize: '0.86rem', fontFamily: 'Inter,sans-serif', lineHeight: 1.55, color: 'white', whiteSpace: 'pre-wrap' }}>{msg.text}</p>
        </div>
        <div style={{ fontSize: '0.61rem', color: G.dim, marginTop: 4, textAlign: 'right', marginRight: 4, fontFamily: 'Inter,sans-serif' }}>
          {msg.timestamp?.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Indicador "escribiendo" ─────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg, ${G.primary}, ${G.dark})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 15 }}>◈</div>
      <div style={{ background: '#fff', borderRadius: '4px 14px 14px 14px', padding: '14px 18px', border: `1px solid ${G.border}`, boxShadow: '0 2px 10px rgba(0,0,0,0.07)' }}>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              style={{ width: 7, height: 7, borderRadius: '50%', background: G.primary }}
              animate={{ y: [0, -7, 0] }}
              transition={{ duration: 0.55, delay: i * 0.14, repeat: Infinity }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Generador de insights en lenguaje natural ────────────────────────────────
function buildInsight(sql = '', result, description = '', context = {}) {
  if (!result) return null
  const { rows, columns, rowCount } = result

  if (rowCount === 0) {
    const hint = context.focusCol ? ` La columna **"${context.focusCol}"** puede tener valores vacíos o formatos distintos.` : ''
    return `⚠️ La consulta no devolvió resultados. Verifica los filtros o los nombres de los archivos cargados.${hint}`
  }

  // JOIN / cruce
  if (/\bjoin\b/i.test(sql)) {
    const matched = rows.filter(r => r['Coincide'] === 'SI' || r['estado_cruce'] === 'coincide').length
    const noMatch = rows.filter(r => r['Coincide'] === 'NO' || r['estado_cruce'] === 'sin_coincidencia').length
    const pct = rowCount > 0 ? Math.round((matched / rowCount) * 100) : 0
    const badge = pct >= 90 ? '✅ Excelente.' : pct >= 60 ? '🟡 Coincidencia parcial.' : '⚠️ Baja coincidencia — verifica las columnas de enlace.'
    const contextHint = context.queriesCount > 3 && pct < 60 ? ' Basado en tu análisis previo, revisa si los IDs tienen espacios o formatos distintos.' : ''
    return `Se procesaron **${rowCount.toLocaleString()}** filas. **${matched.toLocaleString()} coinciden** (${pct}%) y **${noMatch.toLocaleString()} no tienen par**. ${badge}${contextHint}`
  }

  // Escalar único
  if (rowCount === 1 && columns.length === 1) {
    const val = rows[0][columns[0]]
    const num = Number(val)
    const display = !isNaN(num) && val !== '' ? num.toLocaleString() : val
    const ctxHint = context.queriesCount >= 3 ? ` (pregunta ${context.queriesCount} en esta sesión)` : ''
    return `**${columns[0]}**: **${display}**${ctxHint}`
  }

  // Agrupación con 2 columnas (GROUP BY / ranking)
  if (rowCount <= 20 && columns.length === 2) {
    const numCol = columns.find(c => rows.slice(0, 5).every(r => r[c] !== null && !isNaN(Number(r[c])) && String(r[c]).trim() !== ''))
    const labelCol = columns.find(c => c !== numCol)
    if (numCol && labelCol) {
      const topRow = rows[0]
      const topLabel = topRow[labelCol]
      const topNum = Number(topRow[numCol])
      const total = rows.reduce((s, r) => s + (Number(r[numCol]) || 0), 0)
      const pct = total > 0 ? Math.round((topNum / total) * 100) : 0
      const prevFocus = context.recentTopics?.length > 1 ? ` Recuerda que también preguntaste sobre ${context.recentTopics.slice(-2, -1)[0]?.split(' ').slice(0,3).join(' ')}.` : ''
      return `**${rowCount}** grupos encontrados. El mayor es **"${topLabel}"** con **${topNum.toLocaleString()}** (${pct}% del total).${prevFocus}`
    }
  }

  // Resultado grande
  if (rowCount > 10000) {
    return `Encontré **${rowCount.toLocaleString()}** registros con **${columns.length}** columnas. Conjunto grande — puedes filtrar para profundizar.`
  }

  return `Encontré **${rowCount.toLocaleString()}** registro(s) con **${columns.length}** columna(s).`
}

// ─── Sugerencias automáticas según los archivos cargados ─────────────────────
function buildSuggestions(tables) {
  if (!tables.length) return []
  const t0 = tables[0]
  const cols = t0.columns || []
  const numCols = cols.filter(c => ['INTEGER','BIGINT','DOUBLE','FLOAT','DECIMAL','NUMERIC'].some(tp => (c.type || '').toUpperCase().includes(tp)))
  const base = [
    `Muestra los primeros 20 registros de ${t0.name}`,
    `¿Cuántos registros tiene ${t0.name}?`,
    `Busca duplicados en ${t0.name}`,
    `¿Cuántos valores nulos hay en ${t0.name}?`,
    `Estadísticas de ${t0.name}`,
  ]
  if (numCols.length > 0) base.push(`Máximo de ${numCols[0].name} en ${t0.name}`)
  if (tables.length >= 2) {
    base.push(`Cruza ${tables[0].name} con ${tables[1].name}`)
    base.push(`Consolida ${tables[0].name} con ${tables[1].name}`)
  }
  return base.slice(0, 6)
}

// ─── Mensaje de bienvenida ───────────────────────────────────────────────────
const WELCOME = {
  id: 'welcome',
  role: 'assistant',
  text: '¡Hola! Soy tu analista de datos. Carga uno o más archivos CSV o Excel y empieza a conversar con tus datos.\n\nPuedes preguntarme cosas como:\n• "¿Cuántos registros tiene el archivo?"\n• "Muestra los 10 clientes con más ventas"\n• "Cruza el archivo A con el archivo B por ID"\n• "Busca duplicados en la columna cédula"\n\nO escribe SQL directamente si prefieres control total.',
  sql: null,
  result: null,
  error: null,
  timestamp: new Date(),
}

let _msgId = 100

export default function ChatEngine({ tables, onExport, onExportExcel, addToast, onOpenCrossWizard, onOpenDashboard }) {
  const [messages, setMessages] = useState([WELCOME])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [useRemoteAI, setUseRemoteAI] = useState(false)
  const [remoteStatus, setRemoteStatus] = useState('unknown') // unknown | online | offline
  const [prevTableCount, setPrevTableCount] = useState(0)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const fallbackNotifiedRef = useRef(false)
  // Memoria de conversación: rastrear columnas/tablas mencionadas y temas recurrentes
  const contextRef = useRef({ queriesCount: 0, recentTopics: [], focusCol: null, focusTable: null })

  const suggestions = useMemo(() => buildSuggestions(tables), [tables])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [input])

  const addMsg = useCallback((msg) => {
    setMessages(prev => [...prev, { id: `msg-${++_msgId}`, timestamp: new Date(), ...msg }])
  }, [])

  const handleToggleRemoteAI = useCallback(async () => {
    if (useRemoteAI) {
      setUseRemoteAI(false)
      addToast?.('IA remota desactivada. Seguimos en modo local.', 'info', 'Asistente')
      return
    }

    const healthy = await checkAgentHealth()
    setRemoteStatus(healthy ? 'online' : 'offline')
    setUseRemoteAI(true)
    addToast?.(
      healthy
        ? 'IA remota activada. Si falla, regresaremos al modo local automáticamente.'
        : 'Endpoint IA no disponible ahora. Se mantiene fallback local automático.',
      healthy ? 'success' : 'warning',
      'Asistente'
    )
  }, [useRemoteAI, addToast])

  // ── Auto-Briefing Ejecutivo al cargar archivo ───────────────────────────────
  useEffect(() => {
    if (tables.length <= prevTableCount) {
      setPrevTableCount(tables.length)
      return
    }
    const newTable = tables[tables.length - 1]
    setPrevTableCount(tables.length)

    async function runBriefing() {
      setIsThinking(true)
      try {
        const cols = newTable.columns || []
        const rowCount = newTable.rowCount || 0
        const items = []

        // 1. NULL analysis por columna
        const nullExpr = cols.map(c => `COUNT(*) FILTER (WHERE "${c.name}" IS NULL) AS "${c.name}"`).join(', ')
        const nullRow = nullExpr
          ? (await executeQuery(`SELECT ${nullExpr} FROM "${newTable.name}"`))?.rows?.[0] || {}
          : {}

        const criticalNulls = []
        const warningNulls = []
        Object.entries(nullRow).forEach(([col, count]) => {
          const pct = rowCount > 0 ? (Number(count) / rowCount) * 100 : 0
          if (pct > 50) criticalNulls.push({ col, pct: pct.toFixed(1) })
          else if (pct > 10) warningNulls.push({ col, pct: pct.toFixed(1) })
        })

        if (criticalNulls.length > 0) {
          items.push({ severity: 'critical', text: `${criticalNulls.map(n => `${n.col} (${n.pct}% vacíos)`).join(', ')}. Alta tasa de valores faltantes — posible falla en fuente de datos.` })
        }
        if (warningNulls.length > 0) {
          items.push({ severity: 'warning', text: `Columnas con vacíos parciales: ${warningNulls.map(n => `${n.col} (${n.pct}%)`).join(', ')}.` })
        }

        // 2. Detección de duplicados en columna clave
        const keyCol = cols.find(c => /id|ium|c[oó]digo|clave|cedula|c[eé]dula|nit|serial|ref\b/i.test(c.name))
        if (keyCol && rowCount > 0) {
          try {
            const dupRes = await executeQuery(`SELECT COUNT(*) - COUNT(DISTINCT TRIM(CAST("${keyCol.name}" AS VARCHAR))) AS dups FROM "${newTable.name}"`)
            const dupCount = Number(dupRes?.rows?.[0]?.dups || 0)
            if (dupCount > 0) {
              items.push({ severity: 'warning', text: `${dupCount.toLocaleString()} ${dupCount === 1 ? 'duplicado detectado' : 'duplicados detectados'} en "${keyCol.name}". Verifica IDs únicos.` })
            }
          } catch { /* no critico */ }
        }

        // 3. Columnas con un solo valor (constantes / anomalía de proceso)
        const constantCols = []
        for (const col of cols.slice(0, 12)) {
          try {
            const dRes = await executeQuery(`SELECT COUNT(DISTINCT "${col.name}") AS d, MIN(CAST("${col.name}" AS VARCHAR)) AS v FROM "${newTable.name}"`)
            const d = Number(dRes?.rows?.[0]?.d || 0)
            if (d === 1 && rowCount > 1) constantCols.push({ col: col.name, val: dRes?.rows?.[0]?.v })
          } catch { /* skip */ }
        }
        if (constantCols.length > 0) {
          items.push({ severity: 'insight', text: `${constantCols.map(c => `"${c.col}" = "${c.val}"`).join(' · ')} — ${constantCols.length === 1 ? 'columna' : 'columnas'} con valor único en todas las filas. Posible resultado de un proceso fallido.` })
        }

        // 4. Columnas OK
        const cleanCount = cols.filter(c => !Number(nullRow[c.name])).length
        if (criticalNulls.length === 0 && warningNulls.length === 0 && !constantCols.length) {
          items.push({ severity: 'ok', text: `Datos limpios. ${cleanCount} columna(s) sin valores vacíos. ✅` })
        } else if (cleanCount > 0) {
          items.push({ severity: 'ok', text: `${cleanCount} columna(s) completamente limpias.` })
        }

        // 5. Sugerencias contextuales
        const sugs = []
        if (keyCol) sugs.push(`¿Hay duplicados en ${keyCol.name}?`)
        if (criticalNulls.length > 0) sugs.push(`¿Por qué hay NULLs en ${criticalNulls[0].col}?`)
        if (constantCols.length > 0) sugs.push(`Muestra filas donde ${constantCols[0].col} = "${constantCols[0].val}"`)
        sugs.push(`Muestra los primeros 10 registros`)
        if (tables.length >= 2) sugs.push(`Cruza ${newTable.name} con ${tables[tables.length - 2]?.name}`)

        addMsg({
          role: 'assistant',
          text: `Analicé **"${newTable.name}"** automáticamente. Aquí el diagnóstico ejecutivo:`,
          sql: null, result: null, error: null,
          briefing: { tableName: newTable.name, rowCount, colCount: cols.length, items, suggestions: sugs.slice(0, 4) },
        })
      } catch {
        addMsg({ role: 'assistant', text: `Cargué **"${newTable.name}"** (${(newTable.rowCount || 0).toLocaleString()} filas). ¿Qué quieres analizar?`, sql: null, result: null, error: null })
      } finally {
        setIsThinking(false)
      }
    }
    runBriefing()
  }, [tables]) // eslint-disable-line

  const handleSend = useCallback(async (text = input.trim()) => {
    if (!text || isThinking) return
    setInput('')

    addMsg({ role: 'user', text })
    setIsThinking(true)

  // Actualizar memoria de conversación
  const ctx = contextRef.current
  ctx.queriesCount += 1
  ctx.recentTopics = [...ctx.recentTopics.slice(-4), text.toLowerCase()]
  const allCols = tables.flatMap(t => (t.columns || []).map(c => c.name))
  const mentioned = allCols.find(col => text.toLowerCase().includes(col.toLowerCase()))
  if (mentioned) ctx.focusCol = mentioned
  if (tables.length === 1) ctx.focusTable = tables[0].name

  try {
      if (!tables.length) {
        addMsg({ role: 'assistant', text: 'Primero carga un archivo. Usa el botón **"Cargar archivo"** en la barra superior.', sql: null, result: null, error: null })
        return
      }

      if (useRemoteAI) {
        const remote = await queryAgent(text)
        if (remote?.action && remote.action !== 'error') {
          setRemoteStatus('online')
          fallbackNotifiedRef.current = false

          const remoteRows = Array.isArray(remote.rows) ? remote.rows : []
          if (remoteRows.length > 0) {
            const remoteResult = {
              rows: remoteRows,
              rowCount: Number.isFinite(remote.rowCount) ? remote.rowCount : remoteRows.length,
              columns: Array.isArray(remote.columns) ? remote.columns : Object.keys(remoteRows[0] || {}),
              duration: remote.duration,
            }
            addMsg({
              role: 'assistant',
              text: remote.description || buildInsight(remote.sql || '', remoteResult, '', contextRef.current),
              sql: remote.sql || null,
              result: remoteResult,
              error: null,
            })
            return
          }

          if (remote.sql) {
            const start = performance.now()
            const localResult = await executeQuery(remote.sql)
            const duration = ((performance.now() - start) / 1000).toFixed(3)
            addMsg({
              role: 'assistant',
              text: remote.description || buildInsight(remote.sql, localResult, '', contextRef.current),
              sql: remote.sql,
              result: { ...localResult, duration },
              error: null,
              duration,
            })
            return
          }
        } else {
          setRemoteStatus('offline')
          if (!fallbackNotifiedRef.current) {
            addToast?.('IA remota no disponible. Continuamos con motor local.', 'warning', 'Fallback automático')
            fallbackNotifiedRef.current = true
          }
        }
      }

      let parsed = null
      try {
        parsed = parseCommand(text, tables)
      } catch {
        const fallbackTable = tables[0]?.name
        if (!fallbackTable) {
          addMsg({ role: 'assistant', text: null, sql: null, result: null, error: 'No pude interpretar el mensaje y no hay archivos cargados.' })
          return
        }
        parsed = {
          sql: `SELECT * FROM "${fallbackTable}" LIMIT 50;`,
          action: 'query',
          description: `Vista rápida de "${fallbackTable}"`,
        }
      }

      if (parsed.error) {
        addMsg({ role: 'assistant', text: null, sql: null, result: null, error: parsed.error })
        return
      }

      if (parsed.action === 'help') {
        addMsg({
          role: 'assistant',
          text: 'Puedo ayudarte con:\n• **Consultar** datos en lenguaje natural o SQL\n• **Filtrar** registros con condiciones\n• **Agrupar y calcular** estadísticas\n• **Cruzar** dos archivos por columnas comunes\n• **Actualizar, agregar o eliminar** registros\n• **Exportar** resultados a CSV o Excel\n\nEscribe tu pregunta y la respondo al instante.',
          sql: null, result: null, error: null,
        })
        return
      }

      if (parsed.action === 'export') {
        addMsg({ role: 'assistant', text: 'Para exportar, usa los botones **⬇ CSV** o **⬇ Excel** que aparecen junto a cada resultado.', sql: null, result: null, error: null })
        return
      }

      if (parsed.action === 'reorderColumns') {
        addMsg({ role: 'assistant', text: 'Para reordenar columnas usa el modo **SQL Directo** o el comando exacto: "Reordena columnas de [tabla]: col1, col2, col3".', sql: null, result: null, error: null })
        return
      }

      const start = performance.now()
      const result = await executeQuery(parsed.sql)
      const duration = ((performance.now() - start) / 1000).toFixed(3)

      const insight = buildInsight(parsed.sql, result, parsed.description, contextRef.current)
      addMsg({ role: 'assistant', text: insight, sql: parsed.sql, result: { ...result, duration }, error: null, duration })

    } catch (err) {
      const msg = err?.message || String(err)
      const isOOM = msg.includes('malloc') || msg.toLowerCase().includes('out of memory') || msg.toLowerCase().includes('oom')
      addMsg({
        role: 'assistant',
        text: null,
        sql: null,
        result: null,
        error: isOOM
          ? 'Los archivos son muy grandes para procesarlos de una vez. Filtra primero con WHERE o usa el Asistente de Cruce (⋈).'
          : `No pude ejecutar esa consulta: ${msg}`,
      })
    } finally {
      setIsThinking(false)
    }
  }, [input, tables, isThinking, addMsg, useRemoteAI, addToast])

  // Permite inyectar preguntas desde otros módulos (ej. Asistente de Cruce)
  useEffect(() => {
    const onPrompt = (event) => {
      const prompt = event?.detail?.prompt
      if (typeof prompt === 'string' && prompt.trim()) {
        handleSend(prompt.trim())
      }
    }
    window.addEventListener('ds-chat-prompt', onPrompt)
    return () => window.removeEventListener('ds-chat-prompt', onPrompt)
  }, [handleSend])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const showSuggestions = suggestions.length > 0 && messages.length <= 3 && !isThinking
  const basicDeck = useMemo(() => {
    if (!tables.length) return []
    const t0 = tables[0]?.name
    return [
      { label: 'Muéstrame algo', prompt: `quiero ver algo de ${t0}` },
      { label: 'Resúmelo', prompt: `analiza ${t0}` },
      { label: '¿Qué está mal?', prompt: `encuentra problemas en ${t0}` },
      { label: 'Dame top 10', prompt: `muestra top 10 de ${t0}` },
    ]
  }, [tables])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F4F7F4' }}>

      {/* ── Área de mensajes ── */}
      <div
        style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16, scrollbarWidth: 'thin', scrollbarColor: `${G.primary} ${G.light}` }}
      >
        {messages.map(msg =>
          msg.role === 'user'
            ? <UserMessage key={msg.id} msg={msg} />
            : <AssistantMessage key={msg.id} msg={msg} onExport={onExport} onExportExcel={onExportExcel} onSuggest={handleSend} />
        )}
        {isThinking && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* ── Sugerencias automáticas ── */}
      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ padding: '8px 24px 6px', display: 'flex', flexWrap: 'wrap', gap: 6, borderTop: `1px solid ${G.border}`, background: '#fff' }}
          >
            <span style={{ fontSize: '0.68rem', color: G.dim, fontFamily: 'Inter,sans-serif', alignSelf: 'center', marginRight: 4 }}>Sugerencias:</span>
            {suggestions.map((s, i) => (
              <motion.button
                key={i}
                whileHover={{ scale: 1.03, background: G.light }}
                whileTap={{ scale: 0.96 }}
                onClick={() => handleSend(s)}
                style={{ padding: '4px 12px', borderRadius: 20, border: `1px solid ${G.border}`, background: '#F7FBF7', color: G.text2, fontSize: '0.72rem', fontFamily: 'Inter,sans-serif', cursor: 'pointer', fontWeight: 500, transition: 'background 0.15s' }}
              >
                {s}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Deck ultra-simple ── */}
      {basicDeck.length > 0 && !isThinking && (
        <div style={{ padding: '8px 24px', display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: `1px solid ${G.border}`, background: '#FDFEFD' }}>
          <span style={{ fontSize: '0.66rem', color: G.dim, fontFamily: 'Inter,sans-serif', alignSelf: 'center', marginRight: 2 }}>Modo simple:</span>
          {basicDeck.map((item) => (
            <button
              key={item.label}
              onClick={() => handleSend(item.prompt)}
              style={{ padding: '5px 11px', borderRadius: 16, border: `1px solid ${G.border}`, background: '#fff', color: G.text2, fontSize: '0.7rem', fontFamily: 'Inter,sans-serif', cursor: 'pointer', fontWeight: 600 }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Acciones rápidas ── */}
      {tables.length >= 2 && (
        <div style={{ padding: '6px 24px', display: 'flex', gap: 8, borderTop: `1px solid ${G.border}`, background: '#F7FBF7' }}>
          <button
            onClick={onOpenCrossWizard}
            style={{ padding: '5px 13px', borderRadius: 8, border: `1px solid ${G.border}`, background: '#fff', color: G.dark, fontSize: '0.72rem', fontFamily: 'Inter,sans-serif', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            ⋈ Asistente de Cruce
          </button>
          <button
            onClick={onOpenDashboard}
            style={{ padding: '5px 13px', borderRadius: 8, border: `1px solid ${G.border}`, background: '#fff', color: G.dark, fontSize: '0.72rem', fontFamily: 'Inter,sans-serif', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            📊 Dashboard
          </button>
          <button
            onClick={handleToggleRemoteAI}
            style={{
              padding: '5px 13px', borderRadius: 8, border: `1px solid ${G.border}`,
              background: useRemoteAI ? '#E8F5E9' : '#fff',
              color: useRemoteAI ? G.dark : G.text2,
              fontSize: '0.72rem', fontFamily: 'Inter,sans-serif', cursor: 'pointer', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
            title="Activa IA remota opcional; si falla, vuelve a modo local automáticamente"
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: remoteStatus === 'online' ? '#2E7D32' : remoteStatus === 'offline' ? '#C62828' : '#9EBB9E',
              }}
            />
            {useRemoteAI ? 'IA remota ON' : 'IA remota OFF'}
          </button>
        </div>
      )}

      {/* ── Input ── */}
      <div style={{ padding: '12px 24px', borderTop: `1px solid ${G.border}`, background: '#fff', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <motion.div
          animate={{ boxShadow: input ? `0 0 0 2px rgba(67,160,71,0.35)` : `0 0 0 1px ${G.border}` }}
          style={{ flex: 1, borderRadius: 14, overflow: 'hidden', background: '#FAFCFA' }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isThinking}
            placeholder={tables.length ? 'Hazme una pregunta sobre tus datos... (Enter para enviar, Shift+Enter para nueva línea)' : 'Carga un archivo para comenzar...'}
            rows={1}
            style={{
              width: '100%', resize: 'none', border: 'none', outline: 'none',
              background: 'transparent', padding: '11px 16px',
              fontSize: '0.88rem', fontFamily: 'Inter,sans-serif',
              color: G.text, maxHeight: 140, lineHeight: 1.55,
              boxSizing: 'border-box',
            }}
          />
        </motion.div>

        <motion.button
          onClick={() => handleSend()}
          disabled={!input.trim() || isThinking}
          whileHover={{ scale: input.trim() && !isThinking ? 1.06 : 1 }}
          whileTap={{ scale: input.trim() && !isThinking ? 0.93 : 1 }}
          style={{
            width: 46, height: 46, borderRadius: 13, flexShrink: 0,
            background: input.trim() && !isThinking
              ? `linear-gradient(135deg, ${G.primary}, ${G.dark})`
              : '#E0E8E0',
            border: 'none',
            cursor: input.trim() && !isThinking ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: input.trim() && !isThinking ? '0 4px 14px rgba(67,160,71,0.35)' : 'none',
            transition: 'background 0.2s, box-shadow 0.2s',
          }}
        >
          {isThinking ? (
            <motion.div
              style={{ width: 19, height: 19, border: '2.5px solid white', borderTopColor: 'transparent', borderRadius: '50%' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 0.75, repeat: Infinity, ease: 'linear' }}
            />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </motion.button>
      </div>
    </div>
  )
}
