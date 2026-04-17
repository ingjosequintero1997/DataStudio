import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase'

const spring = { type: 'spring', stiffness: 420, damping: 30 }
const AUTH_ERRORS = {
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/user-not-found': 'No existe una cuenta con ese correo.',
  'auth/wrong-password': 'Contraseña incorrecta.',
  'auth/email-already-in-use': 'Ese correo ya tiene una cuenta registrada.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/invalid-email': 'El formato del correo no es válido.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
  'auth/network-request-failed': 'Sin conexión. Verifica tu internet.',
}

function InputField({ label, type, value, onChange, placeholder, icon, autoComplete, rightSlot }) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, marginBottom: 5, color: '#4A6B4A', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: 'Inter, sans-serif' }}>
        {label}
      </label>
      <motion.div
        animate={{ boxShadow: focused ? '0 0 0 2px rgba(67,160,71,0.5)' : '0 0 0 1px #C8DCC8' }}
        transition={{ duration: 0.15 }}
        style={{ borderRadius: 10, overflow: 'hidden', position: 'relative' }}
      >
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 14, display: 'flex', alignItems: 'center', pointerEvents: 'none', color: focused ? '#43A047' : '#9EBB9E', transition: 'color 0.15s' }}>
          {icon}
        </div>
        <input
          type={type}
          value={value}
          onChange={onChange}
          required
          autoComplete={autoComplete}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%',
            paddingLeft: 40,
            paddingRight: rightSlot ? 44 : 14,
            paddingTop: 11,
            paddingBottom: 11,
            background: focused ? '#F1FAF1' : '#F9FBF9',
            border: 'none',
            outline: 'none',
            color: '#1B3318',
            fontSize: '0.88rem',
            fontFamily: 'Inter, sans-serif',
            borderRadius: 10,
            boxSizing: 'border-box',
            transition: 'background 0.15s',
          }}
        />
        {rightSlot && (
          <div style={{ position: 'absolute', right: 12, top: 0, bottom: 0, display: 'flex', alignItems: 'center' }}>
            {rightSlot}
          </div>
        )}
      </motion.div>
    </div>
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [success, setSuccess] = useState(false)

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
      setSuccess(true)
    } catch (err) {
      setError(AUTH_ERRORS[err.code] || 'Ocurrio un error inesperado.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', overflow: 'hidden',
      background: 'linear-gradient(135deg, #1B5E20 0%, #2E7D32 35%, #43A047 70%, #E8F5E9 100%)',
    }}>
      <motion.div
        animate={{ scale: [1, 1.05, 1], opacity: [0.12, 0.2, 0.12] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', top: '-8%', right: '-6%', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)', pointerEvents: 'none' }}
      />
      <motion.div
        animate={{ scale: [1, 1.08, 1], opacity: [0.08, 0.15, 0.08] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        style={{ position: 'absolute', bottom: '-10%', left: '-8%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)', pointerEvents: 'none' }}
      />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 420, margin: '0 16px' }}
      >
        <div style={{ borderRadius: '20px 20px 0 0', background: '#2E7D32', padding: '28px 28px 24px', textAlign: 'center' }}>
          <motion.div whileHover={{ scale: 1.08, rotate: 4 }} transition={spring}
            style={{ display: 'inline-flex', marginBottom: 14, cursor: 'default' }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={1.4}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
              </svg>
            </div>
          </motion.div>
          <h1 style={{ fontFamily: 'Inter, sans-serif', fontSize: '1.6rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.03em', margin: '0 0 6px' }}>DataStudio</h1>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.75rem', color: 'rgba(255,255,255,0.72)', margin: 0 }}>
            Analisis de datos · Motor SQL en navegador
          </p>
        </div>

        <div style={{ background: '#fff', borderRadius: '0 0 20px 20px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', borderRadius: 10, padding: 4, marginBottom: 24, background: '#F4F7F4', border: '1px solid #C8DCC8', gap: 4 }}>
            {['Iniciar sesion', 'Registrarse'].map((label, i) => {
              const active = (i === 1) === isRegister
              return (
                <motion.button key={label} onClick={() => { setIsRegister(i === 1); setError('') }}
                  whileTap={{ scale: 0.97 }} transition={spring}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '0.78rem', fontWeight: 600, transition: 'all 0.18s',
                    background: active ? 'linear-gradient(135deg, #43A047, #2E7D32)' : 'transparent',
                    color: active ? '#fff' : '#4A6B4A',
                    boxShadow: active ? '0 2px 12px rgba(67,160,71,0.35)' : 'none',
                  }}>
                  {label}
                </motion.button>
              )
            })}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <InputField label="Correo electronico" type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="usuario@empresa.com" autoComplete="username"
              icon={<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
            />
            <InputField label="Contrasena" type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
              placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;" autoComplete={isRegister ? 'new-password' : 'current-password'}
              icon={<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
              rightSlot={
                <motion.button type="button" onClick={() => setShowPass(p => !p)} whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.9 }} transition={spring}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9EBB9E', padding: 0, display: 'flex' }}>
                  {showPass
                    ? <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                    : <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  }
                </motion.button>
              }
            />
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, y: -6, height: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ borderRadius: 10, padding: '10px 12px', background: '#FFF3F3', border: '1px solid #FFCDD2', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="#C62828" strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.78rem', color: '#C62828', margin: 0, lineHeight: 1.5 }}>{error}</p>
                </motion.div>
              )}
            </AnimatePresence>
            <motion.button type="submit" disabled={loading || success}
              whileHover={{ scale: loading ? 1 : 1.02 }}
              whileTap={{ scale: loading ? 1 : 0.98 }}
              transition={spring}
              style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none',
                background: success ? 'linear-gradient(135deg, #43A047, #1B5E20)' : 'linear-gradient(135deg, #43A047, #2E7D32)',
                color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: '0.9rem', fontWeight: 700,
                cursor: loading || success ? 'default' : 'pointer',
                boxShadow: '0 4px 20px rgba(67,160,71,0.3)', letterSpacing: '0.01em', marginTop: 4 }}>
              <AnimatePresence mode="wait">
                {success ? (
                  <motion.span key="ok" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Acceso concedido
                  </motion.span>
                ) : loading ? (
                  <motion.span key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTop: '2px solid white', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                    Verificando...
                  </motion.span>
                ) : (
                  <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    {isRegister ? 'Crear cuenta' : 'Ingresar al sistema'}
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </form>
          <p style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', color: '#9EBB9E', marginTop: 20 }}>
            Desarrollado por el <span style={{ color: '#2E7D32', fontWeight: 600 }}>Ing. Jose Quintero</span>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
