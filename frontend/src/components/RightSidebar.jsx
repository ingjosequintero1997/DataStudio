import { useState } from 'react'

export default function RightSidebar({ tables, selectedLeft, selectedRight, onSelectLeft, onSelectRight, columnToggles, onToggleColumn, onCross, onClose }) {

  const leftTable = tables.find(t => t.name === selectedLeft)
  const rightTable = tables.find(t => t.name === selectedRight)
  const allColumns = [
    ...(leftTable?.columns || []).map(c => ({ ...c, source: selectedLeft })),
    ...(rightTable?.columns || []).map(c => ({ ...c, source: selectedRight })),
  ]

  const commonCols = leftTable && rightTable
    ? (leftTable.columns || []).filter(lc =>
        (rightTable.columns || []).some(rc => rc.name.toLowerCase() === lc.name.toLowerCase())
      )
    : []

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e] border-l border-ssms-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-ssms-border shrink-0 bg-[#1a1a2e]">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#8888aa]">Config. de Cruce</span>
        <button onClick={onClose} className="text-ssms-textDim hover:text-ssms-text transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">

        {/* Visual JOIN diagram */}
        <div className="bg-ssms-toolbar rounded-xl border border-ssms-border p-3">
          <p className="text-[10px] font-bold text-[#8888aa] uppercase tracking-wider mb-3">Diagrama de Cruce</p>
          <div className="flex items-center justify-center gap-1 py-2">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-14 h-14 rounded-full border-2 flex items-center justify-center text-[10px] font-bold text-center leading-tight transition-colors ${selectedLeft ? 'border-blue-500 bg-blue-900/30 text-blue-300' : 'border-ssms-border text-ssms-textDim'}`}>
                {selectedLeft ? selectedLeft.slice(0, 6) + (selectedLeft.length > 6 ? '..' : '') : 'A'}
              </div>
              <span className="text-[9px] text-ssms-textDim">Tabla A</span>
            </div>
            <div className="flex flex-col items-center -mx-3 z-10">
              <div className="w-10 h-10 rounded-full bg-ssms-accent/20 border border-ssms-accent/50 flex items-center justify-center">
                <span className="text-ssms-accent text-xs font-bold">∩</span>
              </div>
              {commonCols.length > 0 && (
                <span className="text-[9px] text-emerald-400 mt-1 text-center">{commonCols.length} col común</span>
              )}
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className={`w-14 h-14 rounded-full border-2 flex items-center justify-center text-[10px] font-bold text-center leading-tight transition-colors ${selectedRight ? 'border-indigo-500 bg-indigo-900/30 text-indigo-300' : 'border-ssms-border text-ssms-textDim'}`}>
                {selectedRight ? selectedRight.slice(0, 6) + (selectedRight.length > 6 ? '..' : '') : 'B'}
              </div>
              <span className="text-[9px] text-ssms-textDim">Tabla B</span>
            </div>
          </div>
        </div>

        {/* Table selectors */}
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-bold text-[#8888aa] uppercase tracking-wider">Seleccionar Tablas</p>
          <div>
            <label className="text-[10px] text-ssms-textDim mb-1 block">Tabla A (izquierda)</label>
            <select
              value={selectedLeft || ''}
              onChange={e => onSelectLeft(e.target.value || null)}
              className="w-full bg-ssms-inputBg border border-ssms-border rounded-lg px-2 py-1.5 text-ssms-text text-xs focus:outline-none focus:border-ssms-accent"
            >
              <option value="">-- Selecciona --</option>
              {tables.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-ssms-textDim mb-1 block">Tabla B (derecha)</label>
            <select
              value={selectedRight || ''}
              onChange={e => onSelectRight(e.target.value || null)}
              className="w-full bg-ssms-inputBg border border-ssms-border rounded-lg px-2 py-1.5 text-ssms-text text-xs focus:outline-none focus:border-ssms-accent"
            >
              <option value="">-- Selecciona --</option>
              {tables.filter(t => t.name !== selectedLeft).map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          </div>

          {selectedLeft && selectedRight && (
            <button
              onClick={() => onCross(selectedLeft, selectedRight, commonCols[0]?.name)}
              className="w-full mt-1 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2"
            >
              🔗 Cruzar Tablas
            </button>
          )}
        </div>

        {/* Column toggles */}
        {allColumns.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-bold text-[#8888aa] uppercase tracking-wider">
              Columnas a incluir
            </p>
            <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
              {allColumns.map((col, i) => {
                const key = col.source + '.' + col.name
                const isOn = columnToggles[key] !== false
                return (
                  <div key={i} className="flex items-center justify-between py-1 px-1 rounded hover:bg-ssms-inputBg/50 transition-colors">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[9px] px-1 rounded bg-ssms-inputBg text-ssms-textDim shrink-0">{col.source.slice(0, 4)}</span>
                      <span className="text-ssms-text text-xs truncate">{col.name}</span>
                    </div>
                    <button
                      onClick={() => onToggleColumn(key)}
                      className={`w-8 h-4 rounded-full transition-colors shrink-0 relative ${isOn ? 'bg-ssms-accent' : 'bg-ssms-border'}`}
                    >
                      <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${isOn ? 'left-4' : 'left-0.5'}`} style={{transition: 'left 0.2s'}} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
