import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
function formatRows(n) {
  if (!n) return '—'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M filas`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k filas`
  return `${n} filas`
}
const TYPE_COLORS = {
  VARCHAR: 'text-emerald-400', INTEGER: 'text-blue-400', BIGINT: 'text-blue-400',
  DOUBLE: 'text-purple-400', FLOAT: 'text-purple-400', BOOLEAN: 'text-yellow-400',
  DATE: 'text-orange-400', TIMESTAMP: 'text-orange-400',
}
const spring = { type: 'spring', stiffness: 380, damping: 28 }

export default function ObjectExplorer({ tables, onInsertCommand, onDeleteTable, onOpenUploader, onSelectTable, selectedTable }) {
  const [tooltip, setTooltip] = useState(null)

  return (
    <div className="flex flex-col h-full relative" style={{ background: '#F4F7F4', borderRight: '1px solid #C8DCC8' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 shrink-0"
        style={{ borderBottom: '1px solid #C8DCC8', background: '#E8F5E9' }}>
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#2E7D32', letterSpacing: '0.12em' }}>
          Archivos Cargados
        </span>
        <motion.button onClick={onOpenUploader} title="Cargar nuevo archivo" whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.9 }} transition={spring}
          className="w-6 h-6 rounded-lg flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #43A047, #2E7D32)', boxShadow: '0 2px 8px rgba(67,160,71,0.3)' }}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </motion.button>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        <AnimatePresence mode="popLayout">
          {tables.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4 mt-12 px-4 text-center">
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(0,120,212,0.08)', border: '1px solid rgba(0,120,212,0.15)' }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" style={{ color: '#1e40af' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </motion.div>
              <div>
                <p className="text-xs font-medium mb-1" style={{ color: '#94a3b8' }}>Tu laboratorio de datos está listo</p>
                <p className="text-[10px] leading-relaxed" style={{ color: '#64748b' }}>Arrastra un archivo CSV, Excel o TXT para comenzar</p>
              </div>
              <motion.button onClick={onOpenUploader} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }} transition={spring}
                className="px-4 py-2 text-xs font-semibold rounded-lg text-white"
                style={{ background: 'linear-gradient(135deg, #43A047, #2E7D32)', boxShadow: '0 4px 16px rgba(67,160,71,0.3)' }}>
                + Cargar primer archivo
              </motion.button>
            </motion.div>
          ) : (
            tables.map((table, i) => {
              const isSelected = selectedTable === table.name
              return (
                <motion.div key={table.name}
                  initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }} transition={{ ...spring, delay: i * 0.05 }}
                  layout
                  onClick={() => onSelectTable?.(table.name)}
                  onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setTooltip({ name: table.name, x: r.right + 8, y: r.top }) }}
                  onMouseLeave={() => setTooltip(null)}
                  className="group relative rounded-xl cursor-pointer p-3"
                  style={isSelected
                    ? { border: '1px solid #43A047', background: '#E8F5E9', boxShadow: '0 0 16px rgba(67,160,71,0.15)' }
                    : { border: '1px solid #C8DCC8', background: '#fff' }}
                  whileHover={isSelected ? {} : { borderColor: '#43A047', backgroundColor: '#F1FAF1' }}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: '#E8F5E9' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" style={{ color: '#43A047' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <span className="text-xs font-semibold truncate" style={{ color: '#1B3318' }}>{table.name}</span>
                    </div>
                    <motion.button onClick={e => { e.stopPropagation(); onDeleteTable(table.name) }}
                      whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.85 }} transition={spring}
                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" style={{ color: '#475569' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </motion.button>
                  </div>

                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)', color: '#93c5fd' }}>
                      {formatRows(table.rowCount)}
                    </span>
                    {table.sizeBytes > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)', color: '#c4b5fd' }}>
                        {formatBytes(table.sizeBytes)}
                      </span>
                    )}
                    {table.columns && (
                      <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'rgba(255,255,255,0.05)', color: '#64748b' }}>
                        {table.columns.length} cols
                      </span>
                    )}
                  </div>

                  <div className="hidden group-hover:flex gap-1 mt-2">
                    {[
                      { label: 'Ver', cmd: `Muéstrame los primeros registros de ${table.name}`, color: '#E8F5E9', hover: '#C8DCC8', text: '#2E7D32' },
                      { label: 'Columnas', cmd: `Muéstrame las columnas de ${table.name}`, color: '#F4F7F4', hover: '#E8F5E9', text: '#4A6B4A' },
                      { label: 'Contar', cmd: `Cuántos registros tiene ${table.name}`, color: '#F4F7F4', hover: '#E8F5E9', text: '#4A6B4A' },
                    ].map(btn => (
                      <motion.button key={btn.label}
                        onClick={e => { e.stopPropagation(); onInsertCommand?.(btn.cmd) }}
                        whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }} transition={spring}
                        className="flex-1 text-[10px] py-0.5 rounded font-medium"
                        style={{ background: btn.color, color: btn.text }}>
                        {btn.label}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )
            })
          )}
        </AnimatePresence>
      </div>

      {/* Footer credits */}
      <div className="px-4 py-2.5 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <p className="text-[9px] font-medium tracking-wide" style={{ color: '#9EBB9E' }}>Desarrollado por el Ing. José Quintero</p>
      </div>

      {/* Tooltip */}
      {tooltip && (() => {
        const t = tables.find(x => x.name === tooltip.name)
        if (!t?.columns?.length) return null
        return (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}
            className="fixed z-50 rounded-xl shadow-2xl p-3 min-w-[200px] pointer-events-none"
            style={{ top: tooltip.y, left: tooltip.x, background: 'rgba(8,12,26,0.95)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#4a90d9' }}>Columnas</p>
            {t.columns.slice(0, 6).map(col => (
              <div key={col.name} className="flex items-center justify-between gap-3 py-0.5">
                <span className="text-xs" style={{ color: '#e2e8f0' }}>{col.name}</span>
                <span className={`text-[10px] font-mono ${TYPE_COLORS[col.type?.toUpperCase()] || 'text-gray-400'}`}>{col.type}</span>
              </div>
            ))}
            {t.columns.length > 6 && <p className="text-[10px] mt-1" style={{ color: '#475569' }}>+{t.columns.length - 6} más</p>}
          </motion.div>
        )
      })()}
    </div>
  )
}
