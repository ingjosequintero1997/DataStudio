/**
 * Cliente para consumir la API del agente
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

function getBaseUrl() {
  return API_URL.endsWith('/api') ? API_URL.slice(0, -4) : API_URL
}

export async function checkAgentHealth() {
  try {
    const response = await fetch(`${getBaseUrl()}/health`)
    return response.ok
  } catch {
    return false
  }
}

export async function queryAgent(prompt, userId = 'default') {
  try {
    const response = await fetch(`${API_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, userId })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Error en la consulta')
    }

    return await response.json()
  } catch (err) {
    console.error('Query error:', err)
    return {
      action: 'error',
      error: err.message
    }
  }
}

export async function getTables() {
  try {
    const response = await fetch(`${API_URL}/tables`)
    if (!response.ok) throw new Error('Error obteniendo tablas')
    return await response.json()
  } catch (err) {
    console.error('Tables error:', err)
    return { tables: [], error: err.message }
  }
}

export async function suggestCross(tableLeft, tableRight) {
  try {
    const response = await fetch(`${API_URL}/cross`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableLeft, tableRight })
    })

    if (!response.ok) throw new Error('Error en cruce')
    return await response.json()
  } catch (err) {
    console.error('Cross error:', err)
    return { action: 'error', error: err.message }
  }
}

export async function generateDashboard(tableNames) {
  try {
    const response = await fetch(`${API_URL}/dashboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableNames })
    })

    if (!response.ok) throw new Error('Error generando dashboard')
    return await response.json()
  } catch (err) {
    console.error('Dashboard error:', err)
    return { action: 'error', error: err.message }
  }
}

export async function getQueryHistory(userId) {
  try {
    const response = await fetch(`${API_URL}/query-history/${userId}`)
    if (!response.ok) throw new Error('Error obteniendo historial')
    return await response.json()
  } catch (err) {
    console.error('History error:', err)
    return { history: [] }
  }
}

export async function uploadCSV(file, tableName) {
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('tableName', tableName)

    const response = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) throw new Error('Error subiendo archivo')
    return await response.json()
  } catch (err) {
    console.error('Upload error:', err)
    return { error: err.message }
  }
}
