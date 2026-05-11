import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { executeQuery } from '../../lib/duckdb'

const spring = { type: 'spring', stiffness: 320, damping: 28 }
const G = { dark: '#0D4F1E', primary: '#2E7D32', accent: '#4CAF50', light: '#E8F5E9', panel: '#F7FBF7', border: '#C8DCC8', text: '#1B3318', dim: '#5D7D5F' }

const TEMPLATES = {
  indicadores: { dashboardTitle: '📊 Dashboard de Indicadores en Salud', chartTitle: 'Comportamiento Principal', distributionTitle: 'Distribución de Casos', pivotTitle: 'Análisis Dinámico' },
  auditoria: { dashboardTitle: '🔍 Dashboard de Auditoría y Cumplimiento', chartTitle: 'Hallazgos por Prioridad', distributionTitle: 'Distribución por Estado', pivotTitle: 'Análisis de Auditoría' },
  requerimientos: { dashboardTitle: '✓ Dashboard de Requerimientos y Gestión', chartTitle: 'Seguimiento Operativo', distributionTitle: 'Distribución por Responsable', pivotTitle: 'Análisis de Requerimientos' },
  informes: { dashboardTitle: '📈 Dashboard Ejecutivo de Informes', chartTitle: 'Resumen Analítico', distributionTitle: 'Composición del Resultado', pivotTitle: 'Análisis Ejecutivo' },
}

function isNumeric(v) { return v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v)) }

function groupRows(rows, rowField, columnField, metricField, agg) {
  const grouped = new Map()
  rows.forEach((row) => {
    const key = String(row[rowField] ?? 'Sin dato')
    const columnKey = columnField ? String(row[columnField] ?? 'Sin dato') : 'Valor'
    const metric = metricField ? Number(row[metricField] ?? 0) : 1
    if (!grouped.has(key)) grouped.set(key, new Map())
    const rowBucket = grouped.get(key)
    if (!rowBucket.has(columnKey)) rowBucket.set(columnKey, [])
    rowBucket.get(columnKey).push(metric)
  })
  const reducers = { count: (v) => v.length, sum: (v) => v.reduce((a, x) => a + x, 0), avg: (v) => v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0, max: (v) => v.length ? Math.max(...v) : 0, min: (v) => v.length ? Math.min(...v) : 0 }
  const reduce = reducers[agg] || reducers.count
  return Array.from(grouped.entries()).map(([label, valuesMap]) => {
    const values = Object.fromEntries(Array.from(valuesMap.entries()).map(([k, b]) => [k, reduce(b)]))
    const total = Object.values(values).reduce((a, v) => a + Number(v || 0), 0)
    return { label, values, total }
  }).sort((a, b) => b.total - a.total)
}

function KpiCardPro({ title, value, subtitle, trend, color = '#2E7D32' }) {
  const isPositive = trend > 0
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="group relative overflow-hidden rounded-2xl border px-5 py-4 transition-all hover:scale-105 hover:shadow-lg" style={{ background: '#fff', borderColor: G.border, boxShadow: '0 4px 16px rgba(31,107,53,0.08)' }}>
      <div className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100" style={{ background: `linear-gradient(135deg, ${color}08, transparent)` }} />
      <div className="relative">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: G.dim }}>⎯ {title}</div>
        <div className="mt-2 flex items-end gap-3">
          <div className="text-4xl font-black" style={{ color }}>{value}</div>
          {trend !== undefined && <div className="mb-1 text-xs font-bold" style={{ color: isPositive ? '#2E7D32' : '#C62828' }}>{isPositive ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%</div>}
        </div>
        <div className="mt-2 text-[11px]" style={{ color: G.dim }}>{subtitle}</div>
      </div>
    </motion.div>
  )
}

function AdvancedBarChart({ data, title }) {
  const max = Math.max(...data.map((i) => i.total), 1)
  const colors = ['#2E7D32', '#43A047', '#66BB6A', '#81C784', '#A5D6A7', '#C8E6C9']
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-[20px] border p-6" style={{ background: '#fff', borderColor: G.border, boxShadow: '0 6px 20px rgba(46,125,50,0.1)' }}>
      <div className="mb-6 flex items-center justify-between">
        <div className="text-lg font-black" style={{ color: G.dark }}>📊 {title}</div>
        <div className="text-xs" style={{ color: G.dim }}>{data.length} elementos</div>
      </div>
      <div className="space-y-4">
        {data.slice(0, 8).map((item, idx) => (
          <motion.div key={`${item.label}-${idx}`} initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ delay: idx * 0.05 }}>
            <div className="mb-1.5 flex items-center justify-between text-xs font-semibold" style={{ color: G.text }}>
              <span className="truncate pr-3 max-w-[60%]">{item.label}</span>
              <span style={{ color: colors[idx % colors.length] }}>{item.total.toLocaleString()}</span>
            </div>
            <div className="h-4 overflow-hidden rounded-full" style={{ background: '#E5EFE5' }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${(item.total / max) * 100}%` }} transition={{ delay: idx * 0.05 + 0.2, duration: 0.8 }} style={{ background: `linear-gradient(90deg, ${colors[idx % colors.length]}, ${colors[(idx + 1) % colors.length]})`, height: '100%', borderRadius: '9999px', boxShadow: `0 0 12px ${colors[idx % colors.length]}40` }} />
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

function AdvancedDonutChart({ data, title }) {
  const total = data.reduce((a, i) => a + i.total, 0) || 1
  const colors = ['#0D4F1E', '#2E7D32', '#43A047', '#66BB6A', '#81C784', '#A5D6A7']
  let offset = 0
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-[20px] border p-6" style={{ background: '#fff', borderColor: G.border, boxShadow: '0 6px 20px rgba(46,125,50,0.1)' }}>
      <div className="mb-6 text-lg font-black" style={{ color: G.dark }}>🎯 {title}</div>
      <div className="flex items-center justify-between gap-6">
        <svg width="160" height="160" viewBox="0 0 160 160" style={{ filter: 'drop-shadow(0 4px 12px rgba(46,125,50,0.15))' }}>
          <g transform="translate(80 80)">
            {data.slice(0, 6).map((item, idx) => {
              const portion = item.total / total
              const length = portion * 282.743
              const curr = offset
              offset += length
              return (
                <motion.circle key={`${item.label}-${idx}`} initial={{ strokeDashoffset: 282.743 }} animate={{ strokeDashoffset: -curr }} transition={{ delay: idx * 0.1, duration: 0.8 }} r="45" cx="0" cy="0" fill="transparent" stroke={colors[idx % colors.length]} strokeWidth="26" strokeDasharray={`${length} ${282.743 - length}`} transform="rotate(-90)" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }} />
              )
            })}
            <circle r="24" fill="#fff" />
            <text textAnchor="middle" y="-2" fontSize="20" fontWeight="900" fill={G.dark}>{data.length}</text>
            <text textAnchor="middle" y="14" fontSize="9" fill={G.dim}>categorías</text>
          </g>
        </svg>
        <div className="space-y-3">
          {data.slice(0, 6).map((item, idx) => (
            <motion.div key={`legend-${idx}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05 }} className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full" style={{ background: colors[idx % colors.length], boxShadow: `0 2px 8px ${colors[idx % colors.length]}40` }} />
              <span className="text-xs font-semibold" style={{ color: G.text }}>{item.label}</span>
              <span className="ml-auto text-xs font-black" style={{ color: colors[idx % colors.length] }}>{((item.total / total) * 100).toFixed(1)}%</span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

function AreaChart({ data, title }) {
  const width = 540
  const height = 240
  const values = data.slice(0, 12).map((i) => i.total)
  const max = Math.max(...values, 1)
  const points = values.map((v, idx) => {
    const x = (idx / Math.max(values.length - 1, 1)) * (width - 40) + 20
    const y = height - ((v / max) * (height - 40) + 20)
    return `${x},${y}`
  }).join(' ')
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-[20px] border p-6" style={{ background: '#fff', borderColor: G.border, boxShadow: '0 6px 20px rgba(46,125,50,0.1)' }}>
      <div className="mb-6 text-lg font-black" style={{ color: G.dark }}>📈 {title}</div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2E7D32" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#2E7D32" stopOpacity="0" />
          </linearGradient>
          <filter id="chartShadow"><feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.2" /></filter>
        </defs>
        <motion.polyline initial={{ strokeDashoffset: 500 }} animate={{ strokeDashoffset: 0 }} transition={{ duration: 1.2 }} fill="none" stroke="#2E7D32" strokeWidth="3" points={points} filter="url(#chartShadow)" strokeDasharray="500" />
        <polygon fill="url(#areaFill)" points={`${points} ${width - 20},${height - 20} 20,${height - 20}`} />
      </svg>
    </motion.div>
  )
}

export default function DashboardStudio({ open, onClose, tables, result, addToast, onAskAssistant }) {
  const [sourceType, setSourceType] = useState(result?.rows?.length ? 'result' : 'table')
  const [sourceName, setSourceName] = useState(result?.rows?.length ? '__current_result__' : (tables[0]?.name || ''))
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [templateKey, setTemplateKey] = useState('indicadores')
  const [titles, setTitles] = useState(TEMPLATES.indicadores)
  const [rowField, setRowField] = useState('')
  const [columnField, setColumnField] = useState('')
  const [metricField, setMetricField] = useState('')
  const [agg, setAgg] = useState('count')
  const [chartType, setChartType] = useState('bar')
  const [exportingImage, setExportingImage] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [labels, setLabels] = useState({
    kpiSection: 'Indicadores clave',
    chartsSection: 'Visualizaciones analiticas',
    tableSection: 'Analisis de Auditoria',
  })
  const [paragraphs, setParagraphs] = useState({
    intro: 'Panel ejecutivo configurable para indicadores, auditorias, requerimientos e informes. Ajusta dimensiones, metricas y narrativa para cada audiencia.',
    analysis: 'Lectura recomendada: identifica categorias de mayor impacto y valida tendencias con la tabla dinamica para soportar decisiones rapidas.',
    notes: 'Nota del informe: personaliza estos parrafos para contexto operativo, riesgos detectados, acciones propuestas y responsables.',
  })

  useEffect(() => {
    setTitles(TEMPLATES[templateKey])
  }, [templateKey])

  useEffect(() => {
    if (!open) return
    let active = true
    async function loadSource() {
      setLoading(true)
      setError(null)
      try {
        if (sourceType === 'result' && result?.rows?.length) {
          if (!active) return
          setRows(result.rows)
          return
        }
        if (!sourceName) {
          setRows([])
          return
        }
        const response = await executeQuery(`SELECT * FROM "${sourceName}" LIMIT 1500;`)
        if (!active) return
        setRows(response.rows || [])
      } catch (caught) {
        if (!active) return
        setError(caught?.message || 'No pude cargar la fuente para el dashboard.')
        setRows([])
      } finally {
        if (active) setLoading(false)
      }
    }
    loadSource()
    return () => { active = false }
  }, [open, result, sourceName, sourceType])

  const columns = useMemo(() => rows.length ? Object.keys(rows[0]) : [], [rows])
  const numericColumns = useMemo(() => columns.filter((column) => rows.some((row) => isNumeric(row[column]))), [columns, rows])

  useEffect(() => {
    if (!columns.length) return
    if (!rowField || !columns.includes(rowField)) setRowField(columns[0])
    if (numericColumns.length && (!metricField || !numericColumns.includes(metricField))) setMetricField(numericColumns[0])
    if (!columnField || !columns.includes(columnField)) setColumnField(columns[1] || '')
  }, [columns, rowField, columnField, metricField, numericColumns])

  const grouped = useMemo(() => {
    if (!rows.length || !rowField) return []
    return groupRows(rows, rowField, columnField, agg === 'count' ? null : metricField, agg)
  }, [rows, rowField, columnField, metricField, agg])

  const kpis = useMemo(() => {
    const totalRows = rows.length
    const distinct = rowField ? new Set(rows.map((row) => String(row[rowField] ?? 'Sin dato'))).size : 0
    const numericValues = metricField ? rows.map((row) => Number(row[metricField] || 0)).filter((value) => !Number.isNaN(value)) : []
    const total = numericValues.reduce((acc, value) => acc + value, 0)
    const avg = numericValues.length ? total / numericValues.length : 0
    return [
      { title: 'Registros', value: totalRows.toLocaleString(), subtitle: 'base analizada' },
      { title: 'Categorias', value: distinct.toLocaleString(), subtitle: rowField || 'sin dimension' },
      { title: 'Total', value: total.toLocaleString(undefined, { maximumFractionDigits: 1 }), subtitle: metricField || 'conteo' },
      { title: 'Promedio', value: avg.toLocaleString(undefined, { maximumFractionDigits: 1 }), subtitle: metricField || 'conteo' },
    ]
  }, [rows, rowField, metricField])

  const anomalyHighlights = useMemo(() => {
    if (!rows.length || !columns.length) return []
    const findings = []
    const totalRows = rows.length

    // Alta nulidad
    columns.forEach((col) => {
      const nulls = rows.filter(r => r[col] === null || r[col] === undefined || String(r[col]).trim() === '').length
      const pct = totalRows > 0 ? (nulls / totalRows) * 100 : 0
      if (pct >= 35) findings.push({ level: 'critico', text: `${col}: ${pct.toFixed(1)}% vacíos` })
    })

    // Categorías dominantes
    if (grouped.length > 0) {
      const total = grouped.reduce((a, g) => a + Number(g.total || 0), 0)
      const top = grouped[0]
      const topPct = total > 0 ? (Number(top.total || 0) / total) * 100 : 0
      if (topPct >= 65) findings.push({ level: 'atencion', text: `Alta concentración en "${top.label}" (${topPct.toFixed(1)}%)` })
    }

    if (!findings.length) findings.push({ level: 'ok', text: 'Sin anomalías críticas visibles en la vista actual.' })
    return findings.slice(0, 4)
  }, [rows, columns, grouped])

  const narrativeInsight = useMemo(() => {
    if (!grouped.length) return 'Sin datos suficientes para generar narrativa automática.'
    const top = grouped[0]
    const second = grouped[1]
    const total = grouped.reduce((acc, item) => acc + Number(item.total || 0), 0)
    const topPct = total > 0 ? ((Number(top.total || 0) / total) * 100).toFixed(1) : '0.0'
    const gap = second ? Number(top.total || 0) - Number(second.total || 0) : Number(top.total || 0)
    return `Hallazgo principal: "${top.label}" lidera con ${Number(top.total || 0).toLocaleString()} (${topPct}% del total). Brecha vs segundo lugar: ${gap.toLocaleString()}.`
  }, [grouped])

  const dashboardAssistantPrompts = useMemo(() => {
    const sourceLabel = sourceName === '__current_result__' ? 'resultado actual' : sourceName
    return [
      `Analiza este dashboard de ${sourceLabel}. Quiero 5 hallazgos ejecutivos con impacto y riesgo.`,
      `Resume este dashboard para directivos en lenguaje simple y claro en maximo 6 lineas.`,
      `Propón 3 decisiones accionables basadas en este dashboard y qué validar después.`,
    ]
  }, [sourceName])

  const applyAutoNarrative = () => {
    setParagraphs((prev) => ({
      ...prev,
      analysis: narrativeInsight,
      notes: `Recomendación: validar la categoría "${grouped[0]?.label || 'principal'}" y revisar causas en las dimensiones con menor desempeño.`,
    }))
    addToast?.('Narrativa automática aplicada', 'success', 'Dashboard Studio')
  }

  const sourceOptions = [
    ...(result?.rows?.length ? [{ value: '__current_result__', label: 'Resultado actual' }] : []),
    ...tables.map((table) => ({ value: table.name, label: table.name })),
  ]

  const getDashboardCanvas = async () => {
    const target = document.querySelector('[data-dashboard-export]')
    if (!target) throw new Error('No se encontro el panel para exportar.')
    const { default: html2canvas } = await import('html2canvas')
    return html2canvas(target, {
      backgroundColor: '#F4F7F4',
      scale: 2.5,
      useCORS: true,
      logging: false,
      windowWidth: target.scrollWidth,
      windowHeight: target.scrollHeight,
      scrollX: 0,
      scrollY: -window.scrollY,
    })
  }

  const safeFileName = (base) => (base || 'dashboard').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase()

  const handleExportDashboard = async () => {
    try {
      setExportingPdf(true)
      const canvas = await getDashboardCanvas()
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfWidth = 210
      const pdfHeight = 297
      const margin = 8
      const usableWidth = pdfWidth - margin * 2
      const usableHeight = pdfHeight - margin * 2
      const imgWidth = canvas.width
      const imgHeight = canvas.height
      const pageHeightPx = Math.floor((usableHeight * imgWidth) / usableWidth)
      const pageCanvas = document.createElement('canvas')
      const pageCtx = pageCanvas.getContext('2d')
      let rendered = 0
      let page = 0

      while (rendered < imgHeight) {
        const thisPageHeight = Math.min(pageHeightPx, imgHeight - rendered)
        pageCanvas.width = imgWidth
        pageCanvas.height = thisPageHeight
        pageCtx.clearRect(0, 0, pageCanvas.width, pageCanvas.height)
        pageCtx.drawImage(canvas, 0, rendered, imgWidth, thisPageHeight, 0, 0, imgWidth, thisPageHeight)
        const imgData = pageCanvas.toDataURL('image/png')
        if (page > 0) pdf.addPage()
        const renderHeightMm = (thisPageHeight * usableWidth) / imgWidth
        pdf.addImage(imgData, 'PNG', margin, margin, usableWidth, renderHeightMm)
        rendered += thisPageHeight
        page += 1
      }

      pdf.save(`${safeFileName(titles.dashboardTitle)}_${Date.now()}.pdf`)
      addToast?.('PDF exportado con apariencia fiel al dashboard', 'success', 'Dashboard Studio')
    } catch (caught) {
      addToast?.(caught?.message || 'No se pudo exportar PDF', 'error', 'Dashboard Studio')
    } finally {
      setExportingPdf(false)
    }
  }

  const handleExportPng = async () => {
    try {
      setExportingImage(true)
      const canvas = await getDashboardCanvas()
      const link = document.createElement('a')
      link.download = `${safeFileName(titles.dashboardTitle)}_${Date.now()}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      addToast?.('Imagen PNG exportada correctamente', 'success', 'Dashboard Studio')
    } catch (caught) {
      addToast?.(caught?.message || 'No se pudo exportar la imagen PNG', 'error', 'Dashboard Studio')
    } finally {
      setExportingImage(false)
    }
  }

  const handlePrintDashboard = async () => {
    try {
      setPrinting(true)
      const canvas = await getDashboardCanvas()
      const imgData = canvas.toDataURL('image/png')
      const printWindow = window.open('', '', 'height=900,width=1200')
      if (!printWindow) throw new Error('No se pudo abrir la ventana de impresion.')
      printWindow.document.write(`<html><head><title>${titles.dashboardTitle}</title><style>html,body{margin:0;padding:0;background:#fff}img{width:100%;height:auto;display:block}@page{size:A4;margin:8mm}</style></head><body><img src="${imgData}" alt="Dashboard" /></body></html>`)
      printWindow.document.close()
      setTimeout(() => {
        printWindow.focus()
        printWindow.print()
      }, 300)
    } catch (caught) {
      addToast?.(caught?.message || 'No se pudo imprimir el dashboard', 'error', 'Dashboard Studio')
    } finally {
      setPrinting(false)
    }
  }

  const chart = chartType === 'line'
    ? <AreaChart data={grouped} title={titles.chartTitle} />
    : chartType === 'donut'
      ? <AdvancedDonutChart data={grouped} title={titles.distributionTitle} />
      : <AdvancedBarChart data={grouped} title={titles.chartTitle} />

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[75] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
        <motion.div initial={{ scale: 0.96, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.98, opacity: 0, y: 12 }} transition={spring} className="flex h-[90vh] w-full max-w-[1400px] overflow-hidden rounded-[28px] border" style={{ background: G.panel, borderColor: G.border, boxShadow: '0 26px 70px rgba(0,0,0,0.28)' }}>
          <div className="flex w-[360px] shrink-0 flex-col border-r" style={{ borderColor: G.border, background: '#F3FAF3' }}>
            <div className="border-b px-6 py-5" style={{ borderColor: G.border, background: 'linear-gradient(135deg, #1F6B35 0%, #2E7D32 100%)' }}>
              <div className="text-xl font-black text-white">Dashboard Studio</div>
              <div className="mt-1 text-xs text-white/75">Constructor profesional de reportes, tablas dinámicas y gráficos</div>
            </div>
            <div className="space-y-5 overflow-y-auto p-5 text-sm">
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: G.dim }}>Fuente</div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setSourceType('result'); setSourceName('__current_result__') }} className="rounded-xl border px-3 py-2 text-left" style={{ borderColor: sourceType === 'result' ? G.primary : G.border, background: sourceType === 'result' ? G.light : '#fff' }}>Resultado actual</button>
                  <button onClick={() => { setSourceType('table'); setSourceName(tables[0]?.name || '') }} className="rounded-xl border px-3 py-2 text-left" style={{ borderColor: sourceType === 'table' ? G.primary : G.border, background: sourceType === 'table' ? G.light : '#fff' }}>Tabla cargada</button>
                </div>
                <select value={sourceName} onChange={(event) => setSourceName(event.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2.5 outline-none" style={{ borderColor: G.border, background: '#fff' }}>
                  {sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>

              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: G.dim }}>Plantilla</div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.keys(TEMPLATES).map((key) => (
                    <button key={key} onClick={() => setTemplateKey(key)} className="rounded-xl border px-3 py-2 text-left capitalize" style={{ borderColor: templateKey === key ? G.primary : G.border, background: templateKey === key ? G.light : '#fff' }}>{key}</button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: G.dim }}>Tabla dinámica</div>
                <div className="space-y-2">
                  <select value={rowField} onChange={(event) => setRowField(event.target.value)} className="w-full rounded-xl border px-3 py-2.5 outline-none" style={{ borderColor: G.border, background: '#fff' }}>
                    {columns.map((column) => <option key={column} value={column}>Filas: {column}</option>)}
                  </select>
                  <select value={columnField} onChange={(event) => setColumnField(event.target.value)} className="w-full rounded-xl border px-3 py-2.5 outline-none" style={{ borderColor: G.border, background: '#fff' }}>
                    <option value="">Columnas: ninguna</option>
                    {columns.map((column) => <option key={column} value={column}>Columnas: {column}</option>)}
                  </select>
                  <select value={metricField} onChange={(event) => setMetricField(event.target.value)} className="w-full rounded-xl border px-3 py-2.5 outline-none" style={{ borderColor: G.border, background: '#fff' }}>
                    <option value="">Valor: conteo</option>
                    {numericColumns.map((column) => <option key={column} value={column}>Valor: {column}</option>)}
                  </select>
                  <select value={agg} onChange={(event) => setAgg(event.target.value)} className="w-full rounded-xl border px-3 py-2.5 outline-none" style={{ borderColor: G.border, background: '#fff' }}>
                    <option value="count">Operacion: Conteo</option>
                    <option value="sum">Operacion: Suma</option>
                    <option value="avg">Operacion: Promedio</option>
                    <option value="max">Operacion: Maximo</option>
                    <option value="min">Operacion: Minimo</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: G.dim }}>Gráfico principal</div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'bar', label: 'Barras' },
                    { value: 'line', label: 'Línea' },
                    { value: 'donut', label: 'Donut' },
                  ].map((option) => (
                    <button key={option.value} onClick={() => setChartType(option.value)} className="rounded-xl border px-3 py-2" style={{ borderColor: chartType === option.value ? G.primary : G.border, background: chartType === option.value ? G.light : '#fff' }}>{option.label}</button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: G.dim }}>Textos editables</div>
                <div className="space-y-2">
                  {[
                    ['dashboardTitle', 'Título del dashboard'],
                    ['chartTitle', 'Título gráfico principal'],
                    ['distributionTitle', 'Título gráfico secundario'],
                    ['pivotTitle', 'Título tabla dinámica'],
                  ].map(([key, label]) => (
                    <input key={key} value={titles[key]} onChange={(event) => setTitles((prev) => ({ ...prev, [key]: event.target.value }))} className="w-full rounded-xl border px-3 py-2.5 outline-none" style={{ borderColor: G.border, background: '#fff' }} placeholder={label} />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: G.dim }}>Nombres de secciones</div>
                <div className="space-y-2">
                  {[['kpiSection', 'Seccion KPIs'], ['chartsSection', 'Seccion graficos'], ['tableSection', 'Seccion tabla']].map(([key, label]) => (
                    <input key={key} value={labels[key]} onChange={(event) => setLabels((prev) => ({ ...prev, [key]: event.target.value }))} className="w-full rounded-xl border px-3 py-2.5 outline-none" style={{ borderColor: G.border, background: '#fff' }} placeholder={label} />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: G.dim }}>Parrafos del reporte</div>
                <div className="space-y-2">
                  <textarea value={paragraphs.intro} onChange={(event) => setParagraphs((prev) => ({ ...prev, intro: event.target.value }))} className="min-h-[90px] w-full rounded-xl border px-3 py-2.5 outline-none" style={{ borderColor: G.border, background: '#fff' }} placeholder="Parrafo de introduccion" />
                  <textarea value={paragraphs.analysis} onChange={(event) => setParagraphs((prev) => ({ ...prev, analysis: event.target.value }))} className="min-h-[90px] w-full rounded-xl border px-3 py-2.5 outline-none" style={{ borderColor: G.border, background: '#fff' }} placeholder="Parrafo de analisis" />
                  <textarea value={paragraphs.notes} onChange={(event) => setParagraphs((prev) => ({ ...prev, notes: event.target.value }))} className="min-h-[90px] w-full rounded-xl border px-3 py-2.5 outline-none" style={{ borderColor: G.border, background: '#fff' }} placeholder="Parrafo de recomendaciones o notas" />
                </div>
                <button onClick={applyAutoNarrative} className="mt-2 w-full rounded-xl border px-3 py-2 text-xs font-semibold" style={{ borderColor: '#A5D6A7', color: G.dark, background: '#F1F8F1' }}>
                  Generar narrativa automatica
                </button>
              </div>

              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: G.dim }}>Copiloto del dashboard</div>
                <div className="rounded-xl border p-3" style={{ borderColor: '#BBDEFB', background: '#E8F4FD' }}>
                  <div className="text-[11px] leading-relaxed" style={{ color: '#0D47A1' }}>Envía este contexto al asistente virtual y obtén diagnóstico, resumen ejecutivo o decisiones sugeridas.</div>
                  <div className="mt-2 grid grid-cols-1 gap-2">
                    {dashboardAssistantPrompts.map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => onAskAssistant?.(prompt)}
                        className="rounded-lg border px-3 py-2 text-left text-[11px]"
                        style={{ borderColor: '#90CAF9', background: '#fff', color: '#0D47A1' }}
                      >
                        {idx === 0 ? 'Diagnóstico ejecutivo' : idx === 1 ? 'Resumen para directivos' : 'Decisiones accionables'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button onClick={handleExportDashboard} disabled={exportingPdf} className="rounded-xl px-4 py-2.5 font-semibold text-white transition-all hover:shadow-lg disabled:opacity-60" style={{ background: 'linear-gradient(135deg, #2E7D32 0%, #0D4F1E 100%)' }}>{exportingPdf ? 'Generando PDF...' : 'Exportar PDF fiel'}</button>
                <button onClick={handleExportPng} disabled={exportingImage} className="rounded-xl px-4 py-2.5 font-semibold text-white transition-all disabled:opacity-60" style={{ background: 'linear-gradient(135deg, #1B5E20 0%, #2E7D32 100%)' }}>{exportingImage ? 'Generando PNG...' : 'Exportar PNG fiel'}</button>
                <button onClick={handlePrintDashboard} disabled={printing} className="rounded-xl border px-4 py-2.5 font-semibold transition-all disabled:opacity-60" style={{ borderColor: G.border, color: G.dark, background: '#fff' }}>{printing ? 'Preparando impresion...' : 'Imprimir igual a pantalla'}</button>
                <button onClick={() => addToast?.('Dashboard listo para presentar', 'success', 'Dashboard Studio')} className="rounded-xl px-4 py-2 font-semibold text-white" style={{ background: 'linear-gradient(135deg, #43A047 0%, #1F6B35 100%)' }}>Aplicar diseño pro</button>
                <button onClick={onClose} className="rounded-xl border px-4 py-2 font-semibold" style={{ borderColor: G.border, color: G.text }}>Cerrar</button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6" style={{ background: 'radial-gradient(circle at top right, rgba(76,175,80,0.12), transparent 25%), linear-gradient(180deg, #FDFEFD 0%, #F4F7F4 100%)' }}>
            {loading && <div className="rounded-2xl border px-4 py-4 text-sm" style={{ background: '#fff', borderColor: G.border, color: G.text }}>Cargando datos del dashboard...</div>}
            {error && <div className="rounded-2xl border px-4 py-4 text-sm" style={{ background: '#FFF3F3', borderColor: '#FFCDD2', color: '#B71C1C' }}>{error}</div>}
            {!loading && !error && (
              <div className="space-y-6" data-dashboard-export>
                <div className="grid grid-cols-[1.5fr_1fr] gap-4">
                  <div className="rounded-[26px] border p-6" style={{ background: 'linear-gradient(135deg, #0D4F1E 0%, #1F6B35 48%, #2E7D32 100%)', borderColor: '#276638', color: '#fff', boxShadow: '0 18px 40px rgba(31,107,53,0.22)' }}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs uppercase tracking-[0.22em] text-white/75">Dashboard Pro</div>
                        <h1 className="mt-2 text-3xl font-black leading-tight">{titles.dashboardTitle}</h1>
                        <p className="mt-3 max-w-2xl text-sm text-white/85">{paragraphs.intro}</p>
                      </div>
                      <div className="rounded-2xl border px-4 py-3 text-right" style={{ borderColor: 'rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.08)' }}>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-white/70">Fuente</div>
                        <div className="mt-1 text-lg font-bold">{sourceName === '__current_result__' ? 'Resultado actual' : sourceName}</div>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-4">
                    <div className="rounded-[26px] border p-5" style={{ background: '#fff', borderColor: G.border }}>
                      <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: G.dim }}>Tipo de análisis</div>
                      <div className="mt-2 text-xl font-black capitalize" style={{ color: G.dark }}>{templateKey}</div>
                      <div className="mt-2 text-xs" style={{ color: G.dim }}>Puedes ajustar nombres, filas, columnas, métricas y tipo de gráfico.</div>
                    </div>
                    <div className="rounded-[26px] border p-5" style={{ background: '#fff', borderColor: G.border }}>
                      <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: G.dim }}>Configuración activa</div>
                      <div className="mt-2 space-y-1 text-sm" style={{ color: G.text }}>
                        <div>Filas: {rowField || 'Sin definir'}</div>
                        <div>Columnas: {columnField || 'Sin definir'}</div>
                        <div>Métrica: {metricField || 'Conteo'}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border p-4" style={{ background: '#F6FBF6', borderColor: '#BFD4BF' }}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: G.dim }}>Narrativa ejecutiva</div>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: G.text }}>{paragraphs.analysis}</p>
                  <p className="mt-2 text-xs leading-relaxed" style={{ color: G.dim }}>{paragraphs.notes}</p>
                </div>

                <div className="rounded-2xl border p-4" style={{ background: '#fff', borderColor: G.border }}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: G.dim }}>Radar de anomalías</div>
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {anomalyHighlights.map((f, idx) => (
                      <div key={idx} className="rounded-lg border px-3 py-2 text-xs" style={{
                        borderColor: f.level === 'critico' ? '#FFCDD2' : f.level === 'atencion' ? '#FFE082' : '#C8E6C9',
                        background: f.level === 'critico' ? '#FFF3F3' : f.level === 'atencion' ? '#FFFDE7' : '#F1F8F1',
                        color: f.level === 'critico' ? '#C62828' : f.level === 'atencion' ? '#E65100' : '#1B5E20',
                      }}>
                        {f.level === 'critico' ? '⚠ ' : f.level === 'atencion' ? '◔ ' : '✓ '}{f.text}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: G.dim }}>{labels.kpiSection}</div>
                <div className="grid grid-cols-4 gap-4">
                  {kpis.map((kpi, idx) => (
                    <KpiCardPro
                      key={kpi.title}
                      {...kpi}
                      trend={idx === 0 ? 12.5 : idx === 1 ? -3.2 : idx === 2 ? 8.7 : 5.3}
                      color={[G.primary, '#C62828', '#FF9800', '#00897B'][idx]}
                    />
                  ))}
                </div>

                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: G.dim }}>{labels.chartsSection}</div>
                <div className="grid grid-cols-[1.7fr_1fr] gap-4">
                  {chart}
                  <AdvancedDonutChart data={grouped} title={titles.distributionTitle} />
                </div>

                <div className="rounded-2xl border p-4" style={{ background: '#fff', borderColor: G.border }}>
                  <div className="mb-4 flex items-center justify-between">
                    <div className="text-sm font-bold" style={{ color: G.text }}>{labels.tableSection || titles.pivotTitle}</div>
                    <div className="text-xs" style={{ color: G.dim }}>Estilo tipo tabla dinámica</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-0 text-sm">
                      <thead>
                        <tr>
                          <th className="rounded-tl-xl border px-3 py-2 text-left" style={{ borderColor: G.border, background: G.light, color: G.dark }}>{rowField || 'Fila'}</th>
                          {Array.from(new Set(grouped.flatMap((item) => Object.keys(item.values)))).slice(0, 6).map((column) => (
                            <th key={column} className="border px-3 py-2 text-left" style={{ borderColor: G.border, background: G.light, color: G.dark }}>{column}</th>
                          ))}
                          <th className="rounded-tr-xl border px-3 py-2 text-left" style={{ borderColor: G.border, background: G.light, color: G.dark }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grouped.slice(0, 8).map((item) => (
                          <tr key={item.label}>
                            <td className="border px-3 py-2 font-semibold" style={{ borderColor: G.border, color: G.text }}>{item.label}</td>
                            {Array.from(new Set(grouped.flatMap((entry) => Object.keys(entry.values)))).slice(0, 6).map((column) => (
                              <td key={`${item.label}-${column}`} className="border px-3 py-2" style={{ borderColor: G.border, color: G.text }}>{Number(item.values[column] || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                            ))}
                            <td className="border px-3 py-2 font-bold" style={{ borderColor: G.border, color: G.dark }}>{item.total.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}