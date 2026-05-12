import { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'
import Login from './components/Login'
import Layout from './components/Layout'

export default function App() {
  const [user, setUser] = useState(undefined) // undefined = loading

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u || null))
    return unsub
  }, [])

  if (user === undefined) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: '#F4F7F4' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#43A047', borderTopColor: 'transparent' }} />
          <span className="text-sm" style={{ color: '#4A6B4A' }}>Iniciando...</span>
        </div>
      </div>
    )
  }

  if (!user) return <Login />

  return <Layout user={user} />
}
