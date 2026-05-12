import { askGroq, isGroqConfigured } from '../../lib/groqAI'

const ORCHESTRATOR_URL = import.meta.env.VITE_AI_ORCHESTRATOR_URL
const ORCHESTRATOR_TOKEN = import.meta.env.VITE_AI_ORCHESTRATOR_TOKEN

function getOrchestratorBaseUrl() {
  if (!ORCHESTRATOR_URL) return null
  return ORCHESTRATOR_URL.replace(/\/$/, '')
}

export function isOrchestratorConfigured() {
  return !!getOrchestratorBaseUrl()
}

export function isAiRuntimeConfigured() {
  return isOrchestratorConfigured() || isGroqConfigured()
}

async function callOrchestrator(payload) {
  const baseUrl = getOrchestratorBaseUrl()
  if (!baseUrl) {
    throw new Error('ORCHESTRATOR_NOT_CONFIGURED')
  }

  const headers = {
    'Content-Type': 'application/json',
  }
  if (ORCHESTRATOR_TOKEN) {
    headers.Authorization = `Bearer ${ORCHESTRATOR_TOKEN}`
  }

  const response = await fetch(`${baseUrl}/v1/ai/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error?.message || `Orchestrator error ${response.status}`)
  }

  return response.json()
}

/**
 * Unified AI entry point.
 * Frontend calls this function, not raw model providers.
 */
export async function runAiTask({ task, prompt, tables, history = [], context = {} }) {
  const payload = {
    task,
    prompt,
    context: {
      tables,
      history,
      ...context,
    },
  }

  if (isOrchestratorConfigured()) {
    const data = await callOrchestrator(payload)
    return {
      sql: data.sql || null,
      explanation: data.explanation || data.message || '',
      route: data.route || 'orchestrator',
      model: data.model || null,
      raw: data.raw || data,
    }
  }

  if (!isGroqConfigured()) {
    throw new Error('NO_AI_RUNTIME')
  }

  // Temporary fallback while backend orchestrator is being deployed.
  const data = await askGroq(prompt, tables, history)
  return {
    ...data,
    route: 'groq-direct-fallback',
    model: 'llama-3.1-8b-instant',
  }
}
