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
      <div className="flex items-center justify-center h-full bg-ssms-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-ssms-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-ssms-textDim text-sm">Iniciando...</span>
        </div>
      </div>
    )
  }

  if (!user) return <Login />

  return <Layout user={user} />
}
