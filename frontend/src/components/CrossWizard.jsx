/**
 * CrossWizard — Asistente visual de cruce de archivos
 * Configura el cruce → ejecuta → resultados van al área principal.
 */
import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { executeQuery } from '../lib/duckdb'

const spring = { type: 'spring', stiffness: 380, damping: 32 }

const G = {
  dark:    '#2E7D32',
  primary: '#43A047',
  light:   '#E8F5E9',
  border:  '#C8DCC8',
  text:    '#1B3318',
  text2:   '#4A6B4A',
  dim:     '#9EBB9E',
}

const JOIN_TYPES = [
  { value: 'LEFT JOIN',       label: 'Izquierda',    desc: 'Todos de A + coincidencias de B',   icon: '⟵' },
  { value: 'INNER JOIN',      label: 'Intersección', desc: 'Solo filas que coinciden en ambos', icon: '⋈' },
  { value: 'FULL OUTER JOIN', label: 'Completo',     desc: 'Todos de A y B, rellenando nulos',  icon: '⟷' },
  { value: 'RIGHT JOIN',      label: 'Derecha',      desc: 'Todos de B + coincidencias de A',   icon: '⟶' },
]

const AGG_OPS = [
  { value: 'none',  label: 'Sin agregación',       desc: 'Ver todas las filas resultado',      icon: '📋' },
  { value: 'count', label: 'Contar coincidencias', desc: 'Cuántos registros coinciden',        icon: '🔢' },
  { value: 'sum',   label: 'Sumar columna',        desc: 'Suma total de una columna numérica', icon: '∑' },
  { value: 'avg',   label: 'Promedio de columna',  desc: 'Promedio de una columna numérica',   icon: '〒' },
  { value: 'both',  label: 'Suma + Promedio',      desc: 'Suma y promedio de la columna',      icon: '📊' },
]

const MAX_JOIN_ROWS = 50000

function buildJoinProjection(leftTable, rightTable, leftCols, rightCols, joinCol, rightJoinCol) {
  const leftProjection = (leftCols || []).map((column) => `a."${column.name}" AS "${leftTable}.${column.name}"`)
  const rightProjection = (rightCols || []).map((column) => `b."${column.name}" AS "${rightTable}.${column.name}"`)
  const matchFlag = `CASE WHEN a."${joinCol}" IS NOT NULL AND b."${rightJoinCol}" IS NOT NULL THEN 'coincide' ELSE 'sin_coincidencia' END AS "estado_cruce"`
  return [matchFlag, ...leftProjection, ...rightProjection].join(',\n       ')
}

function buildSQL({ leftTable, rightTable, leftCols, rightCols, joinCol, rightJoinCol, joinType, aggOp, aggCol, groupBy }) {
  if (!leftTable || !rightTable || !joinCol || !rightJoinCol) return null
  const al = 'a', ar = 'b'

  if (aggOp === 'none') {
    return (
      `SELECT ${buildJoinProjection(leftTable, rightTable, leftCols, rightCols, joinCol, rightJoinCol)}\n` +
      `FROM "${leftTable}" ${al}\n` +
      `${joinType} "${rightTable}" ${ar}\n` +
      `  ON TRIM(CAST(${al}."${joinCol}" AS VARCHAR)) = TRIM(CAST(${ar}."${rightJoinCol}" AS VARCHAR))\n` +
      `LIMIT ${MAX_JOIN_ROWS};`
    )
  }
  const groupCol = groupBy ? `${al}."${groupBy}"` : `${al}."${joinCol}"`
  let sel = groupCol
  if (aggOp === 'count')                sel += `, COUNT(*) AS coincidencias`
  else if (aggOp === 'sum'  && aggCol)  sel += `, SUM(${ar}."${aggCol}") AS suma_${aggCol.replace(/[^a-z0-9]/gi,'_')}`
  else if (aggOp === 'avg'  && aggCol)  sel += `, AVG(${ar}."${aggCol}") AS promedio_${aggCol.replace(/[^a-z0-9]/gi,'_')}`
  else if (aggOp === 'both' && aggCol)  sel +=
    `, SUM(${ar}."${aggCol}") AS suma_${aggCol.replace(/[^a-z0-9]/gi,'_')}` +
    `, AVG(${ar}."${aggCol}") AS promedio_${aggCol.replace(/[^a-z0-9]/gi,'_')}`

  return (
    `SELECT ${sel}\n` +
    `FROM "${leftTable}" ${al}\n` +
    `${joinType} "${rightTable}" ${ar}\n` +
    `  ON TRIM(CAST(${al}."${joinCol}" AS VARCHAR)) = TRIM(CAST(${ar}."${rightJoinCol}" AS VARCHAR))\n` +
    `GROUP BY ${groupCol}\n` +
    `ORDER BY 2 DESC\n` +
    `LIMIT ${MAX_JOIN_ROWS};`
  )
}

function Section({ num, title, children }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
          style={{ background: G.primary }}>
          {num}
        </div>
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: G.dark }}>{title}</span>
      </div>
      {children}
    </section>
  )
}

export default function CrossWizard({ tables, onClose, onResult }) {
  const [leftTable,    setLeftTable]    = useState(tables[0]?.name || '')
  const [rightTable,   setRightTable]   = useState(tables[1]?.name || '')
  const [joinCol,      setJoinCol]      = useState('')
  const [rightJoinCol, setRightJoinCol] = useState('')
  const [joinType,     setJoinType]     = useState('LEFT JOIN')
  const [aggOp,        setAggOp]        = useState('none')
  const [aggCol,       setAggCol]       = useState('')
  const [groupBy,      setGroupBy]      = useState('')
  const [postAction,   setPostAction]   = useState('only_result')
  const [targetTable,  setTargetTable]  = useState('')
  const [newTableName, setNewTableName] = useState('resultado_cruce')
  const [isRunning,    setIsRunning]    = useState(false)
  const [error,        setError]        = useState(null)

  const leftMeta  = tables.find(t => t.name === leftTable)
  const rightMeta = tables.find(t => t.name === rightTable)
  const leftCols  = leftMeta?.columns  || []
  const rightCols = rightMeta?.columns || []
  const numericRightCols = rightCols.filter(c => {
    const tp = (c.type || '').toUpperCase()
    return ['INTEGER','BIGINT','DOUBLE','FLOAT','DECIMAL','NUMERIC','HUGEINT','UBIGINT','SMALLINT','TINYINT'].some(n => tp.includes(n))
  })

  useEffect(() => {
    if (!leftCols.length || !rightCols.length) return
    const common = leftCols.find(c => rightCols.some(rc => rc.name.toLowerCase() === c.name.toLowerCase()))
    if (common) {
      setJoinCol(common.name)
      const rMatch = rightCols.find(rc => rc.name.toLowerCase() === common.name.toLowerCase())
      setRightJoinCol(rMatch?.name || '')
    } else { setJoinCol(''); setRightJoinCol('') }
    setAggCol(numericRightCols[0]?.name || '')
  }, [leftTable, rightTable])

  useEffect(() => {
    setTargetTable(leftTable || '')
  }, [leftTable])

  const sqlPreview = useMemo(
    () => buildSQL({ leftTable, rightTable, leftCols, rightCols, joinCol, rightJoinCol, joinType, aggOp, aggCol, groupBy }),
    [leftTable, rightTable, leftCols, rightCols, joinCol, rightJoinCol, joinType, aggOp, aggCol, groupBy]
  )

  const needsAggCol = ['sum','avg','both'].includes(aggOp)
  const needsTarget = postAction === 'replace_main'
  const needsName = postAction === 'new_tab' || postAction === 'new_file'
  const canExecute  = leftTable && rightTable && leftTable !== rightTable && joinCol && rightJoinCol && (!needsAggCol || aggCol) && (!needsTarget || targetTable) && (!needsName || newTableName.trim())

  async function handleExecute() {
    if (!canExecute || !sqlPreview) return
    setIsRunning(true)
    setError(null)
    try {
      const res = await executeQuery(sqlPreview)
      const stats = (res.rows || []).reduce((acc, row) => {
        if (row.estado_cruce === 'coincide') acc.matched += 1
        else if (row.estado_cruce === 'sin_coincidencia') acc.unmatched += 1
        return acc
      }, { matched: 0, unmatched: 0 })
      const joinLabel = JOIN_TYPES.find(j => j.value === joinType)?.label || joinType
      const aggLabel  = AGG_OPS.find(a  => a.value === aggOp)?.label  || aggOp
      const crossContext = {
        leftTable, rightTable, joinCol, rightJoinCol,
        joinType, joinLabel, aggOp, aggLabel,
        aggCol: needsAggCol ? aggCol : null,
        sql: sqlPreview,
        rowCount: res.rowCount,
        matchedRows: stats.matched,
        unmatchedRows: stats.unmatched,
        limited: res.rowCount >= MAX_JOIN_ROWS,
        postAction,
        targetTable,
        newTableName: newTableName.trim(),
      }
      if (onResult) onResult({ ...res, duration: '—', crossContext })
      onClose()
    } catch (e) {
      const msg = e.message || String(e)
      if (msg.includes('malloc') || msg.includes('Out of Memory') || msg.toLowerCase().includes('oom')) {
        setError(`Los archivos son demasiado grandes para cruzarlos directamente.\n\nSugerencias:\n• Usa "Intersección" (INNER JOIN) para reducir resultados\n• Limita los registros antes del cruce`)
      } else {
        setError('Error al ejecutar el cruce: ' + msg)
      }
    } finally {
      setIsRunning(false)
    }
  }

  const selectSt = {
    width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: '0.8rem',
    background: '#fff', border: `1px solid ${G.border}`, outline: 'none',
    color: G.text, fontFamily: 'Inter, sans-serif',
  }
  const cardActive = { background: G.light, border: `1px solid ${G.primary}`, cursor: 'pointer' }
  const cardIdle   = { background: '#fff',  border: `1px solid ${G.border}`,  cursor: 'pointer' }

  return (
    <motion.div
      key="cross-backdrop"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 30 }}
        transition={spring}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl flex flex-col"
        style={{ background: '#F4F7F4', boxShadow: '0 24px 60px rgba(0,0,0,0.25)', border: `1px solid ${G.border}` }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header verde ── */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ background: G.dark, borderRadius: '16px 16px 0 0' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
              style={{ background: 'rgba(255,255,255,0.15)' }}>⋈</div>
            <div>
              <h2 className="font-bold text-sm text-white">Asistente de Cruce de Archivos</h2>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>
                Configura el cruce — los resultados aparecerán en el área principal
              </p>
            </div>
          </div>
          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}>✕
          </motion.button>
        </div>

        <div className="p-6 flex flex-col gap-5">

          {/* 1 · Archivos */}
          <Section num="1" title="Archivos a cruzar">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Archivo A (izquierda)', getter: leftTable,  setter: setLeftTable,  other: rightTable },
                { label: 'Archivo B (derecha)',   getter: rightTable, setter: setRightTable, other: leftTable  },
              ].map(({ label, getter, setter, other }) => (
                <div key={label}>
                  <p className="text-[10px] mb-1.5 font-semibold uppercase tracking-wider" style={{ color: G.dim }}>{label}</p>
                  <div className="flex flex-col gap-1.5">
                    {tables.map(t => {
                      const sel = t.name === getter
                      const blocked = t.name === other
                      return (
                        <motion.button key={t.name}
                          whileHover={!blocked ? { scale: 1.01 } : {}}
                          disabled={blocked}
                          onClick={() => setter(t.name)}
                          className="w-full text-left px-3 py-2.5 rounded-lg transition-all text-xs"
                          style={{ ...(sel ? cardActive : cardIdle), opacity: blocked ? 0.4 : 1, cursor: blocked ? 'not-allowed' : 'pointer' }}>
                          <div className="font-semibold truncate" style={{ color: G.text }}>{t.name}</div>
                          <div style={{ color: G.dim }}>{t.rowCount?.toLocaleString()} filas · {t.columns?.length} cols</div>
                        </motion.button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* 2 · Columnas */}
          <Section num="2" title="Columna de enlace">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] mb-1.5 font-semibold" style={{ color: G.dim }}>Columna de A ({leftTable})</p>
                <select value={joinCol} onChange={e => setJoinCol(e.target.value)} style={selectSt}>
                  <option value="">— Elige columna —</option>
                  {leftCols.map(c => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] mb-1.5 font-semibold" style={{ color: G.dim }}>Columna de B ({rightTable})</p>
                <select value={rightJoinCol} onChange={e => setRightJoinCol(e.target.value)} style={selectSt}>
                  <option value="">— Elige columna —</option>
                  {rightCols.map(c => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
                </select>
              </div>
            </div>
          </Section>

          {/* 3 · Tipo de JOIN */}
          <Section num="3" title="Tipo de cruce">
            <div className="grid grid-cols-2 gap-2">
              {JOIN_TYPES.map(jt => {
                const sel = joinType === jt.value
                return (
                  <motion.button key={jt.value} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                    onClick={() => setJoinType(jt.value)}
                    className="text-left px-3 py-2.5 rounded-lg text-xs transition-all"
                    style={sel ? cardActive : cardIdle}>
                    <span className="mr-1.5 text-base">{jt.icon}</span>
                    <span className="font-bold" style={{ color: sel ? G.dark : G.text }}>{jt.label}</span>
                    <div style={{ color: G.dim }} className="mt-0.5">{jt.desc}</div>
                  </motion.button>
                )
              })}
            </div>
          </Section>

          {/* 4 · Qué calcular */}
          <Section num="4" title="¿Qué calcular?">
            <div className="grid grid-cols-3 gap-2">
              {AGG_OPS.map(op => {
                const sel = aggOp === op.value
                return (
                  <motion.button key={op.value} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                    onClick={() => setAggOp(op.value)}
                    className="text-left px-3 py-2.5 rounded-lg text-xs transition-all"
                    style={sel ? cardActive : cardIdle}>
                    <div className="text-base mb-0.5">{op.icon}</div>
                    <div className="font-bold leading-tight" style={{ color: sel ? G.dark : G.text }}>{op.label}</div>
                    <div className="mt-0.5 leading-snug" style={{ color: G.dim }}>{op.desc}</div>
                  </motion.button>
                )
              })}
            </div>
            <AnimatePresence>
              {needsAggCol && (
                <motion.div key="aggcol"
                  initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] mb-1.5 font-semibold" style={{ color: G.dim }}>Columna a calcular (de B)</p>
                      <select value={aggCol} onChange={e => setAggCol(e.target.value)} style={selectSt}>
                        <option value="">— Elige columna numérica —</option>
                        {(numericRightCols.length > 0 ? numericRightCols : rightCols).map(c =>
                          <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
                      </select>
                    </div>
                    <div>
                      <p className="text-[10px] mb-1.5 font-semibold" style={{ color: G.dim }}>Agrupar por (opcional)</p>
                      <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={selectSt}>
                        <option value="">— Columna de enlace (auto) —</option>
                        {leftCols.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Section>

          {/* 5 · Qué hacer con el resultado */}
          <Section num="5" title="¿Qué hacer con el resultado del cruce?">
            <div className="grid grid-cols-1 gap-2">
              {[
                { key: 'only_result', title: 'Solo mostrar resultado', desc: 'Mostrar en panel de resultados sin guardar cambios' },
                { key: 'replace_main', title: 'Actualizar archivo principal', desc: 'Reemplazar el archivo seleccionado con el resultado del cruce' },
                { key: 'new_tab', title: 'Agregar en pestaña nueva', desc: 'Crear una tabla nueva dentro del proyecto actual' },
                { key: 'new_file', title: 'Crear archivo diferente', desc: 'Crear una tabla diferente para trabajar por separado' },
              ].map(opt => {
                const sel = postAction === opt.key
                return (
                  <motion.button
                    key={opt.key}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setPostAction(opt.key)}
                    className="text-left px-3 py-2.5 rounded-lg text-xs transition-all"
                    style={sel ? cardActive : cardIdle}
                  >
                    <div className="font-bold" style={{ color: sel ? G.dark : G.text }}>{opt.title}</div>
                    <div style={{ color: G.dim }} className="mt-0.5">{opt.desc}</div>
                  </motion.button>
                )
              })}
            </div>
            {postAction === 'replace_main' && (
              <div className="mt-3">
                <p className="text-[10px] mb-1.5 font-semibold" style={{ color: G.dim }}>Archivo principal a actualizar</p>
                <select value={targetTable} onChange={e => setTargetTable(e.target.value)} style={selectSt}>
                  <option value="">— Selecciona archivo —</option>
                  {tables.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
              </div>
            )}
            {(postAction === 'new_tab' || postAction === 'new_file') && (
              <div className="mt-3">
                <p className="text-[10px] mb-1.5 font-semibold" style={{ color: G.dim }}>Nombre de la nueva tabla</p>
                <input
                  value={newTableName}
                  onChange={e => setNewTableName(e.target.value)}
                  placeholder="resultado_cruce"
                  style={selectSt}
                />
              </div>
            )}
          </Section>

          {/* SQL Preview */}
          {sqlPreview && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: G.dim }}>SQL que se ejecutará</p>
              <pre className="rounded-lg px-4 py-3 text-[10px] font-mono overflow-x-auto"
                style={{ background: '#fff', color: G.text2, border: `1px solid ${G.border}`, lineHeight: '1.6' }}>
                {sqlPreview}
              </pre>
            </section>
          )}

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div key="err"
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="rounded-xl px-4 py-3 text-xs whitespace-pre-line"
                style={{ background: '#FFF3F3', border: '1px solid #FFCDD2', color: '#C62828' }}>
                ⚠️ {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Nota */}
          {canExecute && (
            <div className="rounded-lg px-4 py-2.5 text-xs flex items-start gap-2"
              style={{ background: G.light, border: `1px solid ${G.border}` }}>
              <span style={{ color: G.primary, fontSize: '1rem', lineHeight: 1 }}>ℹ</span>
              <span style={{ color: G.text2 }}>
                Los resultados aparecerán en el área principal con un resumen detallado del cruce.
                Además, con el paso 5 puedes decidir si el resultado solo se muestra, actualiza un archivo principal o crea una nueva tabla.
              </span>
            </div>
          )}

          {/* Botón ejecutar */}
          <motion.button
            whileHover={canExecute && !isRunning ? { scale: 1.015, boxShadow: '0 0 28px rgba(67,160,71,0.4)' } : {}}
            whileTap={canExecute && !isRunning ? { scale: 0.985 } : {}}
            onClick={handleExecute}
            disabled={!canExecute || isRunning}
            className="w-full py-3 rounded-xl text-sm font-bold tracking-wide transition-all"
            style={{
              background: canExecute && !isRunning
                ? `linear-gradient(135deg, ${G.primary} 0%, ${G.dark} 100%)`
                : '#D7E8D7',
              color: canExecute ? 'white' : G.dim,
              border: 'none',
              cursor: canExecute && !isRunning ? 'pointer' : 'not-allowed',
            }}>
            {isRunning ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                Ejecutando cruce…
              </span>
            ) : canExecute ? '⋈ Ejecutar cruce y ver resultados' : (
              !leftTable || !rightTable ? 'Selecciona dos archivos distintos' :
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
