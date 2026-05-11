import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import bodyParser from 'body-parser'
import { initDB } from './db/migrations.js'
import queriesRouter from './routes/queries.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}))
app.use(bodyParser.json({ limit: '50mb' }))
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }))

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// API Routes
app.use('/api', queriesRouter)

// Error handling
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  })
})

// Inicializa base de datos y inicia servidor
async function start() {
  try {
    console.log('🚀 Inicializando backend...')
    
    await initDB()
    console.log('✓ Base de datos lista')

    app.listen(PORT, () => {
      console.log(`✓ Servidor escuchando en http://localhost:${PORT}`)
      console.log(`✓ Frontend: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`)
      console.log(`✓ Modelo IA: ${process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022'}`)
    })
  } catch (err) {
    console.error('❌ Error al iniciar:', err)
    process.exit(1)
  }
}

start()
