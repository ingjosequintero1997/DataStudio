import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const spring = { type: 'spring', stiffness: 360, damping: 30 }

const CSV_OPTIONS = [
  { value: ',', label: 'Coma (,)' },
  { value: ';', label: 'Punto y coma (;)' },
  { value: '|', label: 'Pipe (|)' },
  { value: '\t', label: 'Tabulador' },
]

const G = {
  dark: '#2E7D32',
  primary: '#43A047',
  light: '#E8F5E9',
  border: '#C8DCC8',
  text: '#1B3318',
  dim: '#6B8B6B',
}

export default function ExportModal({ open, onClose, onConfirm, rowCount = 0, defaultFormat = 'csv' }) {
  const [format, setFormat] = useState(defaultFormat)
  const [delimiter, setDelimiter] = useState(',')
  const [fileName, setFileName] = useState('resultado')

  useEffect(() => {
    if (open) setFormat(defaultFormat || 'csv')
  }, [defaultFormat, open])

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
        onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
      >
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 24 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 16 }}
          transition={spring}
          className="w-full max-w-xl rounded-2xl border"
          style={{ background: '#F4F7F4', borderColor: G.border, boxShadow: '0 24px 60px rgba(0,0,0,0.22)' }}
        >
          <div className="flex items-center justify-between rounded-t-2xl px-6 py-4" style={{ background: G.dark }}>
            <div>
              <h2 className="text-sm font-bold text-white">Exportar resultados</h2>
              <p className="text-xs text-white/70">Configura formato, separador y nombre del archivo</p>
            </div>
            <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full text-white" style={{ background: 'rgba(255,255,255,0.15)' }}>✕</button>
          </div>

          <div className="space-y-5 p-6">
            <div className="rounded-xl border px-4 py-3 text-xs" style={{ background: '#fff', borderColor: G.border, color: G.text }}>
              {rowCount.toLocaleString()} fila(s) listas para exportar
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setFormat('csv')}
                className="rounded-xl border px-4 py-3 text-left"
                style={{ borderColor: format === 'csv' ? G.primary : G.border, background: format === 'csv' ? G.light : '#fff' }}
              >
                <div className="text-sm font-bold" style={{ color: G.text }}>CSV</div>
                <div className="text-xs" style={{ color: G.dim }}>Ligero y compatible con separadores personalizados</div>
              </button>
              <button
                onClick={() => setFormat('xlsx')}
                className="rounded-xl border px-4 py-3 text-left"
                style={{ borderColor: format === 'xlsx' ? G.primary : G.border, background: format === 'xlsx' ? G.light : '#fff' }}
              >
                <div className="text-sm font-bold" style={{ color: G.text }}>Excel</div>
                <div className="text-xs" style={{ color: G.dim }}>Libro XLSX listo para abrir y compartir</div>
              </button>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest" style={{ color: G.dim }}>Nombre del archivo</p>
              <input
                value={fileName}
                onChange={(event) => setFileName(event.target.value)}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: G.border, background: '#fff', color: G.text }}
                placeholder="resultado_cruce"
              />
            </div>

            {format === 'csv' && (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest" style={{ color: G.dim }}>Separador</p>
                <div className="grid grid-cols-2 gap-2">
                  {CSV_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setDelimiter(option.value)}
                      className="rounded-xl border px-3 py-2.5 text-left text-sm"
                      style={{ borderColor: delimiter === option.value ? G.primary : G.border, background: delimiter === option.value ? G.light : '#fff', color: G.text }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: G.border, color: G.text }}>Cancelar</button>
              <button
                onClick={() => onConfirm({ format, delimiter, fileName: fileName.trim() || 'resultado' })}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
                style={{ background: `linear-gradient(135deg, ${G.primary} 0%, ${G.dark} 100%)` }}
              >
                Exportar ahora
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}