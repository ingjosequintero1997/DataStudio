import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { EXAMPLE_COMMANDS } from '../lib/nlp'

const PLACEHOLDER_CYCLE = [
  'Ej: "Dame el último registro de la columna fecha"',
  'Ej: "Busca en clientes donde nombre sea María"',
  'Ej: "Cruza ventas con precios por ID_producto"',
  'Ej: "Cuántos registros únicos tiene la columna ciudad"',
  'Ej: "Muestra el máximo de ventas por mes"',
  'Ej: "Ordena empleados por salario de mayor a menor"',
  'Ej: "Consolida enero con febrero"',
  'Ej: "Exporta el resultado actual"',
]

const spring = { type: 'spring', stiffness: 380, damping: 28 }

export default function CommandBar({ onExecute, isExecuting, injectedValue, onClear }) {
  const [value, setValue] = useState('')
  const [phIdx, setPhIdx] = useState(0)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [focused, setFocused] = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (value) return
    const id = setInterval(() => setPhIdx(i => (i + 1) % PLACEHOLDER_CYCLE.length), 3200)
    return () => clearInterval(id)
  }, [value])

  useEffect(() => {
    if (injectedValue) {
      setValue(injectedValue)
      textareaRef.current?.focus()
      onClear?.()
    }
  }, [injectedValue])

  const filtered = value.length > 1
    ? EXAMPLE_COMMANDS.filter(c => c.toLowerCase().includes(value.toLowerCase())).slice(0, 5)
    : []

  const submit = () => {
    if (!value.trim() || isExecuting) return
    onExecute(value.trim())
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'rgba(6,9,19,0.5)' }}>
      {/* Header */}
      <div className="flex items-center px-5 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
        <div className="flex items-center gap-2 px-0 py-2.5 border-b-2" style={{ borderColor: '#0078d4' }}>
          <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: 'rgba(0,120,212,0.2)' }}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" style={{ color: '#60a5fa' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <span className="text-xs font-semibold tracking-wide" style={{ color: '#93c5fd', fontFamily: 'Inter, sans-serif', letterSpacing: '0.03em' }}>
            Consulta en Lenguaje Natural
          </span>
        </div>
        <div className="flex-1" />
        <span className="text-[10px] tracking-wide" style={{ color: '#334155', fontFamily: 'Inter, sans-serif' }}>
          Enter para ejecutar · Shift+Enter = nueva línea
        </span>
      </div>

      {/* Body */}
      <div className="relative flex-1 flex flex-col p-4 gap-3">
        {/* Glow border animado al ejecutar */}
        <AnimatePresence>
          {isExecuting && (
            <motion.div key="glow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 pointer-events-none rounded-none z-10">
              <div className="absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, #0078d4, #818cf8, #0078d4, transparent)', animation: 'shimmer 2s linear infinite' }} />
              <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, #0078d4, #818cf8, #0078d4, transparent)', animation: 'shimmer 2s linear infinite reverse' }} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Textarea */}
        <div className="relative flex-1">
          <motion.div
            animate={{ boxShadow: focused ? '0 0 0 1px rgba(0,120,212,0.5), 0 0 20px rgba(0,120,212,0.08)' : '0 0 0 1px rgba(255,255,255,0.07)' }}
            transition={{ duration: 0.2 }}
            className="rounded-xl overflow-hidden h-full"
          >
            <textarea
              ref={textareaRef}
              value={value}
              onChange={e => { setValue(e.target.value); setShowSuggestions(e.target.value.length > 1) }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
              onFocus={() => setFocused(true)}
              onBlur={() => { setFocused(false); setTimeout(() => setShowSuggestions(false), 150) }}
              disabled={isExecuting}
              placeholder={PLACEHOLDER_CYCLE[phIdx]}
              className="w-full h-full min-h-[80px] resize-none focus:outline-none disabled:opacity-50 transition-all leading-loose"
              style={{
                background: 'rgba(8,10,22,0.8)',
                color: '#e2e8f0',
                fontSize: '0.9rem',
                fontFamily: 'Inter, sans-serif',
                fontWeight: 400,
                letterSpacing: '0.01em',
                padding: '14px 16px',
                caretColor: '#60a5fa',
              }}
            />
          </motion.div>

          {/* Placeholder custom animado */}
          {!value && !focused && (
            <div className="absolute inset-0 flex items-start px-4 pt-3.5 pointer-events-none">
              <AnimatePresence mode="wait">
                <motion.span key={phIdx}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.3 }}
                  style={{ color: '#334155', fontSize: '0.88rem', fontFamily: 'Inter, sans-serif', fontStyle: 'italic', lineHeight: 1.6 }}
                >
                  {PLACEHOLDER_CYCLE[phIdx]}
                </motion.span>
              </AnimatePresence>
            </div>
          )}

          {/* Autocomplete */}
          {showSuggestions && filtered.length > 0 && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="absolute left-0 right-0 top-full mt-1 rounded-xl z-20 overflow-hidden"
              style={{ background: 'rgba(10,14,28,0.98)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 16px 40px rgba(0,0,0,0.6)' }}>
              {filtered.map((cmd, i) => (
                <motion.button key={i} whileHover={{ backgroundColor: 'rgba(0,120,212,0.12)' }}
                  onMouseDown={() => { setValue(cmd); setShowSuggestions(false); textareaRef.current?.focus() }}
                  className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                  style={{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <span style={{ color: '#0078d4', fontSize: '0.7rem', fontFamily: 'JetBrains Mono, monospace' }}>▸</span>
                  <span style={{ color: '#cbd5e1', fontSize: '0.78rem', fontFamily: 'Inter, sans-serif' }}>{cmd}</span>
                </motion.button>
              ))}
            </motion.div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ color: '#334155', fontSize: '0.68rem', fontFamily: 'Inter, sans-serif', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Ejemplos:
            </span>
            {EXAMPLE_COMMANDS.slice(0, 3).map((cmd, i) => (
              <motion.button key={i} whileHover={{ scale: 1.04, borderColor: 'rgba(0,120,212,0.5)' }} whileTap={{ scale: 0.96 }} transition={spring}
                onClick={() => { setValue(cmd); textareaRef.current?.focus() }}
                className="rounded-full truncate max-w-[200px]"
                style={{ padding: '2px 10px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: '#64748b', fontSize: '0.7rem', fontFamily: 'Inter, sans-serif' }}>
                {cmd}
              </motion.button>
            ))}
          </div>

          <motion.button onClick={submit} disabled={!value.trim() || isExecuting}
            whileHover={{ scale: 1.04, boxShadow: '0 0 24px rgba(0,120,212,0.5)' }}
            whileTap={{ scale: 0.96 }}
            transition={spring}
            className="flex items-center gap-2 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            style={{ padding: '8px 20px', background: 'linear-gradient(135deg, #0078d4, #1d4ed8)', boxShadow: '0 4px 16px rgba(0,120,212,0.3)', color: '#fff', fontSize: '0.8rem', fontFamily: 'Inter, sans-serif', fontWeight: 600, letterSpacing: '0.02em' }}
          >
            {isExecuting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Procesando…</span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                <span>Ejecutar</span>
              </>
            )}
          </motion.button>
        </div>
      </div>
    </div>
  )
}
