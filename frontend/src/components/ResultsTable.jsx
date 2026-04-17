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
        className={`border-b border-ssms-border/50 hover:bg-ssms-accent/10 transition-colors cursor-default ${isEven ? 'bg-[#1a1a28]' : 'bg-[#1e1e2e]'}`}
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
            const effectiveWidth = Math.max(totalWidth, width)
            const listHeight = height - HEADER_HEIGHT
            return (
              <div style={{ width, height, overflowX: 'auto', overflowY: 'hidden',
                scrollbarColor: '#334155 #0d1117', scrollbarWidth: 'thin' }}
                id="results-scroll-x"
                onScroll={e => {
                  const list = document.querySelector('#results-scroll-x .results-vscroll')
                  if (list) list.scrollLeft = e.currentTarget.scrollLeft
                }}
              >
                <div style={{ width: effectiveWidth, height }}>
                  <div
                    className="flex border-b border-ssms-border bg-[#12121e] shrink-0"
                    style={{ height: HEADER_HEIGHT, width: effectiveWidth, position: 'sticky', top: 0, zIndex: 2 }}
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
                  <div className="results-vscroll" style={{ overflowY: 'auto', overflowX: 'hidden', height: listHeight,
                    scrollbarColor: '#334155 #0d1117', scrollbarWidth: 'thin' }}>
                    <List height={listHeight} itemCount={rows.length} itemSize={ROW_HEIGHT} width={effectiveWidth} style={{ overflowX: 'hidden' }}>
                      {Row}
                    </List>
                  </div>
                </div>
              </div>
            )
          }}
        </AutoSizer>
      </div>
      <div className="flex items-center justify-between px-4 py-1.5 bg-[#12121e] border-t border-ssms-border shrink-0">
        <span className="text-ssms-textDim text-[10px]">
          {displayColumns.length} columna(s) · {rows.length < rowCount ? 'Mostrando ' + rows.length.toLocaleString() + ' de ' : ''}{rowCount.toLocaleString()} registros
        </span>
        <span className="text-ssms-textDim text-[10px]">⏱ {duration}s</span>
      </div>
    </div>
  )
}

function TabBar({ hasError }) {
  return (
    <div className="flex items-center px-3 bg-ssms-toolbar border-b border-ssms-border shrink-0">
      <div className={`flex items-center gap-1.5 px-3 py-2 border-b-2 text-xs font-medium ${hasError ? 'border-red-500 text-red-400' : 'border-ssms-accent text-ssms-text'}`}>
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        {hasError ? 'Error' : 'Resultados'}
      </div>
    </div>
  )
}
