import { query } from './connection.js'

export async function initDB() {
  try {
    // Crear tabla de usuarios
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE,
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `)

    // Crear tabla de datasets
    await query(`
      CREATE TABLE IF NOT EXISTS datasets (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        user_id INTEGER REFERENCES users(id),
        table_name VARCHAR(100) UNIQUE NOT NULL,
        columns JSONB,
        row_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `)

    // Crear tabla de consultas guardadas
    await query(`
      CREATE TABLE IF NOT EXISTS query_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        query TEXT,
        result JSONB,
        execution_time FLOAT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `)

    console.log('✓ Base de datos inicializada')
  } catch (e) {
    console.error('Error inicializando DB:', e)
    throw e
  }
}
