import { motion, AnimatePresence } from 'framer-motion'

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
        boxShadow: disabled ? 'none' : `0 2px 12px ${glow}`,
        minWidth: 44,
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.boxShadow = `0 4px 24px ${glowHover || glow.replace('0.35','0.7')}, inset 0 1px 0 rgba(255,255,255,0.15)` }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.boxShadow = `0 2px 12px ${glow}` }}
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
