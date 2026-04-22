import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'

const spring = { type: 'spring', stiffness: 360, damping: 28 }

export default function DatasetBuilderModal({
  open,
  onClose,
  tables,
  currentResult,
  onCreate,
  defaultSource = 'result',
}) {
  const [sourceType, setSourceType] = useState(defaultSource)
  const [sourceTable, setSourceTable] = useState(tables?.[0]?.name || '')
  const [targetMode, setTargetMode] = useState('new_tab')
  const [newTableName, setNewTableName] = useState('resultado_personalizado')
  const [targetTable, setTargetTable] = useState('')
  const [whereClause, setWhereClause] = useState('')
  const [downloadCopy, setDownloadCopy] = useState(true)

  const sourceColumns = useMemo(() => {
    if (sourceType === 'result') return currentResult?.columns || []
    return (tables.find(t => t.name === sourceTable)?.columns || []).map(c => c.name)
  }, [sourceType, currentResult, tables, sourceTable])

  const [selectedColumns, setSelectedColumns] = useState([])

  const canCreate = sourceColumns.length > 0 && (
    targetMode === 'replace_main' ? !!targetTable : !!newTableName.trim()
  )

  function toggleColumn(col) {
    setSelectedColumns(prev => prev.includes(col)
      ? prev.filter(x => x !== col)
      : [...prev, col]
    )
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
            <h3 className="text-white text-sm font-bold">Constructor de archivo</h3>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.75)' }}>
              Crea un nuevo dataset desde el cruce o desde archivos cargados
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full text-white" style={{ background: 'rgba(255,255,255,0.2)' }}>✕</button>
        </div>

        <div className="p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="rounded-xl p-3" style={{ background: '#fff', border: '1px solid #C8DCC8' }}>
            <h4 className="text-xs font-bold mb-2" style={{ color: '#2E7D32' }}>1) Fuente de datos</h4>
            <div className="flex gap-2 mb-2">
              <button onClick={() => setSourceType('result')} className="px-3 py-1 rounded text-xs"
                style={sourceType === 'result'
                  ? { background: '#E8F5E9', color: '#2E7D32', border: '1px solid #43A047' }
                  : { background: '#fff', color: '#4A6B4A', border: '1px solid #C8DCC8' }}>
                Resultado del cruce / consulta
              </button>
              <button onClick={() => setSourceType('table')} className="px-3 py-1 rounded text-xs"
                style={sourceType === 'table'
                  ? { background: '#E8F5E9', color: '#2E7D32', border: '1px solid #43A047' }
                  : { background: '#fff', color: '#4A6B4A', border: '1px solid #C8DCC8' }}>
                Archivo cargado
              </button>
            </div>

            {sourceType === 'table' && (
              <select
                value={sourceTable}
                onChange={(e) => setSourceTable(e.target.value)}
                className="w-full px-3 py-2 rounded text-sm"
                style={{ border: '1px solid #C8DCC8', background: '#FAFCFA', color: '#1B3318' }}
              >
                <option value="">Selecciona un archivo</option>
                {tables.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select>
            )}

            {sourceType === 'table' && (
              <div className="mt-3">
                <label className="text-[11px] font-semibold" style={{ color: '#4A6B4A' }}>
                  Filtro SQL opcional (sin WHERE)
                </label>
                <input
                  value={whereClause}
                  onChange={(e) => setWhereClause(e.target.value)}
                  placeholder="Ej: ciudad = 'Valledupar' AND estado = 'activo'"
                  className="w-full mt-1 px-3 py-2 rounded text-sm"
                  style={{ border: '1px solid #C8DCC8', background: '#FAFCFA', color: '#1B3318' }}
                />
              </div>
            )}
          </section>

          <section className="rounded-xl p-3" style={{ background: '#fff', border: '1px solid #C8DCC8' }}>
            <h4 className="text-xs font-bold mb-2" style={{ color: '#2E7D32' }}>2) Columnas</h4>
            <div className="max-h-56 overflow-y-auto pr-1 grid grid-cols-1 gap-1.5">
              {sourceColumns.map(col => (
                <label key={col} className="flex items-center gap-2 text-xs p-1.5 rounded"
                  style={{ background: '#FAFCFA', border: '1px solid #E8F5E9', color: '#1B3318' }}>
                  <input
                    type="checkbox"
                    checked={selectedColumns.includes(col)}
                    onChange={() => toggleColumn(col)}
                  />
                  <span>{col}</span>
                </label>
              ))}
            </div>
            <p className="text-[10px] mt-2" style={{ color: '#9EBB9E' }}>
              Si no seleccionas columnas, se usarán todas.
            </p>
          </section>

          <section className="rounded-xl p-3 md:col-span-2" style={{ background: '#fff', border: '1px solid #C8DCC8' }}>
            <h4 className="text-xs font-bold mb-2" style={{ color: '#2E7D32' }}>3) Destino del resultado</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <button onClick={() => setTargetMode('replace_main')} className="px-3 py-2 rounded text-xs text-left"
                style={targetMode === 'replace_main'
                  ? { background: '#E8F5E9', color: '#2E7D32', border: '1px solid #43A047' }
                  : { background: '#fff', color: '#4A6B4A', border: '1px solid #C8DCC8' }}>
                Actualizar archivo principal
              </button>
              <button onClick={() => setTargetMode('new_tab')} className="px-3 py-2 rounded text-xs text-left"
                style={targetMode === 'new_tab'
                  ? { background: '#E8F5E9', color: '#2E7D32', border: '1px solid #43A047' }
                  : { background: '#fff', color: '#4A6B4A', border: '1px solid #C8DCC8' }}>
                Crear en pestaña nueva
              </button>
              <button onClick={() => setTargetMode('new_file')} className="px-3 py-2 rounded text-xs text-left"
                style={targetMode === 'new_file'
                  ? { background: '#E8F5E9', color: '#2E7D32', border: '1px solid #43A047' }
                  : { background: '#fff', color: '#4A6B4A', border: '1px solid #C8DCC8' }}>
                Crear archivo diferente
              </button>
            </div>

            {targetMode === 'replace_main' && (
              <select value={targetTable} onChange={(e) => setTargetTable(e.target.value)}
                className="w-full mt-2 px-3 py-2 rounded text-sm"
                style={{ border: '1px solid #C8DCC8', background: '#FAFCFA', color: '#1B3318' }}>
                <option value="">Selecciona archivo principal a actualizar</option>
                {tables.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select>
            )}

            {(targetMode === 'new_tab' || targetMode === 'new_file') && (
              <input value={newTableName} onChange={(e) => setNewTableName(e.target.value)}
                className="w-full mt-2 px-3 py-2 rounded text-sm"
                placeholder="Nombre de la nueva tabla"
                style={{ border: '1px solid #C8DCC8', background: '#FAFCFA', color: '#1B3318' }}
              />
            )}

            {targetMode === 'new_file' && (
              <label className="flex items-center gap-2 mt-2 text-xs" style={{ color: '#4A6B4A' }}>
                <input type="checkbox" checked={downloadCopy} onChange={(e) => setDownloadCopy(e.target.checked)} />
                Descargar copia CSV al crear
              </label>
            )}
          </section>
        </div>

        <div className="px-4 py-3 border-t flex items-center justify-end gap-2" style={{ borderColor: '#C8DCC8', background: '#fff' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm"
            style={{ border: '1px solid #C8DCC8', color: '#4A6B4A' }}>
            Cancelar
          </button>
          <button
            disabled={!canCreate}
            onClick={() => onCreate?.({
              sourceType,
              sourceTable,
              selectedColumns,
              whereClause,
              targetMode,
              targetTable,
              newTableName,
              downloadCopy,
            })}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #43A047, #2E7D32)' }}
          >
            Construir archivo
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
