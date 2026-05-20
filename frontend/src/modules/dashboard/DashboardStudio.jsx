import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { executeQuery } from '../../lib/duckdb'

const C = {
  dark: {
    bg: '#07120E',
    panel: '#0F2019',
    panelSoft: '#12261E',
    panelAlt: '#163126',
    border: 'rgba(52,211,153,0.18)',
    text: '#E8FFF2',
    dim: 'rgba(167,220,195,0.8)',
    muted: 'rgba(167,220,195,0.55)',
    accent: '#22C55E',
    accent2: '#10B981',
    accent3: '#34D399',
  },
  light: {
    bg: '#EEF6F1',
    panel: '#FFFFFF',
    panelSoft: '#F5FBF7',
    panelAlt: '#E7F4EB',
    border: '#CFE1D4',
    text: '#163728',
    dim: '#607C6C',
    muted: '#7D9889',
    accent: '#15803D',
    accent2: '#16A34A',
    accent3: '#22C55E',
  },
}

const PALETTE = ['#22C55E', '#10B981', '#14B8A6', '#38BDF8', '#0EA5E9', '#84CC16', '#F59E0B', '#F97316']

function isNumeric(value) {
  return value !== null && value !== undefined && value !== '' && !Number.isNaN(Number(value))
}

function aggregateRows(rows, dimension, metric, agg, topN, sortDir = 'desc') {
  if (!rows?.length || !dimension) return []
  const buckets = new Map()

  rows.forEach((row) => {
    const key = String(row[dimension] ?? 'Sin dato')
    const metricValue = metric && isNumeric(row[metric]) ? Number(row[metric]) : 0
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(metricValue)
  })

  const reducers = {
    count: (values) => values.length,
    sum: (values) => values.reduce((acc, value) => acc + value, 0),
    avg: (values) => values.length ? values.reduce((acc, value) => acc + value, 0) / values.length : 0,
    max: (values) => values.length ? Math.max(...values) : 0,
    min: (values) => values.length ? Math.min(...values) : 0,
  }

  const reduce = reducers[agg] || reducers.count
  const items = Array.from(buckets.entries()).map(([label, values], index) => ({
    id: `${label}-${index}`,
    label,
    total: agg === 'count' ? values.length : reduce(values),
  }))

  items.sort((a, b) => sortDir === 'asc' ? a.total - b.total : b.total - a.total)
  return items.slice(0, topN)
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('es-ES', { maximumFractionDigits: 2 })
}

function formatTimestamp(date = new Date()) {
  const pad = (v) => String(v).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function sanitizeFilePart(value = '') {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-]/g, '')
    .slice(0, 42) || 'dashboard'
}

function buildNarrative(data, metricLabel) {
  if (!data.length) return []
  const total = data.reduce((acc, item) => acc + Number(item.total || 0), 0)
  const top = data[0]
  const second = data[1]
  const insights = []

  if (top) {
    const share = total ? (Number(top.total || 0) / total) * 100 : 0
    insights.push(`${top.label} lidera con ${formatNumber(top.total)} (${share.toFixed(1)}% del total ${metricLabel}).`)
  }

  if (top && second) {
    insights.push(`La brecha entre ${top.label} y ${second.label} es de ${formatNumber(Number(top.total || 0) - Number(second.total || 0))}.`)
  }

  const bottom = data[data.length - 1]
  if (bottom && bottom !== top) {
    insights.push(`${bottom.label} aparece como el valor mas bajo con ${formatNumber(bottom.total)}.`)
  }

  return insights.slice(0, 3)
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.82 }}>{label}</div>
      {children}
    </div>
  )
}

function Select({ value, onChange, children, colors, isDark }) {
  return (
    <select
      value={value}
      onChange={onChange}
      style={{
        width: '100%',
        padding: '10px 12px',
        borderRadius: 12,
        border: `1px solid ${colors.border}`,
        background: isDark ? '#0F2119' : '#fff',
        color: colors.text,
        fontSize: 14,
        outline: 'none',
      }}>
      {children}
    </select>
  )
}

function KpiCard({ title, value, subtitle, colors, isDark }) {
  return (
    <div style={{ border: `1px solid ${colors.border}`, background: isDark ? 'linear-gradient(160deg, #173226, #10231B)' : '#fff', borderRadius: 18, padding: 18, boxShadow: isDark ? '0 12px 28px rgba(0,0,0,0.22)' : '0 14px 30px rgba(0,0,0,0.06)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: colors.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{title}</div>
      <div style={{ marginTop: 10, fontSize: 30, lineHeight: 1, fontWeight: 800, color: colors.text }}>{value}</div>
      <div style={{ marginTop: 8, fontSize: 13, color: colors.dim }}>{subtitle}</div>
    </div>
  )
}

function HeroBarChart({ data, colors, isDark }) {
  const max = Math.max(...data.map((item) => Number(item.total || 0)), 1)
  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: 20, background: isDark ? 'linear-gradient(180deg,#13261E,#10211A)' : '#fff', padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: colors.text }}>Vista principal</div>
          <div style={{ fontSize: 13, color: colors.dim }}>Comparativo por categoria con lectura ejecutiva inmediata</div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {data.map((item, index) => (
          <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '220px 1fr 90px', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 13, color: colors.text, fontWeight: index === 0 ? 700 : 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{item.label}</div>
            <div style={{ height: 18, borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.06)' : '#EDF6EF', overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(6, (Number(item.total || 0) / max) * 100)}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${PALETTE[index % PALETTE.length]}, ${colors.accent3})`, boxShadow: 'inset 0 0 12px rgba(255,255,255,0.18)' }} />
            </div>
            <div style={{ fontSize: 13, color: colors.dim, fontWeight: 800, textAlign: 'right' }}>{formatNumber(item.total)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DonutSummary({ data, colors, isDark }) {
  const total = data.reduce((acc, item) => acc + Number(item.total || 0), 0)
  let cursor = 0
  const gradient = data.slice(0, 6).map((item, index) => {
    const ratio = total ? Number(item.total || 0) / total : 0
    const start = cursor * 360
    cursor += ratio
    const end = cursor * 360
    return `${PALETTE[index % PALETTE.length]} ${start}deg ${end}deg`
  }).join(', ')

  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: 20, background: isDark ? '#13251D' : '#fff', padding: 18 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: colors.text, marginBottom: 16 }}>Composicion</div>
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 18, alignItems: 'center' }}>
        <div style={{ width: 180, height: 180, borderRadius: '50%', background: `conic-gradient(${gradient || `${colors.accent} 0deg 360deg`})`, position: 'relative', margin: '0 auto' }}>
          <div style={{ position: 'absolute', inset: 34, borderRadius: '50%', background: isDark ? '#0E1E17' : '#fff', border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: colors.text }}>{formatNumber(total)}</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {data.slice(0, 6).map((item, index) => {
            const share = total ? (Number(item.total || 0) / total) * 100 : 0
            return (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', gap: 10, alignItems: 'center' }}>
                <span style={{ width: 12, height: 12, borderRadius: 4, background: PALETTE[index % PALETTE.length] }} />
                <span style={{ color: colors.text, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                <span style={{ color: colors.dim, fontSize: 13, fontWeight: 700 }}>{share.toFixed(1)}%</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function LineTrend({ data, colors, isDark }) {
  const max = Math.max(...data.map((item) => Number(item.total || 0)), 1)
  const points = data.map((item, index) => {
    const x = data.length > 1 ? (index / (data.length - 1)) * 100 : 50
    const y = 100 - ((Number(item.total || 0) / max) * 80 + 10)
    return { x, y, label: item.label, total: item.total }
  })
  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ')

  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: 20, background: isDark ? '#13251D' : '#fff', padding: 18 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: colors.text, marginBottom: 12 }}>Tendencia visual</div>
      <svg viewBox="0 0 100 100" style={{ width: '100%', height: 240 }}>
        <defs>
          <linearGradient id="dashboardLineFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={colors.accent3} stopOpacity="0.36" />
            <stop offset="100%" stopColor={colors.accent3} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline fill="none" stroke={colors.accent3} strokeWidth="2.5" points={polyline} />
        <polygon fill="url(#dashboardLineFill)" points={`0,100 ${polyline} 100,100`} />
        {points.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle cx={point.x} cy={point.y} r="2.1" fill={PALETTE[index % PALETTE.length]} />
          </g>
        ))}
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
        {points.slice(0, 6).map((point, index) => (
          <div key={`${point.label}-legend-${index}`} style={{ fontSize: 12, color: colors.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {point.label}: <strong style={{ color: colors.text }}>{formatNumber(point.total)}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function RankingTable({ data, dimension, metricLabel, colors, isDark }) {
  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: 20, background: isDark ? '#13251D' : '#fff', overflow: 'hidden' }}>
      <div style={{ padding: '16px 18px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: colors.text }}>Ranking tabular</div>
          <div style={{ fontSize: 13, color: colors.dim }}>Lista ordenada para lectura operativa y analitica</div>
        </div>
      </div>
      <div style={{ maxHeight: 360, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: isDark ? '#173126' : '#EEF7F0' }}>
              <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 12, color: colors.text }}>#</th>
              <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 12, color: colors.text }}>{dimension || 'Dimension'}</th>
              <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 12, color: colors.text }}>{metricLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={item.id} style={{ background: index % 2 ? (isDark ? '#11211A' : '#fff') : (isDark ? '#102019' : '#F9FCFA') }}>
                <td style={{ padding: '10px 12px', fontSize: 13, color: colors.dim, borderBottom: `1px solid ${colors.border}` }}>{index + 1}</td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: colors.text, fontWeight: 600, borderBottom: `1px solid ${colors.border}` }}>{item.label}</td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: colors.text, fontWeight: 700, borderBottom: `1px solid ${colors.border}`, textAlign: 'right' }}>{formatNumber(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function DashboardStudio({ open, onClose, tables, result, addToast, onAskAssistant, theme = 'light' }) {
  const isDark = theme === 'dark'
  const colors = isDark ? C.dark : C.light
  const reportRef = useRef(null)

  const [sourceType, setSourceType] = useState(result?.rows?.length ? 'result' : 'table')
  const [sourceName, setSourceName] = useState(result?.rows?.length ? '__current_result__' : (tables[0]?.name || ''))
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [reportTitle, setReportTitle] = useState('Reporte Ejecutivo')
  const [reportSubtitle, setReportSubtitle] = useState('Panel listo para compartir sin salir de NERV')
  const [dimension, setDimension] = useState('')
  const [metric, setMetric] = useState('')
  const [agg, setAgg] = useState('count')
  const [chartMode, setChartMode] = useState('bars')
  const [topN, setTopN] = useState(8)
  const [sortDir, setSortDir] = useState('desc')
  const [isCompactViewport, setIsCompactViewport] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return

    const updateViewport = () => {
      setIsCompactViewport(window.innerWidth < 1320 || window.innerHeight < 860)
    }

    updateViewport()
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [open])

  useEffect(() => {
    if (!open) return
    let active = true

    async function loadData() {
      setLoading(true)
      setError(null)
      try {
        if (sourceType === 'result' && result?.rows?.length) {
          if (active) setRows(result.rows)
          return
        }
        if (!sourceName) {
          if (active) setRows([])
          return
        }
        const query = await executeQuery(`SELECT * FROM "${sourceName}" LIMIT 5000;`)
        if (active) setRows(query.rows || [])
      } catch (caught) {
        if (active) {
          setRows([])
          setError(caught?.message || 'No se pudo cargar la fuente seleccionada.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    loadData()
    return () => { active = false }
  }, [open, sourceType, sourceName, result])

  const columns = useMemo(() => rows.length ? Object.keys(rows[0]) : [], [rows])
  const numericColumns = useMemo(() => columns.filter((col) => rows.some((row) => isNumeric(row[col]))), [columns, rows])

  useEffect(() => {
    if (!columns.length) return
    if (!dimension || !columns.includes(dimension)) setDimension(columns[0])
    if (numericColumns.length) {
      if (!metric || !numericColumns.includes(metric)) setMetric(numericColumns[0])
    } else {
      setMetric('')
      if (agg !== 'count') setAgg('count')
    }
  }, [columns, numericColumns, dimension, metric, agg])

  const aggregated = useMemo(() => aggregateRows(rows, dimension, agg === 'count' ? '' : metric, agg, topN, sortDir), [rows, dimension, metric, agg, topN, sortDir])
  const fullAggregated = useMemo(() => aggregateRows(rows, dimension, agg === 'count' ? '' : metric, agg, 25, sortDir), [rows, dimension, metric, agg, sortDir])
  const totalMetric = useMemo(() => aggregated.reduce((acc, item) => acc + Number(item.total || 0), 0), [aggregated])
  const distinctCount = useMemo(() => dimension ? new Set(rows.map((row) => String(row[dimension] ?? 'Sin dato'))).size : 0, [rows, dimension])
  const avgMetric = useMemo(() => aggregated.length ? totalMetric / aggregated.length : 0, [aggregated, totalMetric])
  const insights = useMemo(() => buildNarrative(aggregated, agg === 'count' ? 'conteo' : (metric || 'metrica')), [aggregated, agg, metric])
  const metricLabel = agg === 'count' ? 'Conteo' : `${agg.toUpperCase()} de ${metric || 'metrica'}`

  const sourceOptions = [
    ...(result?.rows?.length ? [{ value: '__current_result__', label: 'Resultado actual' }] : []),
    ...tables.map((table) => ({ value: table.name, label: table.name })),
  ]

  const exportRows = useMemo(() => fullAggregated.map((item) => ({
    [dimension || 'dimension']: item.label,
    valor: Number(item.total || 0),
    operacion: agg,
    metrica: metric || 'conteo',
  })), [fullAggregated, dimension, agg, metric])

  const canExport = exportRows.length > 0
  const stackLayout = isCompactViewport

  const exportBaseName = useMemo(() => {
    const sourceLabel = sourceName === '__current_result__' ? 'resultado_actual' : (sourceName || 'dashboard')
    const safeSource = sanitizeFilePart(sourceLabel)
    return `${safeSource}_${formatTimestamp()}`
  }, [sourceName])

  const handleExportCsv = () => {
    if (!canExport) {
      addToast?.('No hay datos para exportar.', 'info')
      return
    }
    const header = Object.keys(exportRows[0])
    const body = exportRows.map((row) => header.map((col) => {
      const value = String(row[col] ?? '')
      return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
    }).join(',')).join('\n')
    const blob = new Blob([[header.join(','), body].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${exportBaseName}_reporte.csv`
    anchor.click()
    URL.revokeObjectURL(url)
    addToast?.('Dashboard exportado en CSV', 'success')
  }

  const handleExportExcel = async () => {
    if (!canExport || !reportRef.current) {
      addToast?.('No hay datos para exportar.', 'info')
      return
    }
    try {
      const [{ default: ExcelJS }, { default: html2canvas }] = await Promise.all([
        import('exceljs'),
        import('html2canvas'),
      ])

      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'NERV Dashboard Studio'
      workbook.created = new Date()
      workbook.modified = new Date()

      const summarySheet = workbook.addWorksheet('Resumen Ejecutivo', {
        views: [{ showGridLines: false }],
      })
      summarySheet.columns = [
        { width: 28 },
        { width: 28 },
        { width: 28 },
        { width: 28 },
      ]

      summarySheet.mergeCells('A1:D1')
      summarySheet.getCell('A1').value = reportTitle || 'Reporte Ejecutivo'
      summarySheet.getCell('A1').font = { size: 20, bold: true, color: { argb: 'FF14532D' } }

      summarySheet.mergeCells('A2:D2')
      summarySheet.getCell('A2').value = reportSubtitle || 'Dashboard ejecutivo exportado desde NERV'
      summarySheet.getCell('A2').font = { size: 12, color: { argb: 'FF4B5563' } }

      summarySheet.getCell('A4').value = 'Fuente'
      summarySheet.getCell('B4').value = sourceName === '__current_result__' ? 'Resultado actual' : (sourceName || 'Sin fuente')
      summarySheet.getCell('C4').value = 'Dimension'
      summarySheet.getCell('D4').value = dimension || 'No definida'
      summarySheet.getCell('A5').value = 'Metrica'
      summarySheet.getCell('B5').value = metricLabel
      summarySheet.getCell('C5').value = 'Fecha'
      summarySheet.getCell('D5').value = new Date().toLocaleString('es-ES')

      ;['A4', 'C4', 'A5', 'C5'].forEach((ref) => {
        summarySheet.getCell(ref).font = { bold: true, color: { argb: 'FF166534' } }
      })

      const kpiRows = [
        ['Registros analizados', rows.length],
        ['Categorias detectadas', distinctCount],
        ['Total visible', totalMetric],
        ['Promedio visible', avgMetric],
      ]
      summarySheet.getCell('A7').value = 'KPIs'
      summarySheet.getCell('A7').font = { bold: true, size: 13, color: { argb: 'FF14532D' } }

      kpiRows.forEach(([label, value], index) => {
        const row = 8 + index
        summarySheet.getCell(`A${row}`).value = label
        summarySheet.getCell(`A${row}`).font = { bold: true, color: { argb: 'FF166534' } }
        summarySheet.getCell(`B${row}`).value = Number(value || 0)
        summarySheet.getCell(`B${row}`).numFmt = '#,##0.00'
      })

      summarySheet.getCell('A13').value = 'Insights Ejecutivos'
      summarySheet.getCell('A13').font = { bold: true, size: 13, color: { argb: 'FF14532D' } }
      ;(insights.length ? insights : ['Sin insights disponibles para la configuracion actual.']).forEach((item, index) => {
        const row = 14 + index
        summarySheet.mergeCells(`A${row}:D${row}`)
        summarySheet.getCell(`A${row}`).value = `• ${item}`
        summarySheet.getCell(`A${row}`).alignment = { vertical: 'top', wrapText: true }
        summarySheet.getRow(row).height = 24
      })

      const dataSheet = workbook.addWorksheet('Tabla Analitica')
      dataSheet.columns = [
        { header: dimension || 'dimension', key: 'dimension', width: 44 },
        { header: 'valor', key: 'valor', width: 20 },
        { header: 'operacion', key: 'operacion', width: 16 },
        { header: 'metrica', key: 'metrica', width: 24 },
      ]
      exportRows.forEach((row) => dataSheet.addRow(row))
      dataSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      dataSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF166534' },
      }

      dataSheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          }
          if (rowNumber > 1 && rowNumber % 2 === 0) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF7FBF7' },
            }
          }
        })
      })

      const visualSheet = workbook.addWorksheet('Dashboard Visual', {
        views: [{ showGridLines: false }],
      })
      visualSheet.columns = [{ width: 120 }]
      visualSheet.getCell('A1').value = 'Vista Visual del Dashboard'
      visualSheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF14532D' } }

      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: isDark ? '#0B1510' : '#FFFFFF',
        scale: 1.7,
        useCORS: true,
      })
      const imageId = workbook.addImage({
        base64: canvas.toDataURL('image/png'),
        extension: 'png',
      })

      const maxWidth = 1100
      const ratio = canvas.width > maxWidth ? maxWidth / canvas.width : 1
      visualSheet.addImage(imageId, {
        tl: { col: 0, row: 2 },
        ext: {
          width: Math.round(canvas.width * ratio),
          height: Math.round(canvas.height * ratio),
        },
      })

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${exportBaseName}_reporte_ejecutivo.xlsx`
      anchor.click()
      URL.revokeObjectURL(url)

      addToast?.('Reporte ejecutivo exportado en Excel', 'success')
    } catch (caught) {
      addToast?.(caught?.message || 'No se pudo exportar Excel.', 'error')
    }
  }

  const handleExportPdf = async () => {
    if (!canExport || !reportRef.current) {
      addToast?.('No hay reporte visual para exportar.', 'info')
      return
    }
    try {
      const { default: html2canvas } = await import('html2canvas')
      const { jsPDF } = await import('jspdf')

      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: isDark ? '#0B1510' : '#FFFFFF',
        scale: 2,
        useCORS: true,
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height)
      const renderWidth = canvas.width * ratio
      const renderHeight = canvas.height * ratio
      const offsetX = (pageWidth - renderWidth) / 2
      const offsetY = 18

      pdf.addImage(imgData, 'PNG', offsetX, offsetY, renderWidth, renderHeight)
      pdf.save(`${exportBaseName}_reporte_visual.pdf`)
      addToast?.('Reporte visual exportado en PDF', 'success')
    } catch (caught) {
      addToast?.(caught?.message || 'No se pudo exportar PDF.', 'error')
    }
  }

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto p-4"
        style={{ background: 'rgba(0,0,0,0.64)', backdropFilter: 'blur(10px)' }}
        onClick={(event) => { if (event.target === event.currentTarget) onClose?.() }}>

        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.985 }}
          transition={{ duration: 0.18 }}
          className="w-full rounded-[24px]"
          style={{
            display: 'grid',
            gridTemplateColumns: stackLayout ? 'minmax(0,1fr)' : '360px minmax(0,1fr)',
            alignItems: 'start',
            width: 'min(1540px, 100%)',
            margin: 'auto 0',
            background: `radial-gradient(circle at 100% 0%, ${isDark ? 'rgba(52,211,153,0.14)' : 'rgba(34,197,94,0.08)'}, transparent 34%), ${colors.bg}`,
            border: `1px solid ${colors.border}`,
            overflow: 'hidden',
          }}>

          <aside style={{ width: '100%', minWidth: 0, maxWidth: '100%', borderRight: stackLayout ? 'none' : `1px solid ${colors.border}`, borderBottom: stackLayout ? `1px solid ${colors.border}` : 'none', background: isDark ? '#0F2019' : '#F5FBF7', overflow: 'visible' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 2, padding: 18, borderBottom: `1px solid ${colors.border}`, background: isDark ? 'linear-gradient(140deg,#153126,#10231B)' : 'linear-gradient(140deg,#1B5E20,#2E7D32)', color: '#fff', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.05 }}>Dashboard Studio</div>
                <div style={{ fontSize: 13, opacity: 0.9, marginTop: 6 }}>Constructor visual para reportes ejecutivos reales</div>
              </div>
              <button onClick={onClose} title="Cerrar" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(255,255,255,0.28)', background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 20, lineHeight: '30px', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ padding: 16, display: 'grid', gap: 16, gridTemplateColumns: stackLayout ? 'repeat(auto-fit,minmax(220px,1fr))' : 'minmax(0,1fr)' }}>
              <Field label="Titulo del reporte">
                <input value={reportTitle} onChange={(event) => setReportTitle(event.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: `1px solid ${colors.border}`, background: isDark ? '#0F2119' : '#fff', color: colors.text, fontSize: 14 }} />
              </Field>

              <Field label="Subtitulo">
                <textarea value={reportSubtitle} onChange={(event) => setReportSubtitle(event.target.value)} rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: `1px solid ${colors.border}`, background: isDark ? '#0F2119' : '#fff', color: colors.text, fontSize: 14, resize: 'vertical' }} />
              </Field>

              <Field label="Fuente de datos">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button onClick={() => { setSourceType('result'); setSourceName('__current_result__') }} style={{ padding: '10px 12px', borderRadius: 12, border: `1px solid ${colors.border}`, background: sourceType === 'result' ? colors.panelAlt : (isDark ? '#0F2119' : '#fff'), color: colors.text, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Resultado</button>
                  <button onClick={() => { setSourceType('table'); setSourceName(tables[0]?.name || '') }} style={{ padding: '10px 12px', borderRadius: 12, border: `1px solid ${colors.border}`, background: sourceType === 'table' ? colors.panelAlt : (isDark ? '#0F2119' : '#fff'), color: colors.text, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Tabla</button>
                </div>
                <Select value={sourceName} onChange={(event) => setSourceName(event.target.value)} colors={colors} isDark={isDark}>
                  {sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </Field>

              <Field label="Dimension principal">
                <Select value={dimension} onChange={(event) => setDimension(event.target.value)} colors={colors} isDark={isDark}>
                  {columns.map((column) => <option key={column} value={column}>{column}</option>)}
                </Select>
              </Field>

              <Field label="Metrica">
                <Select value={metric} onChange={(event) => setMetric(event.target.value)} colors={colors} isDark={isDark}>
                  <option value="">Conteo simple</option>
                  {numericColumns.map((column) => <option key={column} value={column}>{column}</option>)}
                </Select>
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Operacion">
                  <Select value={agg} onChange={(event) => setAgg(event.target.value)} colors={colors} isDark={isDark}>
                    <option value="count">Conteo</option>
                    <option value="sum">Suma</option>
                    <option value="avg">Promedio</option>
                    <option value="max">Maximo</option>
                    <option value="min">Minimo</option>
                  </Select>
                </Field>
                <Field label="Visual principal">
                  <Select value={chartMode} onChange={(event) => setChartMode(event.target.value)} colors={colors} isDark={isDark}>
                    <option value="bars">Barras</option>
                    <option value="line">Tendencia</option>
                    <option value="donut">Composicion</option>
                  </Select>
                </Field>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Top visible">
                  <Select value={String(topN)} onChange={(event) => setTopN(Number(event.target.value))} colors={colors} isDark={isDark}>
                    {[5, 8, 10, 12, 15].map((value) => <option key={value} value={value}>{value}</option>)}
                  </Select>
                </Field>
                <Field label="Orden">
                  <Select value={sortDir} onChange={(event) => setSortDir(event.target.value)} colors={colors} isDark={isDark}>
                    <option value="desc">Mayor a menor</option>
                    <option value="asc">Menor a mayor</option>
                  </Select>
                </Field>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                <button onClick={() => onAskAssistant?.(`Analiza el dashboard actual con dimension ${dimension} y metrica ${metric || 'conteo'}. Dame hallazgos ejecutivos y riesgos.`)} style={{ padding: '11px 12px', borderRadius: 12, border: `1px solid ${colors.border}`, background: isDark ? '#13261E' : '#fff', color: colors.text, fontSize: 13, textAlign: 'left', cursor: 'pointer', fontWeight: 700 }}>IA: hallazgos ejecutivos</button>
                <button onClick={() => onAskAssistant?.(`Quiero un resumen gerencial del reporte ${reportTitle}. Resume oportunidades, desviaciones y siguientes pasos.`)} style={{ padding: '11px 12px', borderRadius: 12, border: `1px solid ${colors.border}`, background: isDark ? '#13261E' : '#fff', color: colors.text, fontSize: 13, textAlign: 'left', cursor: 'pointer', fontWeight: 700 }}>IA: resumen para gerencia</button>
              </div>

              <div style={{ display: 'grid', gap: 8, alignSelf: 'end' }}>
                <button onClick={handleExportCsv} disabled={!canExport} style={{ padding: '11px 12px', borderRadius: 12, border: `1px solid ${colors.border}`, background: canExport ? '#fff' : colors.panelSoft, color: canExport ? '#163728' : colors.muted, fontSize: 13, fontWeight: 800, cursor: canExport ? 'pointer' : 'not-allowed' }}>Exportar CSV</button>
                <button onClick={handleExportExcel} disabled={!canExport} style={{ padding: '11px 12px', borderRadius: 12, border: `1px solid ${colors.border}`, background: canExport ? '#fff' : colors.panelSoft, color: canExport ? '#163728' : colors.muted, fontSize: 13, fontWeight: 800, cursor: canExport ? 'pointer' : 'not-allowed' }}>Exportar Excel</button>
                <button onClick={handleExportPdf} disabled={!canExport} style={{ padding: '11px 12px', borderRadius: 12, border: 'none', background: canExport ? `linear-gradient(135deg, ${colors.accent}, ${colors.accent2})` : colors.panelSoft, color: canExport ? '#fff' : colors.muted, fontSize: 13, fontWeight: 800, cursor: canExport ? 'pointer' : 'not-allowed' }}>Exportar PDF visual</button>
              </div>
            </div>
          </aside>

          <main style={{ minWidth: 0, overflow: 'visible', padding: 18 }}>
            {loading && <div style={{ fontSize: 16, color: colors.text }}>Cargando dashboard...</div>}
            {error && <div style={{ fontSize: 15, color: '#DC2626' }}>{error}</div>}

            {!loading && !error && (
              <div ref={reportRef} style={{ display: 'grid', gap: 16, background: isDark ? '#0B1510' : '#fff', borderRadius: 24, padding: 18, minWidth: 0 }}>
                <section style={{ border: `1px solid ${colors.border}`, borderRadius: 22, background: isDark ? 'linear-gradient(150deg,#153126,#10231B)' : 'linear-gradient(150deg,#FFFFFF,#F4FBF6)', padding: 22 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 30, fontWeight: 900, color: colors.text, lineHeight: 1.05 }}>{reportTitle}</div>
                      <div style={{ marginTop: 8, maxWidth: 760, fontSize: 14, lineHeight: 1.6, color: colors.dim }}>{reportSubtitle}</div>
                    </div>
                    <div style={{ minWidth: 260, display: 'grid', gap: 6, fontSize: 13, color: colors.dim }}>
                      <div><strong style={{ color: colors.text }}>Fuente:</strong> {sourceName === '__current_result__' ? 'Resultado actual' : (sourceName || 'Sin fuente')}</div>
                      <div><strong style={{ color: colors.text }}>Dimension:</strong> {dimension || 'No definida'}</div>
                      <div><strong style={{ color: colors.text }}>Metrica:</strong> {metricLabel}</div>
                    </div>
                  </div>
                </section>

                <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
                  <KpiCard title="Registros" value={formatNumber(rows.length)} subtitle="filas analizadas" colors={colors} isDark={isDark} />
                  <KpiCard title="Categorias" value={formatNumber(distinctCount)} subtitle={dimension || 'dimension'} colors={colors} isDark={isDark} />
                  <KpiCard title="Total visible" value={formatNumber(totalMetric)} subtitle={metricLabel} colors={colors} isDark={isDark} />
                  <KpiCard title="Promedio" value={formatNumber(avgMetric)} subtitle="por categoria visible" colors={colors} isDark={isDark} />
                </section>

                <section style={{ display: 'grid', gridTemplateColumns: stackLayout ? 'minmax(0,1fr)' : 'minmax(0, 1.45fr) minmax(320px, 0.95fr)', gap: 16 }}>
                  {chartMode === 'line' ? (
                    <LineTrend data={aggregated} colors={colors} isDark={isDark} />
                  ) : chartMode === 'donut' ? (
                    <DonutSummary data={aggregated} colors={colors} isDark={isDark} />
                  ) : (
                    <HeroBarChart data={aggregated} colors={colors} isDark={isDark} />
                  )}

                  <div style={{ display: 'grid', gap: 16 }}>
                    <DonutSummary data={aggregated} colors={colors} isDark={isDark} />
                    <div style={{ border: `1px solid ${colors.border}`, borderRadius: 20, background: isDark ? '#13251D' : '#fff', padding: 18 }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: colors.text, marginBottom: 12 }}>Lectura ejecutiva</div>
                      <div style={{ display: 'grid', gap: 10 }}>
                        {insights.map((insight, index) => (
                          <div key={index} style={{ padding: '12px 14px', borderRadius: 14, background: isDark ? '#102019' : '#F5FBF7', border: `1px solid ${colors.border}`, fontSize: 13, lineHeight: 1.6, color: colors.text }}>
                            {insight}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                <section style={{ display: 'grid', gridTemplateColumns: stackLayout ? 'minmax(0,1fr)' : 'minmax(0, 1.1fr) minmax(320px, 0.9fr)', gap: 16 }}>
                  <RankingTable data={fullAggregated} dimension={dimension} metricLabel={metricLabel} colors={colors} isDark={isDark} />
                  <LineTrend data={aggregated} colors={colors} isDark={isDark} />
                </section>
              </div>
            )}
          </main>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}