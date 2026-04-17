/**
 * Motor de Lenguaje Natural → SQL (DuckDB)
 * Versión 2: soporte completo de consultas, UPDATE, DELETE, ALTER TABLE.
 */

const MAX_JOIN_ROWS = 50000   // límite para evitar malloc OOM en DuckDB-Wasm
const MAX_ROWS = 5000

function normalize(text) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim()
}
function findTable(text, tables) {
  const n = normalize(text)
  return (tables.find(t => normalize(t.name) === n) ||
          tables.find(t => n.includes(normalize(t.name)) || normalize(t.name).includes(n)))?.name || null
}
function getBestTable(norm, tables) {
  return tables.find(t => norm.includes(normalize(t.name))) || tables[0]
}
function findColumn(text, columns) {
  const n = normalize(text)
  return columns.find(c => normalize(c.name) === n) ||
         columns.find(c => n.includes(normalize(c.name)) || normalize(c.name).includes(n)) || null
}
function extractTwoTables(norm, tables) {
  for (const sep of [" con "," y "," mas "," + ",","," entre "]) {
    const idx = norm.indexOf(sep)
    if (idx !== -1) {
      const t1 = findTable(norm.slice(0, idx).trim(), tables)
      const t2 = findTable(norm.slice(idx + sep.length).trim(), tables)
      if (t1 && t2) return [t1, t2]
    }
  }
  const found = tables.filter(t => norm.includes(normalize(t.name)))
  return found.length >= 2 ? [found[0].name, found[1].name] : []
}
function extractNumber(norm) { const m = norm.match(/\b(\d+)\b/); return m ? parseInt(m[1]) : null }
function detectOrder(norm) {
  if (/(desc|mayor.*menor|descendente)/.test(norm)) return "DESC"
  if (/(asc|menor.*mayor|ascendente)/.test(norm)) return "ASC"
  return null
}
function quoteVal(val, isNum) { return isNum && !isNaN(val) ? val : `'${val.replace(/'/g,"''")}'` }
function isNumericType(type) {
  return ["INTEGER","BIGINT","DOUBLE","FLOAT","DECIMAL","NUMERIC","HUGEINT","UBIGINT","SMALLINT","TINYINT"].includes((type||"").toUpperCase())
}

export function parseCommand(input, tables) {
  if (!input?.trim()) return { error: "Escribe una consulta para comenzar." }
  if (!tables?.length) return { error: "No hay tablas cargadas. Primero carga un archivo." }
  const raw = input.trim()
  const norm = normalize(raw)

  // ── SQL directo ──────────────────────────────────────────────────────────
  if (/^(select|insert|update|delete|alter|create|drop|with)\s/i.test(raw)) {
    return { sql: raw.endsWith(";") ? raw : raw + ";", action: "query", description: "Consulta SQL personalizada", isDML: /^(update|delete|alter)/i.test(raw) }
  }

  // ── CRUZAR / JOIN ────────────────────────────────────────────────────────
  if (/(cruza|cruzar|join|relaciona|combina|enlaza|mezcla)/.test(norm)) {
    const pair = extractTwoTables(norm, tables)
    if (pair.length < 2) return { error: `Necesito dos tablas. Disponibles: ${tables.map(t=>`"${t.name}"`).join(", ")}` }
    const [t1, t2] = pair
    const cols1 = tables.find(t=>t.name===t1)?.columns||[]
    const cols2 = tables.find(t=>t.name===t2)?.columns||[]
    const common = cols1.find(c => cols2.some(c2 => normalize(c2.name)===normalize(c.name)))
    let joinCol = null
    const byM = norm.match(/(?:por|usando|con el campo|con la columna|by|en)\s+(.{1,40})$/)
    if (byM) { const c = findColumn(byM[1],cols1)||findColumn(byM[1],cols2); if(c) joinCol=c.name }
    if (!joinCol && common) joinCol = common.name
    if (!joinCol) return { error: `No hay columna común entre "${t1}" y "${t2}". Escribe: "Cruza ${t1} con ${t2} por [columna]"` }
    let joinType = "LEFT JOIN"
    if (/(inner|solo.*coincide|solo.*comun)/.test(norm)) joinType="INNER JOIN"
    else if (/(full|completo|outer|todos.*ambos)/.test(norm)) joinType="FULL OUTER JOIN"
    else if (/(right|derecha)/.test(norm)) joinType="RIGHT JOIN"
    const sql = `SELECT *\nFROM "${t1}" a\n${joinType} "${t2}" b\n  ON a."${joinCol}" = b."${joinCol}"\nLIMIT ${MAX_JOIN_ROWS};`
    return { sql, action:"query", description:`${joinType} de "${t1}" y "${t2}" por "${joinCol}"` }
  }

  // ── CONSOLIDAR / UNION ────────────────────────────────────────────────────
  if (/(consolida|consolidar|pega|une|unir|apila|apilar|union|append|junta.*todas|combina.*todas)/.test(norm)) {
    const pair = extractTwoTables(norm, tables)
    if (pair.length >= 2) {
      return { sql:`SELECT * FROM "${pair[0]}"\nUNION ALL\nSELECT * FROM "${pair[1]}";`, action:"query", description:`Consolidación de "${pair[0]}" y "${pair[1]}"` }
    }
    if (tables.length >= 2) {
      return { sql: tables.map(t=>`SELECT * FROM "${t.name}"`).join("\nUNION ALL\n")+";", action:"query", description:`Consolidación de ${tables.length} tablas` }
    }
    return { error:"Necesitas al menos dos tablas." }
  }

  // ── ACTUALIZAR / UPDATE ───────────────────────────────────────────────────
  if (/(actualiza|actualizar|cambia|cambiar|modifica|modificar|pon el valor|establece|set\s)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const cols = table.columns||[]
    // "Actualiza [tabla] pon/establece [col] = [val] donde [col2] sea [val2]"
    const setM = norm.match(/(?:pon|establece|set|cambia(?:r)?|actualiza(?:r)?)\s+(.+?)\s*(?:=|a|con el valor|con valor)\s*["']?([^"']+?)["']?(?:\s+(?:donde|where|if)\s+(.+))?$/)
    if (setM) {
      const colName = findColumn(setM[1], cols)?.name
      const newVal = setM[2]?.trim()
      const whereClause = setM[3]?.trim()
      if (colName && newVal) {
        const tableInfo = tables.find(t=>t.name===table.name)
        const colInfo = tableInfo?.columns?.find(c=>c.name===colName)
        const quoted = quoteVal(newVal, isNumericType(colInfo?.type))
        let sql = `UPDATE "${table.name}" SET "${colName}" = ${quoted}`
        if (whereClause) {
          const whereColM = whereClause.match(/(.+?)\s+(?:sea|igual a|=|es)\s+["']?(.+?)["']?$/)
          if (whereColM) {
            const wCol = findColumn(whereColM[1], cols)?.name
            const wVal = whereColM[2]?.trim()
            const wColInfo = tableInfo?.columns?.find(c=>c.name===wCol)
            if (wCol) sql += `\nWHERE "${wCol}" = ${quoteVal(wVal, isNumericType(wColInfo?.type))}`
          }
        }
        sql += ";"
        return { sql, action:"query", description:`Actualizar "${colName}" en "${table.name}"`, isDML:true }
      }
    }
    return { error:`Especifica: "Actualiza ${table.name} pon [columna] a [valor] donde [columna2] sea [valor2]"` }
  }

  // ── ELIMINAR REGISTROS / DELETE ───────────────────────────────────────────
  if (/(elimina.*registro|eliminar.*registro|borra.*registro|borrar.*registro|delete.*where|quita.*donde|elimina.*donde)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const cols = table.columns||[]
    const whereM = norm.match(/(?:donde|where|que|con)\s+(.+?)\s+(?:sea igual a|igual a|sea|=|es)\s+["']?([^"'\n]+?)["']?$/)
    if (whereM) {
      const wCol = findColumn(whereM[1], cols)?.name
      const wVal = whereM[2]?.trim()
      const colInfo = tables.find(t=>t.name===table.name)?.columns?.find(c=>c.name===wCol)
      if (wCol) {
        const sql = `DELETE FROM "${table.name}"\nWHERE "${wCol}" = ${quoteVal(wVal, isNumericType(colInfo?.type))};`
        return { sql, action:"query", description:`Eliminar registros de "${table.name}" donde "${wCol}" = ${wVal}`, isDML:true }
      }
    }
    return { error:`Especifica: "Elimina registros de ${table.name} donde [columna] sea [valor]"` }
  }

  // ── AGREGAR COLUMNA / ALTER TABLE ADD ─────────────────────────────────────
  if (/(agrega.*columna|agregar.*columna|añade.*columna|añadir.*columna|nueva.*columna|add.*column)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const m = norm.match(/(?:columna|campo|campo llamado|columna llamada)\s+["']?([a-z0-9_\s]+?)["']?(?:\s+(?:de tipo|tipo|como)\s+(\w+))?(?:\s+(?:con valor|con default)\s+(.+))?$/)
    if (m) {
      const colName = m[1].trim().replace(/\s+/g,"_")
      const colType = m[2]?.toUpperCase() || "VARCHAR"
      const defVal = m[3]?.trim()
      let sql = `ALTER TABLE "${table.name}" ADD COLUMN "${colName}" ${colType}`
      if (defVal) sql += ` DEFAULT ${quoteVal(defVal, isNumericType(colType))}`
      sql += ";"
      return { sql, action:"query", description:`Agregar columna "${colName}" a "${table.name}"`, isDML:true }
    }
    return { error:`Especifica: "Agrega columna [nombre] de tipo [VARCHAR/INTEGER/DATE] a ${table.name}"` }
  }

  // ── ELIMINAR COLUMNA / ALTER TABLE DROP ───────────────────────────────────
  if (/(elimina.*columna|quita.*columna|borra.*columna|drop.*columna|remove.*columna|elimina.*campo|quita.*campo)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const cols = table.columns||[]
    const cleanNorm = norm.replace(/(elimina|quita|borra|drop|remove|columna|campo)/g,"")
    const col = findColumn(cleanNorm, cols)
    if (!col) return { error:`No encontré esa columna en "${table.name}". Columnas: ${cols.map(c=>`"${c.name}"`).join(", ")}` }
    const sql = `ALTER TABLE "${table.name}" DROP COLUMN "${col.name}";`
    return { sql, action:"query", description:`Eliminar columna "${col.name}" de "${table.name}"`, isDML:true }
  }

  // ── RENOMBRAR COLUMNA ────────────────────────────────────────────────────
  if (/(renombra|renombrar|cambia.*nombre|rename.*column)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const cols = table.columns||[]
    const m = norm.match(/(?:columna|campo)?\s*["']?(.+?)["']?\s+(?:a|como|por)\s+["']?(.+?)["']?$/)
    if (m) {
      const oldCol = findColumn(m[1].trim(), cols)
      const newName = m[2].trim().replace(/\s+/g,"_")
      if (oldCol) {
        const sql = `ALTER TABLE "${table.name}" RENAME COLUMN "${oldCol.name}" TO "${newName}";`
        return { sql, action:"query", description:`Renombrar "${oldCol.name}" → "${newName}" en "${table.name}"`, isDML:true }
      }
    }
    return { error:`Especifica: "Renombra columna [nombre_actual] a [nombre_nuevo] en ${table.name}"` }
  }

  // ── ÚLTIMO REGISTRO ───────────────────────────────────────────────────────
  if (/(ultimo|ultima|last|mas.*reciente|registro.*final|el.*ultimo)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const cols = table.columns||[]
    const n = extractNumber(norm)||1
    const order = detectOrder(norm)||"DESC"
    const col = findColumn(norm.replace(/(ultimo|ultima|last|mas.*reciente)/g,""), cols)
    if (col) {
      return { sql:`SELECT "${col.name}"\nFROM "${table.name}"\nORDER BY "${col.name}" ${order}\nLIMIT ${n};`, action:"query", description:`Último${n>1?` ${n}` :""} valor de "${col.name}"` }
    }
    return { sql:`SELECT *\nFROM "${table.name}"\nLIMIT ${n}\nOFFSET (SELECT COUNT(*) FROM "${table.name}")-${n};`, action:"query", description:`Último${n>1?` ${n}`:""} registro de "${table.name}"` }
  }

  // ── PRIMEROS / TOP ────────────────────────────────────────────────────────
  if (/(primer|primeros|primeras|top|head)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const n = extractNumber(norm)||10
    return { sql:`SELECT *\nFROM "${table.name}"\nLIMIT ${n};`, action:"query", description:`Primeros ${n} registros de "${table.name}"` }
  }

  // ── ESTADÍSTICAS ─────────────────────────────────────────────────────────
  if (/(estadistica|stats|resumen.*estadistico|summarize|perfil|data.*profile)/.test(norm)) {
    const table = getBestTable(norm, tables)
    return { sql:`SUMMARIZE "${table.name}";`, action:"query", description:`Perfil estadístico de "${table.name}"` }
  }

  // ── MÁXIMO/MÍNIMO/PROMEDIO/SUMA ───────────────────────────────────────────
  const aggMap = [
    { re:/(maximo|maxima|max\b|valor.*maximo|mayor.*valor)/, fn:"MAX", label:"Máximo" },
    { re:/(minimo|minima|min\b|valor.*minimo|menor.*valor)/, fn:"MIN", label:"Mínimo" },
    { re:/(promedio|media\b|average|avg\b)/, fn:"AVG", label:"Promedio" },
    { re:/(suma|sumar|total.*de|sumatoria)/, fn:"SUM", label:"Suma" },
  ]
  for (const agg of aggMap) {
    if (agg.re.test(norm)) {
      const table = getBestTable(norm, tables)
      const cols = table.columns||[]
      const numCols = cols.filter(c => isNumericType(c.type))
      const cleanNorm = norm.replace(/(maximo|maxima|minimo|minima|promedio|media|suma|sumar|total|average)/g,"")
      const col = findColumn(cleanNorm, numCols.length>0?numCols:cols)
      const groupM = norm.match(/(?:por|segun|por cada|agrupado por)\s+(.{1,40})/)
      const groupCol = groupM ? findColumn(groupM[1], cols) : null
      if (col) {
        const dir = (agg.fn==="MAX"||agg.fn==="SUM")?"DESC":"ASC"
        if (groupCol) {
          return { sql:`SELECT "${groupCol.name}", ${agg.fn}("${col.name}") AS resultado\nFROM "${table.name}"\nGROUP BY "${groupCol.name}"\nORDER BY resultado ${dir};`, action:"query", description:`${agg.label} de "${col.name}" por "${groupCol.name}"` }
        }
        return { sql:`SELECT ${agg.fn}("${col.name}") AS resultado\nFROM "${table.name}";`, action:"query", description:`${agg.label} de "${col.name}" en "${table.name}"` }
      }
      if (numCols.length>0) {
        const exprs = numCols.map(c=>`${agg.fn}("${c.name}") AS "${agg.label.toLowerCase()}_${c.name}"`).join(",\n       ")
        return { sql:`SELECT ${exprs}\nFROM "${table.name}";`, action:"query", description:`${agg.label} de columnas numéricas de "${table.name}"` }
      }
    }
  }

  // ── CONTAR ────────────────────────────────────────────────────────────────
  if (/(cuantos|cuantas|cuenta|contar|total.*registros|count\b|numero.*registros)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const cols = table.columns||[]
    if (/(unicos|unicas|distinct|diferentes|distintos)/.test(norm)) {
      const col = findColumn(norm.replace(/(unicos|unicas|distinct|diferentes|distintos|cuantos|cuenta)/g,""), cols)
      if (col) return { sql:`SELECT COUNT(DISTINCT "${col.name}") AS valores_unicos\nFROM "${table.name}";`, action:"query", description:`Valores únicos en "${col.name}"` }
    }
    return { sql:`SELECT COUNT(*) AS total_registros FROM "${table.name}";`, action:"query", description:`Total de registros en "${table.name}"` }
  }

  // ── DISTINCT / VALORES ÚNICOS ─────────────────────────────────────────────
  if (/(unicos|unicas|distinct|diferentes|distintos|valores.*de|lista.*de)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const col = findColumn(norm.replace(/(unicos|unicas|distinct|diferentes|distintos|valores|lista)/g,""), table.columns||[])
    if (col) return { sql:`SELECT DISTINCT "${col.name}"\nFROM "${table.name}"\nORDER BY "${col.name}";`, action:"query", description:`Valores únicos de "${col.name}"` }
  }

  // ── ORDENAR ───────────────────────────────────────────────────────────────
  if (/(ordena|ordenar|orden|sort|clasifica)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const order = detectOrder(norm)||"ASC"
    const col = findColumn(norm.replace(/(ordena|ordenar|sort|clasifica|mayor.*menor|menor.*mayor|desc|asc)/g,""), table.columns||[])
    const n = extractNumber(norm)||MAX_ROWS
    if (col) return { sql:`SELECT *\nFROM "${table.name}"\nORDER BY "${col.name}" ${order}\nLIMIT ${n};`, action:"query", description:`"${table.name}" ordenado por "${col.name}" ${order==="DESC"?"descendente":"ascendente"}` }
  }

  // ── FILTRAR ───────────────────────────────────────────────────────────────
  if (/(busca|buscar|filtra|filtrar|donde|where|que.*sea|que.*tenga|que.*contenga|contiene|que.*diga)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const cols = table.columns||[]
    const patterns = [
      { re:/(?:donde|where|que|con)\s+(.+?)\s+(?:sea igual a|igual a|sea|=)\s+["']?([^"'\n]+?)["']?$/, op:"=" },
      { re:/(?:donde|where|que|con)\s+(.+?)\s+(?:contiene|incluye|like|parecido a)\s+["']?([^"'\n]+?)["']?$/, op:"LIKE" },
      { re:/(?:donde|where|que|con)\s+(.+?)\s+(?:mayor que|mayor a|>)\s+["']?([^"'\n]+?)["']?$/, op:">" },
      { re:/(?:donde|where|que|con)\s+(.+?)\s+(?:menor que|menor a|<)\s+["']?([^"'\n]+?)["']?$/, op:"<" },
      { re:/(?:donde|where|que|con)\s+(.+?)\s+(?:mayor o igual|>=)\s+["']?([^"'\n]+?)["']?$/, op:">=" },
      { re:/(?:donde|where|que|con)\s+(.+?)\s+(?:menor o igual|<=)\s+["']?([^"'\n]+?)["']?$/, op:"<=" },
      { re:/(?:donde|where|que|con)\s+(.+?)\s+(?:no sea|no es|diferente de|!=)\s+["']?([^"'\n]+?)["']?$/, op:"!=" },
      { re:/(?:donde|where|que|con)\s+(.+?)\s+(?:empiece con|empieza con|inicia con)\s+["']?([^"'\n]+?)["']?$/, op:"STARTS" },
      { re:/(?:donde|where|que|con)\s+(.+?)\s+(?:termine con|termina con)\s+["']?([^"'\n]+?)["']?$/, op:"ENDS" },
      { re:/(?:donde|where|que|con)\s+(.+?)\s+(?:este en|en la lista)\s+\(?([^)]+)\)?$/, op:"IN" },
      { re:/(?:donde|where|que|con)\s+(.+?)\s+(?:sea nulo|es nulo|este vacio|vacio)/, op:"NULL" },
      { re:/(?:donde|where|que|con)\s+(.+?)\s+(?:no sea nulo|no es nulo|no vacio|not null)/, op:"NOT NULL" },
    ]
    for (const {re, op} of patterns) {
      const m = norm.match(re)
      if (!m) continue
      const col = findColumn(m[1]?.trim(), cols)
      if (!col) continue
      const val = m[2]?.trim()
      const colInfo = tables.find(t=>t.name===table.name)?.columns?.find(c=>c.name===col.name)
      const num = isNumericType(colInfo?.type)
      const qv = v => quoteVal(v, num)
      let cond = ""
      if (op==="=") cond=`"${col.name}" = ${qv(val)}`
      else if (op==="LIKE") cond=`"${col.name}" ILIKE '%${val}%'`
      else if (op==="STARTS") cond=`"${col.name}" ILIKE '${val}%'`
      else if (op==="ENDS") cond=`"${col.name}" ILIKE '%${val}'`
      else if (op==="IN") cond=`"${col.name}" IN (${val.split(/,\s*/).map(v=>qv(v.trim())).join(", ")})`
      else if (op==="NULL") cond=`"${col.name}" IS NULL`
      else if (op==="NOT NULL") cond=`"${col.name}" IS NOT NULL`
      else cond=`"${col.name}" ${op} ${qv(val)}`
      const n = extractNumber(norm.replace(/\d+.*(?:registro|fila)/,""))||MAX_ROWS
      return { sql:`SELECT *\nFROM "${table.name}"\nWHERE ${cond}\nLIMIT ${n};`, action:"query", description:`Filtro: ${cond} en "${table.name}"` }
    }
    const col = findColumn(norm, cols)
    if (col) return { error:`¿Qué valor buscas en "${col.name}"? Ejemplo: '...donde ${col.name} sea [valor]'` }
    return { error:`Ejemplo: "Busca en ${table.name} donde [columna] sea [valor]"` }
  }

  // ── ENTRE (BETWEEN) ───────────────────────────────────────────────────────
  if (/(entre|between|rango|desde.*hasta)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const m = norm.match(/(.+?)\s+(?:entre|between|en el rango|de)\s+([\d.]+)\s+(?:y|and|a|hasta)\s+([\d.]+)/)
    if (m) {
      const col = findColumn(m[1], table.columns||[])
      if (col) return { sql:`SELECT *\nFROM "${table.name}"\nWHERE "${col.name}" BETWEEN ${m[2]} AND ${m[3]};`, action:"query", description:`"${col.name}" entre ${m[2]} y ${m[3]}` }
    }
  }

  // ── AGRUPAR ───────────────────────────────────────────────────────────────
  if (/(agrupa|agrupar|group.*by|por.*grupo|cuenta.*por|total.*por)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const col = findColumn(norm.replace(/(agrupa|agrupar|group|cuenta.*por|total.*por)/g,""), table.columns||[])
    if (col) return { sql:`SELECT "${col.name}", COUNT(*) AS total\nFROM "${table.name}"\nGROUP BY "${col.name}"\nORDER BY total DESC;`, action:"query", description:`Agrupación por "${col.name}"` }
  }

  // ── DUPLICADOS ────────────────────────────────────────────────────────────
  if (/(duplicados|duplicadas|repetidos|repetidas)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const col = findColumn(norm.replace(/(duplicados|duplicadas|repetidos|repetidas)/g,""), table.columns||[])
    if (col) return { sql:`SELECT "${col.name}", COUNT(*) AS apariciones\nFROM "${table.name}"\nGROUP BY "${col.name}"\nHAVING COUNT(*) > 1\nORDER BY apariciones DESC;`, action:"query", description:`Duplicados en "${col.name}"` }
    const allCols = (table.columns||[]).map(c=>`"${c.name}"`).join(", ")
    return { sql:`SELECT ${allCols}, COUNT(*) AS veces\nFROM "${table.name}"\nGROUP BY ${allCols}\nHAVING COUNT(*) > 1\nORDER BY veces DESC\nLIMIT 500;`, action:"query", description:`Filas duplicadas en "${table.name}"` }
  }

  // ── NULOS ─────────────────────────────────────────────────────────────────
  if (/(nulos|vacios|null|sin datos|faltantes)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const col = findColumn(norm.replace(/(nulos|vacios|null|sin datos|faltantes)/g,""), table.columns||[])
    if (col) return { sql:`SELECT *\nFROM "${table.name}"\nWHERE "${col.name}" IS NULL\nLIMIT 1000;`, action:"query", description:`Nulos en "${col.name}"` }
    const exprs = (table.columns||[]).map(c=>`COUNT(*) FILTER (WHERE "${c.name}" IS NULL) AS "${c.name}_nulos"`).join(",\n       ")
    return { sql:`SELECT ${exprs}\nFROM "${table.name}";`, action:"query", description:`Conteo de nulos por columna en "${table.name}"` }
  }

  // ── DESCRIBE / ESTRUCTURA ─────────────────────────────────────────────────
  if (/(describe|estructura|columnas.*de|campos.*de|que.*columnas|informacion.*tabla)/.test(norm)) {
    const table = tables.find(t=>norm.includes(normalize(t.name)))
    if (table) return { sql:`DESCRIBE "${table.name}";`, action:"query", description:`Estructura de "${table.name}"` }
    return { sql:`SHOW TABLES;`, action:"query", description:"Tablas cargadas" }
  }

  // ── EXPORTAR ─────────────────────────────────────────────────────────────
  if (/(exporta|exportar|descarga|descargar|guardar.*csv)/.test(norm)) {
    return { action:"export", sql:null, description:"Exportando a CSV…" }
  }

  // ── AYUDA ────────────────────────────────────────────────────────────────
  if (/(ayuda|help|que puedo|comandos|ejemplos)/.test(norm)) {
    return { action:"help", sql:null, description:"Ayuda" }
  }

  // ── MUESTRA / VER ────────────────────────────────────────────────────────
  if (/(muestra|ver|mostrar|selecciona|trae|dame|visualiza|todo.*de|todos.*de)/.test(norm)) {
    const table = getBestTable(norm, tables)
    const n = extractNumber(norm)||MAX_ROWS
    const order = detectOrder(norm)
    const col = order ? findColumn(norm.replace(/(muestra|ver|mostrar|trae|dame|todo|todos)/g,""), table.columns||[]) : null
    let sql = `SELECT *\nFROM "${table.name}"\n`
    if (col && order) sql += `ORDER BY "${col.name}" ${order}\n`
    sql += `LIMIT ${n};`
    return { sql, action:"query", description:`Registros de "${table.name}"` }
  }

  // ── Fallback: tabla mencionada ────────────────────────────────────────────
  const matchedTable = tables.find(t => norm.includes(normalize(t.name)))
  if (matchedTable) {
    return { sql:`SELECT *\nFROM "${matchedTable.name}"\nLIMIT ${MAX_ROWS};`, action:"query", description:`Mostrando "${matchedTable.name}"` }
  }

  return { error:`No entendí. Tablas: ${tables.map(t=>`"${t.name}"`).join(", ")}.\nEjemplos:\n• "Muestra todos los datos de ${tables[0]?.name}"\n• "Actualiza ${tables[0]?.name} pon [columna] a [valor] donde [col2] sea [val2]"\n• "Elimina registros de ${tables[0]?.name} donde [columna] sea [valor]"\n• "Agrega columna nueva_col de tipo INTEGER a ${tables[0]?.name}"` }
}

export const EXAMPLE_COMMANDS = [
  "Cruza ventas con precios por ID_producto",
  "Dame el último registro de la columna fecha",
  "Busca en clientes donde ciudad sea Caracas",
  "Actualiza empleados pon salario a 5000 donde nombre sea Juan",
  "Elimina registros de pacientes donde estado sea inactivo",
  "Agrega columna observacion de tipo VARCHAR a clientes",
  "Duplicados en la columna cédula",
  "Estadísticas de ventas",
  "Ordena empleados por salario de mayor a menor",
  "Consolida enero con febrero",
  "Exporta el resultado actual",
]
