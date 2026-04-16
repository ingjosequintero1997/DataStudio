import { useRef, useCallback, useEffect } from 'react'
import Editor from '@monaco-editor/react'

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN',
  'FULL OUTER JOIN', 'ON', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET',
  'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TABLE', 'VIEW',
  'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT', 'WITH', 'AS', 'CASE', 'WHEN',
  'THEN', 'ELSE', 'END', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN',
  'LIKE', 'IS NULL', 'IS NOT NULL', 'DISTINCT', 'COUNT', 'SUM', 'AVG',
  'MIN', 'MAX', 'COALESCE', 'CAST', 'OVER', 'PARTITION BY', 'ROW_NUMBER',
  'RANK', 'DENSE_RANK', 'DESCRIBE', 'SHOW TABLES',
]

export default function QueryEditor({ editorRef, onExecute, tables }) {
  const monacoRef = useRef(null)
  const internalEditorRef = useRef(null)

  const handleEditorDidMount = useCallback((editor, monaco) => {
    internalEditorRef.current = editor
    monacoRef.current = monaco

    // Register SQL completions
    monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }

        const kwSuggestions = SQL_KEYWORDS.map(kw => ({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          range,
        }))

        const tableSuggestions = tables.map(t => ({
          label: t.name,
          kind: monaco.languages.CompletionItemKind.Field,
          insertText: `"${t.name}"`,
          detail: `${t.rowCount?.toLocaleString()} rows`,
          range,
        }))

        const colSuggestions = tables.flatMap(t =>
          (t.columns || []).map(col => ({
            label: col.name,
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: col.name,
            detail: `${col.type} · ${t.name}`,
            range,
          }))
        )

        return { suggestions: [...kwSuggestions, ...tableSuggestions, ...colSuggestions] }
      },
    })

    // F5 to execute
    editor.addCommand(monaco.KeyCode.F5, () => onExecute())
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => onExecute()
    )

    // Expose helpers to parent via ref
    if (editorRef) {
      editorRef.current = {
        getValue: () => editor.getValue(),
        insertText: (text) => {
          editor.setValue(text)
          editor.focus()
        },
      }
    }
  }, [tables, onExecute, editorRef])

  // Update completions when tables change
  useEffect(() => {
    if (!internalEditorRef.current || !monacoRef.current) return
    const monaco = monacoRef.current
    monaco.languages.getLanguages() // ensure registered
  }, [tables])

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center px-3 bg-ssms-toolbar border-b border-ssms-border shrink-0">
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b-2 border-ssms-accent text-ssms-text text-xs">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-ssms-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          SQLQuery1.sql
        </div>
        <div className="flex-1" />
        <span className="text-ssms-textDim text-[10px]">F5 / Ctrl+Enter para ejecutar</span>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="sql"
          defaultValue={`-- CSV SQL Studio | Motor DuckDB-Wasm\n-- Escribe tu consulta SQL aquí\n\n-- Ejemplo:\n-- SELECT *\n-- FROM "mi_tabla"\n-- LIMIT 100;\n`}
          theme="vs-dark"
          onMount={handleEditorDidMount}
          options={{
            fontSize: 13,
            fontFamily: 'Consolas, "Courier New", monospace',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            tabSize: 2,
            suggestOnTriggerCharacters: true,
            quickSuggestions: true,
            lineNumbers: 'on',
            renderLineHighlight: 'line',
            padding: { top: 8 },
          }}
        />
      </div>
    </div>
  )
}
