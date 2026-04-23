/**
 * QueryTabs — Sistema de múltiples pestañas de consultas
 * Permite tener varias consultas abiertas simultáneamente
 */
import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CommandBar from './CommandBar'

const spring = { type: 'spring', stiffness: 300, damping: 30 }

export default function QueryTabs({ 
  tables, 
  onExecute, 
  isExecuting, 
  queryResult,
  onClear,
  onShowKnowledgeBase 
}) {
  const [tabs, setTabs] = useState([{ id: Date.now(), label: 'Consulta 1', active: true }])
  const [activeTabId, setActiveTabId] = useState(tabs[0].id)

  const activeTab = tabs.find(t => t.id === activeTabId)

  const addTab = useCallback(() => {
    const newId = Date.now()
    setTabs(prev => [
      ...prev.map(t => ({ ...t, active: false })),
      { id: newId, label: `Consulta ${prev.length + 1}`, active: true }
    ])
    setActiveTabId(newId)
  }, [])

  const closeTab = useCallback((id) => {
    if (tabs.length === 1) return
    setTabs(prev => prev.filter(t => t.id !== id))
    if (activeTabId === id) {
      setActiveTabId(tabs[0].id)
    }
  }, [tabs, activeTabId])

  const renameTab = useCallback((id, newLabel) => {
    if (!newLabel.trim()) return
    setTabs(prev => prev.map(t => t.id === id ? { ...t, label: newLabel.trim() } : t))
  }, [])

  const switchTab = useCallback((id) => {
    setActiveTabId(id)
  }, [])

  return (
    <div className="flex flex-col h-full bg-white border-r" style={{ borderColor: '#C8DCC8' }}>
      {/* Tabs Header */}
      <div className="flex items-center gap-0 px-0 py-0 overflow-x-auto border-b" style={{ borderColor: '#C8DCC8', background: '#F8F9F8' }}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="flex items-center gap-1 px-3 py-2 border-r cursor-pointer transition-all relative group"
            style={{
              borderColor: '#C8DCC8',
              background: activeTabId === tab.id ? '#FFFFFF' : '#F8F9F8',
              borderBottom: activeTabId === tab.id ? '2px solid #43A047' : 'none'
            }}
            onClick={() => switchTab(tab.id)}
          >
            <span className="text-xs font-medium" style={{ color: '#1B3318', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {tab.label}
            </span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
                className="ml-1 text-xs hover:opacity-70 transition-opacity"
                style={{ color: '#93c5fd' }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        
        {/* Botón agregar pestaña */}
        <button
          onClick={addTab}
          className="px-3 py-2 text-xs font-medium hover:bg-green-50 transition-all"
          style={{ color: '#43A047', borderRight: '1px solid #C8DCC8' }}
          title="Nueva consulta"
        >
          +
        </button>

        {/* Botón Base de Conocimiento */}
        <button
          onClick={onShowKnowledgeBase}
          className="px-3 py-2 text-xs font-medium hover:bg-green-50 transition-all"
          style={{ color: '#2E7D32', borderRight: '1px solid #C8DCC8' }}
          title="Abrir Base de Conocimiento"
        >
          📚
        </button>
      </div>

      {/* CommandBar */}
      <CommandBar
        onExecute={onExecute}
        isExecuting={isExecuting}
        injectedValue={null}
        onClear={onClear}
        tables={tables}
      />
    </div>
  )
}
