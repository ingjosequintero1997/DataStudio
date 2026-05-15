import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { EXAMPLE_COMMANDS } from '../lib/nlp'
import { buildAutocompleteContext } from '../lib/autocomplete'

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

function buildTabLabel(tab, index) {
  const source = (tab?.draft || '').trim().replace(/\s+/g, ' ')
  if (!source) return `Consulta ${index + 1}`
  return source.length > 18 ? source.slice(0, 18) + '…' : source
}
export default function CommandBar({ onExecute, isExecuting, injectedValue, onClear, tables = [], newTabSignal = 0, onTabChange, activeTableName = null, theme = 'light' }) {
  const isDark = theme === 'dark'
  const T = isDark
    ? {
      bg: '#0D1914',
      panel: '#11241C',
      panelSoft: '#143125',
      border: 'rgba(52,211,153,0.25)',
      text: '#E6FFF3',
      dim: '#97C8AF',
      accent: '#22C55E',
      chip: '#173629',
      suggestion: '#11271E',
    }
    : {
      bg: '#fff',
      panel: '#FAFCFA',
      panelSoft: '#F7FBF7',
      border: '#C8DCC8',
      text: '#1B3318',
      dim: '#4A6B4A',
      accent: '#2E7D32',
      chip: '#E8F5E9',
      suggestion: '#fff',
    }
  const [tabs, setTabs] = useState([{ id: 1, draft: '' }])
  const [activeTabId, setActiveTabId] = useState(1)
  const [phIdx, setPhIdx] = useState(0)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [focused, setFocused] = useState(false)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const textareaRef = useRef(null)
  const nextTabIdRef = useRef(2)

  const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0]
  const value = activeTab?.draft || ''

  useEffect(() => {
    if (tabs.length === 1 && activeTabId === tabs[0]?.id) return
    setTabs((current) => current.slice(0, 1))
    setActiveTabId(1)
  }, [])

  useEffect(() => {
    if (value) return
    const id = setInterval(() => setPhIdx((index) => (index + 1) % PLACEHOLDER_CYCLE.length), 3200)
    return () => clearInterval(id)
  }, [value])

  useEffect(() => {
    if (!injectedValue) return
    setTabs((current) => current.map((tab) => (
      tab.id === activeTabId ? { ...tab, draft: injectedValue } : tab
    )))
    setCursorPosition(injectedValue.length)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(injectedValue.length, injectedValue.length)
    })
    onClear?.()
  }, [activeTabId, injectedValue, onClear])

  useEffect(() => {
    if (!newTabSignal) return
    const newId = nextTabIdRef.current++
    setTabs((current) => [...current, { id: newId, draft: '' }])
    setActiveTabId(newId)
    setCursorPosition(0)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [newTabSignal])

  useEffect(() => {
    onTabChange?.(activeTabId)
  }, [activeTabId, onTabChange])

  const filteredExamples = useMemo(() => (
    value.length > 1
      ? EXAMPLE_COMMANDS.filter((command) => command.toLowerCase().includes(value.toLowerCase())).slice(0, 5)
      : []
  ), [value])

  const autocompleteContext = useMemo(
    () => buildAutocompleteContext(value, cursorPosition, tables, activeTableName),
    [activeTableName, cursorPosition, tables, value]
  )

  const visibleSuggestions = autocompleteContext?.items || filteredExamples

  useEffect(() => {
    setSelectedSuggestionIndex(0)
  }, [value, cursorPosition, activeTabId])

  const updateActiveDraft = (nextDraft) => {
    setTabs((current) => current.map((tab) => (
      tab.id === activeTabId ? { ...tab, draft: nextDraft } : tab
    )))
  }

  const closeTab = (tabId) => {
    if (tabs.length === 1) return
    const currentIndex = tabs.findIndex((tab) => tab.id === tabId)
    const remaining = tabs.filter((tab) => tab.id !== tabId)
    setTabs(remaining)
    if (tabId === activeTabId) {
      const fallback = remaining[Math.max(0, currentIndex - 1)] || remaining[0]
      setActiveTabId(fallback.id)
      setCursorPosition((fallback.draft || '').length)
    }
  }

  const switchTab = (tabId) => {
    setActiveTabId(tabId)
    const nextTab = tabs.find((tab) => tab.id === tabId)
    const nextCaret = (nextTab?.draft || '').length
    setCursorPosition(nextCaret)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret)
    })
  }

  const submit = () => {
    if (!value.trim() || isExecuting) return
    onExecute(value.trim(), activeTabId)
  }

  const applySuggestion = (suggestion) => {
    if (!suggestion) return
    if (suggestion.type === 'hint') return

    if (autocompleteContext?.type === 'bracket') {
      const suffixOffset = value[autocompleteContext.end] === ']' ? 1 : 0
      const nextValue =
        value.slice(0, autocompleteContext.start) +
        suggestion.insertText +
        value.slice(autocompleteContext.end + suffixOffset)

      updateActiveDraft(nextValue)
      setShowSuggestions(false)

      requestAnimationFrame(() => {
        const nextCaret = autocompleteContext.start + suggestion.insertText.length
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(nextCaret, nextCaret)
        setCursorPosition(nextCaret)
      })
      return
    }

    if (autocompleteContext?.type === 'entity') {
      const nextValue =
        value.slice(0, autocompleteContext.start) +
        suggestion.insertText +
        value.slice(autocompleteContext.end)

      updateActiveDraft(nextValue)
      setShowSuggestions(false)
      requestAnimationFrame(() => {
        const nextCaret = autocompleteContext.start + suggestion.insertText.length
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(nextCaret, nextCaret)
        setCursorPosition(nextCaret)
      })
      return
    }

    updateActiveDraft(suggestion)
    setShowSuggestions(false)
    requestAnimationFrame(() => {
      const nextCaret = suggestion.length
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret)
      setCursorPosition(nextCaret)
    })
  }

  const handleChange = (event) => {
    const nextValue = event.target.value
    const nextCursor = event.target.selectionStart ?? nextValue.length
    updateActiveDraft(nextValue)
    setCursorPosition(nextCursor)
    setShowSuggestions(Boolean(buildAutocompleteContext(nextValue, nextCursor, tables, activeTableName)) || nextValue.length > 1)
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
        if (autocompleteContext) {
          event.preventDefault()
          applySuggestion(visibleSuggestions[selectedSuggestionIndex])
          return
        }

        if (filteredExamples.length > 0 && value.trim() !== visibleSuggestions[selectedSuggestionIndex]) {
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

  let currentSection = ''

  return (
    <div className="flex flex-col h-full" style={{ background: T.bg, borderRight: `1px solid ${T.border}` }}>
      <div className="relative flex-1 flex flex-col p-3 gap-2">
        <AnimatePresence>
          {isExecuting && (
            <motion.div key="glow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 pointer-events-none rounded-none z-10">
              <div className="absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, #0078d4, #818cf8, #0078d4, transparent)', animation: 'shimmer 2s linear infinite' }} />
              <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, #0078d4, #818cf8, #0078d4, transparent)', animation: 'shimmer 2s linear infinite reverse' }} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative flex-1 min-h-0">
          <motion.div
            animate={{ boxShadow: focused ? '0 0 0 2px rgba(67,160,71,0.5), 0 0 20px rgba(67,160,71,0.08)' : `0 0 0 1px ${T.border}` }}
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
                background: T.panel,
                color: T.text,
                fontSize: '0.9rem',
                fontFamily: 'Inter, sans-serif',
                fontWeight: 400,
                letterSpacing: '0.01em',
                padding: '12px 14px',
                caretColor: T.accent,
              }}
            />
          </motion.div>

          {!value && !focused && (
            <div className="absolute inset-0 flex items-start px-4 pt-3.5 pointer-events-none">
              <AnimatePresence mode="wait">
                <motion.span key={phIdx} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.3 }} style={{ color: T.dim, fontSize: '0.92rem', fontFamily: 'Inter, sans-serif', fontStyle: 'italic', lineHeight: 1.6 }}>
                  {PLACEHOLDER_CYCLE[phIdx]}
                </motion.span>
              </AnimatePresence>
            </div>
          )}

          {showSuggestions && visibleSuggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={autocompleteContext ? 'absolute left-0 right-0 top-full mt-1 rounded-xl z-20 overflow-hidden max-h-[280px]' : 'absolute left-0 right-0 top-full mt-1 rounded-xl z-20 overflow-hidden'}
              style={{ background: T.suggestion, backdropFilter: 'blur(10px)', border: `1px solid ${T.border}`, boxShadow: '0 8px 24px rgba(0,0,0,0.16)' }}
            >
              {visibleSuggestions.map((item, index) => {
                const section = autocompleteContext ? item.section : ''
                const showSection = autocompleteContext && section !== currentSection
                if (showSection) currentSection = section

                return (
                  <div key={autocompleteContext ? item.key : `${item}-${index}`}>
                    {showSection && (
                      <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ background: T.panelSoft, color: T.accent, borderBottom: `1px solid ${T.border}` }}>
                        {section}
                      </div>
                    )}
                    <motion.button whileHover={{ backgroundColor: T.panelSoft }} onMouseDown={() => applySuggestion(item)} className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors" style={{ borderBottom: index < visibleSuggestions.length - 1 ? `1px solid ${T.border}` : 'none', background: index === selectedSuggestionIndex ? T.panelSoft : T.suggestion }}>
                      <span style={{ color: T.accent, fontSize: '0.72rem', fontFamily: 'JetBrains Mono, monospace' }}>
                        {autocompleteContext
                          ? (item.type === 'column' ? '# ' : item.type === 'hint' ? 'i' : 'tbl')
                          : '▸'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="truncate" style={{ color: T.text, fontSize: '0.84rem', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
                          {autocompleteContext ? item.label : item}
                        </div>
                        {autocompleteContext && (
                          <div className="truncate" style={{ color: T.dim, fontSize: '0.74rem', fontFamily: 'Inter, sans-serif' }}>
                            {item.caption ? `${item.caption} · ` : ''}Inserta {item.insertText}
                          </div>
                        )}
                      </div>
                    </motion.button>
                  </div>
                )
              })}
            </motion.div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 shrink-0">
          <motion.button onClick={submit} disabled={!value.trim() || isExecuting} whileHover={{ scale: 1.04, boxShadow: '0 0 24px rgba(0,120,212,0.5)' }} whileTap={{ scale: 0.96 }} transition={spring} className="flex items-center gap-2 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed shrink-0" style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #43A047, #2E7D32)', boxShadow: '0 4px 16px rgba(67,160,71,0.3)', color: '#fff', fontSize: '0.9rem', fontFamily: 'Inter, sans-serif', fontWeight: 700, letterSpacing: '0.02em' }}>
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
