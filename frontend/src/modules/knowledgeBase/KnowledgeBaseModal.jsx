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

export default function KnowledgeBaseModal({ open, onClose, userEmail, onUseCommand, addToast }) {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [newText, setNewText] = useState('')
  const [editingId, setEditingId] = useState('')
  const [editingText, setEditingText] = useState('')
  const [loading, setLoading] = useState(false)
  const [savingEditId, setSavingEditId] = useState('')
  const [error, setError] = useState('')

  const isAdmin = isAdminUser(userEmail)

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
    const text = newText.trim()
    if (!text) return
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
      addToast?.('Instruccion guardada para todos los usuarios', 'success', 'Base de conocimiento')
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
  }

  function onEditCancel() {
    setEditingId('')
    setEditingText('')
  }

  async function onEditSave(item) {
    if (!isAdmin || item.id.startsWith('default-')) return
    const text = editingText.trim()
    if (!text) {
      addToast?.('La instruccion no puede estar vacia', 'error', 'Base de conocimiento')
      return
    }
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
      addToast?.('Instruccion eliminada', 'info', 'Base de conocimiento')
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
        className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl flex flex-col"
        style={{ background: '#F4F7F4', border: '1px solid #C8DCC8' }}
      >
        <div className="px-5 py-4 flex items-center justify-between" style={{ background: '#2E7D32' }}>
          <div>
            <h3 className="text-white text-sm font-bold">Base de conocimiento</h3>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.75)' }}>
              Instrucciones reutilizables para consultas en lenguaje natural
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full text-white" style={{ background: 'rgba(255,255,255,0.2)' }}>✕</button>
        </div>

        <div className="p-4 border-b" style={{ borderColor: '#C8DCC8', background: '#E8F5E9' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar instruccion..."
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ border: '1px solid #C8DCC8', background: '#fff', color: '#1B3318' }}
          />
          {error && <p className="text-xs mt-2" style={{ color: '#B91C1C' }}>{error}</p>}
        </div>

        {isAdmin && (
          <div className="p-4 border-b" style={{ borderColor: '#C8DCC8', background: '#fff' }}>
            <label className="text-[11px] font-semibold" style={{ color: '#4A6B4A' }}>
              Nueva instruccion global (solo admin)
            </label>
            <div className="flex gap-2 mt-2">
              <input
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="Ej: Actualiza masivo clientes columna estado por id con: 1001=>activo; 1002=>inactivo"
                className="flex-1 px-3 py-2 rounded-lg text-sm"
                style={{ border: '1px solid #C8DCC8', background: '#FAFCFA', color: '#1B3318' }}
              />
              <button
                onClick={onAdd}
                disabled={loading || !newText.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #43A047, #2E7D32)' }}
              >
                Guardar
              </button>
            </div>
          </div>
        )}

        <div className="p-4 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
          <AnimatePresence>
            {filtered.map((item) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="rounded-xl p-3"
                style={{ background: '#fff', border: '1px solid #C8DCC8' }}
              >
                {editingId === item.id ? (
                  <textarea
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    className="w-full rounded-lg p-2 text-sm"
                    rows={4}
                    style={{ border: '1px solid #C8DCC8', background: '#FAFCFA', color: '#1B3318', resize: 'vertical' }}
                  />
                ) : (
                  <p className="text-sm leading-relaxed" style={{ color: '#1B3318' }}>{item.text}</p>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[10px]" style={{ color: '#9EBB9E' }}>{item.createdBy || 'admin'}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { onUseCommand?.(item.text); onClose?.() }}
                      className="px-3 py-1 rounded-md text-xs font-semibold"
                      style={{ background: '#E8F5E9', color: '#2E7D32', border: '1px solid #C8DCC8' }}
                    >
                      Usar consulta
                    </button>
                    {editingId === item.id ? (
                      <>
                        <button
                          onClick={() => onEditSave(item)}
                          disabled={!editingText.trim() || savingEditId === item.id}
                          className="px-2 py-1 rounded-md text-xs disabled:opacity-50"
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
                      <button
                        onClick={() => onEditStart(item)}
                        disabled={!isAdmin || item.id.startsWith('default-')}
                        className="px-2 py-1 rounded-md text-xs disabled:opacity-50"
                        style={{ background: '#F4F7F4', color: '#4A6B4A', border: '1px solid #C8DCC8' }}
                      >
                        Editar
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(item.id)}
                      disabled={!isAdmin || item.id.startsWith('default-')}
                      className="px-2 py-1 rounded-md text-xs disabled:opacity-50"
                      style={{ background: '#FFF3F3', color: '#B91C1C', border: '1px solid #FFCDD2' }}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}
