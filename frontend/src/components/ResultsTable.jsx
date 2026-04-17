import { useMemo } from 'react'
import { FixedSizeList as List } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'

const ROW_HEIGHT = 26
const HEADER_HEIGHT = 32

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
function CrossBanner({ ctx, onExport, onSave }) {
  if (!ctx) return null
  return (
    <div style={{ background: G.light, borderBottom: `1px solid ${G.border}`, padding: '10px 16px', flexShrink: 0 }}>
      {/* Título */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: G.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13 }}>⋈</div>
          <span style={{ fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: '0.8rem', color: G.dark }}>
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
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: `1px solid ${G.primary}`, background: '#fff', color: G.dark, fontFamily: 'Inter,sans-serif', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
            ⬇ Exportar CSV
          </button>
          {onSave && (
            <button onClick={onSave}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: 'none', background: G.primary, color: '#fff', fontFamily: 'Inter,sans-serif', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
              💾 Guardar como tabla
            </button>
          )}
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
        ].map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: G.dim, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'Inter,sans-serif' }}>{label}</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: G.text, fontFamily: 'Inter,sans-serif' }}>{value}</span>
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

export default function ResultsTable({ result, error, isExecuting, visibleColumns, onExport, onSave }) {
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
      <div className="flex flex-col h-full" style={{ background: '#fff' }}>
        <TabBar hasError />
        <div className="flex-1 p-4">
          <div style={{ background: '#FFF3F3', border: '1px solid #FFCDD2', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: '1.1rem' }}>⚠️</span>
              <p style={{ color: '#C62828', fontSize: '0.78rem', fontWeight: 600, fontFamily: 'Inter,sans-serif' }}>No pude procesar ese comando</p>
            </div>
            <p style={{ color: '#B71C1C', fontSize: '0.75rem', lineHeight: 1.6, fontFamily: 'Inter,sans-serif' }}>{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!result || !result.rows) {
    return (
      <div className="flex flex-col h-full" style={{ background: '#fff' }}>
        <TabBar />
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

  const { rows, rowCount, duration, crossContext } = result

  const Row = ({ index, style }) => {
    const row = rows[index]
    const isEven = index % 2 === 0
    return (
      <div
        style={{ ...style, width: totalWidth, display: 'flex', alignItems: 'center' }}
        className={`border-b transition-colors cursor-default`}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(67,160,71,0.07)' }}
        onMouseLeave={e => { e.currentTarget.style.background = isEven ? '#FAFCFA' : '#fff' }}
        {...{ style: { ...style, width: totalWidth, display: 'flex', alignItems: 'center', background: isEven ? '#FAFCFA' : '#fff', borderBottom: '1px solid #E6EFE6' } }}
      >
        <div
          style={{ width: 44, height: ROW_HEIGHT, lineHeight: ROW_HEIGHT + 'px', color: G.dim, fontSize: '0.65rem', textAlign: 'right', paddingRight: 8, borderRight: `1px solid ${G.border}`, flexShrink: 0, userSelect: 'none' }}
        >
          {index + 1}
        </div>
        {displayColumns.map(col => (
          <div
            key={col}
            style={{ width: colWidths[col] || 100, height: ROW_HEIGHT, lineHeight: ROW_HEIGHT + 'px', borderRight: `1px solid ${G.border}`, flexShrink: 0, overflow: 'hidden', padding: '0 8px', fontSize: '0.76rem', fontFamily: 'JetBrains Mono, monospace' }}
            title={row[col] !== null && row[col] !== undefined ? String(row[col]) : 'NULL'}
          >
            <CellValue value={row[col]} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#fff' }}>
      <TabBar rowCount={rowCount} duration={duration} hasCross={!!crossContext} />
      <CrossBanner ctx={crossContext} onExport={onExport} onSave={onSave} />
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
                      style={{ width: 44, color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem', fontWeight: 700, padding: '0 8px', borderRight: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                    >
                      #
                    </div>
                    {displayColumns.map(col => (
                      <div
                        key={col}
                        style={{ width: colWidths[col] || 100, fontSize: '0.7rem', fontWeight: 700, padding: '0 8px', borderRight: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', flexShrink: 0, overflow: 'hidden', color: 'white', fontFamily: 'Inter,sans-serif', letterSpacing: '0.02em', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={col}
                      >
                        {col}
                      </div>
                    ))}
                  </div>
                  <div className="results-vscroll" style={{ overflowY: 'auto', overflowX: 'hidden', height: listHeight,
                    scrollbarColor: `${G.primary} ${G.light}`, scrollbarWidth: 'thin' }}>
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 16px', background: G.light, borderTop: `1px solid ${G.border}`, flexShrink: 0 }}>
        <span style={{ color: G.text2, fontSize: '0.68rem', fontFamily: 'Inter,sans-serif' }}>
          {displayColumns.length} columna(s) · {rows.length < rowCount ? 'Mostrando ' + rows.length.toLocaleString() + ' de ' : ''}{rowCount.toLocaleString()} registros
        </span>
        <span style={{ color: G.dim, fontSize: '0.68rem', fontFamily: 'Inter,sans-serif' }}>⏱ {duration}s</span>
      </div>
    </div>
  )
}

function TabBar({ hasError, hasCross }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', background: '#fff', borderBottom: `2px solid ${G.primary}`, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderBottom: `2px solid ${G.primary}`, marginBottom: -2, color: hasError ? '#C62828' : G.dark, fontSize: '0.78rem', fontWeight: 600, fontFamily: 'Inter,sans-serif' }}>
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
    </div>
  )
}
