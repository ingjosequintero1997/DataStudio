/**
 * ChatEngine v3 — Conversacion con IA
 * Groq genera SQL to DuckDB ejecuta localmente to insight en lenguaje natural
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { executeQuery } from '../lib/duckdb'
import { runAiTask, isAiRuntimeConfigured } from '../services/ai/aiOrchestratorClient'
import { parseCommand } from '../lib/nlp'

const G = {
  dark:    '#1B5E20',
  primary: '#43A047',
  light:   '#E8F5E9',
  border:  '#C8DCC8',
  text:    '#1B3318',
  text2:   '#4A6B4A',
  dim:     '#9EBB9E',
}

function MiniTable({ result }) {
  if (!result?.rows?.length) return null
  const { columns, rows } = result
  const display = rows.slice(0, 300)
  return (
    <div style={{ borderRadius: 10, border: `1px solid ${G.border}`, overflow: 'hidden', marginTop: 12 }}>
      <div style={{ display: 'flex', background: G.dark, overflowX: 'auto' }}>
        <div style={{ width: 36, flexShrink: 0, padding: '6px 8px', color: 'rgba(255,255,255,0.4)', fontSize: '0.63rem', borderRight: '1px solid rgba(255,255,255,0.1)' }}>#</div>
        {columns.map(col => (
          <div key={col} title={col} style={{ minWidth: 80, maxWidth: 200, padding: '6px 10px', color: 'white', fontSize: '0.68rem', fontWeight: 700, borderRight: '1px solid rgba(255,255,255,0.1)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Inter,sans-serif' }}>{col}</div>
        ))}
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto', overflowX: 'auto', scrollbarWidth: 'thin' }}>
        {display.map((row, i) => (
          <div key={i} style={{ display: 'flex', background: i % 2 === 0 ? '#FAFCFA' : '#fff', borderBottom: `1px solid ${G.border}` }}>
            <div style={{ width: 36, flexShrink: 0, padding: '4px 8px', color: G.dim, fontSize: '0.61rem', textAlign: 'right', borderRight: `1px solid ${G.border}`, fontFamily: 'Inter,sans-serif' }}>{i + 1}</div>
            {columns.map(col => {
              const val = row[col]
              const isNull = val === null || val === undefined
              const str = isNull ? '' : String(val)
              const isNum = !isNull && str.trim() !== '' && !isNaN(Number(str))
              return (
                <div key={col} title={str} style={{ minWidth: 80, maxWidth: 200, padding: '4px 10px', fontSize: '0.72rem', fontFamily: 'JetBrains Mono, monospace', borderRight: `1px solid ${G.border}`, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isNull ? G.dim : isNum ? (Number(str) < 0 ? '#C62828' : '#1B5E20') : G.text, fontStyle: isNull ? 'italic' : 'normal' }}>
                  {isNull ? 'NULL' : str}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div style={{ padding: '5px 12px', background: G.light, borderTop: `1px solid ${G.border}`, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.67rem', color: G.text2, fontFamily: 'Inter,sans-serif' }}>
          {rows.length > 300 ? `Mostrando 300 de ${rows.length.toLocaleString()}` : `${rows.length.toLocaleString()} fila(s)`} · {columns.length} col(s)
        </span>
      </div>
    </div>
  )
}

const SEV = {
  critical: { label: 'CRITICO', bg: '#FFF3F3', border: '#FFCDD2', text: '#C62828', dot: '#EF5350' },
  warning:  { label: 'ATENCION', bg: '#FFFDE7', border: '#FFE082', text: '#E65100', dot: '#FFB300' },
  insight:  { label: 'INSIGHT', bg: '#E8F4FD', border: '#BBDEFB', text: '#0D47A1', dot: '#1976D2' },
  ok:       { label: 'OK', bg: '#E8F5E9', border: '#C8E6C9', text: '#1B5E20', dot: '#43A047' },
}

function BriefingCard({ briefing, onSuggest }) {
  const [open, setOpen] = useState(true)
  if (!briefing?.items?.length) return null
  return (
    <div style={{ borderRadius: 12, border: `1.5px solid ${G.border}`, overflow: 'hidden', marginTop: 10 }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: `linear-gradient(135deg, ${G.dark}, #2E7D32)`, border: 'none', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'white' }}>◈</span>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'white', fontFamily: 'Inter,sans-serif', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Diagnostico — {briefing.tableName}</span>
          <span style={{ fontSize: '0.63rem', color: 'rgba(255,255,255,0.65)', fontFamily: 'Inter,sans-serif' }}>{briefing.rowCount?.toLocaleString()} filas · {briefing.colCount} cols</span>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>▼</span>
      </button>
      {open && (
        <div>
          {briefing.items.map((item, i) => {
            const cfg = SEV[item.severity] || SEV.insight
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 14px', background: cfg.bg, borderTop: `1px solid ${cfg.border}` }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, marginTop: 5, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.63rem', fontWeight: 700, color: cfg.text, fontFamily: 'Inter,sans-serif', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 7 }}>{cfg.label}</span>
                  <span style={{ fontSize: '0.76rem', color: cfg.text, fontFamily: 'Inter,sans-serif', lineHeight: 1.5 }}>{item.text}</span>
                </div>
              </div>
            )
          })}
          {briefing.suggestions?.length > 0 && (
            <div style={{ padding: '8px 14px', background: G.light, borderTop: `1px solid ${G.border}`, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: '0.62rem', color: G.dim, fontFamily: 'Inter,sans-serif', flexShrink: 0 }}>Sugerencias:</span>
              {briefing.suggestions.map((s, i) => (
                <motion.button key={i} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} onClick={() => onSuggest?.(s)} style={{ padding: '3px 10px', borderRadius: 20, border: `1px solid ${G.border}`, background: '#fff', color: G.text2, fontSize: '0.68rem', fontFamily: 'Inter,sans-serif', cursor: 'pointer', fontWeight: 500 }}>{s}</motion.button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RichText({ text }) {
  if (!text) return null
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return (
    <span>
      {parts.map((p, i) => i % 2 === 1 ? <strong key={i} style={{ color: G.dark, fontWeight: 700 }}>{p}</strong> : p)}
    </span>
  )
}

function SetupGuideCard() {
  return (
    <div style={{ borderRadius: 12, border: '1.5px solid #BBDEFB', background: '#E8F4FD', overflow: 'hidden', marginTop: 4 }}>
      <div style={{ padding: '10px 14px', background: 'linear-gradient(135deg, #0D47A1, #1565C0)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>⚡</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'white', fontFamily: 'Inter,sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Activa runtime IA en 2 minutos</span>
      </div>
      <div style={{ padding: '12px 14px' }}>
        <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: '#0D47A1', fontFamily: 'Inter,sans-serif', lineHeight: 1.6 }}>
          Configura primero el Orchestrator IA y si aun no esta listo usa Groq como fallback:
        </p>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: '0.78rem', color: '#1B3318', fontFamily: 'Inter,sans-serif', lineHeight: 2 }}>
          <li>Configura <strong>VITE_AI_ORCHESTRATOR_URL</strong> hacia tu API local o backend</li>
          <li>Opcional: agrega <strong>VITE_AI_ORCHESTRATOR_TOKEN</strong> para proteger la API</li>
          <li>Fallback temporal: crea API key en <strong>console.groq.com</strong> y agrega <code style={{ background: '#fff', border: '1px solid #BBDEFB', borderRadius: 4, padding: '2px 6px', fontSize: '0.75rem', color: '#0D47A1' }}>VITE_GROQ_API_KEY</code></li>
          <li>Redeploy desde Vercel para aplicar variables</li>
        </ol>
        <p style={{ margin: '10px 0 0', fontSize: '0.72rem', color: '#4A6B4A', fontFamily: 'Inter,sans-serif' }}>
          Si no hay runtime IA configurado, se activa modo local basico.
        </p>
      </div>
    </div>
  )
}

function AssistantMessage({ msg, onExport, onExportExcel, onSuggest }) {
  const [sqlOpen, setSqlOpen] = useState(false)
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 340, damping: 28 }} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', maxWidth: '90%' }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg, ${G.primary}, ${G.dark})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2, fontSize: 15 }}>◈</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ background: '#fff', borderRadius: '4px 14px 14px 14px', padding: '12px 16px', border: `1px solid ${G.border}`, boxShadow: '0 2px 10px rgba(0,0,0,0.07)' }}>
          {msg.isSetupGuide && <SetupGuideCard />}
          {msg.text && (
            <p style={{ margin: 0, fontSize: '0.86rem', color: G.text, fontFamily: 'Inter,sans-serif', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: (msg.sql || msg.result || msg.error || msg.briefing) ? 10 : 0 }}>
              <RichText text={msg.text} />
            </p>
          )}
          {msg.error && (
            <div style={{ background: '#FFF3F3', border: '1px solid #FFCDD2', borderRadius: 8, padding: '9px 13px', marginTop: msg.text ? 8 : 0 }}>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#C62828', fontFamily: 'Inter,sans-serif', lineHeight: 1.55 }}>{msg.error}</p>
            </div>
          )}
          {msg.sql && (
            <div style={{ marginTop: 8 }}>
              <button onClick={() => setSqlOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: G.dim, fontSize: '0.71rem', fontFamily: 'Inter,sans-serif', padding: 0 }}>
                <span style={{ display: 'inline-block', transform: sqlOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s', fontSize: 9 }}>▶</span>
                {sqlOpen ? 'Ocultar SQL' : 'Ver SQL generado por IA'}
              </button>
              <AnimatePresence>
                {sqlOpen && (
                  <motion.pre initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ margin: '6px 0 0', background: '#F4F7F4', border: `1px solid ${G.border}`, borderRadius: 8, padding: '8px 12px', fontSize: '0.71rem', color: G.text2, fontFamily: 'JetBrains Mono, monospace', overflowX: 'auto', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                    {msg.sql}
                  </motion.pre>
                )}
              </AnimatePresence>
            </div>
          )}
          {msg.briefing && <BriefingCard briefing={msg.briefing} onSuggest={onSuggest} />}
          {msg.result?.rows?.length > 0 && (
            <>
              <MiniTable result={msg.result} />
              <div style={{ display: 'flex', gap: 7, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={() => onExport?.(msg.result)} style={{ padding: '4px 11px', borderRadius: 7, border: `1px solid ${G.border}`, background: '#fff', color: G.text2, fontSize: '0.7rem', fontFamily: 'Inter,sans-serif', cursor: 'pointer', fontWeight: 600 }}>⬇ CSV</button>
                <button onClick={() => onExportExcel?.(msg.result)} style={{ padding: '4px 11px', borderRadius: 7, border: `1px solid ${G.border}`, background: '#fff', color: G.text2, fontSize: '0.7rem', fontFamily: 'Inter,sans-serif', cursor: 'pointer', fontWeight: 600 }}>⬇ Excel</button>
                {msg.duration && <span style={{ fontSize: '0.66rem', color: G.dim, fontFamily: 'Inter,sans-serif' }}>⏱ {msg.duration}s</span>}
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

function UserMessage({ msg }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 340, damping: 28 }} style={{ display: 'flex', justifyContent: 'flex-end' }}>
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

function TypingIndicator() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg, ${G.primary}, ${G.dark})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 15 }}>◈</div>
      <div style={{ background: '#fff', borderRadius: '4px 14px 14px 14px', padding: '14px 18px', border: `1px solid ${G.border}`, boxShadow: '0 2px 10px rgba(0,0,0,0.07)' }}>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {[0, 1, 2].map(i => (
            <motion.div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: G.primary }} animate={{ y: [0, -7, 0] }} transition={{ duration: 0.55, delay: i * 0.14, repeat: Infinity }} />
          ))}
        </div>
      </div>
    </motion.div>
  )
}

function ActionBar({ tables, onOpenCrossWizard, onOpenDashboard, onOpenKnowledgeBase, onConsolidate, isThinking }) {
  if (!tables.length) return null
  const totalRows = tables.reduce((s, t) => s + (t.rowCount || 0), 0)
  return (
    <div style={{ padding: '8px 16px', background: '#fff', borderBottom: `1px solid ${G.border}`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: G.light, border: `1px solid ${G.border}`, marginRight: 4 }}>
        <span style={{ fontSize: 11 }}>📁</span>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: G.dark, fontFamily: 'Inter,sans-serif' }}>
          {tables.length} archivo{tables.length !== 1 ? 's' : ''} · {totalRows.toLocaleString()} filas
        </span>
      </div>
      {tables.length >= 2 && (
        <motion.button whileHover={{ scale: 1.04, y: -1 }} whileTap={{ scale: 0.95 }} onClick={onOpenCrossWizard} disabled={isThinking}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 13px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #0078d4, #0056b3)', color: 'white', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'Inter,sans-serif', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,120,212,0.3)', opacity: isThinking ? 0.5 : 1 }}>
          ⋈ Cruzar
        </motion.button>
      )}
      {tables.length >= 2 && (
        <motion.button whileHover={{ scale: 1.04, y: -1 }} whileTap={{ scale: 0.95 }} onClick={onConsolidate} disabled={isThinking}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 13px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #4f46e5, #3730a3)', color: 'white', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'Inter,sans-serif', cursor: 'pointer', boxShadow: '0 2px 8px rgba(79,70,229,0.3)', opacity: isThinking ? 0.5 : 1 }}>
          ≡ Consolidar
        </motion.button>
      )}
      <motion.button whileHover={{ scale: 1.04, y: -1 }} whileTap={{ scale: 0.95 }} onClick={onOpenDashboard} disabled={isThinking}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 13px', borderRadius: 8, border: 'none', background: `linear-gradient(135deg, ${G.dark}, #145A32)`, color: 'white', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'Inter,sans-serif', cursor: 'pointer', boxShadow: '0 2px 8px rgba(27,94,32,0.3)', opacity: isThinking ? 0.5 : 1 }}>
        📊 Dashboard
      </motion.button>
      <motion.button whileHover={{ scale: 1.04, y: -1 }} whileTap={{ scale: 0.95 }} onClick={onOpenKnowledgeBase} disabled={isThinking}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 13px', borderRadius: 8, border: `1px solid ${G.border}`, background: '#fff', color: G.dark, fontSize: '0.72rem', fontWeight: 700, fontFamily: 'Inter,sans-serif', cursor: 'pointer', opacity: isThinking ? 0.5 : 1 }}>
        📚 Conocimiento
      </motion.button>
    </div>
  )
}

function EmptyState({ onOpenUploader }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 24 }}>
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }} style={{ width: 80, height: 80, borderRadius: 24, background: `linear-gradient(135deg, ${G.primary}, ${G.dark})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, boxShadow: '0 8px 32px rgba(67,160,71,0.35)' }}>
        ◈
      </motion.div>
      <div style={{ textAlign: 'center', maxWidth: 380 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '1.25rem', fontWeight: 800, color: G.dark, fontFamily: 'Inter,sans-serif' }}>DataStudio AI</h2>
        <p style={{ margin: '0 0 20px', fontSize: '0.88rem', color: G.text2, fontFamily: 'Inter,sans-serif', lineHeight: 1.7 }}>
          Carga cualquier archivo CSV o Excel y conversa con tus datos en lenguaje natural. La IA genera SQL automaticamente.
        </p>
        <motion.button whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.95 }} onClick={onOpenUploader}
          style={{ padding: '10px 24px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg, ${G.primary}, ${G.dark})`, color: 'white', fontSize: '0.88rem', fontWeight: 700, fontFamily: 'Inter,sans-serif', cursor: 'pointer', boxShadow: '0 4px 16px rgba(67,160,71,0.4)' }}>
          + Cargar primer archivo
        </motion.button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%', maxWidth: 380 }}>
        {[
          { icon: '🔍', title: 'Consulta libre', desc: 'Pregunta cualquier cosa sobre tus datos' },
          { icon: '⋈', title: 'Cruce inteligente', desc: 'Une archivos por columnas comunes' },
          { icon: '📊', title: 'Dashboard', desc: 'Graficas y metricas automaticas' },
          { icon: '🩺', title: 'Diagnostico', desc: 'Detecta nulos, duplicados y anomalias' },
        ].map((item, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${G.border}`, background: '#fff' }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{item.icon}</div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: G.dark, fontFamily: 'Inter,sans-serif', marginBottom: 3 }}>{item.title}</div>
            <div style={{ fontSize: '0.68rem', color: G.text2, fontFamily: 'Inter,sans-serif', lineHeight: 1.5, fontStyle: 'italic' }}>{item.desc}</div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

const WELCOME = {
  id: 'welcome',
  role: 'assistant',
  text: 'Hola! Soy tu analista de datos con IA.\n\nCarga un archivo CSV o Excel y preguntame lo que quieras:\n• "Cuantos registros hay con estado Inactivo?"\n• "Muestra el top 10 por valor de contrato"\n• "Busca duplicados en cedula"\n• "Cruza el archivo A con B y muestra los que no coinciden"',
  sql: null, result: null, error: null,
  timestamp: new Date(),
}

let _msgId = 200
const AI_AVAILABLE = isAiRuntimeConfigured()

export default function ChatEngine({
  tables,
  onExport,
  onExportExcel,
  addToast,
  onOpenCrossWizard,
  onOpenDashboard,
  onOpenKnowledgeBase,
  onOpenUploader,
}) {
  const [messages, setMessages] = useState([WELCOME])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [conversationHistory, setConversationHistory] = useState([])
  const [prevTableCount, setPrevTableCount] = useState(0)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [input])

  const addMsg = useCallback((msg) => {
    setMessages(prev => [...prev, { id: `msg-${++_msgId}`, timestamp: new Date(), ...msg }])
  }, [])

  useEffect(() => {
    if (tables.length <= prevTableCount) { setPrevTableCount(tables.length); return }
    const newTable = tables[tables.length - 1]
    setPrevTableCount(tables.length)

    async function runBriefing() {
      setIsThinking(true)
      try {
        const cols = newTable.columns || []
        const rowCount = newTable.rowCount || 0
        const items = []

        if (cols.length > 0) {
          const nullExpr = cols.map(c => `COUNT(*) FILTER (WHERE "${c.name}" IS NULL) AS "${c.name}"`).join(', ')
          const nullRow = (await executeQuery(`SELECT ${nullExpr} FROM "${newTable.name}"`))?.rows?.[0] || {}
          const criticals = []
          const warnings = []
          Object.entries(nullRow).forEach(([col, count]) => {
            const pct = rowCount > 0 ? (Number(count) / rowCount) * 100 : 0
            if (pct > 50) criticals.push(`${col} (${pct.toFixed(1)}% vacios)`)
            else if (pct > 10) warnings.push(`${col} (${pct.toFixed(1)}%)`)
          })
          if (criticals.length > 0) items.push({ severity: 'critical', text: `Alta tasa de vacios en: ${criticals.join(', ')}` })
          if (warnings.length > 0) items.push({ severity: 'warning', text: `Vacios parciales en: ${warnings.join(', ')}` })
          const cleanCount = cols.filter(c => !Number(nullRow[c.name])).length
          if (criticals.length === 0 && warnings.length === 0) items.push({ severity: 'ok', text: `Datos limpios. ${cleanCount} columna(s) sin vacios.` })
          else if (cleanCount > 0) items.push({ severity: 'ok', text: `${cleanCount} columna(s) completamente limpias.` })
        }

        const keyCol = cols.find(c => /id|ium|c[ou]d|clave|cedula|nit|serial|ref|folio|cuenta/i.test(c.name))
        if (keyCol && rowCount > 0) {
          try {
            const dupRes = await executeQuery(`SELECT COUNT(*) - COUNT(DISTINCT TRIM(CAST("${keyCol.name}" AS VARCHAR))) AS dups FROM "${newTable.name}"`)
            const dups = Number(dupRes?.rows?.[0]?.dups || 0)
            if (dups > 0) items.push({ severity: 'warning', text: `${dups.toLocaleString()} duplicado(s) en "${keyCol.name}".` })
          } catch { }
        }

        const sugs = []
        if (keyCol) sugs.push(`Hay duplicados en ${keyCol.name}?`)
        sugs.push(`Muestra los primeros 10 registros de ${newTable.name}`)
        sugs.push(`Cuantos registros tiene ${newTable.name}?`)
        if (tables.length >= 2) sugs.push(`Cruza ${newTable.name} con ${tables[tables.length - 2]?.name}`)

        addMsg({
          role: 'assistant',
          text: `Analice "${newTable.name}" (${rowCount.toLocaleString()} filas · ${cols.length} columnas). Diagnostico automatico:`,
          sql: null, result: null, error: null,
          briefing: { tableName: newTable.name, rowCount, colCount: cols.length, items, suggestions: sugs.slice(0, 4) },
        })
      } catch {
        addMsg({ role: 'assistant', text: `Listo! Cargue "${newTable.name}" (${(newTable.rowCount || 0).toLocaleString()} filas). Que quieres analizar?`, sql: null, result: null, error: null })
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

    try {
      if (!tables.length) {
        addMsg({ role: 'assistant', text: 'Primero carga un archivo CSV o Excel usando el boton "Cargar archivos".', sql: null, result: null, error: null })
        return
      }

      if (!AI_AVAILABLE) {
        addMsg({ role: 'assistant', text: 'La IA no esta configurada aun. Aqui tienes como activarla gratis:', sql: null, result: null, error: null, isSetupGuide: true })
        try {
          const parsed = parseCommand(text, tables)
          if (parsed?.sql && !parsed?.error) {
            const start = performance.now()
            const result = await executeQuery(parsed.sql)
            const duration = ((performance.now() - start) / 1000).toFixed(3)
            addMsg({ role: 'assistant', text: `(Modo local sin IA) ${parsed.description || ''}`, sql: parsed.sql, result: { ...result, duration }, error: null })
          }
        } catch { }
        return
      }

      const { sql: aiSql, explanation: aiExplanation } = await runAiTask({
        task: 'sql.generate',
        prompt: text,
        tables,
        history: conversationHistory,
      })

      let result = null
      let finalSql = aiSql
      let finalExplanation = aiExplanation

      if (aiSql) {
        try {
          const start = performance.now()
          result = await executeQuery(aiSql)
          result = { ...result, duration: ((performance.now() - start) / 1000).toFixed(3) }
        } catch (sqlErr) {
          try {
            const retryPrompt = `El SQL fallo con error en DuckDB: "${sqlErr.message}"\n\nSQL intentado:\n\`\`\`sql\n${aiSql}\n\`\`\`\n\nPor favor corrije el SQL.`
            const retryHistory = [
              ...conversationHistory,
              { role: 'user', content: text },
              { role: 'assistant', content: aiExplanation + `\n\`\`\`sql\n${aiSql}\n\`\`\`` },
            ]
            const retry = await runAiTask({
              task: 'sql.repair',
              prompt: retryPrompt,
              tables,
              history: retryHistory,
              context: {
                failedSql: aiSql,
                sqlError: sqlErr.message,
              },
            })
            if (retry.sql) {
              const start = performance.now()
              result = await executeQuery(retry.sql)
              result = { ...result, duration: ((performance.now() - start) / 1000).toFixed(3) }
              finalSql = retry.sql
              finalExplanation = retry.explanation
            } else {
              addMsg({ role: 'assistant', text: finalExplanation, sql: aiSql, result: null, error: `Error de SQL: ${sqlErr.message}` })
              return
            }
          } catch {
            addMsg({ role: 'assistant', text: null, sql: aiSql, result: null, error: `Error al ejecutar la consulta: ${sqlErr.message}` })
            return
          }
        }
      }

      addMsg({ role: 'assistant', text: finalExplanation, sql: finalSql, result, error: null })

      setConversationHistory(prev => [
        ...prev,
        { role: 'user', content: text },
        { role: 'assistant', content: finalExplanation + (finalSql ? `\n\`\`\`sql\n${finalSql}\n\`\`\`` : '') },
      ].slice(-12))

    } catch (err) {
      const msg = err?.message || String(err)
      if (msg.includes('malloc') || msg.toLowerCase().includes('out of memory')) {
        addMsg({ role: 'assistant', text: null, sql: null, result: null, error: 'Archivos demasiado grandes. Filtra con WHERE o usa el Asistente de Cruce.' })
      } else {
        addMsg({ role: 'assistant', text: null, sql: null, result: null, error: `Error: ${msg}` })
      }
    } finally {
      setIsThinking(false)
    }
  }, [input, tables, isThinking, addMsg, conversationHistory])

  const handleConsolidate = useCallback(() => {
    if (tables.length < 2) { addToast?.('Carga al menos 2 archivos para consolidar.', 'info'); return }
    const names = tables.map(t => `"${t.name}"`).join(', ')
    handleSend(`Consolida todos los archivos (${names}) en una sola tabla usando UNION ALL y muestra el total de filas.`)
  }, [tables, handleSend])

  useEffect(() => {
    const onPrompt = (e) => {
      const prompt = e?.detail?.prompt
      if (typeof prompt === 'string' && prompt.trim()) handleSend(prompt.trim())
    }
    window.addEventListener('ds-chat-prompt', onPrompt)
    return () => window.removeEventListener('ds-chat-prompt', onPrompt)
  }, [handleSend])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const suggestions = useMemo(() => {
    if (!tables.length) return []
    const t0 = tables[0]
    const cols = t0.columns || []
    const keyCol = cols.find(c => /id|ium|c[ou]d|clave|cedula|nit/i.test(c.name))
    const s = [
      `Muestra los primeros 20 registros de ${t0.name}`,
      `Cuantos registros tiene ${t0.name}?`,
      `Busca valores nulos en ${t0.name}`,
    ]
    if (keyCol) s.push(`Hay duplicados en ${keyCol.name}?`)
    if (tables.length >= 2) s.push(`Cruza ${tables[0].name} con ${tables[1].name}`)
    return s.slice(0, 5)
  }, [tables])

  const showSuggestions = suggestions.length > 0 && messages.length <= 3 && !isThinking

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F4F7F4' }}>
      <ActionBar
        tables={tables}
        onOpenCrossWizard={onOpenCrossWizard}
        onOpenDashboard={onOpenDashboard}
        onOpenKnowledgeBase={onOpenKnowledgeBase}
        onConsolidate={handleConsolidate}
        isThinking={isThinking}
      />

      {tables.length === 0 ? (
        <EmptyState onOpenUploader={onOpenUploader} />
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16, scrollbarWidth: 'thin', scrollbarColor: `${G.primary} ${G.light}` }}>
          {messages.map(msg =>
            msg.role === 'user'
              ? <UserMessage key={msg.id} msg={msg} />
              : <AssistantMessage key={msg.id} msg={msg} onExport={onExport} onExportExcel={onExportExcel} onSuggest={handleSend} />
          )}
          {isThinking && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>
      )}

      <AnimatePresence>
        {showSuggestions && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ padding: '8px 20px 6px', display: 'flex', flexWrap: 'wrap', gap: 6, borderTop: `1px solid ${G.border}`, background: '#fff' }}>
            <span style={{ fontSize: '0.67rem', color: G.dim, fontFamily: 'Inter,sans-serif', alignSelf: 'center', marginRight: 4 }}>Prueba:</span>
            {suggestions.map((s, i) => (
              <motion.button key={i} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} onClick={() => handleSend(s)} style={{ padding: '4px 12px', borderRadius: 20, border: `1px solid ${G.border}`, background: '#F7FBF7', color: G.text2, fontSize: '0.72rem', fontFamily: 'Inter,sans-serif', cursor: 'pointer', fontWeight: 500 }}>{s}</motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {tables.length > 0 && (
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${G.border}`, background: '#fff', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <motion.div animate={{ boxShadow: input ? `0 0 0 2px rgba(67,160,71,0.35)` : `0 0 0 1px ${G.border}` }} style={{ flex: 1, borderRadius: 14, overflow: 'hidden', background: '#FAFCFA' }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isThinking}
              placeholder={AI_AVAILABLE ? 'Hazme cualquier pregunta sobre tus datos... (Enter para enviar)' : 'Configura VITE_AI_ORCHESTRATOR_URL o VITE_GROQ_API_KEY (ver guia arriba)'}
              rows={1}
              style={{ width: '100%', resize: 'none', border: 'none', outline: 'none', background: 'transparent', padding: '11px 16px', fontSize: '0.88rem', fontFamily: 'Inter,sans-serif', color: G.text, maxHeight: 140, lineHeight: 1.55, boxSizing: 'border-box' }}
            />
          </motion.div>
          <div title={AI_AVAILABLE ? 'IA activa (orchestrator o fallback)' : 'Sin IA - configura runtime'} style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginBottom: 20, background: AI_AVAILABLE ? '#43A047' : '#FFB300', boxShadow: AI_AVAILABLE ? '0 0 6px rgba(67,160,71,0.8)' : '0 0 6px rgba(255,179,0,0.8)' }} />
          <motion.button onClick={() => handleSend()} disabled={!input.trim() || isThinking} whileHover={{ scale: input.trim() && !isThinking ? 1.06 : 1 }} whileTap={{ scale: input.trim() && !isThinking ? 0.93 : 1 }}
            style={{ width: 46, height: 46, borderRadius: 13, flexShrink: 0, border: 'none', cursor: input.trim() && !isThinking ? 'pointer' : 'not-allowed', background: input.trim() && !isThinking ? `linear-gradient(135deg, ${G.primary}, ${G.dark})` : G.border, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: input.trim() && !isThinking ? '0 4px 14px rgba(67,160,71,0.4)' : 'none', transition: 'background 0.2s' }}>
            {isThinking
              ? <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }} style={{ width: 16, height: 16, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', display: 'block' }} />
              : <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            }
          </motion.button>
        </div>
      )}
    </div>
  )
}
