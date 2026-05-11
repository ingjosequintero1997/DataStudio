import express from 'express'
import { processQuery, suggestCross, generateDashboard } from '../agent/agent.js'
import { query } from '../db/connection.js'

const router = express.Router()

// POST /api/query - Procesa consulta en lenguaje natural
router.post('/query', async (req, res) => {
  try {
    const { prompt, userId } = req.body
    
    if (!prompt) {
      return res.status(400).json({ error: 'Falta el parámetro: prompt' })
    }

    const result = await processQuery(prompt, userId || 'default')
    res.json(result)
  } catch (err) {
    console.error('Query endpoint error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/cross - Sugiere y ejecuta un cruce
router.post('/cross', async (req, res) => {
  try {
    const { tableLeft, tableRight, joinCondition } = req.body

    if (!tableLeft || !tableRight) {
      return res.status(400).json({ error: 'Faltan parámetros: tableLeft, tableRight' })
    }

    // Si no hay condición, la sugiere el agente
    let condition = joinCondition
    if (!condition) {
      const suggestion = await suggestCross(tableLeft, tableRight)
      if (suggestion.error) {
        return res.status(400).json({ error: suggestion.error })
      }
      condition = suggestion.on_condition
    }

    const sql = `
      SELECT * FROM ${tableLeft}
      INNER JOIN ${tableRight}
      ON ${condition}
      LIMIT 1000
    `

    const start = Date.now()
    const result = await query(sql)
    const duration = (Date.now() - start) / 1000

    res.json({
      action: 'cross',
      rowCount: result.rows.length,
      columns: Object.keys(result.rows[0] || {}),
      rows: result.rows,
      duration: duration.toFixed(3),
      joinCondition: condition
    })
  } catch (err) {
    console.error('Cross endpoint error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/dashboard - Genera dashboard basado en datos
router.post('/dashboard', async (req, res) => {
  try {
    const { tableNames, customPrompt } = req.body

    if (!tableNames || !Array.isArray(tableNames)) {
      return res.status(400).json({ error: 'Falta parámetro: tableNames (array)' })
    }

    const dashboard = await generateDashboard({}, tableNames)
    
    res.json({
      action: 'dashboard',
      widgets: dashboard,
      tables: tableNames
    })
  } catch (err) {
    console.error('Dashboard endpoint error:', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/tables - Lista todas las tablas
router.get('/tables', async (req, res) => {
  try {
    const result = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      AND table_name NOT LIKE 'pg_%'
    `)

    const tables = []
    for (const row of result.rows) {
      const colRes = await query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = $1
      `, [row.table_name])

      const countRes = await query(`SELECT COUNT(*) as count FROM "${row.table_name}"`)
      
      tables.push({
        name: row.table_name,
        columns: colRes.rows,
        rowCount: parseInt(countRes.rows[0].count, 10)
      })
    }

    res.json({ tables })
  } catch (err) {
    console.error('Tables endpoint error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/upload - Carga CSV y crea tabla
router.post('/upload', async (req, res) => {
  try {
    // Este endpoint será manejado por middleware en server.js
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/query-history - Historial de consultas
router.get('/query-history/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const result = await query(
      'SELECT * FROM query_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [userId]
    )
    res.json({ history: result.rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
