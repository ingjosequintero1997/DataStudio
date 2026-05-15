import { useEffect, useMemo, useState } from 'react'
import { FixedSizeList as List } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'

const BASE_ROW_HEIGHT = 26
const BASE_HEADER_HEIGHT = 32

// ─ Colores verde/blanco (mismos que CrossWizard) ──────────────────────
const G = {
  dark:   '#2E7D32',
  primary:'#43A047',
  light:  '#E8F5E9',
  border: '#C8DCC8',
  text:   '#1B3318',
  text2:  '#4A6B4A',
  dim:    '#9EBB9E',
}

const JOIN_LABELS = {
  'LEFT JOIN':       'Izquierda  (⟵)',
  'INNER JOIN':      'Intersección (⋈)',
  'FULL OUTER JOIN': 'Completo  (⟷)',
  'RIGHT JOIN':      'Derecha  (⟶)',
}
const AGG_LABELS = {
  none:  'Sin agregación',
  count: 'Contar coincidencias',
  sum:   'Sumar columna',
  avg:   'Promedio de columna',
  both:  'Suma + Promedio',
}

/* ─ Banner que resume el cruce ejecutado ─────────────────────────────── */
function CrossBanner({ ctx, onExport, onExportExcel, theme = 'light' }) {
  if (!ctx) return null
  const isDark = theme === 'dark'
  return (
    <div style={{ background: isDark ? '#102019' : G.light, borderBottom: `1px solid ${isDark ? 'rgba(16,185,129,0.22)' : G.border}`, padding: '10px 16px', flexShrink: 0 }}>
      {/* Título */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: G.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13 }}>⋈</div>
          <span style={{ fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: '0.82rem', color: isDark ? '#E2F5E2' : G.dark }}>
            Resultado del Cruce
          </span>
          {ctx.limited && (
            <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: 99, background: '#FFF9C4', border: '1px solid #F9A825', color: '#6D4C00', fontWeight: 600 }}>
              Limitado a 50 000 filas
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onExport}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: `1px solid ${G.primary}`, background: isDark ? '#163326' : '#fff', color: isDark ? '#E2F5E2' : G.dark, fontFamily: 'Inter,sans-serif', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer' }}>
            ⬇ Exportar CSV
          </button>
          <button onClick={onExportExcel}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: `1px solid ${G.primary}`, background: isDark ? '#163326' : '#fff', color: isDark ? '#E2F5E2' : G.dark, fontFamily: 'Inter,sans-serif', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer' }}>
            ⬇ Exportar Excel
          </button>
        </div>
      </div>
      {/* Detalles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
        {[
          { label: 'Archivo A', value: ctx.leftTable },
          { label: 'Archivo B', value: ctx.rightTable },
          { label: 'Columna enlace A', value: ctx.joinCol },
          { label: 'Columna enlace B', value: ctx.rightJoinCol },
          { label: 'Tipo de cruce', value: JOIN_LABELS[ctx.joinType] || ctx.joinLabel },
          { label: 'Cálculo', value: AGG_LABELS[ctx.aggOp] || ctx.aggLabel },
          ...(ctx.aggCol ? [{ label: 'Columna calculada', value: ctx.aggCol }] : []),
          { label: 'Filas obtenidas', value: ctx.rowCount?.toLocaleString() },
          ...(typeof ctx.matchedRows === 'number' ? [{ label: 'Coincidencias', value: ctx.matchedRows.toLocaleString() }] : []),
          ...(typeof ctx.unmatchedRows === 'number' ? [{ label: 'Sin coincidencia', value: ctx.unmatchedRows.toLocaleString() }] : []),
        ].map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.64rem', fontWeight: 700, color: isDark ? 'rgba(160,205,170,0.8)' : G.dim, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'Inter,sans-serif' }}>{label}</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: isDark ? '#E2F5E2' : G.text, fontFamily: 'Inter,sans-serif' }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function isNumericStr(val) {
  if (val === null || val === undefined || val === '') return false
  const n = Number(val)
  return !isNaN(n) && val.toString().trim() !== ''
}

function normalizeErrorState(error) {
  if (!error) return null
  if (typeof error === 'string') {
    return {
      level: 'error',
      title: 'No pude procesar ese comando',
      message: error,
      actionHint: null,
    }
  }
  return {
    level: error.level || 'error',
    title: error.title || 'No pude procesar ese comando',
    message: error.message || 'Ocurrió un error no controlado.',
    actionHint: error.actionHint || null,
  }
}

function compareValues(a, b) {
  const na = Number(a)
  const nb = Number(b)
  const aIsNum = a !== null && a !== undefined && a !== '' && !isNaN(na)
  const bIsNum = b !== null && b !== undefined && b !== '' && !isNaN(nb)

  if (aIsNum && bIsNum) return na - nb
  return String(a ?? '').localeCompare(String(b ?? ''), 'es', { sensitivity: 'base' })
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

export default function ResultsTable({ result, error, isExecuting, visibleColumns, onExport, onExportExcel, onClear, theme = 'light', density = 'default' }) {
  const isDark = theme === 'dark'
  const isLarge = density === 'large'
  const ROW_HEIGHT = isLarge ? 34 : BASE_ROW_HEIGHT
  const HEADER_HEIGHT = isLarge ? 40 : BASE_HEADER_HEIGHT
  const bodyFontSize = isLarge ? '0.84rem' : '0.76rem'
  const headerFontSize = isLarge ? '0.78rem' : '0.7rem'
  const indexFontSize = isLarge ? '0.74rem' : '0.65rem'
  const summaryFontSize = isLarge ? '0.76rem' : '0.68rem'
  const panelBg = isDark ? '#0F1A14' : '#fff'
  const rowA = isDark ? '#102019' : '#FAFCFA'
  const rowB = isDark ? '#0E1A14' : '#fff'
  const rowHover = isDark ? 'rgba(16,185,129,0.12)' : 'rgba(67,160,71,0.07)'
  const line = isDark ? 'rgba(16,185,129,0.18)' : '#E6EFE6'
  const displayColumns = visibleColumns?.length ? visibleColumns : (result?.columns || [])
  const errorState = normalizeErrorState(error)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [pageSize, setPageSize] = useState(50)
  const [page, setPage] = useState(1)

  useEffect(() => {
    setSearchTerm('')
    setSortBy(null)
    setSortDir('asc')
    setPage(1)
  }, [result])

  const filteredRows = useMemo(() => {
    const rows = result?.rows || []
    const term = searchTerm.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) =>
      displayColumns.some((col) => String(row[col] ?? '').toLowerCase().includes(term))
    )
  }, [result, searchTerm, displayColumns])

  const sortedRows = useMemo(() => {
    if (!sortBy) return filteredRows
    const next = [...filteredRows]
    next.sort((ra, rb) => {
      const cmp = compareValues(ra?.[sortBy], rb?.[sortBy])
      return sortDir === 'asc' ? cmp : -cmp
    })
    return next
  }, [filteredRows, sortBy, sortDir])

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, safePage, pageSize])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const numericExtremes = useMemo(() => {
    const extremes = {}
    displayColumns.forEach((col) => {
      const nums = sortedRows
        .map((r) => Number(r?.[col]))
        .filter((n) => !isNaN(n))
      if (!nums.length) return
      extremes[col] = { min: Math.min(...nums), max: Math.max(...nums) }
    })
    return extremes
  }, [displayColumns, sortedRows])

  const colWidths = useMemo(() => {
    const widths = {}
    for (const col of displayColumns) {
      let max = col.length
      if (pagedRows?.length) {
        for (let i = 0; i < Math.min(50, pagedRows.length); i++) {
          const val = pagedRows[i][col]
          if (val !== null && val !== undefined) max = Math.max(max, String(val).length)
        }
      }
      widths[col] = Math.max(80, Math.min(300, max * 7.5 + 24))
    }
    return widths
  }, [pagedRows, displayColumns])

  const totalWidth = useMemo(
    () => displayColumns.reduce((s, c) => s + (colWidths[c] || 100), 44),
    [displayColumns, colWidths]
  )

  if (errorState) {
    const severity = errorState.level === 'info'
      ? {
        bg: isDark ? '#102B3B' : '#E8F4FD',
        border: isDark ? 'rgba(59,130,246,0.45)' : '#BBDEFB',
        title: isDark ? '#BFDBFE' : '#0D47A1',
        body: isDark ? '#DBEAFE' : '#1565C0',
      }
      : errorState.level === 'warning'
        ? {
          bg: isDark ? '#2B210F' : '#FFF8E1',
          border: isDark ? 'rgba(245,158,11,0.45)' : '#FFE082',
          title: isDark ? '#FCD34D' : '#E65100',
          body: isDark ? '#FDE68A' : '#8A3B00',
        }
        : {
          bg: isDark ? '#2A1313' : '#FFF3F3',
          border: isDark ? 'rgba(239,68,68,0.45)' : '#FFCDD2',
          title: isDark ? '#FCA5A5' : '#C62828',
          body: isDark ? '#FECACA' : '#B71C1C',
        }

    return (
      <div className="flex flex-col h-full" style={{ background: panelBg }}>
        <TabBar hasError canClear onClear={onClear} theme={theme} />
        <div className="flex-1 p-4">
          <div style={{ background: severity.bg, border: `1px solid ${severity.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: '1.1rem' }}>⚠️</span>
              <p style={{ color: severity.title, fontSize: '0.78rem', fontWeight: 600, fontFamily: 'Inter,sans-serif' }}>{errorState.title}</p>
            </div>
            <p style={{ color: severity.body, fontSize: '0.75rem', lineHeight: 1.6, fontFamily: 'Inter,sans-serif' }}>{errorState.message}</p>
            {errorState.actionHint && (
              <p style={{ marginTop: 8, color: severity.body, fontSize: '0.74rem', lineHeight: 1.6, fontFamily: 'Inter,sans-serif' }}>
                <strong>Acción sugerida:</strong> {errorState.actionHint}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (!result || !result.rows) {
    return (
      <div className="flex flex-col h-full" style={{ background: panelBg }}>
        <TabBar canClear={!!result || !!error} onClear={onClear} theme={theme} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: G.dim }}>
          {isExecuting ? (
            <>
              <span style={{ width: 32, height: 32, border: `2px solid ${G.primary}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ fontSize: '0.85rem', color: G.text2, fontFamily: 'Inter,sans-serif' }}>Procesando con DuckDB...</span>
              <span style={{ fontSize: '0.72rem', color: G.dim, fontFamily: 'Inter,sans-serif' }}>Trabajando con los datos en memoria</span>
            </>
          ) : (
            <>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: G.light, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${G.border}` }}>
                <svg xmlns="http://www.w3.org/2000/svg" style={{ width: 24, height: 24, color: G.primary }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <span style={{ fontSize: '0.85rem', color: G.text2, fontFamily: 'Inter,sans-serif' }}>Los resultados aparecerán aquí</span>
              <span style={{ fontSize: '0.72rem', color: G.dim, fontFamily: 'Inter,sans-serif' }}>Escribe un comando y presiona Ejecutar</span>
            </>
          )}
        </div>
      </div>
    )
  }

  const { rowCount, duration, crossContext } = result

  const Row = ({ index, style }) => {
    const row = pagedRows[index]
    const absoluteIndex = (safePage - 1) * pageSize + index
    const isEven = index % 2 === 0
    return (
      <div
        style={{ ...style, width: totalWidth, display: 'flex', alignItems: 'center' }}
        className={`border-b transition-colors cursor-default`}
        onMouseEnter={e => { e.currentTarget.style.background = rowHover }}
        onMouseLeave={e => { e.currentTarget.style.background = isEven ? rowA : rowB }}
        {...{ style: { ...style, width: totalWidth, display: 'flex', alignItems: 'center', background: isEven ? rowA : rowB, borderBottom: `1px solid ${line}` } }}
      >
        <div
          style={{ width: 44, height: ROW_HEIGHT, lineHeight: ROW_HEIGHT + 'px', color: G.dim, fontSize: indexFontSize, textAlign: 'right', paddingRight: 8, borderRight: `1px solid ${G.border}`, flexShrink: 0, userSelect: 'none' }}
        >
          {absoluteIndex + 1}
        </div>
        {displayColumns.map(col => (
          (() => {
            const numeric = Number(row?.[col])
            const isNum = !isNaN(numeric)
            const range = numericExtremes[col]
            const isMax = isNum && range && numeric === range.max
            const isMin = isNum && range && numeric === range.min
            const glow = isMax
              ? (isDark ? 'rgba(34,197,94,0.16)' : 'rgba(34,197,94,0.11)')
              : isMin
                ? (isDark ? 'rgba(239,68,68,0.16)' : 'rgba(239,68,68,0.1)')
                : 'transparent'
            return (
          <div
            key={col}
            style={{ width: colWidths[col] || 100, height: ROW_HEIGHT, lineHeight: ROW_HEIGHT + 'px', borderRight: `1px solid ${G.border}`, flexShrink: 0, overflow: 'hidden', padding: isLarge ? '0 10px' : '0 8px', fontSize: bodyFontSize, fontFamily: 'JetBrains Mono, monospace', background: glow }}
            title={row[col] !== null && row[col] !== undefined ? String(row[col]) : 'NULL'}
          >
            <CellValue value={row[col]} />
          </div>
            )
          })()
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ background: panelBg }}>
      <TabBar rowCount={rowCount} duration={duration} hasCross={!!crossContext} canClear onClear={onClear} theme={theme} />
      <CrossBanner ctx={crossContext} onExport={onExport} onExportExcel={onExportExcel} theme={theme} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: `1px solid ${line}`, background: isDark ? '#102019' : '#F7FBF7', flexWrap: 'wrap' }}>
        <input
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
          placeholder="Buscar en resultados..."
          style={{
            minWidth: 220,
            flex: '1 1 260px',
            padding: '6px 10px',
            borderRadius: 8,
            border: `1px solid ${G.border}`,
            background: isDark ? '#0F1A14' : '#fff',
            color: isDark ? '#E2F5E2' : G.text,
            fontSize: '0.74rem',
            fontFamily: 'Inter,sans-serif',
          }}
        />
        <button
          onClick={() => { setSortBy(null); setSortDir('asc') }}
          style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${G.border}`, background: isDark ? '#163326' : '#fff', color: isDark ? '#E2F5E2' : G.text2, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
          Limpiar orden
        </button>
        <select
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
          style={{ padding: '6px 8px', borderRadius: 8, border: `1px solid ${G.border}`, background: isDark ? '#163326' : '#fff', color: isDark ? '#E2F5E2' : G.text2, fontSize: '0.72rem', fontWeight: 700 }}>
          {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} por página</option>)}
        </select>
      </div>
      <div className="flex-1 overflow-hidden">
        <AutoSizer>
          {({ width, height }) => {
            const effectiveWidth = Math.max(totalWidth, width)
            const listHeight = height - HEADER_HEIGHT
            return (
              <div style={{ width, height, overflowX: 'auto', overflowY: 'hidden',
                scrollbarColor: `${G.primary} ${G.light}`, scrollbarWidth: 'thin' }}
                id="results-scroll-x"
                onScroll={e => {
                  const list = document.querySelector('#results-scroll-x .results-vscroll')
                  if (list) list.scrollLeft = e.currentTarget.scrollLeft
                }}
              >
              <div style={{ width: effectiveWidth, height }}>
                  <div
                    style={{ height: HEADER_HEIGHT, width: effectiveWidth, position: 'sticky', top: 0, zIndex: 2, display: 'flex', background: G.dark, borderBottom: `1px solid ${G.primary}` }}
                  >
                    <div
                      style={{ width: 44, color: 'rgba(255,255,255,0.5)', fontSize: indexFontSize, fontWeight: 700, padding: '0 8px', borderRight: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                    >
                      #
                    </div>
                    {displayColumns.map(col => (
                      <div
                        key={col}
                        onClick={() => {
                          if (sortBy === col) {
                            setSortDir((prev) => prev === 'asc' ? 'desc' : 'asc')
                          } else {
                            setSortBy(col)
                            setSortDir('asc')
                          }
                        }}
                        style={{ width: colWidths[col] || 100, fontSize: headerFontSize, fontWeight: 700, padding: isLarge ? '0 10px' : '0 8px', borderRight: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', flexShrink: 0, overflow: 'hidden', color: 'white', fontFamily: 'Inter,sans-serif', letterSpacing: '0.02em', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={col}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col}</span>
                        {sortBy === col && <span style={{ marginLeft: 6, fontSize: '0.62rem', opacity: 0.9 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                      </div>
                    ))}
                  </div>
                  <div className="results-vscroll" style={{ overflowY: 'auto', overflowX: 'hidden', height: listHeight,
                    scrollbarColor: `${G.primary} ${G.light}`, scrollbarWidth: 'thin' }}>
                    <List height={listHeight} itemCount={pagedRows.length} itemSize={ROW_HEIGHT} width={effectiveWidth} style={{ overflowX: 'hidden' }}>
                      {Row}
                    </List>
                  </div>
                </div>
              </div>
            )
          }}
        </AutoSizer>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 16px', background: G.light, borderTop: `1px solid ${G.border}`, flexShrink: 0 }}>
        <span style={{ color: G.text2, fontSize: summaryFontSize, fontFamily: 'Inter,sans-serif' }}>
          {displayColumns.length} columna(s) · {searchTerm ? `${sortedRows.length.toLocaleString()} filtrados` : `${rowCount.toLocaleString()} total`} · Página {safePage}/{pageCount}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${G.border}`, background: '#fff', color: G.text2, fontSize: '0.7rem', cursor: safePage <= 1 ? 'not-allowed' : 'pointer', opacity: safePage <= 1 ? 0.5 : 1 }}>Anterior</button>
          <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={safePage >= pageCount} style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${G.border}`, background: '#fff', color: G.text2, fontSize: '0.7rem', cursor: safePage >= pageCount ? 'not-allowed' : 'pointer', opacity: safePage >= pageCount ? 0.5 : 1 }}>Siguiente</button>
          <span style={{ color: G.dim, fontSize: summaryFontSize, fontFamily: 'Inter,sans-serif' }}>⏱ {duration}s</span>
        </div>
      </div>
    </div>
  )
}

function TabBar({ hasError, hasCross, canClear, onClear, theme = 'light' }) {
  const isDark = theme === 'dark'
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', background: isDark ? '#102019' : '#fff', borderBottom: `2px solid ${G.primary}`, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderBottom: `2px solid ${G.primary}`, marginBottom: -2, color: hasError ? (isDark ? '#FCA5A5' : '#C62828') : (isDark ? '#E2F5E2' : G.dark), fontSize: '0.78rem', fontWeight: 600, fontFamily: 'Inter,sans-serif' }}>
        {hasError ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        )}
        {hasError ? 'Error' : hasCross ? 'Resultado del Cruce' : 'Resultados'}
      </div>
      {canClear && (
        <button
          onClick={onClear}
          title="Limpiar resultado"
          style={{
            marginRight: 4,
            width: 24,
            height: 24,
            borderRadius: 6,
            border: `1px solid ${G.border}`,
            background: isDark ? '#163326' : '#fff',
            color: isDark ? '#E2F5E2' : G.text2,
            cursor: 'pointer',
            fontWeight: 700,
            lineHeight: '22px',
          }}
        >
          x
        </button>
      )}
    </div>
  )
}
