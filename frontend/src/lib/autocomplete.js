function normalizeText(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function compactText(text) {
  return normalizeText(text).replace(/[_\-.\s]+/g, '')
}

function findTableByName(name, tables) {
  const norm = normalizeText(name)
  const compact = compactText(name)
  return tables.find((table) => normalizeText(table.name) === norm)
    || tables.find((table) => compactText(table.name) === compact)
    || null
}

function findLastMentionedTable(text, tables) {
  const source = normalizeText(text)
  let bestMatch = null

  tables.forEach((table) => {
    const tableName = normalizeText(table.name)
    const idx = source.lastIndexOf(tableName)
    if (idx !== -1 && (!bestMatch || idx > bestMatch.idx)) {
      bestMatch = { idx, table }
    }
  })

  return bestMatch?.table || null
}

function buildEntitySuggestions(text, cursorPosition, tables, activeTableName = null) {
  const safeCursor = typeof cursorPosition === 'number' ? cursorPosition : text.length
  const leftText = text.slice(0, safeCursor)
  const tokenMatch = leftText.match(/([A-Za-z0-9_\-.]+)$/)
  if (!tokenMatch) return null

  const rawToken = tokenMatch[1]
  const token = normalizeText(rawToken)
  const compactToken = compactText(rawToken)
  if (!token) return null

  const start = safeCursor - rawToken.length
  const end = safeCursor
  const beforeToken = leftText.slice(0, start)
  const nearbyText = normalizeText(beforeToken.slice(Math.max(0, beforeToken.length - 180)))
  const activeTable = tables.find((table) => table.name === activeTableName) || null
  const mentionedTable = findLastMentionedTable(beforeToken, tables)
  const wantsColumns = /(columna|columnas|campo|campos|atributo|atributos|select|where|order by|group by|join|actualiza|renombra|elimina|borra|quita|muestra)/.test(nearbyText)

  const [rawTablePart, rawColumnPart = ''] = rawToken.split('.', 2)
  const hasDotSyntax = rawToken.includes('.')
  const explicitTable = hasDotSyntax ? findTableByName(rawTablePart, tables) : null
  const searchTerm = hasDotSyntax ? normalizeText(rawColumnPart) : token
  const searchCompact = hasDotSyntax ? compactText(rawColumnPart) : compactToken
  const items = []

  const pushItem = (item) => {
    if (!items.some((entry) => entry.key === item.key)) items.push(item)
  }

  if (!hasDotSyntax) {
    tables
      .filter((table) => {
        const nameNorm = normalizeText(table.name)
        const nameCompact = compactText(table.name)
        return nameNorm.includes(token) || nameCompact.includes(compactToken)
      })
      .forEach((table) => {
        pushItem({
          key: `table:${table.name}`,
          label: table.name,
          caption: `${table.columns?.length || 0} columna(s)`,
          insertText: table.name,
          section: 'Archivos cargados',
          type: 'table',
        })
      })
  }

  const preferredTable = explicitTable || activeTable || mentionedTable || null

  if (preferredTable && (wantsColumns || hasDotSyntax || compactToken.length >= 2)) {
    ;(preferredTable.columns || [])
      .filter((column) => {
        const colNorm = normalizeText(column.name)
        const colCompact = compactText(column.name)
        return !searchTerm || colNorm.includes(searchTerm) || colCompact.includes(searchCompact)
      })
      .forEach((column) => {
        pushItem({
          key: `column:${preferredTable.name}:${column.name}`,
          label: hasDotSyntax ? `${preferredTable.name}.${column.name}` : column.name,
          caption: preferredTable.name,
          insertText: hasDotSyntax ? `${preferredTable.name}.${column.name}` : column.name,
          section: `Columnas de ${preferredTable.name}`,
          type: 'column',
        })
      })
  }

  if (!preferredTable && compactToken.length >= 2) {
    tables.forEach((table) => {
      ;(table.columns || []).forEach((column) => {
        const colNorm = normalizeText(column.name)
        const colCompact = compactText(column.name)
        if (colNorm.includes(token) || colCompact.includes(compactToken)) {
          pushItem({
            key: `column:${table.name}:${column.name}`,
            label: `${table.name}.${column.name}`,
            caption: table.name,
            insertText: `${table.name}.${column.name}`,
            section: 'Columnas disponibles',
            type: 'column',
          })
        }
      })
    })
  }

  if (!items.length) return null

  return {
    start,
    end,
    items: items.slice(0, 14),
    type: 'entity',
  }
}

function buildBracketContext(text, cursorPosition, tables, activeTableName = null) {
  const safeCursor = typeof cursorPosition === 'number' ? cursorPosition : text.length
  const start = text.lastIndexOf('[', safeCursor - 1)
  if (start === -1) return null

  const closing = text.indexOf(']', start)
  if (closing !== -1 && closing < safeCursor) return null

  const beforeBracket = text.slice(0, start)
  const rawQuery = text.slice(start + 1, safeCursor)
  const [rawTablePart, rawColumnPart = ''] = rawQuery.split('.', 2)
  const hasDotSyntax = rawQuery.includes('.')
  const explicitTable = hasDotSyntax ? findTableByName(rawTablePart, tables) : null
  const activeTable = tables.find((table) => table.name === activeTableName) || findLastMentionedTable(beforeBracket, tables)
  const nearbyText = normalizeText(beforeBracket.slice(Math.max(0, beforeBracket.length - 140)))
  const wantsColumns = /(columna|columnas|campo|campos|atributo|atributos)/.test(nearbyText)
  const queryNorm = hasDotSyntax ? normalizeText(rawColumnPart) : normalizeText(rawQuery)
  const items = []

  const pushItem = (item) => {
    if (!items.some((entry) => entry.key === item.key)) items.push(item)
  }

  if (!hasDotSyntax) {
    tables
      .filter((table) => !queryNorm || normalizeText(table.name).includes(queryNorm) || compactText(table.name).includes(compactText(rawQuery)))
      .forEach((table) => {
        pushItem({
          key: `table:${table.name}`,
          label: table.name,
          caption: `${table.columns?.length || 0} columna(s)`,
          insertText: `[${table.name}]`,
          section: 'Archivos cargados',
          type: 'table',
        })
      })
  }

  const preferredTable = explicitTable || ((wantsColumns || !queryNorm) ? activeTable : null)
  if (preferredTable) {
    ;(preferredTable.columns || [])
      .filter((column) => !queryNorm || normalizeText(column.name).includes(queryNorm) || compactText(column.name).includes(compactText(rawColumnPart || rawQuery)))
      .forEach((column) => {
        pushItem({
          key: `column:${preferredTable.name}:${column.name}`,
          label: column.name,
          caption: preferredTable.name,
          insertText: hasDotSyntax ? `[${preferredTable.name}.${column.name}]` : `[${column.name}]`,
          section: `Columnas de ${preferredTable.name}`,
          type: 'column',
        })
      })
  }

  if (!items.length) return null

  return {
    start,
    end: safeCursor,
    items,
    type: 'bracket',
  }
}

export function buildAutocompleteContext(text, cursorPosition, tables = [], activeTableName = null) {
  return buildBracketContext(text, cursorPosition, tables, activeTableName)
    || buildEntitySuggestions(text, cursorPosition, tables, activeTableName)
}
