/**
 * ChatEngine v3 — Conversacion con IA
 * Groq genera SQL to DuckDB ejecuta localmente to insight en lenguaje natural
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { dropColumns, executeQuery, reorderTableColumns } from '../lib/duckdb'
import { runAiTask, isAiRuntimeConfigured } from '../services/ai/aiOrchestratorClient'
import { setGroqApiKey } from '../lib/groqAI'
import { parseCommand, shouldPreferLocalCommand } from '../lib/nlp'
import { buildAutocompleteContext } from '../lib/autocomplete'

const CHAT_THEME = {
  dark: {
    bg: '#07130F',
    panel: '#0C1E18',
    panelSoft: '#10271F',
    border: 'rgba(52,211,153,0.24)',
    dark: '#14532D',
    text: '#E6FFF3',
    text2: '#A7DCC3',
    dim: '#79B79A',
    primary: '#22C55E',
    accent: '#10B981',
    bubbleUserA: '#16A34A',
    bubbleUserB: '#047857',
    bubbleAssistant: '#0F231C',
  },
  light: {
    bg: '#F3F8F5',
    panel: '#FFFFFF',
    panelSoft: '#F0F7F3',
    border: '#CDE1D4',
    dark: '#1B5E20',
    text: '#163728',
    text2: '#4D6F5D',
    dim: '#789886',
    primary: '#2E7D32',
    accent: '#15803D',
    bubbleUserA: '#2E7D32',
    bubbleUserB: '#166534',
    bubbleAssistant: '#FFFFFF',
  },
}

const G = CHAT_THEME.dark

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

function AssistantMessage({ msg, onExport, onExportExcel, onSuggest, palette, isDark }) {
  const [sqlOpen, setSqlOpen] = useState(false)
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 340, damping: 28 }} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', maxWidth: '92%' }}>
      <div style={{ width: 34, height: 34, borderRadius: 11, background: `linear-gradient(145deg, ${palette.primary}, ${palette.accent})`, border: `1px solid ${palette.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2, fontSize: 15, color: '#fff', boxShadow: isDark ? '0 8px 20px rgba(16,185,129,0.2)' : '0 8px 16px rgba(0,0,0,0.08)' }}>◈</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ background: palette.bubbleAssistant, borderRadius: '8px 18px 18px 18px', padding: '14px 18px', border: `1px solid ${palette.border}`, boxShadow: isDark ? '0 12px 28px rgba(0,0,0,0.32)' : '0 8px 24px rgba(0,0,0,0.08)' }}>
          {msg.isSetupGuide && <SetupGuideCard />}
          {msg.text && (
            <p style={{ margin: 0, fontSize: '0.93rem', color: palette.text, fontFamily: 'Inter,sans-serif', lineHeight: 1.72, whiteSpace: 'pre-wrap', marginBottom: (msg.sql || msg.result || msg.error || msg.briefing) ? 10 : 0 }}>
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
              <button onClick={() => setSqlOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: palette.dim, fontSize: '0.73rem', fontFamily: 'Inter,sans-serif', padding: 0 }}>
                <span style={{ display: 'inline-block', transform: sqlOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s', fontSize: 9 }}>▶</span>
                {sqlOpen ? 'Ocultar SQL' : 'Ver SQL generado por IA'}
              </button>
              <AnimatePresence>
                {sqlOpen && (
                  <motion.pre initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ margin: '6px 0 0', background: isDark ? '#0A1713' : '#F4F7F4', border: `1px solid ${palette.border}`, borderRadius: 8, padding: '8px 12px', fontSize: '0.73rem', color: palette.text2, fontFamily: 'JetBrains Mono, monospace', overflowX: 'auto', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
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
                <button onClick={() => onExport?.(msg.result)} style={{ padding: '5px 12px', borderRadius: 8, border: `1px solid ${palette.border}`, background: isDark ? '#153227' : '#fff', color: palette.text2, fontSize: '0.72rem', fontFamily: 'Inter,sans-serif', cursor: 'pointer', fontWeight: 700 }}>⬇ CSV</button>
                <button onClick={() => onExportExcel?.(msg.result)} style={{ padding: '5px 12px', borderRadius: 8, border: `1px solid ${palette.border}`, background: isDark ? '#153227' : '#fff', color: palette.text2, fontSize: '0.72rem', fontFamily: 'Inter,sans-serif', cursor: 'pointer', fontWeight: 700 }}>⬇ Excel</button>
                {msg.duration && <span style={{ fontSize: '0.68rem', color: palette.dim, fontFamily: 'Inter,sans-serif' }}>⏱ {msg.duration}s</span>}
              </div>
            </>
          )}
        </div>
        <div style={{ fontSize: '0.64rem', color: palette.dim, marginTop: 4, marginLeft: 4, fontFamily: 'Inter,sans-serif' }}>
          {msg.timestamp?.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </motion.div>
  )
}

function UserMessage({ msg, palette }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 340, damping: 28 }} style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ maxWidth: '80%' }}>
        <div style={{ background: `linear-gradient(145deg, ${palette.bubbleUserA}, ${palette.bubbleUserB})`, borderRadius: '18px 8px 18px 18px', padding: '12px 17px', boxShadow: '0 10px 22px rgba(0,0,0,0.22)' }}>
          <p style={{ margin: 0, fontSize: '0.9rem', fontFamily: 'Inter,sans-serif', lineHeight: 1.58, color: 'white', whiteSpace: 'pre-wrap' }}>{msg.text}</p>
        </div>
        <div style={{ fontSize: '0.64rem', color: palette.dim, marginTop: 4, textAlign: 'right', marginRight: 4, fontFamily: 'Inter,sans-serif' }}>
          {msg.timestamp?.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </motion.div>
  )
}

function TypingIndicator({ palette, isDark }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ width: 34, height: 34, borderRadius: 11, background: `linear-gradient(145deg, ${palette.primary}, ${palette.accent})`, border: `1px solid ${palette.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 15, color: '#fff' }}>◈</div>
      <div style={{ background: palette.bubbleAssistant, borderRadius: '6px 16px 16px 16px', padding: '14px 18px', border: `1px solid ${palette.border}`, boxShadow: isDark ? '0 10px 22px rgba(0,0,0,0.28)' : '0 8px 20px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {[0, 1, 2].map(i => (
            <motion.div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: palette.primary }} animate={{ y: [0, -7, 0] }} transition={{ duration: 0.55, delay: i * 0.14, repeat: Infinity }} />
          ))}
        </div>
      </div>
    </motion.div>
  )
}

function ActionBar({ tables, onOpenCrossWizard, onOpenDashboard, onConsolidate, isThinking, palette, isDark }) {
  if (!tables.length) return null
  const totalRows = tables.reduce((s, t) => s + (t.rowCount || 0), 0)
  return (
    <div style={{ padding: '11px 16px', background: isDark ? 'linear-gradient(180deg, #10251D, #0E2019)' : '#fff', borderBottom: `1px solid ${palette.border}`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 20, background: isDark ? '#143024' : palette.panelSoft, border: `1px solid ${palette.border}`, marginRight: 4 }}>
        <span style={{ fontSize: 11 }}>📁</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: palette.text, fontFamily: 'Inter,sans-serif' }}>
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
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 13px', borderRadius: 8, border: 'none', background: `linear-gradient(135deg, ${palette.primary}, ${palette.accent})`, color: 'white', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'Inter,sans-serif', cursor: 'pointer', boxShadow: '0 2px 8px rgba(27,94,32,0.3)', opacity: isThinking ? 0.5 : 1 }}>
        📊 Dashboard
      </motion.button>
    </div>
  )
}

function EmptyState({ onOpenUploader, palette, isDark }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 24 }}>
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }} style={{ width: 80, height: 80, borderRadius: 24, background: `linear-gradient(145deg, ${palette.primary}, ${palette.accent})`, border: `1px solid ${palette.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, color: '#fff', boxShadow: isDark ? '0 8px 32px rgba(16,185,129,0.25)' : '0 8px 24px rgba(0,0,0,0.12)' }}>
        ◈
      </motion.div>
      <div style={{ textAlign: 'center', maxWidth: 380 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '1.32rem', fontWeight: 800, color: palette.text, fontFamily: 'Inter,sans-serif' }}>NERV</h2>
        <p style={{ margin: '0 0 20px', fontSize: '0.9rem', color: palette.text2, fontFamily: 'Inter,sans-serif', lineHeight: 1.7 }}>
          Carga cualquier archivo CSV o Excel y conversa con tus datos en lenguaje natural. La IA genera SQL automaticamente.
        </p>
        <motion.button whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.95 }} onClick={onOpenUploader}
          style={{ padding: '10px 24px', borderRadius: 12, border: 'none', background: `linear-gradient(145deg, ${palette.primary}, ${palette.accent})`, color: 'white', fontSize: '0.9rem', fontWeight: 700, fontFamily: 'Inter,sans-serif', cursor: 'pointer', boxShadow: isDark ? '0 4px 18px rgba(16,185,129,0.35)' : '0 4px 14px rgba(0,0,0,0.14)' }}>
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
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${palette.border}`, background: isDark ? '#0F251D' : '#fff' }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{item.icon}</div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: palette.text, fontFamily: 'Inter,sans-serif', marginBottom: 3 }}>{item.title}</div>
            <div style={{ fontSize: '0.68rem', color: palette.text2, fontFamily: 'Inter,sans-serif', lineHeight: 1.5, fontStyle: 'italic' }}>{item.desc}</div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

const WELCOME = {
  id: 'welcome',
  role: 'assistant',
  text: 'Listo para ayudarte con los datos cargados.',
  sql: null, result: null, error: null,
  timestamp: new Date(),
}

let _msgId = 200

export default function ChatEngine({
  tables,
  activeTableName = null,
  onExport,
  onExportExcel,
  onResult,
  addToast,
  onOpenCrossWizard,
  onOpenDashboard,
  onOpenUploader,
  showActionBar = true,
  theme = 'light',
}) {
  const isDark = theme === 'dark'
  const palette = CHAT_THEME[theme] || CHAT_THEME.light
  const [messages, setMessages] = useState([WELCOME])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [aiAvailable, setAiAvailable] = useState(() => isAiRuntimeConfigured())
  const [forceLocalMode, setForceLocalMode] = useState(false)
  const [conversationHistory, setConversationHistory] = useState([])
  const [prevTableCount, setPrevTableCount] = useState(0)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
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

  const autocompleteContext = useMemo(
    () => buildAutocompleteContext(input, cursorPosition, tables, activeTableName),
    [activeTableName, cursorPosition, input, tables]
  )

  const visibleSuggestions = autocompleteContext?.items || []

  useEffect(() => {
    setSelectedSuggestionIndex(0)
  }, [input, cursorPosition, activeTableName])

  useEffect(() => {
    setAiAvailable(isAiRuntimeConfigured())
  }, [])

  const configureGroqRuntime = useCallback(() => {
    addToast?.('IA no disponible temporalmente. Contacta al administrador del despliegue.', 'warning', 'Runtime IA')
  }, [addToast])

  const addMsg = useCallback((msg) => {
    setMessages(prev => [...prev, { id: `msg-${++_msgId}`, timestamp: new Date(), ...msg }])
  }, [])

  useEffect(() => {
    if (tables.length <= prevTableCount) { setPrevTableCount(tables.length); return }
    const newTable = tables[tables.length - 1]
    setPrevTableCount(tables.length)
    addMsg({ role: 'assistant', text: `Archivo cargado: ${newTable.name}.`, sql: null, result: null, error: null })
  }, [tables]) // eslint-disable-line

  const applySuggestion = useCallback((suggestion) => {
    if (!suggestion || !autocompleteContext) return

    const suffixOffset = autocompleteContext.type === 'bracket' && input[autocompleteContext.end] === ']' ? 1 : 0
    const nextValue =
      input.slice(0, autocompleteContext.start) +
      suggestion.insertText +
      input.slice(autocompleteContext.end + suffixOffset)

    setInput(nextValue)
    setShowSuggestions(false)

    requestAnimationFrame(() => {
      const nextCaret = autocompleteContext.start + suggestion.insertText.length
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret)
      setCursorPosition(nextCaret)
    })
  }, [autocompleteContext, input])

  const executeLocalCommand = useCallback(async (text) => {
    const parsed = parseCommand(text, tables, { activeTableName })

    if (parsed?.action === 'help') {
      addMsg({
        role: 'assistant',
        text: 'Prueba instrucciones como: "muestra 20 registros", "filtra donde ciudad sea Bogota", "cruza ventas con clientes por id", "reemplaza inactivo por activo en estado".',
        sql: null,
        result: null,
        error: null,
      })
      return { handled: true, parsed }
    }

    if (parsed?.action === 'export') {
      addMsg({
        role: 'assistant',
        text: 'Usa los botones de exportacion del modulo de resultados para descargar CSV o Excel del resultado actual.',
        sql: null,
        result: null,
        error: null,
      })
      return { handled: true, parsed }
    }

    if (parsed?.action === 'reorderColumns') {
      await reorderTableColumns(parsed.tableName, parsed.orderedColumns || [])
      const preview = await executeQuery(`SELECT * FROM "${parsed.tableName}" LIMIT 200;`)
      onResult?.({
        result: preview,
        prompt: text,
        sql: null,
        targetTable: parsed.tableName,
        source: 'chat',
      })
      addMsg({ role: 'assistant', text: `Listo. ${parsed.description || 'Reordene las columnas'}.`, sql: null, result: preview, error: null })
      return { handled: true, parsed }
    }

    if (parsed?.action === 'dropColumns') {
      await dropColumns(parsed.tableName, parsed.columnNames || [])
      const preview = await executeQuery(`SELECT * FROM "${parsed.tableName}" LIMIT 200;`)
      onResult?.({
        result: preview,
        prompt: text,
        sql: null,
        targetTable: parsed.tableName,
        source: 'chat',
      })
      addMsg({ role: 'assistant', text: `Listo. ${parsed.description || 'Elimine columnas'}.`, sql: null, result: preview, error: null })
      return { handled: true, parsed }
    }

    if (parsed?.sql && !parsed?.error) {
      const start = performance.now()
      let result = await executeQuery(parsed.sql)
      if (isMutatingSql(parsed.sql)) {
        const target = parsed.targetTable || extractTargetTable(parsed.sql, tables)
        if (target) {
          result = await executeQuery(`SELECT * FROM "${target}" LIMIT 200;`)
        }
      }
      const duration = ((performance.now() - start) / 1000).toFixed(3)
      const finalResult = { ...result, duration }
      onResult?.({
        result: finalResult,
        prompt: text,
        sql: parsed.sql,
        targetTable: parsed.targetTable || extractTargetTable(parsed.sql, tables),
        source: 'chat',
      })
      addMsg({ role: 'assistant', text: parsed.description || '(Modo local)', sql: parsed.sql, result: finalResult, error: null })
      return { handled: true, parsed }
    }

    if (parsed?.error) {
      addMsg({ role: 'assistant', text: null, sql: null, result: null, error: parsed.error })
      return { handled: true, parsed }
    }

    return { handled: false, parsed }
  }, [activeTableName, addMsg, onResult, tables])

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

      const runtimeReady = !forceLocalMode && isAiRuntimeConfigured()
      setAiAvailable(runtimeReady)

      const preferLocal = shouldPreferLocalCommand(text)

      if (!runtimeReady || preferLocal) {
        try {
          const localResult = await executeLocalCommand(text)
          if (localResult.handled || !runtimeReady) {
            if (!localResult.handled && !runtimeReady) {
              addMsg({ role: 'assistant', text: 'No pude interpretar esa instruccion en modo local. Si quieres consultas libres en lenguaje natural, activa IA en configuracion.', sql: null, result: null, error: null })
            }
            return
          }
        } catch {
          addMsg({ role: 'assistant', text: 'No pude interpretar esa instruccion en modo local. Si quieres consultas libres en lenguaje natural, activa IA en configuracion.', sql: null, result: null, error: null })
          return
        }
      }

      const { sql: aiSql, explanation: aiExplanation } = await runAiTask({
        task: 'sql.generate',
        prompt: `Tabla activa: ${activeTableName || 'sin seleccionar'}\nSolicitud: ${text}`,
        tables,
        history: conversationHistory,
        context: {
          activeTableName,
          recentConversation: conversationHistory.slice(-6),
          tableSchema: tables.map((t) => ({
            name: t.name,
            columns: (t.columns || []).map((c) => ({ name: c.name, type: c.type || 'TEXT' })),
          })),
        },
      })

      let result = null
      let finalSql = aiSql
      let finalExplanation = aiExplanation

      if (aiSql) {
        try {
          const start = performance.now()
          result = await executeQuery(aiSql)
          if (isMutatingSql(aiSql)) {
            const target = extractTargetTable(aiSql, tables)
            if (target) {
              result = await executeQuery(`SELECT * FROM "${target}" LIMIT 200;`)
            }
          }
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
              if (isMutatingSql(retry.sql)) {
                const target = extractTargetTable(retry.sql, tables)
                if (target) {
                  result = await executeQuery(`SELECT * FROM "${target}" LIMIT 200;`)
                }
              }
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

      if (!finalSql) {
        const localResult = await executeLocalCommand(text)
        if (localResult.handled) return
      }

      onResult?.({
        result,
        prompt: text,
        sql: finalSql,
        targetTable: finalSql ? extractTargetTable(finalSql, tables) : null,
        source: 'chat',
      })

      addMsg({ role: 'assistant', text: finalExplanation, sql: finalSql, result, error: null })

      setConversationHistory(prev => [
        ...prev,
        { role: 'user', content: text },
        { role: 'assistant', content: finalExplanation + (finalSql ? `\n\`\`\`sql\n${finalSql}\n\`\`\`` : '') },
      ].slice(-12))

    } catch (err) {
      const msg = err?.message || String(err)
      if (/invalid\s*api\s*key|invalid_api_key|unauthorized|authentication/i.test(msg)) {
        setGroqApiKey('')
        setForceLocalMode(true)
        setAiAvailable(false)
        addMsg({ role: 'assistant', text: 'La API key configurada es invalida. Cambie automaticamente a modo local para que sigas trabajando.', sql: null, result: null, error: null })
        return
      }
      if (msg.includes('malloc') || msg.toLowerCase().includes('out of memory')) {
        addMsg({ role: 'assistant', text: null, sql: null, result: null, error: 'Archivos demasiado grandes. Filtra con WHERE o usa el Asistente de Cruce.' })
      } else if (msg.includes('NO_AI_RUNTIME') || msg.includes('NO_API_KEY')) {
        setAiAvailable(false)
        addMsg({ role: 'assistant', text: 'El runtime IA no esta disponible en este despliegue. Puedes seguir en modo local.', sql: null, result: null, error: null })
      } else {
        addMsg({ role: 'assistant', text: null, sql: null, result: null, error: `Error: ${msg}` })
      }
    } finally {
      setIsThinking(false)
    }
  }, [input, tables, isThinking, addMsg, conversationHistory, forceLocalMode, onResult, activeTableName, executeLocalCommand])

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
    if (showSuggestions && visibleSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSuggestionIndex((current) => (current + 1) % visibleSuggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSuggestionIndex((current) => (current - 1 + visibleSuggestions.length) % visibleSuggestions.length)
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        applySuggestion(visibleSuggestions[selectedSuggestionIndex])
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        applySuggestion(visibleSuggestions[selectedSuggestionIndex])
        return
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: isDark ? '#0B1410' : '#FFFFFF' }}>
      {showActionBar && (
        <ActionBar
          tables={tables}
          onOpenCrossWizard={onOpenCrossWizard}
          onOpenDashboard={onOpenDashboard}
          onConsolidate={handleConsolidate}
          isThinking={isThinking}
          palette={palette}
          isDark={isDark}
        />
      )}

      {tables.length === 0 ? (
        <EmptyState onOpenUploader={onOpenUploader} palette={palette} isDark={isDark} />
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 10, scrollbarWidth: 'thin', scrollbarColor: `${palette.primary} ${palette.panelSoft}` }}>
          {messages.map(msg =>
            msg.role === 'user'
              ? <UserMessage key={msg.id} msg={msg} palette={palette} />
              : <AssistantMessage key={msg.id} msg={msg} onExport={onExport} onExportExcel={onExportExcel} onSuggest={handleSend} palette={palette} isDark={isDark} />
          )}
          {isThinking && <TypingIndicator palette={palette} isDark={isDark} />}
          <div ref={bottomRef} />
        </div>
      )}
      {tables.length > 0 && (
        <div style={{ padding: '10px 10px 12px', borderTop: `1px solid ${palette.border}`, background: isDark ? '#0D1712' : '#fff', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <motion.div animate={{ boxShadow: input ? `0 0 0 1px ${isDark ? 'rgba(34,197,94,0.45)' : 'rgba(67,160,71,0.35)'}` : `0 0 0 1px ${palette.border}` }} style={{ flex: 1, borderRadius: 10, overflow: 'visible', background: isDark ? '#0B1D16' : '#FAFCFA', position: 'relative' }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => {
                const nextValue = e.target.value
                const nextCursor = e.target.selectionStart ?? nextValue.length
                setInput(nextValue)
                setCursorPosition(nextCursor)
                setShowSuggestions(Boolean(buildAutocompleteContext(nextValue, nextCursor, tables, activeTableName)))
              }}
              onClick={e => setCursorPosition(e.currentTarget.selectionStart ?? input.length)}
              onKeyUp={e => setCursorPosition(e.currentTarget.selectionStart ?? input.length)}
              onSelect={e => setCursorPosition(e.currentTarget.selectionStart ?? input.length)}
              onKeyDown={handleKeyDown}
              onFocus={e => setShowSuggestions(Boolean(buildAutocompleteContext(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length, tables, activeTableName)))}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
              disabled={isThinking}
              placeholder={aiAvailable ? 'Preguntar sobre los datos' : 'Modo local activo'}
              rows={1}
              style={{ width: '100%', resize: 'none', border: 'none', outline: 'none', background: 'transparent', padding: '10px 12px', fontSize: '0.84rem', fontFamily: 'Inter,sans-serif', color: palette.text, maxHeight: 120, lineHeight: 1.5, boxSizing: 'border-box' }}
            />
            {showSuggestions && visibleSuggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute left-0 right-0 bottom-full mb-2 rounded-xl z-20 overflow-hidden max-h-[260px]"
                style={{ background: isDark ? '#10271F' : '#FFFFFF', border: `1px solid ${palette.border}`, boxShadow: '0 10px 28px rgba(0,0,0,0.18)' }}>
                {visibleSuggestions.map((item, index) => (
                  <motion.button
                    key={item.key}
                    whileHover={{ backgroundColor: isDark ? '#143126' : '#F0F7F3' }}
                    onMouseDown={() => applySuggestion(item)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors"
                    style={{ borderBottom: index < visibleSuggestions.length - 1 ? `1px solid ${palette.border}` : 'none', background: index === selectedSuggestionIndex ? (isDark ? '#143126' : '#F0F7F3') : 'transparent' }}>
                    <span style={{ color: palette.accent, fontSize: '0.72rem', fontFamily: 'JetBrains Mono, monospace' }}>
                      {item.type === 'column' ? '# ' : 'tbl'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate" style={{ color: palette.text, fontSize: '0.82rem', fontFamily: 'Inter,sans-serif', fontWeight: 700 }}>
                        {item.label}
                      </div>
                      <div className="truncate" style={{ color: palette.dim, fontSize: '0.72rem', fontFamily: 'Inter,sans-serif' }}>
                        {item.caption ? `${item.caption} · ` : ''}Tab para insertar
                      </div>
                    </div>
                  </motion.button>
                ))}
              </motion.div>
            )}
          </motion.div>
          <motion.button onClick={() => handleSend()} disabled={!input.trim() || isThinking} whileHover={{ scale: input.trim() && !isThinking ? 1.06 : 1 }} whileTap={{ scale: input.trim() && !isThinking ? 0.93 : 1 }}
            style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, border: 'none', cursor: input.trim() && !isThinking ? 'pointer' : 'not-allowed', background: input.trim() && !isThinking ? `linear-gradient(145deg, ${palette.primary}, ${palette.accent})` : palette.border, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'none', transition: 'background 0.2s' }}>
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
