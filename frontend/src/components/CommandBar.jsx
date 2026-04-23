import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
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

function findTableByName(name, tables) {
  const norm = normalizeText(name)
  return tables.find((table) => normalizeText(table.name) === norm) || null
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

function buildTabLabel(tab, index) {
  const source = (tab?.draft || '').trim().replace(/\s+/g, ' ')
  if (!source) return `Consulta ${index + 1}`
  return source.length > 18 ? source.slice(0, 18) + '…' : source
}

function buildBracketContext(text, cursorPosition, tables) {
  const safeCursor = typeof cursorPosition === 'number' ? cursorPosition : text.length
  const start = text.lastIndexOf('[', safeCursor - 1)
  if (start === -1) return null

  const closing = text.indexOf(']', start)
  if (closing !== -1 && closing < safeCursor) return null

  const beforeBracket = text.slice(0, start)
  const rawQuery = text.slice(start + 1, safeCursor)
  const normalizedQuery = normalizeText(rawQuery)
  const nearbyText = normalizeText(beforeBracket.slice(Math.max(0, beforeBracket.length - 140)))
  const activeTable = findLastMentionedTable(beforeBracket, tables)
  const hasDotSyntax = rawQuery.includes('.')
  const wantsColumns = /(columna|columnas|campo|campos|atributo|atributos)/.test(nearbyText)

  const [rawTablePart, rawColumnPart = ''] = rawQuery.split('.', 2)
  const tablePart = normalizeText(rawTablePart)
  const columnPart = normalizeText(rawColumnPart)
  const explicitTable = hasDotSyntax ? findTableByName(rawTablePart, tables) : null

  const items = []
  const pushItem = (item) => {
    if (!items.some((entry) => entry.key === item.key)) items.push(item)
  }

  if (!hasDotSyntax) {
    tables
      .filter((table) => !tablePart || normalizeText(table.name).includes(tablePart))
      .forEach((table) => {
        pushItem({
          key: `table:${table.name}`,
          label: table.name,
          caption: `${table.columns?.length || 0} columna(s)`,
          insertText: `[${table.name}]`,
          section: 'Archivos cargados',
          type: 'table',
        })
      })
  }

  const preferredTable = explicitTable || ((wantsColumns || !normalizedQuery) ? activeTable : null)
  if (preferredTable) {
    ;(preferredTable.columns || [])
      .filter((column) => {
        const search = hasDotSyntax ? columnPart : normalizedQuery
        return !search || normalizeText(column.name).includes(search)
      })
      .forEach((column) => {
        pushItem({
          key: `column:${preferredTable.name}:${column.name}`,
          label: column.name,
          caption: preferredTable.name,
          insertText: hasDotSyntax ? `[${preferredTable.name}.${column.name}]` : `[${column.name}]`,
          section: `Columnas de ${preferredTable.name}`,
          type: 'column',
        })
      })
  } else if (normalizedQuery) {
    tables.forEach((table) => {
      ;(table.columns || []).forEach((column) => {
        const composite = `${normalizeText(table.name)}.${normalizeText(column.name)}`
        if (
          normalizeText(column.name).includes(normalizedQuery) ||
          normalizeText(table.name).includes(normalizedQuery) ||
          composite.includes(normalizedQuery)
        ) {
          pushItem({
            key: `column:${table.name}:${column.name}`,
            label: `${table.name}.${column.name}`,
            caption: table.name,
            insertText: `[${table.name}.${column.name}]`,
            section: 'Columnas disponibles',
            type: 'column',
          })
        }
      })
    })
  }

  if (!items.length) {
    if (!tables.length) {
      return {
        start,
        end: safeCursor,
        items: [{
          key: 'empty:no_tables',
          label: 'No hay archivos cargados',
          caption: 'Carga archivos para usar autocompletado',
          insertText: '',
          section: 'Archivos cargados',
          type: 'hint',
        }],
      }
    }
    return null
  }

  return {
    start,
    end: safeCursor,
    items: items.slice(0, 14),
  }
}

export default function CommandBar({ onExecute, isExecuting, injectedValue, onClear, tables = [], newTabSignal = 0, onTabChange }) {
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

  const bracketContext = useMemo(
    () => buildBracketContext(value, cursorPosition, tables),
    [cursorPosition, tables, value]
  )

  const visibleSuggestions = bracketContext?.items || filteredExamples

  useEffect(() => {
    setSelectedSuggestionIndex(0)
  }, [value, cursorPosition, activeTabId])

  const updateActiveDraft = (nextDraft) => {
    setTabs((current) => current.map((tab) => (
      tab.id === activeTabId ? { ...tab, draft: nextDraft } : tab
    )))
  }

  const createTab = () => {
    const newId = nextTabIdRef.current++
    setTabs((current) => [...current, { id: newId, draft: '' }])
    setActiveTabId(newId)
    setCursorPosition(0)
    requestAnimationFrame(() => textareaRef.current?.focus())
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

    if (bracketContext) {
      const suffixOffset = value[bracketContext.end] === ']' ? 1 : 0
      const nextValue =
        value.slice(0, bracketContext.start) +
        suggestion.insertText +
        value.slice(bracketContext.end + suffixOffset)

      updateActiveDraft(nextValue)
      setShowSuggestions(false)

      requestAnimationFrame(() => {
        const nextCaret = bracketContext.start + suggestion.insertText.length
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
    <div className="flex flex-col h-full" style={{ background: '#fff', borderRight: '1px solid #C8DCC8' }}>
      <div className="flex items-center gap-1 px-2 py-1.5 shrink-0 overflow-x-auto" style={{ borderBottom: '1px solid #DDEADD', background: '#F7FBF7' }}>
        {tabs.map((tab, index) => {
          const active = tab.id === activeTabId
          return (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-xs transition-all shrink-0"
              style={{
                background: active ? '#fff' : '#EDF5ED',
                color: active ? '#1B3318' : '#4A6B4A',
                border: active ? '1px solid #C8DCC8' : '1px solid transparent',
                borderBottomColor: active ? '#fff' : 'transparent',
                fontWeight: active ? 700 : 600,
              }}
            >
              <span>{buildTabLabel(tab, index)}</span>
              {tabs.length > 1 && (
                <span
                  onClick={(event) => {
                    event.stopPropagation()
                    closeTab(tab.id)
                  }}
                  style={{ color: '#7A987A' }}
                >
                  ✕
                </span>
              )}
            </button>
          )
        })}
        <button
          onClick={createTab}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0"
          style={{ background: '#E8F5E9', color: '#2E7D32', border: '1px solid #C8DCC8' }}
          title="Nueva consulta"
        >
          + Nueva pestaña
        </button>
      </div>

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
          Usa [ para archivos y columnas · Enter para ejecutar
        </span>
      </div>

      <div className="relative flex-1 flex flex-col p-4 gap-3">
        <AnimatePresence>
          {isExecuting && (
            <motion.div key="glow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 pointer-events-none rounded-none z-10">
              <div className="absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, #0078d4, #818cf8, #0078d4, transparent)', animation: 'shimmer 2s linear infinite' }} />
              <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, #0078d4, #818cf8, #0078d4, transparent)', animation: 'shimmer 2s linear infinite reverse' }} />
            </motion.div>
          )}
        </AnimatePresence>

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

          {!value && !focused && (
            <div className="absolute inset-0 flex items-start px-4 pt-3.5 pointer-events-none">
              <AnimatePresence mode="wait">
                <motion.span key={phIdx} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.3 }} style={{ color: '#9EBB9E', fontSize: '0.88rem', fontFamily: 'Inter, sans-serif', fontStyle: 'italic', lineHeight: 1.6 }}>
                  {PLACEHOLDER_CYCLE[phIdx]}
                </motion.span>
              </AnimatePresence>
            </div>
          )}

          {showSuggestions && visibleSuggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={bracketContext ? 'absolute left-0 top-0 bottom-0 w-[44%] rounded-xl z-20 overflow-auto' : 'absolute left-0 right-0 top-full mt-1 rounded-xl z-20 overflow-hidden'}
              style={{ background: '#fff', backdropFilter: 'blur(10px)', border: '1px solid #C8DCC8', boxShadow: '0 8px 24px rgba(0,0,0,0.16)' }}
            >
              {visibleSuggestions.map((item, index) => {
                const section = bracketContext ? item.section : ''
                const showSection = bracketContext && section !== currentSection
                if (showSection) currentSection = section

                return (
                  <div key={bracketContext ? item.key : `${item}-${index}`}>
                    {showSection && (
                      <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ background: '#F4FBF4', color: '#2E7D32', borderBottom: '1px solid #E0EDE0' }}>
                        {section}
                      </div>
                    )}
                    <motion.button whileHover={{ backgroundColor: '#E8F5E9' }} onMouseDown={() => applySuggestion(item)} className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors" style={{ borderBottom: index < visibleSuggestions.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: index === selectedSuggestionIndex ? '#E8F5E9' : '#fff' }}>
                      <span style={{ color: '#43A047', fontSize: '0.72rem', fontFamily: 'JetBrains Mono, monospace' }}>
                        {bracketContext
                          ? (item.type === 'column' ? '# ' : item.type === 'hint' ? 'i' : 'tbl')
                          : '▸'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="truncate" style={{ color: '#1B3318', fontSize: '0.8rem', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
                          {bracketContext ? item.label : item}
                        </div>
                        {bracketContext && (
                          <div className="truncate" style={{ color: '#6B8B6B', fontSize: '0.7rem', fontFamily: 'Inter, sans-serif' }}>
                            Inserta {item.insertText}
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

        <div className="flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ color: '#334155', fontSize: '0.68rem', fontFamily: 'Inter, sans-serif', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Ejemplos:
            </span>
            {EXAMPLE_COMMANDS.slice(0, 3).map((command, index) => (
              <motion.button key={index} whileHover={{ scale: 1.04, borderColor: 'rgba(0,120,212,0.5)' }} whileTap={{ scale: 0.96 }} transition={spring} onClick={() => { updateActiveDraft(command); setCursorPosition(command.length); requestAnimationFrame(() => textareaRef.current?.focus()) }} className="rounded-full truncate max-w-[220px]" style={{ padding: '2px 10px', border: '1px solid #C8DCC8', background: '#E8F5E9', color: '#4A6B4A', fontSize: '0.7rem', fontFamily: 'Inter, sans-serif' }}>
                {command}
              </motion.button>
            ))}
          </div>

          <motion.button onClick={submit} disabled={!value.trim() || isExecuting} whileHover={{ scale: 1.04, boxShadow: '0 0 24px rgba(0,120,212,0.5)' }} whileTap={{ scale: 0.96 }} transition={spring} className="flex items-center gap-2 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed shrink-0" style={{ padding: '8px 20px', background: 'linear-gradient(135deg, #43A047, #2E7D32)', boxShadow: '0 4px 16px rgba(67,160,71,0.3)', color: '#fff', fontSize: '0.8rem', fontFamily: 'Inter, sans-serif', fontWeight: 600, letterSpacing: '0.02em' }}>
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
