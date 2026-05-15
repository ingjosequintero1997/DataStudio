/**
 * groqAI.js — Cliente Groq para generación de SQL con IA
 * API gratuita: console.groq.com — modelo llama-3.1-8b-instant
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.1-8b-instant'
const GROQ_KEY_STORAGE = 'datastudio-groq-api-key'

function readGroqKeyFromStorage() {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(GROQ_KEY_STORAGE) || ''
  } catch {
    return ''
  }
}

export function getGroqApiKey() {
  const envKey = (import.meta.env.VITE_GROQ_API_KEY || '').trim()
  if (envKey) return envKey
  return (readGroqKeyFromStorage() || '').trim()
}

export function setGroqApiKey(value) {
  if (typeof window === 'undefined') return
  const clean = (value || '').trim()
  try {
    if (!clean) {
      window.localStorage.removeItem(GROQ_KEY_STORAGE)
      return
    }
    window.localStorage.setItem(GROQ_KEY_STORAGE, clean)
  } catch {}
}

export function isGroqConfigured() {
  return !!getGroqApiKey()
}

function buildSchema(tables) {
  if (!tables.length) return 'No hay tablas cargadas.'
  return tables
    .map(t => {
      const cols = (t.columns || [])
        .map(c => `  - ${c.name} (${c.type || 'TEXT'})`)
        .join('\n')
      return `Tabla: "${t.name}" — ${(t.rowCount || 0).toLocaleString()} filas\n${cols}`
    })
    .join('\n\n')
}

function extractSQL(content) {
  // Bloque markdown ```sql ... ```
  const block = content.match(/```(?:sql)?\s*([\s\S]+?)```/i)
  if (block) return block[1].trim()
  // SELECT/WITH suelto
  const bare = content.match(/\b(SELECT|WITH|INSERT|UPDATE|DELETE)\b[\s\S]+?;/i)
  if (bare) return bare[0].trim()
  return null
}

const SYSTEM_PROMPT = (schema) => `Eres DataStudio AI, analista de datos experto integrado en una app web.
El usuario tiene archivos CSV/Excel cargados como tablas en DuckDB (motor SQL en el navegador).

ESQUEMA ACTUAL:
${schema}

REGLAS ESTRICTAS:
- Responde SIEMPRE en español
- Para consultar datos genera SQL DuckDB en bloques: \`\`\`sql ... \`\`\`
- Usa SIEMPRE comillas dobles: SELECT "columna" FROM "tabla"
- Si el usuario pide modificar datos/estructura, SI genera SQL de escritura (UPDATE, INSERT, DELETE, ALTER TABLE, CREATE TABLE AS)
- Permite actualizar una tabla principal desde otra con JOIN, por ejemplo: UPDATE a SET ... FROM "otra_tabla" b WHERE ...
- Permite agregar columnas calculadas con ALTER TABLE ... ADD COLUMN y luego UPDATE para poblarla
- Si se pide insertar filas desde otro archivo usa INSERT INTO ... SELECT ... FROM "tabla_origen"
- Después del SQL explica en 1-2 líneas qué hace y qué encontrará el usuario
- Para cruzar tablas: usa LEFT JOIN, INNER JOIN, FULL OUTER JOIN según corresponda
- Para duplicados: GROUP BY "col" HAVING COUNT(*) > 1
- Para nulos: WHERE "col" IS NULL o COUNT(*) FILTER (WHERE "col" IS NULL)
- Para búsqueda de texto: LOWER("col") LIKE LOWER('%texto%')
- Para estadísticas: MIN, MAX, AVG, COUNT, SUM agrupados por lo que pida
- Limita a LIMIT 1000 por defecto; LIMIT 50 para vistas rápidas
- Si la pregunta es conceptual (sin datos), responde directamente sin SQL
- Si hay un error de SQL previo en el historial, corrígelo
- Para UNION/consolidar múltiples tablas: usa UNION ALL con las mismas columnas`

export async function askGroq(prompt, tables, history = []) {
  const apiKey = getGroqApiKey()
  if (!apiKey) throw new Error('NO_API_KEY')

  const schema = buildSchema(tables)

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT(schema) },
    ...history.slice(-10),
    { role: 'user', content: prompt },
  ]

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.1,
      max_tokens: 1500,
    }),
  })

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.error?.message || `Groq API error ${res.status}`)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content || ''
  const sql = extractSQL(content)
  const explanation = content.replace(/```(?:sql)?[\s\S]*?```/gi, '').trim()

  return { sql, explanation, raw: content }
}
