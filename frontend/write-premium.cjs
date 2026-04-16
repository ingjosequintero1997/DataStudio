const fs = require('fs')

// ─── TOOLBAR ───────────────────────────────────────────────────────────────
const toolbar = `import { motion, AnimatePresence } from 'framer-motion'

const spring = { type: 'spring', stiffness: 400, damping: 25 }

function PremiumButton({ onClick, disabled, gradient, glow, glowHover, icon, label, loading, title }) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled || loading}
      title={title || label}
      whileHover={disabled ? {} : { scale: 1.04, y: -1 }}
      whileTap={disabled ? {} : { scale: 0.95 }}
      transition={spring}
      className="relative flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg text-white text-xs font-semibold overflow-hidden disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: gradient,
        boxShadow: disabled ? 'none' : \`0 2px 12px \${glow}\`,
        minWidth: 44,
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.boxShadow = \`0 4px 24px \${glowHover || glow.replace('0.35','0.7')}, inset 0 1px 0 rgba(255,255,255,0.15)\` }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.boxShadow = \`0 2px 12px \${glow}\` }}
    >
      {/* animated border glow for primary button */}
      <AnimatePresence>
        {loading && (
          <motion.span
            key="spinner"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.2 }}
            className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"
          />
        )}
        {!loading && (
          <motion.span
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-2"
          >
            {icon}
            <span className="hidden sm:inline">{label}</span>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

function Divider() {
  return <div className="w-px h-6 shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }} />
}

export default function Toolbar({
  user, onExport, onOpenUploader, onCrossTable, onConsolidate, onCleanColumns,
  isExecuting, hasResults, dbReady, onSignOut, onToggleDrawer,
}) {
  return (
    <div className="flex flex-col shrink-0">

      {/* ─── Top strip ─── */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{
          background: 'linear-gradient(90deg, #0a0e1f 0%, #0d1530 40%, #0a0e1f 100%)',
          borderBottom: '1px solid rgba(0,120,212,0.2)',
          boxShadow: '0 1px 0 rgba(0,120,212,0.1)',
        }}
      >
        <div className="flex items-center gap-3">
          {/* Hamburger — only on mobile */}
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={onToggleDrawer}
            className="md:hidden w-8 h-8 flex flex-col items-center justify-center gap-1 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.06)' }}
            title="Archivos cargados"
          >
            <span className="w-4 h-0.5 rounded" style={{ background: 'rgba(255,255,255,0.6)' }} />
            <span className="w-4 h-0.5 rounded" style={{ background: 'rgba(255,255,255,0.6)' }} />
            <span className="w-4 h-0.5 rounded" style={{ background: 'rgba(255,255,255,0.6)' }} />
          </motion.button>

          <motion.div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #0078d4 0%, #1d4ed8 100%)', boxShadow: '0 0 16px rgba(0,120,212,0.4)' }}
            whileHover={{ rotate: 8, scale: 1.08 }}
            transition={spring}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
            </svg>
          </motion.div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight" style={{ color: '#f0f4ff', letterSpacing: '-0.01em' }}>DataStudio</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2">
            <motion.div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #0078d4, #1d4ed8)' }}
              whileHover={{ scale: 1.15 }}
              transition={spring}
            >
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </motion.div>
            <span className="text-xs hidden lg:block" style={{ color: '#64748b' }}>{user?.email}</span>
          </div>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            transition={spring}
            onClick={onSignOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ color: '#64748b', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="hidden sm:inline">Salir</span>
          </motion.button>
        </div>
      </div>

      {/* ─── Action toolbar ─── */}
      <div
        className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 shrink-0 overflow-x-auto"
        style={{ background: 'rgba(8,12,26,0.95)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <PremiumButton onClick={onOpenUploader} disabled={!dbReady}
          gradient="linear-gradient(135deg, #059669 0%, #047857 100%)" glow="rgba(5,150,105,0.35)"
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>}
          label="Cargar archivos"
        />
        <Divider />
        <PremiumButton onClick={onCrossTable} disabled={!dbReady || isExecuting}
          gradient="linear-gradient(135deg, #0078d4 0%, #0056b3 100%)" glow="rgba(0,120,212,0.35)"
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>}
          label="Cruzar"
        />
        <PremiumButton onClick={onConsolidate} disabled={!dbReady || isExecuting}
          gradient="linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)" glow="rgba(79,70,229,0.35)"
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
          label="Consolidar"
        />
        <Divider />
        <PremiumButton onClick={onCleanColumns} disabled={!dbReady}
          gradient="linear-gradient(135deg, #ea580c 0%, #c2410c 100%)" glow="rgba(234,88,12,0.35)"
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
          label="Limpiar"
        />
        <Divider />
        <PremiumButton onClick={() => onExport()} disabled={!hasResults}
          gradient="linear-gradient(135deg, #0d9488 0%, #0f766e 100%)" glow="rgba(13,148,136,0.35)"
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>}
          label="Exportar"
        />

        <div className="flex-1 min-w-2" />
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg shrink-0" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {dbReady ? (
            <>
              <motion.span animate={{ scale: [1, 1.4, 1] }} transition={{ repeat: Infinity, duration: 2 }}
                className="w-2 h-2 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.8)' }} />
              <span className="text-[11px] font-medium text-emerald-400 hidden sm:inline">Motor listo</span>
            </>
          ) : (
            <>
              <span className="w-3 h-3 border border-yellow-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-[11px] font-medium text-yellow-400 hidden sm:inline">Iniciando...</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
`

// ─── OBJECTEXPLORER ──────────────────────────────────────────────────────────
const explorer = `import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return \`\${(bytes / 1024).toFixed(0)} KB\`
  return \`\${(bytes / (1024 * 1024)).toFixed(1)} MB\`
}
function formatRows(n) {
  if (!n) return '—'
  if (n >= 1000000) return \`\${(n / 1000000).toFixed(1)}M filas\`
  if (n >= 1000) return \`\${(n / 1000).toFixed(0)}k filas\`
  return \`\${n} filas\`
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
    <div className="flex flex-col h-full relative" style={{ background: 'rgba(6,9,19,0.6)', backdropFilter: 'blur(12px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#4a90d9', letterSpacing: '0.12em' }}>
          Archivos Cargados
        </span>
        <motion.button onClick={onOpenUploader} title="Cargar nuevo archivo" whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.9 }} transition={spring}
          className="w-6 h-6 rounded-lg flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #059669, #047857)', boxShadow: '0 2px 8px rgba(5,150,105,0.3)' }}>
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
                <p className="text-xs font-medium mb-1" style={{ color: '#334155' }}>Tu laboratorio de datos está listo</p>
                <p className="text-[10px] leading-relaxed" style={{ color: '#1e293b' }}>Arrastra un archivo CSV, Excel o TXT para comenzar</p>
              </div>
              <motion.button onClick={onOpenUploader} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }} transition={spring}
                className="px-4 py-2 text-xs font-semibold rounded-lg text-white"
                style={{ background: 'linear-gradient(135deg, #059669, #047857)', boxShadow: '0 4px 16px rgba(5,150,105,0.3)' }}>
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
                    ? { border: '1px solid rgba(0,120,212,0.5)', background: 'rgba(0,120,212,0.08)', boxShadow: '0 0 20px rgba(0,120,212,0.12)' }
                    : { border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
                  whileHover={isSelected ? {} : { borderColor: 'rgba(0,120,212,0.3)', backgroundColor: 'rgba(0,120,212,0.04)' }}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(0,120,212,0.15)' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" style={{ color: '#3b82f6' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <span className="text-xs font-semibold truncate" style={{ color: '#e2e8f0' }}>{table.name}</span>
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
                      { label: 'Ver', cmd: \`Muéstrame los primeros registros de \${table.name}\`, color: 'rgba(0,120,212,0.2)', hover: 'rgba(0,120,212,0.4)', text: '#93c5fd' },
                      { label: 'Columnas', cmd: \`Muéstrame las columnas de \${table.name}\`, color: 'rgba(255,255,255,0.05)', hover: 'rgba(255,255,255,0.1)', text: '#94a3b8' },
                      { label: 'Contar', cmd: \`Cuántos registros tiene \${table.name}\`, color: 'rgba(255,255,255,0.05)', hover: 'rgba(255,255,255,0.1)', text: '#94a3b8' },
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
        <p className="text-[9px]" style={{ color: '#1e293b' }}>Desarrollado por el Ing. José Quintero</p>
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
                <span className={\`text-[10px] font-mono \${TYPE_COLORS[col.type?.toUpperCase()] || 'text-gray-400'}\`}>{col.type}</span>
              </div>
            ))}
            {t.columns.length > 6 && <p className="text-[10px] mt-1" style={{ color: '#475569' }}>+{t.columns.length - 6} más</p>}
          </motion.div>
        )
      })()}
    </div>
  )
}
`

fs.writeFileSync('src/components/Toolbar.jsx', toolbar)
fs.writeFileSync('src/components/ObjectExplorer.jsx', explorer)
console.log('Toolbar.jsx y ObjectExplorer.jsx escritos.')
