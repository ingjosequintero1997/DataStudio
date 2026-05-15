import { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'
import Login from './components/Login'
import Layout from './components/Layout'

export default function App() {
  const [user, setUser] = useState(undefined) // undefined = loading
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('datastudio-theme')
    return saved === 'dark' ? 'dark' : 'light'
  })

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u || null))
    return unsub
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('datastudio-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))

  if (user === undefined) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: theme === 'dark' ? '#070C07' : '#F4F7F4' }}>
        <div className="flex flex-col items-center gap-4">
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #10B981, #065F46)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 32px rgba(16,185,129,0.4)' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={1.4}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
            </svg>
          </div>
          <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#10B981', borderTopColor: 'transparent' }} />
          <span className="text-sm font-medium" style={{ color: 'rgba(16,185,129,0.7)', fontFamily: 'Inter, sans-serif', letterSpacing: '0.05em' }}>INICIANDO...</span>
        </div>
      </div>
    )
  }

  if (!user) return <Login theme={theme} onToggleTheme={toggleTheme} />

  return <Layout user={user} theme={theme} onToggleTheme={toggleTheme} />
}
