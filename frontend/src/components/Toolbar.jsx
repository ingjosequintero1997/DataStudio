import { motion } from 'framer-motion'

const spring = { type: 'spring', stiffness: 360, damping: 28 }

export default function Toolbar({ user, dbReady, onSignOut, onToggleDrawer, theme, onToggleTheme }) {
  const isDark = theme === 'dark'

  return (
    <div className="flex items-center justify-between px-4 py-2.5 shrink-0"
      style={{
        background: isDark
          ? 'linear-gradient(90deg, #08120C 0%, #0A1B12 45%, #08120C 100%)'
          : 'linear-gradient(90deg, #1B5E20 0%, #2E7D32 45%, #1B5E20 100%)',
        borderBottom: isDark ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(0,0,0,0.12)',
      }}>
      <div className="flex items-center gap-3">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onToggleDrawer}
          className="md:hidden w-8 h-8 flex flex-col items-center justify-center gap-1 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.08)' }}
          title="Archivos cargados">
          <span className="w-4 h-0.5 rounded" style={{ background: 'rgba(255,255,255,0.7)' }} />
          <span className="w-4 h-0.5 rounded" style={{ background: 'rgba(255,255,255,0.7)' }} />
          <span className="w-4 h-0.5 rounded" style={{ background: 'rgba(255,255,255,0.7)' }} />
        </motion.button>

        <motion.div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #10B981 0%, #065F46 100%)', boxShadow: '0 0 18px rgba(16,185,129,0.4)' }}
          whileHover={{ rotate: 8, scale: 1.08 }}
          transition={spring}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
          </svg>
        </motion.div>

        <div className="leading-tight">
          <div className="text-sm font-bold tracking-tight" style={{ color: '#F4FFF8', letterSpacing: '-0.01em' }}>NERV</div>
          <div className="text-[10px]" style={{ color: 'rgba(16,185,129,0.75)' }}>
            {dbReady ? 'Motor listo' : 'Iniciando motor...'}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.95 }}
          transition={spring}
          onClick={onToggleTheme}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{
            color: '#E2F5E2',
            border: '1px solid rgba(16,185,129,0.28)',
            background: 'rgba(16,185,129,0.12)',
          }}>
          <span>{isDark ? '☀' : '🌙'}</span>
          <span>{isDark ? 'Modo normal' : 'Modo oscuro'}</span>
        </motion.button>

        <div className="hidden sm:flex items-center gap-2 px-2 py-1 rounded-lg"
          style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>
            {user?.email?.[0]?.toUpperCase() || 'U'}
          </div>
          <span className="text-[11px] max-w-[180px] truncate" style={{ color: 'rgba(226,245,226,0.9)' }}>{user?.email}</span>
        </div>

        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.95 }}
          transition={spring}
          onClick={onSignOut}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ color: '#E2F5E2', border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)' }}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="hidden sm:inline">Salir</span>
        </motion.button>
      </div>
    </div>
  )
}
