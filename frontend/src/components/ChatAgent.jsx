import { useState, useRef, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { queryAgent, getTables } from '../lib/agentApi'

export default function ChatAgent({ addToast, onOpenCrossWizard, onOpenDashboard }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'assistant',
      content: '👋 Hola! Soy tu asistente de análisis de datos. Puedo:',
      details: [
        '📊 Analizar datos con consultas en lenguaje natural',
        '🔄 Sugerir cruces automáticos entre tablas',
        '📈 Generar dashboards inteligentes',
        '💾 Guardar y reutilizar consultas'
      ]
    }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [tables, setTables] = useState([])
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    const loadTables = async () => {
      const res = await getTables()
      setTables(res.tables || [])
    }
    loadTables()
  }, [])

  const handleSend = useCallback(async () => {
    if (!input.trim()) return

    // Agrega mensaje del usuario
    const userMsg = {
      id: messages.length + 1,
      role: 'user',
      content: input
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      const result = await queryAgent(input, 'default')

      if (result.action === 'error') {
        setMessages(prev => [...prev, {
          id: prev.length + 1,
          role: 'assistant',
          content: '❌ Error: ' + result.error,
          isError: true
        }])
        addToast(result.error, 'error', 'Consulta')
        return
      }

      if (result.action === 'query' || result.rows) {
        setMessages(prev => [...prev, {
          id: prev.length + 1,
          role: 'assistant',
          content: result.description || 'Consulta ejecutada',
          data: {
            rows: result.rows,
            columns: result.columns,
            rowCount: result.rowCount,
            duration: result.duration
          }
        }])
        addToast(`${result.rowCount} filas en ${result.duration}s`, 'success', 'Consulta completada')
      } else if (result.action === 'cross') {
        setMessages(prev => [...prev, {
          id: prev.length + 1,
          role: 'assistant',
          content: 'Cruce ejecutado: ' + result.joinCondition,
          data: {
            rows: result.rows,
            columns: result.columns,
            rowCount: result.rowCount,
            isCross: true
          }
        }])
        addToast(`Cruce con ${result.rowCount} filas`, 'success', 'Cruce ejecutado')
      } else if (result.action === 'dashboard') {
        setMessages(prev => [...prev, {
          id: prev.length + 1,
          role: 'assistant',
          content: 'Dashboard generado con ' + result.widgets.length + ' widgets',
          data: { widgets: result.widgets, isDashboard: true }
        }])
        addToast('Dashboard listo', 'success', 'Visualización')
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: prev.length + 1,
        role: 'assistant',
        content: '❌ Error: ' + err.message,
        isError: true
      }])
      addToast(err.message, 'error', 'Error')
    } finally {
      setIsLoading(false)
    }
  }, [input, addToast])

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-2xl rounded-lg p-4 ${
              msg.role === 'user'
                ? 'bg-blue-500 text-white'
                : msg.isError
                ? 'bg-red-100 text-red-900'
                : 'bg-gray-100 text-gray-900'
            }`}>
              <p className="text-sm font-medium">{msg.content}</p>

              {msg.details && (
                <ul className="mt-2 space-y-1">
                  {msg.details.map((detail, i) => (
                    <li key={i} className="text-xs">{detail}</li>
                  ))}
                </ul>
              )}

              {msg.data?.rows && (
                <div className="mt-3 bg-white rounded p-2">
                  <div className="text-xs font-mono text-gray-600 mb-2">
                    {msg.data.rowCount} filas • {msg.data.duration}s
                  </div>
                  <div className="overflow-x-auto">
                    <table className="text-xs w-full border-collapse">
                      <thead>
                        <tr className="bg-gray-200">
                          {msg.data.columns.slice(0, 5).map(col => (
                            <th key={col} className="border px-2 py-1 text-left">{col}</th>
                          ))}
                          {msg.data.columns.length > 5 && <th className="border px-2 py-1">...</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {msg.data.rows.slice(0, 3).map((row, i) => (
                          <tr key={i}>
                            {msg.data.columns.slice(0, 5).map(col => (
                              <td key={col} className="border px-2 py-1">{String(row[col]).slice(0, 20)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-600 rounded-lg p-4">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-4 bg-gray-50">
        <div className="flex gap-2 mb-3">
          <button
            onClick={onOpenCrossWizard}
            className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
          >
            ⋈ Cruzar
          </button>
          <button
            onClick={onOpenDashboard}
            className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
          >
            📊 Dashboard
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ej: Muestra el total de ventas por región"
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 font-medium text-sm"
          >
            {isLoading ? '...' : 'Enviar'}
          </button>
        </div>
        {tables.length > 0 && (
          <div className="mt-2 text-xs text-gray-600">
            📊 Tablas disponibles: {tables.map(t => t.name).join(', ')}
          </div>
        )}
      </div>
    </div>
  )
}
