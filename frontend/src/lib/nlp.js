/**
 * Motor de Lenguaje Natural → SQL (DuckDB)
 * Soporta consultas libres en español sobre cualquier tabla cargada.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function findTable(text, tables) {
  const norm = normalize(text)
  let match = tables.find(t => normalize(t.name) === norm)
  if (match) return match.name
  match = tables.find(t => norm.includes(normalize(t.name)) || normalize(t.name).includes(norm))
  if (match) return match.name
  return null
}

function getBestTable(norm, tables) {
  return (
    tables.find(t => norm.includes(normalize(t.name))) ||
    tables[0]
  )
}

function findColumn(text, columns) {
  const norm = normalize(text)
  // exact match first
  let col = columns.find(c => normalize(c.name) === norm)
  if (col) return col
  // partial
  col = columns.find(c => norm.includes(normalize(c.name)) || normalize(c.name).includes(norm))
  return col || null
}

function extractTwoTables(norm, tables) {
  const separators = [' con ', ' y ', ' mas ', ' + ', ',', ' entre ']
  for (const sep of separators) {
    const idx = norm.indexOf(sep)
    if (idx !== -1) {
      const left = norm.slice(0, idx).trim()
      const right = norm.slice(idx + sep.length).trim()
      const t1 = findTable(left, tables)
      const t2 = findTable(right, tables)
      if (t1 && t2) return [t1, t2]
    }
  }
  const found = tables.filter(t => norm.includes(normalize(t.name)))
  if (found.length >= 2) return [found[0].name, found[1].name]
  return []
}

// Extrae un número del texto (ej: "los primeros 50", "top 10", "100 registros")
function extractNumber(norm) {
  const m = norm.match(/\b(\d+)\b/)
  return m ? parseInt(m[1]) : null
}

// Detecta el tipo de ordenamiento
function detectOrder(norm) {
  if (/(desc|mayor.*menor|de.*mayor|descendente)/.test(norm)) return 'DESC'
  if (/(asc|menor.*mayor|de.*menor|ascendente)/.test(norm)) return 'ASC'
  return null
}

// ── Parser principal ──────────────────────────────────────────────────────────

export function parseCommand(input, tables) {
  if (!input?.trim()) return { error: 'Escribe una consulta para comenzar.' }
  if (!tables?.length) return { error: 'No hay tablas cargadas. Primero carga un archivo CSV, Excel o TXT.' }

  const raw = input.trim()
  const norm = normalize(raw)

  // ─── CRUZAR / JOIN ────────────────────────────────────────────────────────
  if (/(cruza|cruzar|join|relaciona|combina|mezcla|enlaza)/.test(norm)) {
    const pair = extractTwoTables(norm, tables)
    if (pair.length < 2) {
      return { error: `Necesito dos tablas. Disponibles: ${tables.map(t => `"${t.name}"`).join(', ')}` }
    }
    const [t1, t2] = pair
    const cols1 = tables.find(t => t.name === t1)?.columns || []
    const cols2 = tables.find(t => t.name === t2)?.columns || []
    const common = cols1.find(c => cols2.some(c2 => normalize(c2.name) === normalize(c.name)))

    let joinCol = null
    const byMatch = norm.match(/(?:por|usando|con el campo|con la columna|by|en|a traves de)\s+(.{1,40})$/)
    if (byMatch) {
      const candidate = findColumn(byMatch[1], cols1) || findColumn(byMatch[1], cols2)
      if (candidate) joinCol = candidate.name
    }
    if (!joinCol && common) joinCol = common.name

    if (!joinCol) {
      return { error: `No encontré columna común entre "${t1}" y "${t2}". Escribe: "Cruza ${t1} con ${t2} por [columna]"` }
    }

    let joinType = 'LEFT JOIN'
    if (/(solo.*comun|inner|solo.*coincide|interseccion)/.test(norm)) joinType = 'INNER JOIN'
    else if (/(todos.*ambos|full|completo|outer)/.test(norm)) joinType = 'FULL OUTER JOIN'
    else if (/(derecha|right)/.test(norm)) joinType = 'RIGHT JOIN'

    const sql = `SELECT *\nFROM "${t1}" a\n${joinType} "${t2}" b\n  ON a."${joinCol}" = b."${joinCol}";`
    return { sql, action: 'query', description: `${joinType} de "${t1}" y "${t2}" por "${joinCol}"` }
  }

  // ─── CONSOLIDAR / UNION / APILAR ──────────────────────────────────────────
  if (/(consolida|consolidar|pega|pegar|une|unir|apila|apilar|union|append|combina.*todas|junta.*todas)/.test(norm)) {
    const pair = extractTwoTables(norm, tables)
    if (pair.length >= 2) {
      const [t1, t2] = pair
      return {
        sql: `SELECT * FROM "${t1}"\nUNION ALL\nSELECT * FROM "${t2}";`,
        action: 'query',
        description: `Consolidación (apilado) de "${t1}" y "${t2}"`,
      }
    }
    if (tables.length >= 2) {
      const sql = tables.map(t => `SELECT * FROM "${t.name}"`).join('\nUNION ALL\n') + ';'
      return { sql, action: 'query', description: `Consolidación de todas las tablas (${tables.length})` }
    }
    return { error: 'Necesitas al menos dos tablas para consolidar.' }
  }

  // ─── ÚLTIMO REGISTRO ──────────────────────────────────────────────────────
  if (/(ultimo|ultima|ultimos|ultimas|last|el.*ultimo|el.*final|mas.*reciente|registro.*final)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const cols = table.columns || []

    // ¿mencionó una columna?
    const col = findColumn(norm.replace(/(ultimo|ultima|ultimos|ultimas|last|mas.*reciente)/g, ''), cols)

    const n = extractNumber(norm) || 1
    const order = detectOrder(norm)

    if (col) {
      // Último valor de esa columna (ORDER BY la misma columna DESC o rowid)
      const dir = order || 'DESC'
      const sql = `SELECT "${col.name}"\nFROM "${table.name}"\nORDER BY "${col.name}" ${dir}\nLIMIT ${n};`
      return { sql, action: 'query', description: `Último${n > 1 ? 's ' + n : ''} valor de columna "${col.name}" en "${table.name}"` }
    }

    // Sin columna especificada — último registro de la tabla
    const sql = `SELECT *\nFROM "${table.name}"\nLIMIT ${n}\nOFFSET (SELECT COUNT(*) FROM "${table.name}") - ${n};`
    return { sql, action: 'query', description: `Último${n > 1 ? 's ' + n : ''} registro de "${table.name}"` }
  }

  // ─── PRIMER REGISTRO / TOP ────────────────────────────────────────────────
  if (/(primer|primeros|primeras|top|inicio|head|encabezado)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const n = extractNumber(norm) || 10
    const sql = `SELECT *\nFROM "${table.name}"\nLIMIT ${n};`
    return { sql, action: 'query', description: `Primeros ${n} registros de "${table.name}"` }
  }

  // ─── MUESTRA COLUMNA ESPECÍFICA ───────────────────────────────────────────
  if (/(muestra.*columna|ver.*columna|dame.*columna|trae.*columna|muestra.*campo|solo.*columna|solo.*campo)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const cols = table.columns || []
    // Buscar columnas mencionadas
    const mentioned = cols.filter(c => norm.includes(normalize(c.name)))
    if (mentioned.length > 0) {
      const selectList = mentioned.map(c => `"${c.name}"`).join(', ')
      const n = extractNumber(norm) || 1000
      const sql = `SELECT ${selectList}\nFROM "${table.name}"\nLIMIT ${n};`
      return { sql, action: 'query', description: `Columna(s) ${mentioned.map(c => `"${c.name}"`).join(', ')} de "${table.name}"` }
    }
  }

  // ─── MÁXIMO / MÍNIMO / PROMEDIO / SUMA ───────────────────────────────────
  const aggMap = [
    { pattern: /(maximo|maxima|max\b|valor.*maximo|mayor.*valor|el.*mayor)/, fn: 'MAX', label: 'Máximo' },
    { pattern: /(minimo|minima|min\b|valor.*minimo|menor.*valor|el.*menor)/, fn: 'MIN', label: 'Mínimo' },
    { pattern: /(promedio|media\b|average|avg\b|media.*de)/, fn: 'AVG', label: 'Promedio' },
    { pattern: /(suma|sumar|total.*de|sumatoria)/, fn: 'SUM', label: 'Suma' },
  ]
  for (const agg of aggMap) {
    if (agg.pattern.test(norm)) {
      const table = getBestTable(norm, tables)
      const cols = table.columns || []
      const numCols = cols.filter(c => ['INTEGER', 'BIGINT', 'DOUBLE', 'FLOAT', 'DECIMAL', 'NUMERIC', 'HUGEINT', 'UBIGINT'].includes(c.type?.toUpperCase()))

      // Buscar columna mencionada
      const cleanNorm = norm.replace(/(maximo|maxima|minimo|minima|promedio|media|suma|sumar|total)/g, '')
      const col = findColumn(cleanNorm, numCols.length > 0 ? numCols : cols)

      // Detectar GROUP BY ("por", "agrupado por", "segun", "por cada")
      const groupMatch = norm.match(/(?:por|segun|por cada|agrupado por|por.*grupo)\s+(.{1,40})/)
      const groupCol = groupMatch ? findColumn(groupMatch[1], cols) : null

      if (col) {
        const agg_expr = `${agg.fn}("${col.name}") AS resultado`
        const orderDir = agg.fn === 'MAX' || agg.fn === 'SUM' ? 'DESC' : 'ASC'
        if (groupCol) {
          const sql = `SELECT "${groupCol.name}", ${agg_expr}\nFROM "${table.name}"\nGROUP BY "${groupCol.name}"\nORDER BY resultado ${orderDir};`
          return { sql, action: 'query', description: `${agg.label} de "${col.name}" por "${groupCol.name}" en "${table.name}"` }
        }
        const sql = `SELECT ${agg_expr}\nFROM "${table.name}";`
        return { sql, action: 'query', description: `${agg.label} de "${col.name}" en "${table.name}"` }
      }

      // Sin columna — aplicar a todas las numéricas
      if (numCols.length > 0) {
        const exprs = numCols.map(c => `${agg.fn}("${c.name}") AS "${agg.label.toLowerCase()}_${c.name}"`).join(',\n       ')
        const sql = `SELECT ${exprs}\nFROM "${table.name}";`
        return { sql, action: 'query', description: `${agg.label} de todas las columnas numéricas de "${table.name}"` }
      }
    }
  }

  // ─── CONTAR ───────────────────────────────────────────────────────────────
  if (/(cuantos|cuantas|cuenta|contar|total.*registros|registros.*totales|count\b|numero.*registros|cuantos.*hay)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const cols = table.columns || []

    // Contar únicos: "cuántos valores únicos tiene la columna X"
    if (/(unicos|unicas|distinct|diferentes|distintos|distintas)/.test(norm)) {
      const cleanNorm = norm.replace(/(unicos|unicas|distinct|diferentes|distintos|distintas|cuantos|cuantas|cuenta|contar)/g, '')
      const col = findColumn(cleanNorm, cols)
      if (col) {
        const sql = `SELECT COUNT(DISTINCT "${col.name}") AS valores_unicos\nFROM "${table.name}";`
        return { sql, action: 'query', description: `Valores únicos en "${col.name}" de "${table.name}"` }
      }
    }

    const sql = `SELECT COUNT(*) AS total_registros FROM "${table.name}";`
    return { sql, action: 'query', description: `Total de registros en "${table.name}"` }
  }

  // ─── VALORES ÚNICOS / DISTINCT ────────────────────────────────────────────
  if (/(unicos|unicas|distinct|diferentes|distintos|distintas|valores.*de|lista.*de)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const cols = table.columns || []
    const cleanNorm = norm.replace(/(unicos|unicas|distinct|diferentes|distintos|distintas|valores|lista)/g, '')
    const col = findColumn(cleanNorm, cols)
    if (col) {
      const sql = `SELECT DISTINCT "${col.name}"\nFROM "${table.name}"\nORDER BY "${col.name}";`
      return { sql, action: 'query', description: `Valores únicos de "${col.name}" en "${table.name}"` }
    }
  }

  // ─── ORDENAR ──────────────────────────────────────────────────────────────
  if (/(ordena|ordenar|orden|sort|clasifica|ranking)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const cols = table.columns || []
    const order = detectOrder(norm) || 'ASC'
    const cleanNorm = norm.replace(/(ordena|ordenar|orden|sort|clasifica|ranking|mayor.*menor|menor.*mayor|desc|asc|descendente|ascendente)/g, '')
    const col = findColumn(cleanNorm, cols)
    const n = extractNumber(norm) || 1000

    if (col) {
      const sql = `SELECT *\nFROM "${table.name}"\nORDER BY "${col.name}" ${order}\nLIMIT ${n};`
      return { sql, action: 'query', description: `"${table.name}" ordenado por "${col.name}" ${order === 'DESC' ? 'descendente' : 'ascendente'}` }
    }
    const sql = `SELECT *\nFROM "${table.name}"\nLIMIT ${n};`
    return { sql, action: 'query', description: `Registros de "${table.name}" (especifica columna para ordenar)` }
  }

  // ─── BUSCAR / FILTRAR por valor ───────────────────────────────────────────
  if (/(busca|buscar|filtra|filtrar|donde|where|que.*sea|que.*tenga|con.*igual|que.*contenga|contiene|que.*diga|valor.*sea|igual.*a|como)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const cols = table.columns || []

    // Intentar extraer: "columna" "operador" "valor"
    // Patrones: "donde X sea Y", "que X sea Y", "donde X igual a Y", "donde X contiene Y", "donde X mayor que Y"
    const patterns = [
      { re: /(?:donde|where|que|con)\s+(.+?)\s+(?:sea igual a|igual a|sea|=)\s+["']?([^"'\n]+?)["']?$/, op: '=' },
      { re: /(?:donde|where|que|con)\s+(.+?)\s+(?:contiene|incluye|like|parecido a)\s+["']?([^"'\n]+?)["']?$/, op: 'LIKE' },
      { re: /(?:donde|where|que|con)\s+(.+?)\s+(?:mayor que|mayor a|mas grande que|>)\s+["']?([^"'\n]+?)["']?$/, op: '>' },
      { re: /(?:donde|where|que|con)\s+(.+?)\s+(?:menor que|menor a|mas pequeno que|<)\s+["']?([^"'\n]+?)["']?$/, op: '<' },
      { re: /(?:donde|where|que|con)\s+(.+?)\s+(?:mayor o igual|>=)\s+["']?([^"'\n]+?)["']?$/, op: '>=' },
      { re: /(?:donde|where|que|con)\s+(.+?)\s+(?:menor o igual|<=)\s+["']?([^"'\n]+?)["']?$/, op: '<=' },
      { re: /(?:donde|where|que|con)\s+(.+?)\s+(?:no sea|no es|diferente de|distinto de|!=|<>)\s+["']?([^"'\n]+?)["']?$/, op: '!=' },
      { re: /(?:donde|where|que|con)\s+(.+?)\s+(?:empiece con|empieza con|inicia con)\s+["']?([^"'\n]+?)["']?$/, op: 'STARTS' },
      { re: /(?:donde|where|que|con)\s+(.+?)\s+(?:termine con|termina con)\s+["']?([^"'\n]+?)["']?$/, op: 'ENDS' },
      { re: /(?:donde|where|que|con)\s+(.+?)\s+(?:este en|en la lista|in)\s+\(?([^)]+)\)?$/, op: 'IN' },
      { re: /(?:donde|where|que|con)\s+(.+?)\s+(?:sea nulo|es nulo|null|vacio|esta vacio)/, op: 'NULL' },
      { re: /(?:donde|where|que|con)\s+(.+?)\s+(?:no sea nulo|no es nulo|not null|no vacio)/, op: 'NOT NULL' },
    ]

    for (const { re, op } of patterns) {
      const m = norm.match(re)
      if (m) {
        const colText = m[1]?.trim()
        const val = m[2]?.trim()
        const col = findColumn(colText, cols)
        if (!col) continue

        const isNumeric = ['INTEGER', 'BIGINT', 'DOUBLE', 'FLOAT', 'DECIMAL', 'NUMERIC', 'HUGEINT'].includes(col.type?.toUpperCase())
        const quote = (v) => isNumeric && !isNaN(v) ? v : `'${v}'`

        let condition = ''
        if (op === '=') condition = `"${col.name}" = ${quote(val)}`
        else if (op === 'LIKE') condition = `"${col.name}" ILIKE '%${val}%'`
        else if (op === 'STARTS') condition = `"${col.name}" ILIKE '${val}%'`
        else if (op === 'ENDS') condition = `"${col.name}" ILIKE '%${val}'`
        else if (op === 'IN') {
          const items = val.split(/,\s*/).map(v => quote(v.trim())).join(', ')
          condition = `"${col.name}" IN (${items})`
        }
        else if (op === 'NULL') condition = `"${col.name}" IS NULL`
        else if (op === 'NOT NULL') condition = `"${col.name}" IS NOT NULL`
        else condition = `"${col.name}" ${op} ${quote(val)}`

        const n = extractNumber(norm.replace(/\d+.*(?:registro|fila|resultado)/,'')) || 1000
        const sql = `SELECT *\nFROM "${table.name}"\nWHERE ${condition}\nLIMIT ${n};`
        return { sql, action: 'query', description: `Filtro en "${table.name}": ${condition}` }
      }
    }

    // Fallback filter: menciona tabla pero sin columna clara
    const colMentioned = findColumn(norm, cols)
    if (colMentioned) {
      return {
        error: `¿Qué valor buscas en "${colMentioned.name}"? Ej: '${raw} sea [valor]'`,
      }
    }

    return {
      error: `Sé más específico. Ej: "Busca en ${table.name} donde [columna] sea [valor]"`,
    }
  }

  // ─── ENTRE DOS VALORES (BETWEEN) ─────────────────────────────────────────
  if (/(entre|between|rango|desde.*hasta)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const cols = table.columns || []
    const m = norm.match(/(.+?)\s+(?:entre|between|en el rango)\s+([\d.]+)\s+(?:y|and|a|hasta|)\s+([\d.]+)/)
    if (m) {
      const col = findColumn(m[1], cols)
      if (col) {
        const sql = `SELECT *\nFROM "${table.name}"\nWHERE "${col.name}" BETWEEN ${m[2]} AND ${m[3]};`
        return { sql, action: 'query', description: `"${col.name}" entre ${m[2]} y ${m[3]} en "${table.name}"` }
      }
    }
  }

  // ─── AGRUPAR (GROUP BY) ───────────────────────────────────────────────────
  if (/(agrupa|agrupar|group.*by|por.*grupo|cuenta.*por|cuantos.*por|total.*por)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const cols = table.columns || []
    const cleanNorm = norm.replace(/(agrupa|agrupar|group.*by|cuenta.*por|cuantos.*por|total.*por)/g, '')
    const col = findColumn(cleanNorm, cols)
    if (col) {
      const sql = `SELECT "${col.name}", COUNT(*) AS total\nFROM "${table.name}"\nGROUP BY "${col.name}"\nORDER BY total DESC;`
      return { sql, action: 'query', description: `Agrupación por "${col.name}" en "${table.name}"` }
    }
  }

  // ─── DESCRIPCIÓN / ESTRUCTURA ─────────────────────────────────────────────
  if (/(describe|estructura|columnas.*de|campos.*de|que.*columnas|que.*campos|info.*tabla|informacion.*tabla)/.test(norm)) {
    const table = tables.find(t => norm.includes(normalize(t.name)))
    if (table) {
      const sql = `DESCRIBE "${table.name}";`
      return { sql, action: 'query', description: `Estructura y tipos de "${table.name}"` }
    }
    const sql = `SHOW TABLES;`
    return { sql, action: 'query', description: 'Tablas cargadas en memoria' }
  }

  // ─── ESTADÍSTICAS COMPLETAS ───────────────────────────────────────────────
  if (/(estadisticas|stats|resumen estadistico|resume|perfil.*datos|data profile)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const sql = `SUMMARIZE "${table.name}";`
    return { sql, action: 'query', description: `Perfil estadístico completo de "${table.name}"` }
  }

  // ─── DUPLICADOS ───────────────────────────────────────────────────────────
  if (/(duplicados|duplicadas|repite|repetidos|repetidas|duplicidade)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const cols = table.columns || []
    const cleanNorm = norm.replace(/(duplicados|duplicadas|repite|repetidos|repetidas)/g, '')
    const col = findColumn(cleanNorm, cols)

    if (col) {
      const sql = `SELECT "${col.name}", COUNT(*) AS apariciones\nFROM "${table.name}"\nGROUP BY "${col.name}"\nHAVING COUNT(*) > 1\nORDER BY apariciones DESC;`
      return { sql, action: 'query', description: `Duplicados en "${col.name}" de "${table.name}"` }
    }

    // Filas completamente duplicadas
    const allCols = cols.map(c => `"${c.name}"`).join(', ')
    const sql = `SELECT ${allCols}, COUNT(*) AS veces\nFROM "${table.name}"\nGROUP BY ${allCols}\nHAVING COUNT(*) > 1\nORDER BY veces DESC\nLIMIT 500;`
    return { sql, action: 'query', description: `Filas duplicadas en "${table.name}"` }
  }

  // ─── NULOS / VACÍOS ───────────────────────────────────────────────────────
  if (/(nulos|vacios|null|sin datos|datos faltantes|faltantes)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const cols = table.columns || []
    const cleanNorm = norm.replace(/(nulos|vacios|null|sin datos|datos faltantes|faltantes)/g, '')
    const col = findColumn(cleanNorm, cols)

    if (col) {
      const sql = `SELECT *\nFROM "${table.name}"\nWHERE "${col.name}" IS NULL OR CAST("${col.name}" AS VARCHAR) = ''\nLIMIT 1000;`
      return { sql, action: 'query', description: `Registros con "${col.name}" nulo en "${table.name}"` }
    }

    // Contar nulos por columna
    const exprs = cols.map(c => `COUNT(*) FILTER (WHERE "${c.name}" IS NULL) AS "${c.name}_nulos"`).join(',\n       ')
    const sql = `SELECT ${exprs}\nFROM "${table.name}";`
    return { sql, action: 'query', description: `Conteo de valores nulos por columna en "${table.name}"` }
  }

  // ─── QUITAR / EXCLUIR COLUMNA ─────────────────────────────────────────────
  if (/(quita|quitar|elimina|eliminar|borra|borrar|sin.*columna|sin.*campo|excluye|excluir|ocualto|sin mostrar)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const cols = table.columns || []
    const cleanNorm = norm.replace(/(quita|quitar|elimina|eliminar|borra|borrar|sin|excluye|excluir|la columna|el campo)/g, '')
    const colToRemove = findColumn(cleanNorm, cols)
    if (!colToRemove) {
      return { error: `No encontré la columna a ocultar. Columnas de "${table.name}": ${cols.map(c => `"${c.name}"`).join(', ')}` }
    }
    const remaining = cols.filter(c => normalize(c.name) !== normalize(colToRemove.name))
    const selectList = remaining.map(c => `"${c.name}"`).join(', ')
    const sql = `SELECT ${selectList}\nFROM "${table.name}"\nLIMIT 1000;`
    return { sql, action: 'query', description: `"${table.name}" sin la columna "${colToRemove.name}"` }
  }

  // ─── EXPORTAR ─────────────────────────────────────────────────────────────
  if (/(exporta|exportar|descarga|descargar|guardar.*csv|guarda.*csv|download)/.test(norm)) {
    return { action: 'export', description: 'Exportando resultado a CSV…', sql: null }
  }

  // ─── AYUDA ────────────────────────────────────────────────────────────────
  if (/(ayuda|help|que puedo|comandos|ejemplos|como usar)/.test(norm)) {
    return { action: 'help', sql: null, description: 'Mostrando asistente de ayuda' }
  }

  // ─── MOSTRAR TABLA COMPLETA ───────────────────────────────────────────────
  if (/(muestra|ver|mostrar|selecciona|trae|dame|visualiza|abre|todo.*de|todos.*de|todo|show)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const n = extractNumber(norm) || 1000
    const order = detectOrder(norm)
    const cols = table.columns || []
    const cleanNorm = norm.replace(/(muestra|ver|mostrar|selecciona|trae|dame|visualiza|abre|todo|todos)/g, '')
    const orderCol = order ? findColumn(cleanNorm, cols) : null

    let sql = `SELECT *\nFROM "${table.name}"\n`
    if (orderCol) sql += `ORDER BY "${orderCol.name}" ${order}\n`
    sql += `LIMIT ${n};`

    return { sql, action: 'query', description: `Primeros ${n} registros de "${table.name}"` }
  }

  // ─── FALLBACK: tabla detectada ────────────────────────────────────────────
  const matchedTable = tables.find(t => norm.includes(normalize(t.name)))
  if (matchedTable) {
    const n = extractNumber(norm) || 1000
    return {
      sql: `SELECT *\nFROM "${matchedTable.name}"\nLIMIT ${n};`,
      action: 'query',
      description: `Mostrando "${matchedTable.name}"`,
    }
  }

  // ─── FALLBACK: SQL directo ────────────────────────────────────────────────
  if (/^select\s/i.test(raw)) {
    return { sql: raw.endsWith(';') ? raw : raw + ';', action: 'query', description: 'Consulta SQL personalizada' }
  }

  const tableNames = tables.map(t => `"${t.name}"`).join(', ')
  return {
    error: `No entendí la consulta. Tablas disponibles: ${tableNames}.\n\nEjemplos:\n• "Dame el último registro de ${tables[0]?.name}"\n• "Busca en ${tables[0]?.name} donde [columna] sea [valor]"\n• "Máximo de [columna] por [grupo]"\n• "Duplicados en [columna]"\n• "Valores únicos de [columna]"`,
  }
}

export const EXAMPLE_COMMANDS = [
  'Cruza ventas con precios por ID_producto',
  'Dame el último registro de la columna fecha',
  'Busca en clientes donde ciudad sea Caracas',
  'Máximo de ventas por mes',
  'Cuántos valores únicos tiene la columna estado',
  'Ordena empleados por salario de mayor a menor',
  'Duplicados en la columna cédula',
  'Nulos en columna dirección',
  'Consolida enero con febrero',
  'Estadísticas de ventas',
  'Primeros 50 registros de pacientes',
  'Exporta el resultado actual',
]
