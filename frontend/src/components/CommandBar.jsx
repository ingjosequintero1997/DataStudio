import { useEffect, useMemo, useRef, useState } from 'react'
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

function normalizeText(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function findLastMentionedTable(text, tables) {
  const source = normalizeText(text)
  let bestMatch = null

  tables.forEach((table) => {
    const tableName = normalizeText(table.name)
    const idx = source.lastIndexOf(tableName)
    if (idx !== -1 && (!bestMatch || idx > bestMatch.idx)) {
      bestMatch = { idx, table }
    }
  })

  return bestMatch?.table || null
}

function buildBracketContext(text, cursorPosition, tables) {
  const safeCursor = typeof cursorPosition === 'number' ? cursorPosition : text.length
  const start = text.lastIndexOf('[', safeCursor - 1)
  if (start === -1) return null

  const closing = text.indexOf(']', start)
  if (closing !== -1 && closing < safeCursor) return null

  const beforeBracket = text.slice(0, start)
  const rawQuery = text.slice(start + 1, safeCursor)
  const query = normalizeText(rawQuery)
  const nearbyText = normalizeText(beforeBracket.slice(Math.max(0, beforeBracket.length - 120)))
  const activeTable = findLastMentionedTable(beforeBracket, tables)
  const wantsColumns = /(columna|columnas|campo|campos|atributo|atributos)/.test(nearbyText) && activeTable

  const sourceItems = wantsColumns
    ? (activeTable?.columns || []).map((column) => ({
        key: `${activeTable.name}:${column.name}`,
        label: column.name,
        insertValue: column.name,
        caption: activeTable.name,
        type: 'column',
      }))
    : tables.map((table) => ({
        key: table.name,
        label: table.name,
        insertValue: table.name,
        caption: `${table.columns?.length || 0} columna(s)`,
        type: 'table',
      }))

  const items = sourceItems.filter((item) => {
    if (!query) return true
    const label = normalizeText(item.label)
    return label.includes(query)
  })

  if (!items.length) return null

  return {
    start,
    end: safeCursor,
    mode: wantsColumns ? 'columns' : 'tables',
    activeTable,
    query: rawQuery,
    items: items.slice(0, 8),
  }
}

export default function CommandBar({ onExecute, isExecuting, injectedValue, onClear, tables = [] }) {
  const [value, setValue] = useState('')
  const [phIdx, setPhIdx] = useState(0)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [focused, setFocused] = useState(false)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (value) return
    const id = setInterval(() => setPhIdx(i => (i + 1) % PLACEHOLDER_CYCLE.length), 3200)
    return () => clearInterval(id)
  }, [value])

  useEffect(() => {
    if (injectedValue) {
      setValue(injectedValue)
      setCursorPosition(injectedValue.length)
      textareaRef.current?.focus()
      onClear?.()
    }
  }, [injectedValue])

  const filtered = value.length > 1
    ? EXAMPLE_COMMANDS.filter(c => c.toLowerCase().includes(value.toLowerCase())).slice(0, 5)
    : []

  const bracketContext = useMemo(
    () => buildBracketContext(value, cursorPosition, tables),
    [cursorPosition, tables, value]
  )

  const visibleSuggestions = bracketContext?.items || filtered

  useEffect(() => {
    setSelectedSuggestionIndex(0)
  }, [value, cursorPosition])

  const submit = () => {
    if (!value.trim() || isExecuting) return
    onExecute(value.trim())
  }

  const applySuggestion = (suggestion) => {
    if (!suggestion) return

    if (bracketContext) {
      const suffixOffset = value[bracketContext.end] === ']' ? 1 : 0
      const nextValue =
        value.slice(0, bracketContext.start) +
        suggestion.insertValue +
        value.slice(bracketContext.end + suffixOffset)

      setValue(nextValue)
      setShowSuggestions(false)

      requestAnimationFrame(() => {
        const nextCaret = bracketContext.start + suggestion.insertValue.length
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(nextCaret, nextCaret)
        setCursorPosition(nextCaret)
      })
      return
    }

    setValue(suggestion)
    setShowSuggestions(false)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      const nextCaret = suggestion.length
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret)
      setCursorPosition(nextCaret)
    })
  }

  const handleChange = (event) => {
    const nextValue = event.target.value
    const nextCursor = event.target.selectionStart ?? nextValue.length
    setValue(nextValue)
    setCursorPosition(nextCursor)
    setShowSuggestions(Boolean(buildBracketContext(nextValue, nextCursor, tables)) || nextValue.length > 1)
  }

  const handleKeyDown = (event) => {
    if (showSuggestions && visibleSuggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedSuggestionIndex((current) => (current + 1) % visibleSuggestions.length)
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedSuggestionIndex((current) => (current - 1 + visibleSuggestions.length) % visibleSuggestions.length)
        return
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        if (bracketContext) {
          event.preventDefault()
          applySuggestion(visibleSuggestions[selectedSuggestionIndex])
          return
        }

        if (filtered.length > 0 && selectedSuggestionIndex >= 0 && value.trim() !== visibleSuggestions[selectedSuggestionIndex]) {
          event.preventDefault()
          applySuggestion(visibleSuggestions[selectedSuggestionIndex])
          return
        }
      }

      if (event.key === 'Escape') {
        setShowSuggestions(false)
        return
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#fff', borderRight: '1px solid #C8DCC8' }}>
      {/* Header */}
      <div className="flex items-center px-5 shrink-0" style={{ borderBottom: '1px solid #C8DCC8', background: '#E8F5E9' }}>
          <div className="flex items-center gap-2 px-0 py-2.5 border-b-2" style={{ borderColor: '#2E7D32' }}>
            <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: '#E8F5E9' }}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" style={{ color: '#60a5fa' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <span className="text-xs font-semibold tracking-wide" style={{ color: '#2E7D32', fontFamily: 'Inter, sans-serif', letterSpacing: '0.03em' }}>
            Consulta en Lenguaje Natural
          </span>
        </div>
        <div className="flex-1" />
        <span className="text-[10px] tracking-wide ml-3" style={{ color: '#334155', fontFamily: 'Inter, sans-serif' }}>
          Enter para ejecutar
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
            animate={{ boxShadow: focused ? '0 0 0 2px rgba(67,160,71,0.5), 0 0 20px rgba(67,160,71,0.08)' : '0 0 0 1px #C8DCC8' }}
            transition={{ duration: 0.2 }}
            className="rounded-xl overflow-hidden h-full"
          >
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onClick={(event) => setCursorPosition(event.currentTarget.selectionStart ?? value.length)}
              onKeyUp={(event) => setCursorPosition(event.currentTarget.selectionStart ?? value.length)}
              onSelect={(event) => setCursorPosition(event.currentTarget.selectionStart ?? value.length)}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => { setFocused(false); setTimeout(() => setShowSuggestions(false), 150) }}
              disabled={isExecuting}
              placeholder={PLACEHOLDER_CYCLE[phIdx]}
              className="w-full h-full min-h-[80px] resize-none focus:outline-none disabled:opacity-50 transition-all leading-loose"
              style={{
                background: '#FAFCFA',
                color: '#1B3318',
                fontSize: '0.9rem',
                fontFamily: 'Inter, sans-serif',
                fontWeight: 400,
                letterSpacing: '0.01em',
                padding: '14px 16px',
                caretColor: '#43A047',
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
                  style={{ color: '#9EBB9E', fontSize: '0.88rem', fontFamily: 'Inter, sans-serif', fontStyle: 'italic', lineHeight: 1.6 }}
                >
                  {PLACEHOLDER_CYCLE[phIdx]}
                </motion.span>
              </AnimatePresence>
            </div>
          )}

          {/* Autocomplete */}
          {showSuggestions && visibleSuggestions.length > 0 && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="absolute left-0 right-0 top-full mt-1 rounded-xl z-20 overflow-hidden"
              style={{ background: '#fff', backdropFilter: 'blur(10px)', border: '1px solid #C8DCC8', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}>
              {bracketContext && (
                <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ background: '#F4FBF4', color: '#2E7D32', borderBottom: '1px solid #E0EDE0' }}>
                  {bracketContext.mode === 'columns'
                    ? `Columnas de ${bracketContext.activeTable?.name || ''}`
                    : 'Archivos cargados'}
                </div>
              )}
              {visibleSuggestions.map((cmd, i) => (
                <motion.button key={bracketContext ? cmd.key : `${cmd}-${i}`} whileHover={{ backgroundColor: '#E8F5E9' }}
                  onMouseDown={() => applySuggestion(cmd)}
                  className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                  style={{
                    borderBottom: i < visibleSuggestions.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    background: i === selectedSuggestionIndex ? '#E8F5E9' : '#fff',
                  }}>
                  <span style={{ color: '#43A047', fontSize: '0.7rem', fontFamily: 'JetBrains Mono, monospace' }}>
                    {bracketContext ? (cmd.type === 'column' ? '# ' : 'tbl') : '▸'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate" style={{ color: '#1B3318', fontSize: '0.78rem', fontFamily: 'Inter, sans-serif' }}>
                      {bracketContext ? cmd.label : cmd}
                    </div>
                    {bracketContext && cmd.caption && (
                      <div className="truncate" style={{ color: '#6B8B6B', fontSize: '0.68rem', fontFamily: 'Inter, sans-serif' }}>
                        {cmd.caption}
                      </div>
                    )}
                  </div>
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
                style={{ padding: '2px 10px', border: '1px solid #C8DCC8', background: '#E8F5E9', color: '#4A6B4A', fontSize: '0.7rem', fontFamily: 'Inter, sans-serif' }}>
                {cmd}
              </motion.button>
            ))}
          </div>

          <motion.button onClick={submit} disabled={!value.trim() || isExecuting}
            whileHover={{ scale: 1.04, boxShadow: '0 0 24px rgba(0,120,212,0.5)' }}
            whileTap={{ scale: 0.96 }}
            transition={spring}
            className="flex items-center gap-2 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            style={{ padding: '8px 20px', background: 'linear-gradient(135deg, #43A047, #2E7D32)', boxShadow: '0 4px 16px rgba(67,160,71,0.3)', color: '#fff', fontSize: '0.8rem', fontFamily: 'Inter, sans-serif', fontWeight: 600, letterSpacing: '0.02em' }}
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
