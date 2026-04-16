const fs = require('fs')
const path = require('path')

const base = path.join(__dirname, 'src/components')

// ─── ResultsTable.jsx ───────────────────────────────────────────────────────
fs.writeFileSync(path.join(base, 'ResultsTable.jsx'), `
import { useMemo } from 'react'
import { FixedSizeList as List } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'

const ROW_HEIGHT = 26
const HEADER_HEIGHT = 32

function isNumericStr(val) {
  if (val === null || val === undefined || val === '') return false
  const n = Number(val)
  return !isNaN(n) && val.toString().trim() !== ''
}

function CellValue({ value }) {
  if (value === null || value === undefined) {
    return <span className="text-ssms-textDim italic text-[10px]">NULL</span>
  }
  const str = String(value)
  if (isNumericStr(str)) {
    const num = Number(str)
    if (num < 0) return <span className="text-red-400 font-mono">{str}</span>
    if (num > 0) return <span className="text-emerald-400 font-mono">{str}</span>
    return <span className="text-gray-400 font-mono">{str}</span>
  }
  return <span className="truncate">{str}</span>
}

export default function ResultsTable({ result, error, isExecuting, visibleColumns }) {
  const displayColumns = visibleColumns?.length ? visibleColumns : (result?.columns || [])

  const colWidths = useMemo(() => {
    const widths = {}
    for (const col of displayColumns) {
      let max = col.length
      if (result?.rows) {
        for (let i = 0; i < Math.min(50, result.rows.length); i++) {
          const val = result.rows[i][col]
          if (val !== null && val !== undefined) max = Math.max(max, String(val).length)
        }
      }
      widths[col] = Math.max(80, Math.min(300, max * 7.5 + 24))
    }
    return widths
  }, [result, displayColumns])

  const totalWidth = useMemo(
    () => displayColumns.reduce((s, c) => s + (colWidths[c] || 100), 44),
    [displayColumns, colWidths]
  )

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <TabBar hasError />
        <div className="flex-1 p-4">
          <div className="bg-red-900/20 border border-red-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">⚠️</span>
              <p className="text-red-400 text-xs font-semibold">No pude procesar ese comando</p>
            </div>
            <p className="text-red-300 text-xs leading-relaxed">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!result || !result.rows) {
    return (
      <div className="flex flex-col h-full">
        <TabBar />
        <div className="flex flex-col items-center justify-center h-full gap-3 text-ssms-textDim">
          {isExecuting ? (
            <>
              <span className="w-8 h-8 border-2 border-ssms-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Procesando con DuckDB...</span>
              <span className="text-xs opacity-60">Trabajando con los datos en memoria</span>
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="text-sm">Los resultados aparecerán aquí</span>
              <span className="text-xs opacity-50">Escribe un comando y presiona Ejecutar</span>
            </>
          )}
        </div>
      </div>
    )
  }

  const { rows, rowCount, duration } = result

  const Row = ({ index, style }) => {
    const row = rows[index]
    const isEven = index % 2 === 0
    return (
      <div
        style={{ ...style, width: totalWidth, display: 'flex', alignItems: 'center' }}
        className={\`border-b border-ssms-border/50 hover:bg-ssms-accent/10 transition-colors cursor-default \${isEven ? 'bg-[#1a1a28]' : 'bg-[#1e1e2e]'}\`}
      >
        <div
          className="text-ssms-textDim text-[10px] text-right px-2 border-r border-ssms-border/50 shrink-0 select-none"
          style={{ width: 44, height: ROW_HEIGHT, lineHeight: ROW_HEIGHT + 'px' }}
        >
          {index + 1}
        </div>
        {displayColumns.map(col => (
          <div
            key={col}
            style={{ width: colWidths[col] || 100, height: ROW_HEIGHT, lineHeight: ROW_HEIGHT + 'px' }}
            className="px-2 text-xs font-mono border-r border-ssms-border/30 shrink-0 overflow-hidden"
            title={row[col] !== null && row[col] !== undefined ? String(row[col]) : 'NULL'}
          >
            <CellValue value={row[col]} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <TabBar rowCount={rowCount} duration={duration} />
      <div className="flex-1 overflow-hidden">
        <AutoSizer>
          {({ width, height }) => {
            const listHeight = height - HEADER_HEIGHT
            return (
              <div style={{ width, height }}>
                <div
                  className="flex border-b border-ssms-border bg-[#12121e] shrink-0"
                  style={{ height: HEADER_HEIGHT, width: Math.max(totalWidth, width), overflow: 'hidden' }}
                >
                  <div
                    className="text-ssms-textDim text-[10px] uppercase px-2 border-r border-ssms-border shrink-0 flex items-center font-bold"
                    style={{ width: 44 }}
                  >
                    #
                  </div>
                  {displayColumns.map(col => (
                    <div
                      key={col}
                      className="text-ssms-text text-xs font-bold px-2 border-r border-ssms-border shrink-0 flex items-center truncate"
                      style={{ width: colWidths[col] || 100 }}
                      title={col}
                    >
                      {col}
                    </div>
                  ))}
                </div>
                <List height={listHeight} itemCount={rows.length} itemSize={ROW_HEIGHT} width={Math.max(totalWidth, width)}>
                  {Row}
                </List>
              </div>
            )
          }}
        </AutoSizer>
      </div>
      <div className="flex items-center justify-between px-4 py-1.5 bg-[#12121e] border-t border-ssms-border shrink-0">
        <span className="text-ssms-textDim text-[10px]">
          {displayColumns.length} columna(s) \u00b7 {rows.length < rowCount ? 'Mostrando ' + rows.length.toLocaleString() + ' de ' : ''}{rowCount.toLocaleString()} registros
        </span>
        <span className="text-ssms-textDim text-[10px]">\u23f1 {duration}s</span>
      </div>
    </div>
  )
}

function TabBar({ hasError }) {
  return (
    <div className="flex items-center px-3 bg-ssms-toolbar border-b border-ssms-border shrink-0">
      <div className={\`flex items-center gap-1.5 px-3 py-2 border-b-2 text-xs font-medium \${hasError ? 'border-red-500 text-red-400' : 'border-ssms-accent text-ssms-text'}\`}>
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        {hasError ? 'Error' : 'Resultados'}
      </div>
    </div>
  )
}
`.trimStart())

// ─── CommandBar.jsx ─────────────────────────────────────────────────────────
fs.writeFileSync(path.join(base, 'CommandBar.jsx'), `
import { useState, useRef, useEffect } from 'react'
import { EXAMPLE_COMMANDS } from '../lib/nlp'

const PLACEHOLDER_CYCLE = [
  'Prueba: "Cruza ventas con precios por ID_producto"...',
  'Prueba: "Consolida enero con febrero"...',
  'Prueba: "Muéstrame las columnas de empleados"...',
  'Prueba: "Quita la columna dirección de clientes"...',
  'Prueba: "Cuántos registros tiene el archivo pacientes"...',
  'Prueba: "Exporta el resultado actual"...',
]

export default function CommandBar({ onExecute, isExecuting, injectedValue, onClear }) {
  const [value, setValue] = useState('')
  const [phIdx, setPhIdx] = useState(0)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (value) return
    const id = setInterval(() => setPhIdx(i => (i + 1) % PLACEHOLDER_CYCLE.length), 3000)
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
    ? EXAMPLE_COMMANDS.filter(c => c.toLowerCase().includes(value.toLowerCase())).slice(0, 4)
    : []

  const submit = () => {
    if (!value.trim() || isExecuting) return
    onExecute(value.trim())
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-4 bg-ssms-toolbar border-b border-ssms-border shrink-0">
        <div className="flex items-center gap-1.5 px-3 py-2 border-b-2 border-ssms-accent text-ssms-text text-xs font-medium">
          <span>💬</span>
          Comando en Lenguaje Natural
        </div>
        <div className="flex-1" />
        <span className="text-ssms-textDim text-[10px]">Enter para ejecutar · Shift+Enter = nueva línea</span>
      </div>

      <div className={\`relative flex-1 flex flex-col p-4 gap-3 \${isExecuting ? 'processing' : ''}\`}>
        {isExecuting && (
          <>
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-ssms-accent to-transparent animate-pulse z-10" />
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-ssms-accent to-transparent animate-pulse z-10" />
            <div className="absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-transparent via-ssms-accent to-transparent animate-pulse z-10" />
            <div className="absolute inset-y-0 right-0 w-0.5 bg-gradient-to-b from-transparent via-ssms-accent to-transparent animate-pulse z-10" />
          </>
        )}

        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => { setValue(e.target.value); setShowSuggestions(e.target.value.length > 1) }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            disabled={isExecuting}
            placeholder={PLACEHOLDER_CYCLE[phIdx]}
            className="w-full h-full min-h-[90px] bg-[#12121e] border border-ssms-border rounded-xl px-4 py-3 text-ssms-text text-sm resize-none focus:outline-none focus:border-ssms-accent/70 focus:ring-1 focus:ring-ssms-accent/30 placeholder-[#555577] transition-all leading-relaxed disabled:opacity-50 font-sans"
          />

          {showSuggestions && filtered.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-[#1a1a2e] border border-ssms-border rounded-xl shadow-2xl z-20 overflow-hidden">
              {filtered.map((cmd, i) => (
                <button
                  key={i}
                  onMouseDown={() => { setValue(cmd); setShowSuggestions(false); textareaRef.current?.focus() }}
                  className="w-full text-left px-4 py-2.5 text-xs text-ssms-text hover:bg-ssms-accent/20 transition-colors flex items-center gap-2"
                >
                  <span className="text-ssms-accent text-sm">→</span>
                  {cmd}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-ssms-textDim text-[10px] shrink-0">Ejemplos rápidos:</span>
            {EXAMPLE_COMMANDS.slice(0, 3).map((cmd, i) => (
              <button
                key={i}
                onClick={() => { setValue(cmd); textareaRef.current?.focus() }}
                className="px-2.5 py-0.5 rounded-full bg-ssms-toolbar border border-ssms-border text-ssms-textDim hover:text-ssms-text hover:border-ssms-accent/50 text-[10px] transition-colors truncate max-w-[180px]"
              >
                {cmd}
              </button>
            ))}
          </div>

          <button
            onClick={submit}
            disabled={!value.trim() || isExecuting}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-ssms-accent hover:bg-ssms-accentHover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-lg hover:shadow-ssms-accent/30 hover:shadow-xl shrink-0"
          >
            {isExecuting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                Ejecutar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
`.trimStart())

// ─── RightSidebar.jsx ────────────────────────────────────────────────────────
fs.writeFileSync(path.join(base, 'RightSidebar.jsx'), `
import { useState } from 'react'

export default function RightSidebar({ tables, selectedLeft, selectedRight, onSelectLeft, onSelectRight, columnToggles, onToggleColumn, onCross, onClose }) {

  const leftTable = tables.find(t => t.name === selectedLeft)
  const rightTable = tables.find(t => t.name === selectedRight)
  const allColumns = [
    ...(leftTable?.columns || []).map(c => ({ ...c, source: selectedLeft })),
    ...(rightTable?.columns || []).map(c => ({ ...c, source: selectedRight })),
  ]

  const commonCols = leftTable && rightTable
    ? (leftTable.columns || []).filter(lc =>
        (rightTable.columns || []).some(rc => rc.name.toLowerCase() === lc.name.toLowerCase())
      )
    : []

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e] border-l border-ssms-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-ssms-border shrink-0 bg-[#1a1a2e]">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#8888aa]">Config. de Cruce</span>
        <button onClick={onClose} className="text-ssms-textDim hover:text-ssms-text transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">

        {/* Visual JOIN diagram */}
        <div className="bg-ssms-toolbar rounded-xl border border-ssms-border p-3">
          <p className="text-[10px] font-bold text-[#8888aa] uppercase tracking-wider mb-3">Diagrama de Cruce</p>
          <div className="flex items-center justify-center gap-1 py-2">
            <div className="flex flex-col items-center gap-1">
              <div className={\`w-14 h-14 rounded-full border-2 flex items-center justify-center text-[10px] font-bold text-center leading-tight transition-colors \${selectedLeft ? 'border-blue-500 bg-blue-900/30 text-blue-300' : 'border-ssms-border text-ssms-textDim'}\`}>
                {selectedLeft ? selectedLeft.slice(0, 6) + (selectedLeft.length > 6 ? '..' : '') : 'A'}
              </div>
              <span className="text-[9px] text-ssms-textDim">Tabla A</span>
            </div>
            <div className="flex flex-col items-center -mx-3 z-10">
              <div className="w-10 h-10 rounded-full bg-ssms-accent/20 border border-ssms-accent/50 flex items-center justify-center">
                <span className="text-ssms-accent text-xs font-bold">∩</span>
              </div>
              {commonCols.length > 0 && (
                <span className="text-[9px] text-emerald-400 mt-1 text-center">{commonCols.length} col común</span>
              )}
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className={\`w-14 h-14 rounded-full border-2 flex items-center justify-center text-[10px] font-bold text-center leading-tight transition-colors \${selectedRight ? 'border-indigo-500 bg-indigo-900/30 text-indigo-300' : 'border-ssms-border text-ssms-textDim'}\`}>
                {selectedRight ? selectedRight.slice(0, 6) + (selectedRight.length > 6 ? '..' : '') : 'B'}
              </div>
              <span className="text-[9px] text-ssms-textDim">Tabla B</span>
            </div>
          </div>
        </div>

        {/* Table selectors */}
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-bold text-[#8888aa] uppercase tracking-wider">Seleccionar Tablas</p>
          <div>
            <label className="text-[10px] text-ssms-textDim mb-1 block">Tabla A (izquierda)</label>
            <select
              value={selectedLeft || ''}
              onChange={e => onSelectLeft(e.target.value || null)}
              className="w-full bg-ssms-inputBg border border-ssms-border rounded-lg px-2 py-1.5 text-ssms-text text-xs focus:outline-none focus:border-ssms-accent"
            >
              <option value="">-- Selecciona --</option>
              {tables.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-ssms-textDim mb-1 block">Tabla B (derecha)</label>
            <select
              value={selectedRight || ''}
              onChange={e => onSelectRight(e.target.value || null)}
              className="w-full bg-ssms-inputBg border border-ssms-border rounded-lg px-2 py-1.5 text-ssms-text text-xs focus:outline-none focus:border-ssms-accent"
            >
              <option value="">-- Selecciona --</option>
              {tables.filter(t => t.name !== selectedLeft).map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          </div>

          {selectedLeft && selectedRight && (
            <button
              onClick={() => onCross(selectedLeft, selectedRight, commonCols[0]?.name)}
              className="w-full mt-1 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2"
            >
              🔗 Cruzar Tablas
            </button>
          )}
        </div>

        {/* Column toggles */}
        {allColumns.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-bold text-[#8888aa] uppercase tracking-wider">
              Columnas a incluir
            </p>
            <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
              {allColumns.map((col, i) => {
                const key = col.source + '.' + col.name
                const isOn = columnToggles[key] !== false
                return (
                  <div key={i} className="flex items-center justify-between py-1 px-1 rounded hover:bg-ssms-inputBg/50 transition-colors">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[9px] px-1 rounded bg-ssms-inputBg text-ssms-textDim shrink-0">{col.source.slice(0, 4)}</span>
                      <span className="text-ssms-text text-xs truncate">{col.name}</span>
                    </div>
                    <button
                      onClick={() => onToggleColumn(key)}
                      className={\`w-8 h-4 rounded-full transition-colors shrink-0 relative \${isOn ? 'bg-ssms-accent' : 'bg-ssms-border'}\`}
                    >
                      <span className={\`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all \${isOn ? 'left-4' : 'left-0.5'}\`} style={{transition: 'left 0.2s'}} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
`.trimStart())

console.log('Todos los archivos escritos correctamente.')
