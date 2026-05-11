import { useState, useCallback, useEffect } from 'react'
import { signOut } from 'firebase/auth'
import { motion, AnimatePresence } from 'framer-motion'
import { auth } from '../firebase'
import { ToastContainer } from './Toast'
import Toolbar from './Toolbar'
import ChatAgent from './ChatAgent'
import CrossWizard from './CrossWizard'
import DashboardStudio from '../modules/dashboard/DashboardStudio'
import ExportModal from './ExportModal'

const spring = { type: 'spring', stiffness: 300, damping: 30 }

const G = {
  dark:    '#1B5E20',
  primary: '#43A047',
  light:   '#E8F5E9',
  border:  '#C8DCC8',
  text:    '#1B3318',
  text2:   '#4A6B4A',
  dim:     '#9EBB9E',
}

let _toastId = 0

export default function LayoutAgent({ user }) {
  const [toasts, setToasts] = useState([])
  const [showCrossWizard, setShowCrossWizard] = useState(false)
  const [showDashboardStudio, setShowDashboardStudio] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [queryResult, setQueryResult] = useState(null)

  const addToast = useCallback((message, type = 'info', title) => {
    const id = ++_toastId
    setToasts(prev => [...prev, { id, message, type, title }])
    setTimeout(() => removeToast(id), 4000)
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <div className="flex flex-col h-full select-none" style={{ background: '#F4F7F4' }}>
      <Toolbar
        user={user}
        onExport={() => addToast('Usa el menú en el chat para exportar', 'info')}
        onOpenUploader={() => addToast('Carga archivos como CSV desde el chat', 'info')}
        onCrossTable={() => setShowCrossWizard(true)}
        onConsolidate={() => addToast('Usa el comando: "Consolida todas las tablas"', 'info')}
        onCleanColumns={() => addToast('Selecciona tabla y usa: "Limpia columnas"', 'info')}
        onOpenKnowledgeBase={() => addToast('Base de conocimientos', 'info')}
        onOpenDashboard={() => setShowDashboardStudio(true)}
        isExecuting={false}
        hasResults={!!queryResult}
        dbReady={true}
        onSignOut={() => signOut(auth)}
        onToggleDrawer={() => setDrawerOpen(p => !p)}
      />

      {/* Status bar */}
      <motion.div layout
        className="flex items-center px-4 py-1 text-[11px] shrink-0 gap-2 font-medium"
        style={{ background: '#2E7D32', borderBottom: '1px solid #1B5E20', color: 'rgba(255,255,255,0.85)' }}>
        <motion.span className="truncate flex-1">
          ✓ Agente IA listo • Claude Haiku 3.5
        </motion.span>
        <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.68rem', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
          Ing. José Quintero
        </span>
      </motion.div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1">
          <ChatAgent
            addToast={addToast}
            onOpenCrossWizard={() => setShowCrossWizard(true)}
            onOpenDashboard={() => setShowDashboardStudio(true)}
          />
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showCrossWizard && (
          <CrossWizard
            tables={[]}
            onClose={() => setShowCrossWizard(false)}
            onAskAssistant={(prompt) => {
              setShowCrossWizard(false)
              addToast('Prompt enviado: ' + prompt, 'info')
            }}
            onResult={(res) => {
              setQueryResult(res)
              addToast(res.rowCount + ' filas en cruce', 'success', 'Cruce ejecutado')
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDashboardStudio && (
          <DashboardStudio
            open={showDashboardStudio}
            onClose={() => setShowDashboardStudio(false)}
            tables={[]}
            result={queryResult}
            addToast={addToast}
            onAskAssistant={(prompt) => {
              setShowDashboardStudio(false)
              addToast('Analizando datos...', 'info')
            }}
          />
        )}
      </AnimatePresence>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
