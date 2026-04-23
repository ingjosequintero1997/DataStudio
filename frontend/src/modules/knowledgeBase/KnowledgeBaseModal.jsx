import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  DEFAULT_QUERIES,
  createKnowledgeItem,
  isAdminUser,
  removeKnowledgeItem,
  subscribeKnowledgeBase,
  updateKnowledgeItem,
} from '../../lib/knowledgeBase'

const spring = { type: 'spring', stiffness: 360, damping: 28 }

// Detectar placeholders en el texto
function detectPlaceholders(text) {
  const tableMatches = (text.match(/\[tabla\]|\[tabla_\w+\]/gi) || []).map(m => m.toLowerCase())
  const columnMatches = (text.match(/\[columna\]|\[columna_\w+\]/gi) || []).map(m => m.toLowerCase())
  return { hasTable: tableMatches.length > 0, hasColumn: columnMatches.length > 0, tableMatches, columnMatches }
}

export default function KnowledgeBaseModal({ open, onClose, userEmail, onUseCommand, onRunCommand, addToast, tables = [] }) {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [newText, setNewText] = useState('')
  const [newSelectedTable, setNewSelectedTable] = useState('')
  const [newSelectedColumn, setNewSelectedColumn] = useState('')
  const [editingId, setEditingId] = useState('')
  const [editingText, setEditingText] = useState('')
  const [editSelectedTable, setEditSelectedTable] = useState('')
  const [editSelectedColumn, setEditSelectedColumn] = useState('')
  const [loading, setLoading] = useState(false)
  const [savingEditId, setSavingEditId] = useState('')
  const [error, setError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const isAdmin = isAdminUser(userEmail)
  const tableMeta = tables.find(t => t.name === newSelectedTable)
  const tableMetaEdit = tables.find(t => t.name === editSelectedTable)
  const availableColumns = tableMeta?.columns || []
  const availableColumnsEdit = tableMetaEdit?.columns || []

  useEffect(() => {
    if (!open) return
    const unsub = subscribeKnowledgeBase(
      (all) => setItems(all),
      () => setError('No se pudo sincronizar Firebase. Se muestran sugerencias locales.')
    )
    return () => unsub?.()
  }, [open])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    const cloud = items.filter(i => !q || i.text.toLowerCase().includes(q) || i.tags.some(t => t.toLowerCase().includes(q)))
    const local = DEFAULT_QUERIES
      .filter(t => !q || t.toLowerCase().includes(q))
      .map((text, idx) => ({ id: `default-${idx}`, text, createdBy: 'sistema', tags: ['sugerida'] }))
    return [...cloud, ...local]
  }, [items, search])

  async function onAdd() {
    if (!isAdmin) return
    let text = newText.trim()
    if (!text) return
    
    // Reemplazar placeholders con valores seleccionados
    if (newSelectedTable) text = text.replace(/\[tabla\]|\[tabla_\w+\]/gi, `"${newSelectedTable}"`)
    if (newSelectedColumn) text = text.replace(/\[columna\]|\[columna_\w+\]/gi, `"${newSelectedColumn}"`)
    
    setLoading(true)
    try {
      const createdId = await createKnowledgeItem({
        text,
        createdBy: userEmail,
        tags: ['admin'],
      })
      setItems(prev => {
        const exists = prev.some(i => i.id === createdId || i.text === text)
        if (exists) return prev
        return [{
          id: createdId,
          text,
          createdBy: userEmail,
          tags: ['admin'],
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
        }, ...prev]
      })
      setSearch('')
      setNewText('')
      setNewSelectedTable('')
      setNewSelectedColumn('')
      setShowAdvanced(false)
      addToast?.('Instrucción guardada para todos los usuarios', 'success', 'Base de conocimiento')
    } catch (e) {
      addToast?.(e.message || 'No se pudo guardar', 'error', 'Base de conocimiento')
    } finally {
      setLoading(false)
    }
  }

  function onEditStart(item) {
    if (!isAdmin) return
    if (item.id.startsWith('default-')) return
    setEditingId(item.id)
    setEditingText(item.text || '')
    setEditSelectedTable('')
    setEditSelectedColumn('')
  }

  function onEditCancel() {
    setEditingId('')
    setEditingText('')
    setEditSelectedTable('')
    setEditSelectedColumn('')
  }

  async function onEditSave(item) {
    if (!isAdmin || item.id.startsWith('default-')) return
    let text = editingText.trim()
    if (!text) {
      addToast?.('La instrucción no puede estar vacía', 'error', 'Base de conocimiento')
      return
    }
    
    // Reemplazar placeholders con valores seleccionados
    if (editSelectedTable) text = text.replace(/\[tabla\]|\[tabla_\w+\]/gi, `"${editSelectedTable}"`)
    if (editSelectedColumn) text = text.replace(/\[columna\]|\[columna_\w+\]/gi, `"${editSelectedColumn}"`)
    
    setSavingEditId(item.id)
    try {
      await updateKnowledgeItem({
        id: item.id,
        text,
        tags: item.tags,
        updatedBy: userEmail,
      })
      setItems(prev => prev.map(it => (
        it.id === item.id
          ? { ...it, text, updatedAtMs: Date.now() }
          : it
      )))
      onEditCancel()
      addToast?.('Instruccion actualizada', 'success', 'Base de conocimiento')
    } catch (e) {
      addToast?.(e.message || 'No se pudo actualizar', 'error', 'Base de conocimiento')
    } finally {
      setSavingEditId('')
    }
  }

  async function onDelete(id) {
    if (!isAdmin || id.startsWith('default-')) return
    try {
      await removeKnowledgeItem(id, userEmail)
      setItems(prev => prev.filter(i => i.id !== id))
      addToast?.('Instrucción eliminada', 'info', 'Base de conocimiento')
    } catch (e) {
      addToast?.(e.message || 'No se pudo eliminar', 'error', 'Base de conocimiento')
    }
  }

  if (!open) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, y: 18, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 18, opacity: 0 }}
        transition={spring}
        className="w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-2xl flex flex-col"
        style={{ background: '#F4F7F4', border: '1px solid #C8DCC8' }}
      >
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between shrink-0" style={{ background: '#2E7D32', borderRadius: '16px 16px 0 0' }}>
          <div>
            <h3 className="text-white text-sm font-bold">📚 Base de Conocimiento</h3>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.8)' }}>
              Instrucciones reutilizables para consultas
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-full flex items-center justify-center text-lg text-white hover:opacity-80 transition-opacity"
            style={{ background: 'rgba(255,255,255,0.2)' }}
          >
            ✕
          </button>
        </div>

        {/* Search bar */}
        <div className="px-6 py-3 border-b" style={{ borderColor: '#C8DCC8', background: '#E8F5E9' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar instrucción..."
            className="w-full px-4 py-2 rounded-lg text-sm"
            style={{ border: '1px solid #C8DCC8', background: '#fff', color: '#1B3318' }}
          />
          {error && <p className="text-xs mt-2" style={{ color: '#B91C1C' }}>{error}</p>}
        </div>

        {/* Admin Section */}
        {isAdmin && (
          <div className="px-6 py-4 border-b" style={{ borderColor: '#C8DCC8', background: '#fff' }}>
            <div className="mb-3 flex items-center justify-between">
              <label className="text-xs font-bold tracking-wide" style={{ color: '#2E7D32' }}>
                ✨ Nueva Instrucción Global (Admin)
              </label>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs font-semibold px-2 py-1 rounded"
                style={{ color: '#43A047', background: '#E8F5E9', border: '1px solid #C8DCC8' }}
              >
                {showAdvanced ? 'Básico' : 'Avanzado'}
              </button>
            </div>

            <textarea
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Escribe tu instrucción aquí. Usa [tabla] para placeholder de tabla, [columna] para columna..."
              className="w-full px-4 py-3 rounded-lg text-sm mb-3 resize-none"
              rows={3}
              style={{ border: '1px solid #C8DCC8', background: '#FAFCFA', color: '#1B3318' }}
            />

            {showAdvanced && (
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs font-semibold" style={{ color: '#4A6B4A' }}>Tabla (reemplazar [tabla])</label>
                  <select
                    value={newSelectedTable}
                    onChange={(e) => {
                      setNewSelectedTable(e.target.value)
                      setNewSelectedColumn('')
                    }}
                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                    style={{ border: '1px solid #C8DCC8', background: '#FAFCFA', color: '#1B3318' }}
                  >
                    <option value="">-- Seleccionar tabla --</option>
                    {tables.map(t => (
                      <option key={t.name} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold" style={{ color: '#4A6B4A' }}>Columna (reemplazar [columna])</label>
                  <select
                    value={newSelectedColumn}
                    onChange={(e) => setNewSelectedColumn(e.target.value)}
                    disabled={!newSelectedTable}
                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm disabled:opacity-50"
                    style={{ border: '1px solid #C8DCC8', background: '#FAFCFA', color: '#1B3318' }}
                  >
                    <option value="">-- Seleccionar columna --</option>
                    {availableColumns.map(c => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <button
              onClick={onAdd}
              disabled={loading || !newText.trim()}
              className="w-full px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-all"
              style={{ background: 'linear-gradient(135deg, #43A047, #2E7D32)' }}
            >
              {loading ? 'Guardando...' : 'Guardar Instrucción'}
            </button>
          </div>
        )}

        {/* Queries Grid */}
        <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3">
          <AnimatePresence>
            {filtered.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-12 opacity-50">
                <span className="text-3xl mb-2">📭</span>
                <p className="text-sm">No hay instrucciones que coincidan</p>
              </div>
            ) : (
              filtered.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="rounded-xl p-4 border transition-all"
                  style={{ background: '#fff', border: '1px solid #C8DCC8', borderLeftWidth: 4, borderLeftColor: item.tags.includes('sugerida') ? '#FFA500' : '#43A047' }}
                >
                  {editingId === item.id ? (
                    <div className="space-y-3">
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        className="w-full rounded-lg p-3 text-sm resize-none"
                        rows={4}
                        style={{ border: '1px solid #C8DCC8', background: '#FAFCFA', color: '#1B3318' }}
                      />
                      {showAdvanced && (
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={editSelectedTable}
                            onChange={(e) => {
                              setEditSelectedTable(e.target.value)
                              setEditSelectedColumn('')
                            }}
                            className="px-3 py-2 rounded-lg text-xs"
                            style={{ border: '1px solid #C8DCC8', background: '#FAFCFA', color: '#1B3318' }}
                          >
                            <option value="">-- Tabla --</option>
                            {tables.map(t => (
                              <option key={t.name} value={t.name}>{t.name}</option>
                            ))}
                          </select>
                          <select
                            value={editSelectedColumn}
                            onChange={(e) => setEditSelectedColumn(e.target.value)}
                            disabled={!editSelectedTable}
                            className="px-3 py-2 rounded-lg text-xs disabled:opacity-50"
                            style={{ border: '1px solid #C8DCC8', background: '#FAFCFA', color: '#1B3318' }}
                          >
                            <option value="">-- Columna --</option>
                            {availableColumnsEdit.map(c => (
                              <option key={c.name} value={c.name}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed mb-3" style={{ color: '#1B3318' }}>{item.text}</p>
                  )}

                  <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t" style={{ borderColor: '#E5EFE5' }}>
                    <span className="text-[10px]" style={{ color: '#9EBB9E' }}>
                      {item.tags.includes('sugerida') ? '💡 Sugerida' : `👤 ${item.createdBy}`}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { onUseCommand?.(item.text); onRunCommand?.(item.text); onClose?.() }}
                        className="px-3 py-1 rounded-md text-xs font-semibold hover:opacity-80 transition-opacity"
                        style={{ background: '#E8F5E9', color: '#2E7D32', border: '1px solid #C8DCC8' }}
                      >
                        Usar
                      </button>
                      {editingId === item.id ? (
                        <>
                          <button
                            onClick={() => onEditSave(item)}
                            disabled={!editingText.trim() || savingEditId === item.id}
                            className="px-2 py-1 rounded-md text-xs font-semibold disabled:opacity-50"
                            style={{ background: '#E8F5E9', color: '#2E7D32', border: '1px solid #C8DCC8' }}
                          >
                            Guardar
                          </button>
                          <button
                            onClick={onEditCancel}
                            className="px-2 py-1 rounded-md text-xs"
                            style={{ background: '#F3F4F6', color: '#4B5563', border: '1px solid #D1D5DB' }}
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          {!item.id.startsWith('default-') && isAdmin && (
                            <>
                              <button
                                onClick={() => onEditStart(item)}
                                className="px-2 py-1 rounded-md text-xs disabled:opacity-50"
                                style={{ background: '#F4F7F4', color: '#4A6B4A', border: '1px solid #C8DCC8' }}
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => onDelete(item.id)}
                                className="px-2 py-1 rounded-md text-xs"
                                style={{ background: '#FFF3F3', color: '#B91C1C', border: '1px solid #FFCDD2' }}
                              >
                                🗑️
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}
