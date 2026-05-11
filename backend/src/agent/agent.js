import { query } from '../db/connection.js'
import dotenv from 'dotenv'

dotenv.config()

// Usa Ollama (gratis, local) en lugar de Anthropic
const OLLAMA_API = process.env.OLLAMA_API || 'http://localhost:11434/api/generate'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama2'

async function callOllama(prompt) {
  try {
    const response = await fetch(OLLAMA_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        temperature: 0.3
      })
    })

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`)
    }

    const data = await response.json()
    return data.response || ''
  } catch (e) {
    console.error('Ollama API error:', e)
    throw e
  }
}

// Caché en memoria del esquema (optimiza tokens)
let schemaCache = null
let schemaCacheTime = 0
const SCHEMA_CACHE_TTL = 5 * 60 * 1000 // 5 minutos

async function getSchemaInfo() {
  const now = Date.now()
  if (schemaCache && (now - schemaCacheTime) < SCHEMA_CACHE_TTL) {
    return schemaCache
  }

  const res = await query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  `)

  const tables = res.rows.map(r => r.table_name)
  
  const schema = {}
  for (const tableName of tables) {
    if (tableName.startsWith('pg_')) continue
    
    const colRes = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1
    `, [tableName])
    
    schema[tableName] = colRes.rows.map(r => ({
      name: r.column_name,
      type: r.data_type
    }))
  }

  schemaCache = schema
  schemaCacheTime = now
  return schema
}

export async function processQuery(userPrompt, userId = 'default') {
  try {
    const schema = await getSchemaInfo()
    const schemaStr = JSON.stringify(schema, null, 2)

    const systemPrompt = `Eres un asistente experto en análisis de datos SQL y bases de datos.
Tu objetivo es interpretar solicitudes en lenguaje natural y generar consultas SQL precisas.

INSTRUCCIONES CRÍTICAS:
1. Analiza el esquema disponible cuidadosamente
2. Genera SQL correcto y optimizado para PostgreSQL
3. Para CRUCES (JOINS): Analiza las claves foráneas y columnas comunes
4. Responde SIEMPRE en JSON VÁLIDO con esta estructura (SIN MARKDOWN):
{
  "action": "query|cross|dashboard|error",
  "sql": "SELECT ...",
  "description": "Descripción de qué hace",
  "columns_to_visualize": ["col1", "col2"],
  "chart_type": "bar|line|pie|table",
  "error": null
}

ESQUEMA DISPONIBLE:
${schemaStr}

USUARIO PREGUNTA: ${userPrompt}

REGLAS:
- NUNCA modifiques datos (solo SELECT)
- Si hay múltiples tablas, sugiere JOINs
- RESPONDE JSON PURO SIN CÓDIGO MARKDOWN
- Si no entiendes, devuelve: {"action":"error","error":"descripción"}`

    const responseText = await callOllama(systemPrompt)
    
    // Extrae JSON de la respuesta
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return {
        action: 'error',
        error: 'No se pudo interpretar la respuesta del agente',
        raw: responseText
      }
    }

    const result = JSON.parse(jsonMatch[0])
    
    // Ejecuta SQL si está disponible
    if (result.sql && result.action !== 'error') {
      const start = Date.now()
      const execRes = await query(result.sql)
      const duration = (Date.now() - start) / 1000

      result.rows = execRes.rows
      result.rowCount = execRes.rows.length
      result.columns = Object.keys(execRes.rows[0] || {})
      result.duration = duration.toFixed(3)

      // Guarda en historial
      await query(
        `INSERT INTO query_history (user_id, query, result, execution_time) 
         VALUES ($1, $2, $3, $4)`,
        [userId, result.sql, JSON.stringify(result), duration]
      )
    }

    return result
  } catch (err) {
    console.error('Agent error:', err)
    return {
      action: 'error',
      error: err.message
    }
  }
}

export async function suggestCross(tableLeft, tableRight) {
  try {
    const schema = await getSchemaInfo()
    const leftCols = schema[tableLeft] || []
    const rightCols = schema[tableRight] || []

    const leftNames = leftCols.map(c => c.name)
    const rightNames = rightCols.map(c => c.name)
    
    // Encuentra columnas comunes (simple heurística)
    const commonCols = leftNames.filter(n => rightNames.includes(n))

    const prompt = `Eres experto en bases de datos SQL.
Tengo dos tablas:
- ${tableLeft}: ${leftNames.join(', ')}
- ${tableRight}: ${rightNames.join(', ')}

Columnas comunes: ${commonCols.join(', ') || 'ninguna'}

Sugiere un JOIN inteligente. RESPONDE SOLO JSON:
{
  "join_type": "INNER|LEFT|RIGHT",
  "on_condition": "tabla1.col = tabla2.col",
  "reason": "Explicación breve"
}`

    const responseText = await callOllama(prompt)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'No se pudo sugerir cruce' }
  } catch (err) {
    console.error('Cross suggestion error:', err)
    return { error: err.message }
  }
}

export async function generateDashboard(data, tableNames) {
  try {
    const prompt = `Eres experto en visualización de datos.
Analiza estas tablas y sugiere 5 dashboards útiles:
Tablas: ${tableNames.join(', ')}

RESPONDE SOLO JSON (array sin markdown):
[
  { "type": "card|gauge|bar|line|pie", "metric": "nombre", "value": "expresión SQL", "color": "#hex" }
]`

    const responseText = await callOllama(prompt)
    const jsonMatch = responseText.match(/\[[\s\S]*\]/)
    return jsonMatch ? JSON.parse(jsonMatch[0]) : []
  } catch (err) {
    console.error('Dashboard generation error:', err)
    return []
  }
}
