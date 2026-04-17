/**
 * CrossWizard — Asistente visual de cruce de archivos
 * Permite seleccionar dos tablas, columna de cruce, tipo de JOIN y agregación.
 */
import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { executeQuery, registerCSVAsTable } from '../lib/duckdb'
import { saveTable } from '../lib/indexeddb'

const spring = { type: 'spring', stiffness: 380, damping: 32 }

const JOIN_TYPES = [
  { value: 'LEFT JOIN',       label: 'Izquierda',    desc: 'Todos de A + coincidencias de B',      icon: '⟵' },
  { value: 'INNER JOIN',      label: 'Intersección',  desc: 'Solo filas que coinciden en ambos',    icon: '⋈' },
  { value: 'FULL OUTER JOIN', label: 'Completo',      desc: 'Todos de A y B, rellenando nulos',     icon: '⟷' },
  { value: 'RIGHT JOIN',      label: 'Derecha',       desc: 'Todos de B + coincidencias de A',      icon: '⟶' },
]

const AGG_OPS = [
  { value: 'none',  label: 'Sin agregación',          desc: 'Ver todas las filas resultado',         icon: '📋' },
  { value: 'count', label: 'Contar coincidencias',    desc: 'Cuántos registros coinciden',           icon: '🔢' },
  { value: 'sum',   label: 'Sumar columna',           desc: 'Suma total de una columna numérica',    icon: '∑' },
  { value: 'avg',   label: 'Promedio de columna',     desc: 'Promedio de una columna numérica',      icon: '〒' },
  { value: 'both',  label: 'Suma + Promedio',         desc: 'Suma y promedio de la columna',         icon: '📊' },
]

const MAX_JOIN_ROWS = 50000

function buildSQL({ leftTable, rightTable, joinCol, rightJoinCol, joinType, aggOp, aggCol, groupBy }) {
  if (!leftTable || !rightTable || !joinCol || !rightJoinCol) return null
  const alias_l = 'a'
  const alias_r = 'b'

  if (aggOp === 'none') {
    return (
      `SELECT ${alias_l}.*, ${alias_r}.*\n` +
      `FROM "${leftTable}" ${alias_l}\n` +
      `${joinType} "${rightTable}" ${alias_r}\n` +
      `  ON ${alias_l}."${joinCol}" = ${alias_r}."${rightJoinCol}"\n` +
      `LIMIT ${MAX_JOIN_ROWS};`
    )
  }

  // With aggregation
  const groupCol = groupBy ? `${alias_l}."${groupBy}"` : `${alias_l}."${joinCol}"`
  let selectExprs = groupCol
  if (aggOp === 'count') {
    selectExprs += `, COUNT(*) AS coincidencias`
  } else if (aggOp === 'sum' && aggCol) {
    selectExprs += `, SUM(${alias_r}."${aggCol}") AS suma_${aggCol.replace(/[^a-z0-9]/gi,'_')}`
  } else if (aggOp === 'avg' && aggCol) {
    selectExprs += `, AVG(${alias_r}."${aggCol}") AS promedio_${aggCol.replace(/[^a-z0-9]/gi,'_')}`
  } else if (aggOp === 'both' && aggCol) {
    selectExprs +=
      `, SUM(${alias_r}."${aggCol}") AS suma_${aggCol.replace(/[^a-z0-9]/gi,'_')}` +
      `, AVG(${alias_r}."${aggCol}") AS promedio_${aggCol.replace(/[^a-z0-9]/gi,'_')}`
  }

  return (
    `SELECT ${selectExprs}\n` +
    `FROM "${leftTable}" ${alias_l}\n` +
    `${joinType} "${rightTable}" ${alias_r}\n` +
    `  ON ${alias_l}."${joinCol}" = ${alias_r}."${rightJoinCol}"\n` +
    `GROUP BY ${groupCol}\n` +
    `ORDER BY 2 DESC\n` +
    `LIMIT ${MAX_JOIN_ROWS};`
  )
}

export default function CrossWizard({ tables, onClose, onResult, onTableSaved }) {
  const [leftTable, setLeftTable]       = useState(tables[0]?.name || '')
  const [rightTable, setRightTable]     = useState(tables[1]?.name || '')
  const [joinCol, setJoinCol]           = useState('')
  const [rightJoinCol, setRightJoinCol] = useState('')
  const [joinType, setJoinType]         = useState('LEFT JOIN')
  const [aggOp, setAggOp]               = useState('none')
  const [aggCol, setAggCol]             = useState('')
  const [groupBy, setGroupBy]           = useState('')
  const [isRunning, setIsRunning]       = useState(false)
  const [error, setError]               = useState(null)
  const [result, setResult]             = useState(null)
  const [saveAsTable, setSaveAsTable]   = useState(false)
  const [savedName, setSavedName]       = useState('')
  const [isSaving, setIsSaving]         = useState(false)

  const leftMeta  = tables.find(t => t.name === leftTable)
  const rightMeta = tables.find(t => t.name === rightTable)
  const leftCols  = leftMeta?.columns  || []
  const rightCols = rightMeta?.columns || []
  const numericRightCols = rightCols.filter(c => {
    const t = (c.type || '').toUpperCase()
    return ['INTEGER','BIGINT','DOUBLE','FLOAT','DECIMAL','NUMERIC','HUGEINT','UBIGINT','SMALLINT','TINYINT'].some(nt => t.includes(nt))
  })

  // Auto-detect common column
  useEffect(() => {
    if (!leftCols.length || !rightCols.length) return
    const common = leftCols.find(c => rightCols.some(rc => rc.name.toLowerCase() === c.name.toLowerCase()))
    if (common) {
      setJoinCol(common.name)
      const rMatch = rightCols.find(rc => rc.name.toLowerCase() === common.name.toLowerCase())
      setRightJoinCol(rMatch?.name || '')
    } else {
      setJoinCol('')
      setRightJoinCol('')
    }
    setAggCol(numericRightCols[0]?.name || '')
    setSavedName(`cruce_${leftTable}_${rightTable}`)
  }, [leftTable, rightTable])

  const sqlPreview = useMemo(() => buildSQL({ leftTable, rightTable, joinCol, rightJoinCol, joinType, aggOp, aggCol, groupBy }), [leftTable, rightTable, joinCol, rightJoinCol, joinType, aggOp, aggCol, groupBy])

  const needsAggCol = ['sum','avg','both'].includes(aggOp)

  const canExecute = leftTable && rightTable && leftTable !== rightTable && joinCol && rightJoinCol && (!needsAggCol || aggCol)

  async function handleExecute() {
    if (!canExecute || !sqlPreview) return
    setIsRunning(true)
    setError(null)
    setResult(null)
    try {
      const res = await executeQuery(sqlPreview)
      const duration = '—'
      setResult({ ...res, duration })
      if (onResult) onResult({ ...res, duration })
    } catch (e) {
      const msg = e.message || String(e)
      if (msg.includes('malloc') || msg.includes('Out of Memory') || msg.toLowerCase().includes('oom')) {
        setError(`Los archivos son demasiado grandes para cruzarlos directamente en el navegador.\n\nSugerencias:\n• Usa tipo "Intersección" (INNER JOIN) para reducir resultados\n• Aplica un filtro WHERE antes del cruce\n• Limita los registros a comparar\n\nDetalles técnicos: ${msg}`)
      } else {
        setError('Error al ejecutar el cruce: ' + msg)
      }
    } finally {
      setIsRunning(false)
    }
  }

  async function handleSaveAsTable() {
    if (!result || !savedName) return
    setIsSaving(true)
    try {
      const header = result.columns.join(',')
      const dataRows = result.rows.map(row =>
        result.columns.map(col => {
          const v = row[col]
          if (v === null || v === undefined) return ''
          const s = String(v)
          return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g,'""')}"` : s
        }).join(',')
      ).join('\n')
      const csv = header + '\n' + dataRows
      const buffer = new TextEncoder().encode(csv).buffer
      const cols = await registerCSVAsTable(savedName, buffer)
      const meta = { name: savedName, rowCount: result.rowCount, columns: cols }
      await saveTable(meta, buffer.slice(0))
      if (onTableSaved) onTableSaved(meta)
    } catch(e) {
      setError('No se pudo guardar: ' + e.message)
    } finally {
      setIsSaving(false)
    }
  }

  function handleExport() {
    if (!result?.rows?.length) return
    const header = result.columns.join(',')
    const dataRows = result.rows.map(row =>
      result.columns.map(col => {
        const v = row[col]
        if (v === null || v === undefined) return ''
        const s = String(v)
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g,'""')}"` : s
      }).join(',')
    )
    const csv = [header, ...dataRows].join('\n')
    const url = URL.createObjectURL(new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url; a.download = `cruce_${leftTable}_${rightTable}_${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <motion.div
      key="cross-backdrop"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(2,4,12,0.85)', backdropFilter: 'blur(12px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ scale: 0.88, opacity: 0, y: 40 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.88, opacity: 0, y: 40 }}
        transition={spring}
        className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl flex flex-col"
        style={{ background: 'linear-gradient(145deg, #0d1226 0%, #09101e 100%)', border: '1px solid rgba(99,102,241,0.22)', boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'rgba(99,102,241,0.15)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg" style={{ background: 'rgba(99,102,241,0.18)' }}>⋈</div>
            <div>
              <h2 className="text-white font-bold text-sm tracking-wide">Asistente de Cruce</h2>
              <p className="text-xs" style={{ color: '#64748b' }}>Relaciona archivos y elige qué calcular</p>
            </div>
          </div>
          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#64748b' }}>✕</motion.button>
        </div>

        <div className="p-6 flex flex-col gap-5">

          {/* ── Sección 1: Selección de tablas ── */}
          <section>
            <label className="text-xs font-semibold uppercase tracking-widest mb-3 block" style={{ color: '#4f46e5' }}>
              1 · Archivos a cruzar
            </label>
            <div className="grid grid-cols-2 gap-3">
              {['Archivo A (izquierda)', 'Archivo B (derecha)'].map((label, idx) => {
                const isLeft = idx === 0
                const current = isLeft ? leftTable : rightTable
                const setter = isLeft ? setLeftTable : setRightTable
                const other = isLeft ? rightTable : leftTable
                return (
                  <div key={idx}>
                    <p className="text-[10px] mb-1.5 font-medium" style={{ color: '#475569' }}>{label}</p>
                    <div className="flex flex-col gap-1.5">
                      {tables.map(t => {
                        const isSelected = t.name === current
                        const isOther = t.name === other
                        return (
                          <motion.button
                            key={t.name}
                            whileHover={!isOther ? { scale: 1.01 } : {}}
                            whileTap={!isOther ? { scale: 0.99 } : {}}
                            disabled={isOther}
                            onClick={() => setter(t.name)}
                            className="w-full text-left px-3 py-2.5 rounded-lg transition-all text-xs"
                            style={{
                              background: isSelected
                                ? 'rgba(99,102,241,0.22)'
                                : isOther
                                ? 'rgba(255,255,255,0.02)'
                                : 'rgba(255,255,255,0.04)',
                              border: isSelected
                                ? '1px solid rgba(99,102,241,0.55)'
                                : '1px solid rgba(255,255,255,0.06)',
                              opacity: isOther ? 0.35 : 1,
                              cursor: isOther ? 'not-allowed' : 'pointer',
                            }}
                          >
                            <div className="font-semibold text-white truncate">{t.name}</div>
                            <div style={{ color: '#64748b' }}>{t.rowCount?.toLocaleString()} filas · {t.columns?.length} cols</div>
                          </motion.button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* ── Sección 2: Columnas de cruce ── */}
          <section>
            <label className="text-xs font-semibold uppercase tracking-widest mb-3 block" style={{ color: '#4f46e5' }}>
              2 · Columna de enlace
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] mb-1.5 font-medium" style={{ color: '#475569' }}>Columna de A ({leftTable})</p>
                <select value={joinCol} onChange={e => setJoinCol(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-xs text-white"
                  style={{ background: 'rgba(15,20,40,0.8)', border: '1px solid rgba(99,102,241,0.25)', outline:'none' }}>
                  <option value="">— Elige columna —</option>
                  {leftCols.map(c => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] mb-1.5 font-medium" style={{ color: '#475569' }}>Columna de B ({rightTable})</p>
                <select value={rightJoinCol} onChange={e => setRightJoinCol(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-xs text-white"
                  style={{ background: 'rgba(15,20,40,0.8)', border: '1px solid rgba(99,102,241,0.25)', outline:'none' }}>
                  <option value="">— Elige columna —</option>
                  {rightCols.map(c => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* ── Sección 3: Tipo de JOIN ── */}
          <section>
            <label className="text-xs font-semibold uppercase tracking-widest mb-3 block" style={{ color: '#4f46e5' }}>
              3 · Tipo de cruce
            </label>
            <div className="grid grid-cols-2 gap-2">
              {JOIN_TYPES.map(jt => {
                const sel = joinType === jt.value
                return (
                  <motion.button key={jt.value} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                    onClick={() => setJoinType(jt.value)}
                    className="text-left px-3 py-2.5 rounded-lg text-xs transition-all"
                    style={{
                      background: sel ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)',
                      border: sel ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.06)',
                    }}>
                    <span className="mr-1.5">{jt.icon}</span>
                    <span className="font-semibold text-white">{jt.label}</span>
                    <div style={{ color: '#64748b' }} className="mt-0.5">{jt.desc}</div>
                  </motion.button>
                )
              })}
            </div>
          </section>

          {/* ── Sección 4: Operación ── */}
          <section>
            <label className="text-xs font-semibold uppercase tracking-widest mb-3 block" style={{ color: '#4f46e5' }}>
              4 · ¿Qué calcular?
            </label>
            <div className="grid grid-cols-3 gap-2">
              {AGG_OPS.map(op => {
                const sel = aggOp === op.value
                return (
                  <motion.button key={op.value} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                    onClick={() => setAggOp(op.value)}
                    className="text-left px-3 py-2.5 rounded-lg text-xs transition-all"
                    style={{
                      background: sel ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)',
                      border: sel ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.06)',
                    }}>
                    <div className="text-base mb-0.5">{op.icon}</div>
                    <div className="font-semibold text-white leading-tight">{op.label}</div>
                    <div className="mt-0.5 leading-snug" style={{ color: '#64748b' }}>{op.desc}</div>
                  </motion.button>
                )
              })}
            </div>

            <AnimatePresence>
              {needsAggCol && (
                <motion.div key="aggcol" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] mb-1.5 font-medium" style={{ color: '#475569' }}>Columna a calcular (de B)</p>
                      <select value={aggCol} onChange={e => setAggCol(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-xs text-white"
                        style={{ background: 'rgba(15,20,40,0.8)', border: '1px solid rgba(99,102,241,0.25)', outline:'none' }}>
                        <option value="">— Elige columna numérica —</option>
                        {(numericRightCols.length > 0 ? numericRightCols : rightCols).map(c => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
                      </select>
                    </div>
                    <div>
                      <p className="text-[10px] mb-1.5 font-medium" style={{ color: '#475569' }}>Agrupar resultados por (opcional)</p>
                      <select value={groupBy} onChange={e => setGroupBy(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-xs text-white"
                        style={{ background: 'rgba(15,20,40,0.8)', border: '1px solid rgba(99,102,241,0.25)', outline:'none' }}>
                        <option value="">— Columna de enlace (auto) —</option>
                        {leftCols.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* ── SQL Preview ── */}
          {sqlPreview && (
            <section>
              <label className="text-xs font-semibold uppercase tracking-widest mb-2 block" style={{ color: '#334155' }}>
                SQL generado
              </label>
              <pre className="rounded-lg px-4 py-3 text-[10px] font-mono overflow-x-auto"
                style={{ background: 'rgba(0,0,0,0.4)', color: '#7c8faa', border: '1px solid rgba(255,255,255,0.05)', lineHeight: '1.6' }}>
                {sqlPreview}
              </pre>
            </section>
          )}

          {/* ── Error ── */}
          <AnimatePresence>
            {error && (
              <motion.div key="err" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="rounded-xl px-4 py-3 text-xs whitespace-pre-line"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
                ⚠️ {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Resultado resumen ── */}
          <AnimatePresence>
            {result && (
              <motion.div key="res" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="rounded-xl px-4 py-3 flex items-center justify-between"
                style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <div>
                  <p className="text-xs font-semibold" style={{ color: '#86efac' }}>✓ Cruce ejecutado exitosamente</p>
                  <p className="text-[10px] mt-0.5" style={{ color: '#4ade80' }}>
                    {result.rowCount?.toLocaleString()} filas · {result.columns?.length} columnas
                    {result.rowCount >= MAX_JOIN_ROWS ? ` (limitado a ${MAX_JOIN_ROWS.toLocaleString()})` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleExport}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc' }}>
                    ⬇ Exportar CSV
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Guardar como tabla ── */}
          <AnimatePresence>
            {result && (
              <motion.section key="save" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="flex items-center gap-2 mb-3">
                  <input type="checkbox" id="save-chk" checked={saveAsTable} onChange={e => setSaveAsTable(e.target.checked)}
                    className="w-4 h-4 rounded accent-indigo-500 cursor-pointer" />
                  <label htmlFor="save-chk" className="text-xs font-medium cursor-pointer" style={{ color: '#94a3b8' }}>
                    Agregar resultado como nueva tabla para seguir consultando
                  </label>
                </div>
                <AnimatePresence>
                  {saveAsTable && (
                    <motion.div key="save-form" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="flex gap-2">
                        <input value={savedName} onChange={e => setSavedName(e.target.value.replace(/[^a-zA-Z0-9_]/g,'_'))}
                          placeholder="nombre_tabla"
                          className="flex-1 px-3 py-2 rounded-lg text-xs text-white font-mono"
                          style={{ background: 'rgba(15,20,40,0.8)', border: '1px solid rgba(99,102,241,0.25)', outline:'none' }} />
                        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                          onClick={handleSaveAsTable} disabled={isSaving || !savedName}
                          className="px-4 py-2 rounded-lg text-xs font-semibold transition-opacity"
                          style={{ background: isSaving ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.7)', color: 'white', opacity: (!savedName || isSaving) ? 0.5 : 1 }}>
                          {isSaving ? 'Guardando…' : 'Guardar'}
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.section>
            )}
          </AnimatePresence>

          {/* ── Botón ejecutar ── */}
          <motion.button
            whileHover={canExecute && !isRunning ? { scale: 1.015, boxShadow: '0 0 28px rgba(99,102,241,0.4)' } : {}}
            whileTap={canExecute && !isRunning ? { scale: 0.985 } : {}}
            onClick={handleExecute}
            disabled={!canExecute || isRunning}
            className="w-full py-3 rounded-xl text-sm font-bold tracking-wide transition-all"
            style={{
              background: canExecute && !isRunning
                ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'
                : 'rgba(30,35,60,0.6)',
              color: canExecute ? 'white' : '#334155',
              border: canExecute ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.04)',
              cursor: canExecute && !isRunning ? 'pointer' : 'not-allowed',
            }}>
            {isRunning ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                Ejecutando cruce…
              </span>
            ) : canExecute ? '⋈ Ejecutar cruce' : (
              !joinCol ? 'Elige la columna de enlace de A' :
              !rightJoinCol ? 'Elige la columna de enlace de B' :
              needsAggCol && !aggCol ? 'Elige la columna a calcular' :
              'Selecciona archivos distintos'
            )}
          </motion.button>

        </div>
      </motion.div>
    </motion.div>
  )
}
