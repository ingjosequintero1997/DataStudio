import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { describeTable, executeQuery, executeStatement } from '../lib/duckdb'

const spring = { type: 'spring', stiffness: 380, damping: 32 }
const MAX_JOIN_ROWS = 50000
const MATCH_ALL = '__all_common__'

const G = {
  dark: '#2E7D32',
  primary: '#43A047',
  light: '#E8F5E9',
  border: '#C8DCC8',
  text: '#1B3318',
  text2: '#4A6B4A',
  dim: '#9EBB9E',
}

const JOIN_TYPES = [
  { value: 'LEFT JOIN', label: 'Izquierda', desc: 'Todos de A + coincidencias de B', icon: '⟵' },
  { value: 'INNER JOIN', label: 'Intersección', desc: 'Solo filas que coinciden en ambos', icon: '⋈' },
  { value: 'FULL OUTER JOIN', label: 'Completo', desc: 'Todos de A y B, rellenando nulos', icon: '⟷' },
  { value: 'RIGHT JOIN', label: 'Derecha', desc: 'Todos de B + coincidencias de A', icon: '⟶' },
]

const AGG_OPS = [
  { value: 'none', label: 'Sin agregación', desc: 'Ver todas las filas resultado', icon: '📋' },
  { value: 'count', label: 'Contar coincidencias', desc: 'Cuántos registros coinciden', icon: '🔢' },
  { value: 'sum', label: 'Sumar columna', desc: 'Suma total de una columna numérica', icon: '∑' },
  { value: 'avg', label: 'Promedio de columna', desc: 'Promedio de una columna numérica', icon: '〒' },
  { value: 'both', label: 'Suma + Promedio', desc: 'Suma y promedio de la columna', icon: '📊' },
]

const STRATEGY_PRESETS = [
  {
    key: 'safe',
    title: 'Seguro',
    desc: 'Menor riesgo y máxima trazabilidad',
    icon: '🛡',
    joinType: 'LEFT JOIN',
    aggOp: 'none',
  },
  {
    key: 'fast',
    title: 'Rápido',
    desc: 'Solo coincidencias para análisis inmediato',
    icon: '⚡',
    joinType: 'INNER JOIN',
    aggOp: 'count',
  },
  {
    key: 'explore',
    title: 'Explorar',
    desc: 'Ver huecos y no coincidencias en ambos lados',
    icon: '🧭',
    joinType: 'FULL OUTER JOIN',
    aggOp: 'none',
  },
]

function normalizeName(value) {
  return String(value || '').trim().toLowerCase()
}

function getCommonColumnPairs(leftCols = [], rightCols = []) {
  return leftCols
    .map((left) => {
      const right = rightCols.find((candidate) => normalizeName(candidate.name) === normalizeName(left.name))
      return right ? { left: left.name, right: right.name } : null
    })
    .filter(Boolean)
}

// ─── Smart Join: predicción semántica de FK ───────────────────────────────────
const ID_KEYWORDS = ['id', 'ium', 'codigo', 'código', 'clave', 'cedula', 'cédula', 'nit', 'serial', 'ref', 'numero', 'número', 'cod', 'key', 'folio', 'placa', 'cuenta', 'expediente']

function scoreJoinPair(lc, rc) {
  const l = (lc.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const r = (rc.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  let score = 0
  if (l === r) score += 70
  else if (l.includes(r) || r.includes(l)) score += 35
  const lKey = ID_KEYWORDS.some(kw => l.includes(kw))
  const rKey = ID_KEYWORDS.some(kw => r.includes(kw))
  if (lKey && rKey) score += 25
  else if (lKey || rKey) score += 8
  if (lc.type && rc.type && lc.type === rc.type) score += 10
  return score
}

function predictBestJoinPair(leftCols, rightCols) {
  if (!leftCols?.length || !rightCols?.length) return null
  let best = null, bestScore = 0
  for (const lc of leftCols) {
    for (const rc of rightCols) {
      const s = scoreJoinPair(lc, rc)
      if (s > bestScore) { bestScore = s; best = { left: lc.name, right: rc.name, score: s } }
    }
  }
  if (!best || bestScore < 25) return null
  const confidence = bestScore >= 70 ? 'alta' : bestScore >= 35 ? 'media' : 'baja'
  const confColor = confidence === 'alta' ? '#1B5E20' : confidence === 'media' ? '#E65100' : '#9E9E9E'
  return { ...best, confidence, confColor, score: bestScore }
}

function buildJoinProjection(leftTable, rightTable, leftCols, rightCols, matchPairs, wholeFileMatch) {
  const leftColNames = new Set((leftCols || []).map(c => c.name))

  // Columnas de tabla A: nombre original (sin prefijo)
  const leftProjection = (leftCols || []).map((col) => `a."${col.name}"`)

  // Columnas de tabla B: prefijo "B_" solo si hay conflicto con tabla A
  const rightProjection = (rightCols || []).map((col) => {
    if (leftColNames.has(col.name)) {
      return `b."${col.name}" AS "B_${col.name}"`
    }
    return `b."${col.name}"`
  })

  // Indicador de coincidencia — claro y en español
  const checks = wholeFileMatch
    ? matchPairs.map(({ left, right }) => `a."${left}" IS NOT NULL AND b."${right}" IS NOT NULL`).join(' AND ')
    : `a."${matchPairs[0]?.left}" IS NOT NULL AND b."${matchPairs[0]?.right}" IS NOT NULL`
  const flag = `CASE WHEN ${checks} THEN 'SI' ELSE 'NO' END AS "Coincide"`

  return [flag, ...leftProjection, ...rightProjection].join(',\n       ')
}

function buildNormalizedExpr(alias, col, rules = {}) {
  const base = `CAST(${alias}."${col}" AS VARCHAR)`
  const trimmed = rules.trimValues ? `TRIM(${base})` : base
  const upper = rules.upperValues ? `UPPER(${trimmed})` : trimmed
  if (rules.alnumOnly) return `REGEXP_REPLACE(${upper}, '[^A-Z0-9]', '', 'g')`
  return upper
}

function buildJoinCondition(matchPairs, rules) {
  return matchPairs
    .map(({ left, right }) => `${buildNormalizedExpr('a', left, rules)} = ${buildNormalizedExpr('b', right, rules)}`)
    .join('\n  AND ')
}

function buildLookupProjection(leftCols, selectedLookupColumns, insertAfterColumn, rightAliasPrefix) {
  const rightProjections = (selectedLookupColumns || []).map((colName) => {
    const alias = `${rightAliasPrefix}_${colName}`.replace(/\s+/g, '_')
    return `b."${colName}" AS "${alias}"`
  })

  if (!leftCols?.length) return rightProjections.join(',\n       ')
  if (!rightProjections.length) return leftCols.map((col) => `a."${col.name}"`).join(',\n       ')

  if (insertAfterColumn === '__start__') {
    return [...rightProjections, ...leftCols.map((col) => `a."${col.name}"`)].join(',\n       ')
  }

  const leftNames = leftCols.map((col) => col.name)
  const insertAt = insertAfterColumn && leftNames.includes(insertAfterColumn)
    ? leftNames.indexOf(insertAfterColumn) + 1
    : leftNames.length

  const before = leftCols.slice(0, insertAt).map((col) => `a."${col.name}"`)
  const after = leftCols.slice(insertAt).map((col) => `a."${col.name}"`)
  return [...before, ...rightProjections, ...after].join(',\n       ')
}

function buildSQL({ leftTable, rightTable, leftCols, rightCols, joinType, aggOp, aggCol, groupBy, wholeFileMatch, matchPairs, normalizeRules, crossMode, lookupColumns, insertAfterColumn }) {
  if (!leftTable || !rightTable || !matchPairs.length) return null

  const joinCondition = buildJoinCondition(matchPairs, normalizeRules)

  if (crossMode === 'lookup') {
    const leftKey = matchPairs[0]?.left
    const rightKey = matchPairs[0]?.right
    if (!leftKey || !rightKey || !lookupColumns?.length) return null
    const leftExpr = buildNormalizedExpr('a', leftKey, normalizeRules)
    const rightExpr = buildNormalizedExpr('src', rightKey, normalizeRules)
    const projection = buildLookupProjection(leftCols, lookupColumns, insertAfterColumn, rightTable)

    return [
      'WITH b_ranked AS (',
      '  SELECT',
      '    src.*,',
      `    ${rightExpr} AS "__norm_key",`,
      `    ROW_NUMBER() OVER (PARTITION BY ${rightExpr} ORDER BY 1) AS "__rn"`,
      `  FROM "${rightTable}" src`,
      ')',
      `SELECT ${projection}`,
      `FROM "${leftTable}" a`,
      'LEFT JOIN b_ranked b',
      `  ON ${leftExpr} = b."__norm_key"`,
      ' AND b."__rn" = 1',
      `LIMIT ${MAX_JOIN_ROWS};`,
    ].join('\n')
  }

  if (aggOp === 'none') {
    return [
      `SELECT ${buildJoinProjection(leftTable, rightTable, leftCols, rightCols, matchPairs, wholeFileMatch)}`,
      `FROM "${leftTable}" a`,
      `${joinType} "${rightTable}" b`,
      `  ON ${joinCondition}`,
      `LIMIT ${MAX_JOIN_ROWS};`,
    ].join('\n')
  }

  const baseGroup = groupBy || matchPairs[0]?.left
  if (!baseGroup) return null

  let selectSql = `a."${baseGroup}"`
  if (aggOp === 'count') selectSql += ', COUNT(*) AS coincidencias'
  if (aggOp === 'sum' && aggCol) selectSql += `, SUM(b."${aggCol}") AS suma_${aggCol.replace(/[^a-z0-9]/gi, '_')}`
  if (aggOp === 'avg' && aggCol) selectSql += `, AVG(b."${aggCol}") AS promedio_${aggCol.replace(/[^a-z0-9]/gi, '_')}`
  if (aggOp === 'both' && aggCol) {
    const safe = aggCol.replace(/[^a-z0-9]/gi, '_')
    selectSql += `, SUM(b."${aggCol}") AS suma_${safe}, AVG(b."${aggCol}") AS promedio_${safe}`
  }

  return [
    `SELECT ${selectSql}`,
    `FROM "${leftTable}" a`,
    `${joinType} "${rightTable}" b`,
    `  ON ${joinCondition}`,
    `GROUP BY a."${baseGroup}"`,
    `ORDER BY 2 DESC`,
    `LIMIT ${MAX_JOIN_ROWS};`,
  ].join('\n')
}

function Section({ num, title, children }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: G.primary }}>
          {num}
        </div>
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: G.dark }}>{title}</span>
      </div>
      {children}
    </section>
  )
}

function buildColumnOptions(columns, commonPairs, side) {
  const options = []
  if (commonPairs.length) {
    options.push({ value: MATCH_ALL, label: `Todo el archivo (${commonPairs.length} columna(s) comunes)` })
  }
  columns.forEach((column) => {
    const isCommon = commonPairs.some((pair) => pair[side] === column.name)
    options.push({
      value: column.name,
      label: `${column.name} (${column.type})${isCommon ? ' · comun' : ''}`,
    })
  })
  return options
}

export default function CrossWizard({ tables, onClose, onResult, onAskAssistant }) {
  const [leftTable, setLeftTable] = useState(tables[0]?.name || '')
  const [rightTable, setRightTable] = useState(tables[1]?.name || '')
  const [joinCol, setJoinCol] = useState('')
  const [rightJoinCol, setRightJoinCol] = useState('')
  const [joinType, setJoinType] = useState('LEFT JOIN')
  const [aggOp, setAggOp] = useState('none')
  const [aggCol, setAggCol] = useState('')
  const [groupBy, setGroupBy] = useState('')
  const [postAction, setPostAction] = useState('only_result')
  const [targetTable, setTargetTable] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState(null)
  const [aiSuggestion, setAiSuggestion] = useState(null)
  const [joinHealth, setJoinHealth] = useState(null)
  const [activePreset, setActivePreset] = useState('safe')
  const [sqlOpen, setSqlOpen] = useState(false)
  const [normalizeRules, setNormalizeRules] = useState({ trimValues: true, upperValues: false, alnumOnly: false })
  const [simState, setSimState] = useState({ running: false, step: 0 })
  const [crossMode, setCrossMode] = useState('join')
  const [lookupColumns, setLookupColumns] = useState([])
  const [insertAfterColumn, setInsertAfterColumn] = useState('__end__')
  const [draggingLookupColumn, setDraggingLookupColumn] = useState(null)

  useEffect(() => {
    if (!tables?.length) return
    const names = tables.map(t => t.name)
    if (!names.includes(leftTable)) setLeftTable(names[0] || '')
    if (!names.includes(rightTable) || rightTable === leftTable) {
      const alt = names.find(n => n !== (leftTable || names[0])) || names[1] || ''
      setRightTable(alt)
    }
  }, [tables, leftTable, rightTable])

  const leftMeta = tables.find((table) => table.name === leftTable)
  const rightMeta = tables.find((table) => table.name === rightTable)
  const leftCols = leftMeta?.columns || []
  const rightCols = rightMeta?.columns || []
  const commonPairs = useMemo(() => getCommonColumnPairs(leftCols, rightCols), [leftCols, rightCols])
  const wholeFileMatch = joinCol === MATCH_ALL && rightJoinCol === MATCH_ALL
  const matchPairs = wholeFileMatch ? commonPairs : (joinCol && rightJoinCol ? [{ left: joinCol, right: rightJoinCol }] : [])
  const leftOptions = useMemo(() => buildColumnOptions(leftCols, commonPairs, 'left'), [leftCols, commonPairs])
  const rightOptions = useMemo(() => buildColumnOptions(rightCols, commonPairs, 'right'), [rightCols, commonPairs])
  const numericRightCols = useMemo(() => rightCols.filter((column) => {
    const type = String(column.type || '').toUpperCase()
    return ['INTEGER', 'BIGINT', 'DOUBLE', 'FLOAT', 'DECIMAL', 'NUMERIC', 'HUGEINT', 'UBIGINT', 'SMALLINT', 'TINYINT'].some((name) => type.includes(name))
  }), [rightCols])

  useEffect(() => {
    setTargetTable(leftTable || '')
  }, [leftTable])

  useEffect(() => {
    setError(null)
    if (!leftTable || !rightTable || leftTable === rightTable) return
    if (!commonPairs.length) {
      setJoinCol('')
      setRightJoinCol('')
      return
    }
    if (!joinCol || !rightJoinCol) {
      setJoinCol(MATCH_ALL)
      setRightJoinCol(MATCH_ALL)
    }
  }, [leftTable, rightTable, commonPairs, joinCol, rightJoinCol])

  // Smart Join: predicción automática de FK al cambiar tablas
  useEffect(() => {
    if (!leftTable || !rightTable || leftTable === rightTable) { setAiSuggestion(null); return }
    const pred = predictBestJoinPair(leftCols, rightCols)
    setAiSuggestion(pred)
    // Auto-seleccionar si la confianza es alta y no hay selección previa
    if (pred && pred.confidence === 'alta' && !joinCol) {
      setJoinCol(pred.left)
      setRightJoinCol(pred.right)
    }
  }, [leftTable, rightTable, leftCols, rightCols]) // eslint-disable-line

  useEffect(() => {
    if (!aggCol && numericRightCols.length) setAggCol(numericRightCols[0].name)
  }, [aggCol, numericRightCols])

  const warnings = useMemo(() => {
    const next = []
    if (!commonPairs.length) next.push('Estos archivos no tienen columnas con el mismo nombre. Necesitas campos equivalentes para cruzarlos.')
    if (wholeFileMatch && commonPairs.length) next.push(`Se cruzaran usando todas las columnas comunes: ${commonPairs.map((pair) => pair.left).join(', ')}`)
    if ((leftMeta?.rowCount || 0) > 100000 || (rightMeta?.rowCount || 0) > 100000) next.push('Archivos grandes detectados. Si tarda, filtra primero o usa Intersección.')
    if (crossMode === 'lookup' && wholeFileMatch) next.push('Modo BuscarV requiere una columna clave específica por lado, no "todo el archivo".')
    return next
  }, [commonPairs, wholeFileMatch, leftMeta?.rowCount, rightMeta?.rowCount, crossMode])

  const lookupCandidates = useMemo(() => {
    if (!rightCols.length) return []
    const blocked = new Set([rightJoinCol, MATCH_ALL])
    return rightCols.filter((col) => !blocked.has(col.name))
  }, [rightCols, rightJoinCol])

  useEffect(() => {
    if (!rightCols.length) {
      setLookupColumns([])
      return
    }
    if (!lookupColumns.length) {
      const firstCandidate = rightCols.find((col) => col.name !== rightJoinCol)
      if (firstCandidate) setLookupColumns([firstCandidate.name])
      return
    }
    setLookupColumns((prev) => prev.filter((colName) => rightCols.some((col) => col.name === colName)))
  }, [rightCols, rightJoinCol, lookupColumns.length])

  const addLookupColumn = useCallback((columnName) => {
    if (!columnName) return
    setLookupColumns((prev) => (prev.includes(columnName) ? prev : [...prev, columnName]))
  }, [])

  const removeLookupColumn = useCallback((columnName) => {
    setLookupColumns((prev) => prev.filter((entry) => entry !== columnName))
  }, [])

  const moveLookupColumn = useCallback((columnName, direction) => {
    setLookupColumns((prev) => {
      const idx = prev.indexOf(columnName)
      if (idx === -1) return prev
      const target = direction === 'up' ? idx - 1 : idx + 1
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      const swap = next[target]
      next[target] = next[idx]
      next[idx] = swap
      return next
    })
  }, [])

  const sqlPreview = useMemo(
    () => buildSQL({ leftTable, rightTable, leftCols, rightCols, joinType, aggOp, aggCol, groupBy, wholeFileMatch, matchPairs, normalizeRules, crossMode, lookupColumns, insertAfterColumn }),
    [leftTable, rightTable, leftCols, rightCols, joinType, aggOp, aggCol, groupBy, wholeFileMatch, matchPairs, normalizeRules, crossMode, lookupColumns, insertAfterColumn]
  )

  const needsAggCol = ['sum', 'avg', 'both'].includes(aggOp)
  const needsTarget = postAction === 'replace_main' || postAction === 'append_to_table'
  const canExecute = Boolean(
    leftTable &&
    rightTable &&
    leftTable !== rightTable &&
    matchPairs.length &&
    (crossMode !== 'lookup' || (lookupColumns.length > 0 && !wholeFileMatch)) &&
    (!needsAggCol || aggCol) &&
    (!needsTarget || targetTable)
  )

  const assistantPrompts = useMemo(() => {
    if (!leftTable || !rightTable) return []
    const base = wholeFileMatch
      ? `Cruza ${leftTable} con ${rightTable} por todas las columnas comunes`
      : `Cruza ${leftTable} con ${rightTable} por ${joinCol || 'columna A'} y ${rightJoinCol || 'columna B'}`
    return [
      `Diagnostica este cruce: ${base}. Quiero causas probables de baja coincidencia y plan de limpieza.`,
      `Propón la mejor estrategia para subir el match entre ${leftTable} y ${rightTable} sin perder filas clave.`,
      `Explícame qué tipo de cruce conviene (${joinType}) para ${leftTable} y ${rightTable} y por qué.`,
    ]
  }, [leftTable, rightTable, wholeFileMatch, joinCol, rightJoinCol, joinType])

  const stepState = useMemo(() => {
    const s1 = Boolean(leftTable && rightTable && leftTable !== rightTable)
    const s2 = Boolean(matchPairs.length)
    const s3 = Boolean(joinType)
    const s4 = Boolean(!needsAggCol || aggCol)
    const s5 = Boolean(!needsTarget || targetTable)
    const done = [s1, s2, s3, s4, s5].filter(Boolean).length
    return { s1, s2, s3, s4, s5, done, pct: Math.round((done / 5) * 100) }
  }, [leftTable, rightTable, matchPairs.length, joinType, needsAggCol, aggCol, needsTarget, targetTable])

  const applyPreset = useCallback((preset) => {
    setJoinType(preset.joinType)
    setAggOp(preset.aggOp)
    setActivePreset(preset.key)
  }, [])

  const comparisonStats = useMemo(() => {
    const common = commonPairs.length
    return {
      leftRows: leftMeta?.rowCount || 0,
      rightRows: rightMeta?.rowCount || 0,
      leftCols: leftCols.length,
      rightCols: rightCols.length,
      common,
      density: (leftCols.length && rightCols.length)
        ? Math.round((common / Math.min(leftCols.length, rightCols.length)) * 100)
        : 0,
    }
  }, [commonPairs.length, leftMeta?.rowCount, rightMeta?.rowCount, leftCols.length, rightCols.length])

  const runSimulation = useCallback(() => {
    if (simState.running || !leftTable || !rightTable || !matchPairs.length) return
    setSimState({ running: true, step: 0 })
    setTimeout(() => setSimState({ running: true, step: 1 }), 350)
    setTimeout(() => setSimState({ running: true, step: 2 }), 800)
    setTimeout(() => setSimState({ running: true, step: 3 }), 1250)
    setTimeout(() => setSimState({ running: false, step: 3 }), 1550)
  }, [simState.running, leftTable, rightTable, matchPairs.length])

  // Estimador rápido de calidad del cruce (muestra pequeña para respuesta inmediata)
  useEffect(() => {
    let alive = true
    async function estimateJoinHealth() {
      if (!leftTable || !rightTable || !matchPairs.length) {
        if (alive) setJoinHealth(null)
        return
      }
      try {
        const cond = buildJoinCondition(matchPairs, normalizeRules)
        const sampleLimit = 1200
        const sql = [
          'WITH sample_a AS (',
          `  SELECT * FROM "${leftTable}" LIMIT ${sampleLimit}`,
          '),',
          'stats AS (',
          '  SELECT',
          '    COUNT(*) AS total_a,',
          `    COUNT(*) FILTER (WHERE b."${matchPairs[0].right}" IS NOT NULL) AS matched_a`,
          '  FROM sample_a a',
          `  ${joinType} "${rightTable}" b`,
          `    ON ${cond}`,
          ')',
          'SELECT total_a, matched_a FROM stats;',
        ].join('\n')
        const res = await executeQuery(sql)
        if (!alive) return
        const totalA = Number(res?.rows?.[0]?.total_a || 0)
        const matchedA = Number(res?.rows?.[0]?.matched_a || 0)
        const pct = totalA > 0 ? Math.round((matchedA / totalA) * 100) : 0
        const level = pct >= 85 ? 'alta' : pct >= 60 ? 'media' : 'baja'
        setJoinHealth({ totalA, matchedA, pct, level })
      } catch {
        if (alive) setJoinHealth(null)
      }
    }
    estimateJoinHealth()
    return () => { alive = false }
  }, [leftTable, rightTable, joinType, matchPairs, normalizeRules])

  async function handleExecute() {
    if (!canExecute || !sqlPreview) return
    setIsRunning(true)
    setError(null)
    try {
      const result = await executeQuery(sqlPreview)
      const stats = (result.rows || []).reduce((acc, row) => {
        if (row['Coincide'] === 'SI') acc.matched += 1
        if (row['Coincide'] === 'NO') acc.unmatched += 1
        return acc
      }, { matched: 0, unmatched: 0 })

      let updatedTableMeta = null
      if (needsTarget && targetTable) {
        const tmpTable = `__tmp_cross_${Date.now()}`
        const baseSql = sqlPreview.replace(/;\s*$/, '')
        await executeStatement(`CREATE TABLE "${tmpTable}" AS ${baseSql}`)
        await executeStatement(`DROP TABLE IF EXISTS "${targetTable}"`)
        await executeStatement(`ALTER TABLE "${tmpTable}" RENAME TO "${targetTable}"`)
        const columns = await describeTable(targetTable)
        updatedTableMeta = {
          name: targetTable,
          rowCount: result.rowCount,
          columns,
          source: 'cross_wizard',
        }
      }

      onResult?.({
        ...result,
        duration: '—',
        crossContext: {
          leftTable,
          rightTable,
          joinType,
          joinLabel: JOIN_TYPES.find((item) => item.value === joinType)?.label || joinType,
          aggOp,
          aggLabel: AGG_OPS.find((item) => item.value === aggOp)?.label || aggOp,
          aggCol: needsAggCol ? aggCol : null,
          joinCol: wholeFileMatch ? 'Todo el archivo' : joinCol,
          rightJoinCol: wholeFileMatch ? 'Todo el archivo' : rightJoinCol,
          wholeFileMatch,
          matchPairs,
          sql: sqlPreview,
          rowCount: result.rowCount,
          matchedRows: stats.matched,
          unmatchedRows: stats.unmatched,
          limited: result.rowCount >= MAX_JOIN_ROWS,
          postAction,
          targetTable,
          crossMode,
          lookupColumns,
          insertAfterColumn,
          updatedTableMeta,
        },
      })
      onClose()
    } catch (caught) {
      const message = caught?.message || String(caught)
      if (message.toLowerCase().includes('oom') || message.toLowerCase().includes('out of memory') || message.includes('malloc')) {
        setError('El cruce superó la memoria disponible. Reduce filas, filtra antes o usa Intersección.')
      } else {
        setError(`No pude ejecutar el cruce. ${message}`)
      }
    } finally {
      setIsRunning(false)
    }
  }

  const selectStyle = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 8,
    fontSize: '0.8rem',
    background: '#fff',
    border: `1px solid ${G.border}`,
    outline: 'none',
    color: G.text,
    fontFamily: 'Inter, sans-serif',
  }
  const cardActive = { background: G.light, border: `1px solid ${G.primary}`, cursor: 'pointer' }
  const cardIdle = { background: '#fff', border: `1px solid ${G.border}`, cursor: 'pointer' }

  return (
    <motion.div key="cross-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <motion.div initial={{ scale: 0.94, opacity: 0, y: 24 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 16 }} transition={spring} className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-y-auto rounded-2xl" style={{ background: '#F4F7F4', boxShadow: '0 24px 60px rgba(0,0,0,0.25)', border: `1px solid ${G.border}` }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ background: G.dark }}>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg text-lg" style={{ background: 'rgba(255,255,255,0.15)' }}>⋈</div>
            <div>
              <h2 className="text-sm font-bold text-white">Asistente de Cruce de Archivos</h2>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>Cruce por columnas o por todo el archivo usando columnas comunes</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full text-xs text-white" style={{ background: 'rgba(255,255,255,0.15)' }}>✕</button>
        </div>

        <div className="flex flex-col gap-5 p-6">
          <section className="rounded-2xl border p-4" style={{ borderColor: G.border, background: 'linear-gradient(130deg, #FFFFFF, #F7FBF7)' }}>
            <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: G.dim }}>Comparación visual A vs B</div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="rounded-xl border px-3 py-3" style={{ borderColor: G.border, background: '#fff' }}>
                <div className="text-xs font-bold truncate" style={{ color: G.dark }}>{leftTable || 'Tabla A'}</div>
                <div className="mt-1 text-[11px]" style={{ color: G.dim }}>{comparisonStats.leftRows.toLocaleString()} filas · {comparisonStats.leftCols} cols</div>
              </div>
              <div className="text-center text-lg">⋈</div>
              <div className="rounded-xl border px-3 py-3" style={{ borderColor: G.border, background: '#fff' }}>
                <div className="text-xs font-bold truncate" style={{ color: G.dark }}>{rightTable || 'Tabla B'}</div>
                <div className="mt-1 text-[11px]" style={{ color: G.dim }}>{comparisonStats.rightRows.toLocaleString()} filas · {comparisonStats.rightCols} cols</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg border px-3 py-2" style={{ borderColor: G.border, background: '#fff', color: G.text2 }}>
                Columnas comunes: <strong style={{ color: G.dark }}>{comparisonStats.common}</strong>
              </div>
              <div className="rounded-lg border px-3 py-2" style={{ borderColor: G.border, background: '#fff', color: G.text2 }}>
                Compatibilidad: <strong style={{ color: G.dark }}>{comparisonStats.density}%</strong>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border p-4" style={{ borderColor: G.border, background: 'linear-gradient(120deg, #FFFFFF, #F1F8F3)' }}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: G.dim }}>Ruta visual de cruce</div>
                <div className="text-xs" style={{ color: G.text2 }}>Configura en orden y ejecuta con confianza.</div>
              </div>
              <div className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: '#E8F5E9', color: G.dark }}>{stepState.pct}% listo</div>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ background: '#E4EFE4' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${stepState.pct}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 18 }}
                style={{ height: '100%', background: 'linear-gradient(90deg, #43A047, #1B5E20)' }}
              />
            </div>
            <div className="mt-3 grid grid-cols-5 gap-2 text-[10px]">
              {[
                ['Archivos', stepState.s1],
                ['Enlace', stepState.s2],
                ['Tipo', stepState.s3],
                ['Cálculo', stepState.s4],
                ['Destino', stepState.s5],
              ].map(([label, ok]) => (
                <div key={label} className="rounded-lg border px-2 py-1 text-center" style={{ borderColor: ok ? '#A5D6A7' : '#DCE8DC', background: ok ? '#F1F8F1' : '#fff', color: ok ? '#1B5E20' : G.dim }}>
                  {ok ? '✓' : '○'} {label}
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: G.primary }}>S</div>
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: G.dark }}>Estrategia sugerida</span>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {STRATEGY_PRESETS.map((preset) => {
                const selected = activePreset === preset.key
                return (
                  <motion.button
                    key={preset.key}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => applyPreset(preset)}
                    className="rounded-xl px-3 py-2.5 text-left text-xs"
                    style={{
                      border: `1px solid ${selected ? '#81C784' : G.border}`,
                      background: selected ? 'linear-gradient(135deg, #F1F8F1, #E8F5E9)' : '#fff',
                      color: G.text,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 14 }}>{preset.icon}</span>
                      <span className="font-bold" style={{ color: selected ? G.dark : G.text }}>{preset.title}</span>
                    </div>
                    <div className="mt-1 text-[11px]" style={{ color: G.dim }}>{preset.desc}</div>
                  </motion.button>
                )
              })}
            </div>
          </section>

          <Section num="1" title="Archivos a cruzar">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Archivo A (izquierda)', value: leftTable, setter: setLeftTable, other: rightTable },
                { label: 'Archivo B (derecha)', value: rightTable, setter: setRightTable, other: leftTable },
              ].map((item) => (
                <div key={item.label}>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: G.dim }}>{item.label}</p>
                  <div className="flex flex-col gap-1.5">
                    {tables.map((table) => {
                      const selected = table.name === item.value
                      const blocked = table.name === item.other
                      return (
                        <motion.button key={table.name} whileHover={!blocked ? { scale: 1.01 } : {}} disabled={blocked} onClick={() => item.setter(table.name)} className="w-full rounded-lg px-3 py-2.5 text-left text-xs transition-all" style={{ ...(selected ? cardActive : cardIdle), opacity: blocked ? 0.45 : 1, cursor: blocked ? 'not-allowed' : 'pointer' }}>
                          <div className="truncate font-semibold" style={{ color: G.text }}>{table.name}</div>
                          <div style={{ color: G.dim }}>{table.rowCount?.toLocaleString()} filas · {table.columns?.length} columnas</div>
                        </motion.button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section num="2" title="Columnas de enlace">
            <div className="grid grid-cols-2 gap-3">
              {aiSuggestion && (
                <div className="col-span-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: '#E8F4FD', border: '1px solid #BBDEFB' }}>
                  <span style={{ fontSize: 13 }}>🤖</span>
                  <div style={{ flex: 1, minWidth: 0, fontFamily: 'Inter,sans-serif' }}>
                    <span style={{ fontWeight: 700, color: '#0D47A1' }}>IA detectó FK probable: </span>
                    <span style={{ color: '#1565C0' }}>"{aiSuggestion.left}" ↔ "{aiSuggestion.right}"</span>
                    <span style={{ marginLeft: 8, padding: '1px 7px', borderRadius: 10, fontSize: '0.63rem', fontWeight: 700, background: aiSuggestion.confColor, color: 'white' }}>
                      confianza {aiSuggestion.confidence}
                    </span>
                  </div>
                  {aiSuggestion.confidence !== 'alta' && (
                    <button
                      onClick={() => { setJoinCol(aiSuggestion.left); setRightJoinCol(aiSuggestion.right) }}
                      style={{ padding: '3px 10px', borderRadius: 7, border: '1px solid #90CAF9', background: '#fff', color: '#0D47A1', fontSize: '0.68rem', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
                    >Aplicar sugerencia</button>
                  )}
                </div>
              )}
              <div>
                <p className="mb-1.5 text-[10px] font-semibold" style={{ color: G.dim }}>Columna de A ({leftTable || 'sin seleccionar'})</p>
                <select value={joinCol} onChange={(event) => { const next = event.target.value; setJoinCol(next); if (next === MATCH_ALL) setRightJoinCol(MATCH_ALL) }} style={selectStyle}>
                  <option value="">— Elige columna —</option>
                  {leftOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <p className="mb-1.5 text-[10px] font-semibold" style={{ color: G.dim }}>Columna de B ({rightTable || 'sin seleccionar'})</p>
                <select value={rightJoinCol} onChange={(event) => { const next = event.target.value; setRightJoinCol(next); if (next === MATCH_ALL) setJoinCol(MATCH_ALL) }} style={selectStyle}>
                  <option value="">— Elige columna —</option>
                  {rightOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </div>
          </Section>

          <Section num="2.1" title="Modo de cruce">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <button
                onClick={() => setCrossMode('join')}
                className="rounded-lg px-3 py-2.5 text-left text-xs"
                style={crossMode === 'join' ? cardActive : cardIdle}>
                <div className="font-bold" style={{ color: G.text }}>Cruce completo</div>
                <div style={{ color: G.dim }}>Une tablas y devuelve coincidencias con todas las columnas relevantes.</div>
              </button>
              <button
                onClick={() => {
                  setCrossMode('lookup')
                  setJoinType('LEFT JOIN')
                  setAggOp('none')
                }}
                className="rounded-lg px-3 py-2.5 text-left text-xs"
                style={crossMode === 'lookup' ? cardActive : cardIdle}>
                <div className="font-bold" style={{ color: G.text }}>BuscarV (Excel)</div>
                <div style={{ color: G.dim }}>Trae columnas de B a A, eligiendo orden y posición en la tabla destino.</div>
              </button>
            </div>
          </Section>

          <AnimatePresence>
            {crossMode === 'lookup' && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <Section num="2.2" title="Columnas a traer de B">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold" style={{ color: G.dim }}>Agregar columna desde {rightTable || 'B'}</p>
                      <select
                        defaultValue=""
                        onChange={(event) => {
                          addLookupColumn(event.target.value)
                          event.target.value = ''
                        }}
                        style={selectStyle}>
                        <option value="">— Selecciona columna —</option>
                        {lookupCandidates.map((column) => (
                          <option key={column.name} value={column.name}>{column.name} ({column.type})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold" style={{ color: G.dim }}>Posición de inserción en {leftTable || 'A'}</p>
                      <select value={insertAfterColumn} onChange={(event) => setInsertAfterColumn(event.target.value)} style={selectStyle}>
                        <option value="__start__">Al inicio de la tabla</option>
                        {leftCols.map((col) => (
                          <option key={col.name} value={col.name}>Después de {col.name}</option>
                        ))}
                        <option value="__end__">Al final de la tabla</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2">
                    {!lookupColumns.length && (
                      <div className="rounded-lg px-3 py-2 text-xs" style={{ border: `1px dashed ${G.border}`, color: G.dim, background: '#fff' }}>
                        No hay columnas seleccionadas para traer desde la tabla B.
                      </div>
                    )}
                    {lookupColumns.map((colName) => (
                      <div
                        key={colName}
                        draggable
                        onDragStart={() => setDraggingLookupColumn(colName)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (!draggingLookupColumn || draggingLookupColumn === colName) return
                          setLookupColumns((prev) => {
                            const from = prev.indexOf(draggingLookupColumn)
                            const to = prev.indexOf(colName)
                            if (from === -1 || to === -1) return prev
                            const next = [...prev]
                            const [moved] = next.splice(from, 1)
                            next.splice(to, 0, moved)
                            return next
                          })
                          setDraggingLookupColumn(null)
                        }}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                        style={{ border: `1px solid ${G.border}`, background: '#fff' }}>
                        <span style={{ color: G.dim, cursor: 'grab' }}>⋮⋮</span>
                        <span className="flex-1" style={{ color: G.text, fontWeight: 700 }}>{colName}</span>
                        <button onClick={() => moveLookupColumn(colName, 'up')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: G.dim }}>↑</button>
                        <button onClick={() => moveLookupColumn(colName, 'down')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: G.dim }}>↓</button>
                        <button onClick={() => removeLookupColumn(colName)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#C62828', fontWeight: 700 }}>Quitar</button>
                      </div>
                    ))}
                  </div>
                </Section>
              </motion.div>
            )}
          </AnimatePresence>

          <Section num="2.2" title="Auto-corrección de claves">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {[
                { key: 'trimValues', label: 'Recortar espacios', hint: 'TRIM' },
                { key: 'upperValues', label: 'Ignorar mayúsculas', hint: 'UPPER' },
                { key: 'alnumOnly', label: 'Quitar símbolos', hint: 'A-Z 0-9' },
              ].map(opt => {
                const on = !!normalizeRules[opt.key]
                return (
                  <button
                    key={opt.key}
                    onClick={() => setNormalizeRules(prev => ({ ...prev, [opt.key]: !prev[opt.key] }))}
                    className="rounded-xl px-3 py-2 text-left text-xs"
                    style={{
                      border: `1px solid ${on ? '#81C784' : G.border}`,
                      background: on ? '#F1F8F1' : '#fff',
                      color: on ? G.dark : G.text2,
                    }}
                  >
                    <div className="font-bold">{on ? '✓' : '○'} {opt.label}</div>
                    <div className="mt-0.5 text-[10px]" style={{ color: G.dim }}>{opt.hint}</div>
                  </button>
                )
              })}
            </div>
          </Section>

          <Section num="2.5" title="Copiloto de Cruce">
            <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg, #F1F8F3, #E8F4FD)', border: `1px solid ${G.border}` }}>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm" style={{ background: '#1565C0', color: '#fff' }}>◈</div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold" style={{ color: '#0D47A1' }}>Asistente virtual conectado al cruce</p>
                  <p className="mt-1 text-[11px] leading-relaxed" style={{ color: '#1E3A5F' }}>
                    Te ayudo a explicar por qué no cruza, qué columnas conviene normalizar y qué estrategia maximiza coincidencias.
                  </p>
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                    {assistantPrompts.map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => onAskAssistant?.(prompt)}
                        className="rounded-lg px-3 py-2 text-left text-[11px] leading-snug transition-all"
                        style={{ border: '1px solid #BBDEFB', background: '#fff', color: '#0D47A1' }}
                      >
                        {idx === 0 ? 'Diagnóstico automático' : idx === 1 ? 'Subir tasa de match' : 'Elegir tipo de join'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {joinHealth && (
                <div className="mt-3 rounded-lg border px-3 py-2" style={{ borderColor: '#BFD4BF', background: '#fff' }}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: G.dim }}>Predicción rápida del cruce</div>
                  <div className="mt-1 text-xs" style={{ color: G.text }}>
                    Match estimado: <strong>{joinHealth.pct}%</strong> ({joinHealth.matchedA.toLocaleString()} de {joinHealth.totalA.toLocaleString()} filas muestra)
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: '#E4EFE4' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(4, joinHealth.pct)}%` }}
                      transition={{ type: 'spring', stiffness: 90, damping: 16 }}
                      style={{
                        height: '100%',
                        background: joinHealth.level === 'alta'
                          ? 'linear-gradient(90deg, #2E7D32, #1B5E20)'
                          : joinHealth.level === 'media'
                            ? 'linear-gradient(90deg, #F9A825, #E65100)'
                            : 'linear-gradient(90deg, #EF5350, #C62828)',
                      }}
                    />
                  </div>
                  <div className="mt-1 text-[11px]" style={{ color: joinHealth.level === 'alta' ? '#1B5E20' : joinHealth.level === 'media' ? '#E65100' : '#C62828' }}>
                    Calidad {joinHealth.level} {joinHealth.level === 'baja' ? '• recomendado: normalizar IDs y recortar espacios.' : ''}
                  </div>
                </div>
              )}
            </div>
          </Section>

          <Section num="3" title="Tipo de cruce">
            <div className="grid grid-cols-2 gap-2">
              {JOIN_TYPES.map((join) => {
                const selected = join.value === joinType
                const disabledByLookup = crossMode === 'lookup' && join.value !== 'LEFT JOIN'
                return (
                  <motion.button key={join.value} whileHover={!disabledByLookup ? { scale: 1.01 } : {}} whileTap={!disabledByLookup ? { scale: 0.98 } : {}} onClick={() => !disabledByLookup && setJoinType(join.value)} className="rounded-lg px-3 py-2.5 text-left text-xs transition-all" style={{ ...(selected ? cardActive : cardIdle), opacity: disabledByLookup ? 0.46 : 1, cursor: disabledByLookup ? 'not-allowed' : 'pointer' }}>
                    <span className="mr-1.5 text-base">{join.icon}</span>
                    <span className="font-bold" style={{ color: selected ? G.dark : G.text }}>{join.label}</span>
                    <div className="mt-0.5" style={{ color: G.dim }}>{join.desc}</div>
                  </motion.button>
                )
              })}
            </div>
          </Section>

          <Section num="4" title="¿Qué calcular?">
            <div className="grid grid-cols-3 gap-2">
              {AGG_OPS.map((op) => {
                const selected = op.value === aggOp
                const disabledByLookup = crossMode === 'lookup' && op.value !== 'none'
                return (
                  <motion.button key={op.value} whileHover={!disabledByLookup ? { scale: 1.01 } : {}} whileTap={!disabledByLookup ? { scale: 0.98 } : {}} onClick={() => !disabledByLookup && setAggOp(op.value)} className="rounded-lg px-3 py-2.5 text-left text-xs transition-all" style={{ ...(selected ? cardActive : cardIdle), opacity: disabledByLookup ? 0.46 : 1, cursor: disabledByLookup ? 'not-allowed' : 'pointer' }}>
                    <div className="mb-0.5 text-base">{op.icon}</div>
                    <div className="font-bold leading-tight" style={{ color: selected ? G.dark : G.text }}>{op.label}</div>
                    <div className="mt-0.5 leading-snug" style={{ color: G.dim }}>{op.desc}</div>
                  </motion.button>
                )
              })}
            </div>
            <AnimatePresence>
              {needsAggCol && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-3 overflow-hidden">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold" style={{ color: G.dim }}>Columna numérica de B</p>
                      <select value={aggCol} onChange={(event) => setAggCol(event.target.value)} style={selectStyle}>
                        <option value="">— Elige columna numérica —</option>
                        {numericRightCols.map((column) => <option key={column.name} value={column.name}>{column.name} ({column.type})</option>)}
                      </select>
                    </div>
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold" style={{ color: G.dim }}>Agrupar por (opcional)</p>
                      <select value={groupBy} onChange={(event) => setGroupBy(event.target.value)} style={selectStyle}>
                        <option value="">— Automática —</option>
                        {leftCols.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}
                      </select>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Section>

          <Section num="5" title="¿Qué hacer con el resultado?">
            <div className="grid grid-cols-1 gap-2">
              {[
                { key: 'only_result', title: 'Solo mostrar resultado', desc: 'Muestra el cruce sin alterar archivos existentes' },
                { key: 'replace_main', title: 'Actualizar archivo principal', desc: 'Sobrescribe el archivo seleccionado con el resultado del cruce' },
                { key: 'append_to_table', title: 'Agregar el cruce a un archivo', desc: 'Agrega el resultado del cruce al archivo que elijas' },
              ].map((option) => {
                const selected = option.key === postAction
                return (
                  <motion.button key={option.key} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} onClick={() => setPostAction(option.key)} className="rounded-lg px-3 py-2.5 text-left text-xs transition-all" style={selected ? cardActive : cardIdle}>
                    <div className="font-bold" style={{ color: selected ? G.dark : G.text }}>{option.title}</div>
                    <div className="mt-0.5" style={{ color: G.dim }}>{option.desc}</div>
                  </motion.button>
                )
              })}
            </div>

            {(postAction === 'replace_main' || postAction === 'append_to_table') && (
              <div className="mt-3">
                <p className="mb-1.5 text-[10px] font-semibold" style={{ color: G.dim }}>
                  {postAction === 'replace_main' ? 'Archivo principal a actualizar' : 'Archivo donde se agregará el cruce'}
                </p>
                <select value={targetTable} onChange={(event) => setTargetTable(event.target.value)} style={selectStyle}>
                  <option value="">— Selecciona archivo —</option>
                  {tables.map((table) => <option key={table.name} value={table.name}>{table.name}</option>)}
                </select>
              </div>
            )}
          </Section>

          <AnimatePresence>
            {warnings.map((warning) => (
              <motion.div key={warning} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-lg px-4 py-3 text-xs" style={{ background: '#FFF8E1', border: '1px solid #FFE082', color: '#8A5D00' }}>
                {warning}
              </motion.div>
            ))}
          </AnimatePresence>

          {sqlPreview && (
            <section>
              <button
                onClick={() => setSqlOpen(v => !v)}
                className="mb-2 flex items-center gap-2"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                <span style={{ transform: sqlOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', fontSize: 10, color: G.dim }}>▶</span>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: G.dim }}>{sqlOpen ? 'Ocultar SQL' : 'Ver SQL que se ejecutará'}</span>
              </button>
              <AnimatePresence>
                {sqlOpen && (
                  <motion.pre
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-x-auto rounded-lg px-4 py-3 text-[10px]"
                    style={{ background: '#fff', color: G.text2, border: `1px solid ${G.border}`, lineHeight: 1.6 }}
                  >
                    {sqlPreview}
                  </motion.pre>
                )}
              </AnimatePresence>
            </section>
          )}

          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="whitespace-pre-line rounded-xl px-4 py-3 text-xs" style={{ background: '#FFF3F3', border: '1px solid #FFCDD2', color: '#C62828' }}>
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <section className="rounded-xl border p-3" style={{ borderColor: G.border, background: '#fff' }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: G.dim }}>Simulación previa</div>
                <div className="text-[11px]" style={{ color: G.text2 }}>Prueba visual antes de ejecutar el cruce completo.</div>
              </div>
              <button
                onClick={runSimulation}
                disabled={!canExecute || simState.running}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{
                  border: `1px solid ${G.border}`,
                  background: !canExecute ? '#EEF4EE' : '#F7FBF7',
                  color: !canExecute ? G.dim : G.dark,
                  cursor: !canExecute || simState.running ? 'not-allowed' : 'pointer',
                }}
              >
                {simState.running ? 'Simulando...' : 'Simular cruce'}
              </button>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: '#E4EFE4' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${simState.running ? Math.min(95, (simState.step + 1) * 28) : (simState.step >= 3 ? 100 : 0)}%` }}
                transition={{ type: 'spring', stiffness: 95, damping: 15 }}
                style={{ height: '100%', background: 'linear-gradient(90deg, #66BB6A, #2E7D32)' }}
              />
            </div>
            <div className="mt-2 text-[11px]" style={{ color: G.dim }}>
              {simState.running
                ? ['Preparando muestra...', 'Normalizando claves...', 'Estimando coincidencias...', 'Finalizando...'][Math.min(simState.step, 3)]
                : simState.step >= 3
                  ? 'Simulación lista. Ya puedes ejecutar el cruce inteligente.'
                  : 'Ejecuta la simulación para visualizar el comportamiento del cruce.'}
            </div>
          </section>

          <motion.button whileHover={canExecute && !isRunning ? { scale: 1.01, boxShadow: '0 0 28px rgba(67,160,71,0.4)' } : {}} whileTap={canExecute && !isRunning ? { scale: 0.985 } : {}} onClick={handleExecute} disabled={!canExecute || isRunning} className="w-full rounded-xl py-3 text-sm font-bold tracking-wide transition-all" style={{ background: canExecute && !isRunning ? `linear-gradient(135deg, ${G.primary} 0%, ${G.dark} 100%)` : '#D7E8D7', color: canExecute ? '#fff' : G.dim, cursor: canExecute && !isRunning ? 'pointer' : 'not-allowed' }}>
            {isRunning ? 'Ejecutando cruce...' : '✨ Ejecutar cruce inteligente'}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
}
