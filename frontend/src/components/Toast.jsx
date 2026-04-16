import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const ICONS = {
  success: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ),
  info: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
}

const COLORS = {
  success: { border: 'rgba(52,211,153,0.35)', glow: 'rgba(52,211,153,0.15)', icon: '#34d399', bar: '#34d399' },
  error:   { border: 'rgba(239,68,68,0.35)',  glow: 'rgba(239,68,68,0.15)',  icon: '#f87171', bar: '#f87171' },
  info:    { border: 'rgba(0,120,212,0.4)',    glow: 'rgba(0,120,212,0.15)', icon: '#60a5fa', bar: '#3b82f6' },
}

function ToastItem({ toast, onRemove }) {
  const c = COLORS[toast.type] || COLORS.info

  useEffect(() => {
    const t = setTimeout(() => onRemove(toast.id), toast.duration || 4000)
    return () => clearTimeout(t)
  }, [toast.id])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.85 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className="relative overflow-hidden rounded-xl cursor-pointer select-none"
      style={{
        background: 'rgba(8,12,26,0.92)',
        backdropFilter: 'blur(20px)',
        border: `1px solid ${c.border}`,
        boxShadow: `0 8px 32px ${c.glow}, 0 2px 8px rgba(0,0,0,0.4)`,
        minWidth: 260,
        maxWidth: 340,
      }}
      onClick={() => onRemove(toast.id)}
    >
      {/* Progress bar */}
      <motion.div
        className="absolute bottom-0 left-0 h-0.5"
        style={{ background: c.bar }}
        initial={{ width: '100%' }}
        animate={{ width: '0%' }}
        transition={{ duration: (toast.duration || 4000) / 1000, ease: 'linear' }}
      />

      <div className="flex items-start gap-3 px-4 py-3">
        <span style={{ color: c.icon }} className="mt-0.5 shrink-0">{ICONS[toast.type]}</span>
        <div className="flex-1 min-w-0">
          {toast.title && (
            <p className="text-xs font-semibold mb-0.5" style={{ color: '#e2e8f0' }}>{toast.title}</p>
          )}
          <p className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>{toast.message}</p>
        </div>
        <button className="shrink-0 mt-0.5" style={{ color: '#475569' }}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </motion.div>
  )
}

export function ToastContainer({ toasts, onRemove }) {
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 items-end pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onRemove={onRemove} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  )
}

// Hook
let _id = 0
export function useToast() {
  return {
    showToast: null, // set externally via ToastProvider
  }
}
