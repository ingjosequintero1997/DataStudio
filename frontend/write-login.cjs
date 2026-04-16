const fs = require('fs')

const code = `import { useState } from 'react'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, email, password)
      } else {
        await signInWithEmailAndPassword(auth, email, password)
      }
    } catch (err) {
      const messages = {
        'auth/invalid-credential': 'Credenciales inválidas.',
        'auth/user-not-found': 'Usuario no encontrado.',
        'auth/wrong-password': 'Contraseña incorrecta.',
        'auth/email-already-in-use': 'El correo ya está registrado.',
        'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
        'auth/invalid-email': 'Correo electrónico inválido.',
        'auth/too-many-requests': 'Demasiados intentos. Espera antes de continuar.',
      }
      setError(messages[err.code] || err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex items-center justify-center h-full overflow-hidden" style={{ background: 'radial-gradient(ellipse 120% 80% at 50% -10%, #0d1b3e 0%, #080c1a 55%, #050710 100%)' }}>

      {/* Ambient grid */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(0,120,212,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,120,212,0.04) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      {/* Glow orbs */}
      <div className="absolute top-[-120px] left-[-100px] w-[500px] h-[500px] rounded-full opacity-10 pointer-events-none" style={{ background: 'radial-gradient(circle, #0078d4 0%, transparent 70%)' }} />
      <div className="absolute bottom-[-80px] right-[-80px] w-[400px] h-[400px] rounded-full opacity-8 pointer-events-none" style={{ background: 'radial-gradient(circle, #2563eb 0%, transparent 70%)' }} />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md mx-4">

        {/* Brand header */}
        <div className="flex flex-col items-center mb-8">
          {/* Logo badge */}
          <div className="relative mb-5">
            <div className="absolute inset-0 rounded-2xl blur-xl opacity-60" style={{ background: 'linear-gradient(135deg, #0078d4, #2563eb)' }} />
            <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0078d4 0%, #1d4ed8 100%)', boxShadow: '0 8px 32px rgba(0,120,212,0.4), inset 0 1px 0 rgba(255,255,255,0.15)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
              </svg>
            </div>
          </div>

          <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#f0f4ff', letterSpacing: '-0.02em' }}>
            Analizador de Datos
          </h1>
          <p className="text-sm mt-1 font-medium" style={{ color: '#4a90d9' }}>Dusakawi EPSI · Aseguramiento</p>
          <p className="text-xs mt-1" style={{ color: '#4a5568' }}>Motor SQL · Cliente exclusivamente en navegador</p>
        </div>

        {/* Glass card */}
        <div className="rounded-2xl p-px" style={{ background: 'linear-gradient(135deg, rgba(0,120,212,0.4) 0%, rgba(255,255,255,0.05) 50%, rgba(0,120,212,0.1) 100%)' }}>
          <div className="rounded-2xl p-7" style={{ background: 'rgba(8,12,26,0.85)', backdropFilter: 'blur(24px)' }}>

            {/* Tab switcher */}
            <div className="flex rounded-lg p-1 mb-6" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {['Iniciar sesión', 'Registrarse'].map((label, i) => {
                const active = (i === 1) === isRegister
                return (
                  <button
                    key={label}
                    onClick={() => { setIsRegister(i === 1); setError('') }}
                    className="flex-1 py-1.5 text-xs font-medium rounded-md transition-all duration-200"
                    style={active
                      ? { background: 'linear-gradient(135deg, #0078d4, #1d4ed8)', color: '#fff', boxShadow: '0 2px 12px rgba(0,120,212,0.35)' }
                      : { color: '#6b7280' }
                    }
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* Email field */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>
                  Correo electrónico
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" style={{ color: '#4a5568' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                    </svg>
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="username"
                    placeholder="usuario@empresa.com"
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg outline-none transition-all duration-200"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#e2e8f0',
                      caretColor: '#0078d4',
                    }}
                    onFocus={e => { e.target.style.border = '1px solid rgba(0,120,212,0.6)'; e.target.style.boxShadow = '0 0 0 3px rgba(0,120,212,0.12)' }}
                    onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none' }}
                  />
                </div>
              </div>

              {/* Password field */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>
                  Contraseña
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" style={{ color: '#4a5568' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2.5 text-sm rounded-lg outline-none transition-all duration-200"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#e2e8f0',
                      caretColor: '#0078d4',
                    }}
                    onFocus={e => { e.target.style.border = '1px solid rgba(0,120,212,0.6)'; e.target.style.boxShadow = '0 0 0 3px rgba(0,120,212,0.12)' }}
                    onBlur={e => { e.target.style.border = '1px solid rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(p => !p)}
                    className="absolute inset-y-0 right-3 flex items-center"
                    style={{ color: '#4a5568' }}
                  >
                    {showPass
                      ? <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      : <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    }
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 rounded-lg px-3 py-2.5" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mt-px shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-red-400 text-xs leading-relaxed">{error}</p>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="relative w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-200 mt-1 overflow-hidden disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: loading ? '#1d4ed8' : 'linear-gradient(135deg, #0078d4 0%, #1d4ed8 100%)', boxShadow: loading ? 'none' : '0 4px 20px rgba(0,120,212,0.35)' }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Autenticando...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    {isRegister ? 'Crear cuenta' : 'Acceder al sistema'}
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] mt-6" style={{ color: '#2d3748' }}>
          Desarrollado por el Ing. José Quintero · Dusakawi EPSI-Aseguramiento
        </p>
      </div>
    </div>
  )
}
`

fs.writeFileSync('src/components/Login.jsx', code)
console.log('Login.jsx escrito.')
