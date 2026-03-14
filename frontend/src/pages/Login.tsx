import { useState } from 'react'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth'
import { auth } from '../lib/firebase'
import { useNavigate } from 'react-router-dom'

const googleProvider = new GoogleAuthProvider()

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [isSignup, setIsSignup]  = useState(false)
  const [error, setError]        = useState('')
  const [loading, setLoading]    = useState(false)
  const navigate = useNavigate()

  const handleGoogle = async () => {
    setError('')
    setLoading(true)
    try {
      await signInWithPopup(auth, googleProvider)
      navigate('/dashboard')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEmail = async () => {
    setError('')
    setLoading(true)
    try {
      if (isSignup) {
        await createUserWithEmailAndPassword(auth, email, password)
      } else {
        await signInWithEmailAndPassword(auth, email, password)
      }
      navigate('/dashboard')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.container}>
      <div style={s.card}>
        <h1 style={s.logo}>PulseQ</h1>
        <p style={s.sub}>Multi-tenant message queue platform</p>

        {/* Google Sign-In */}
        <button style={s.googleBtn} onClick={handleGoogle} disabled={loading}>
          <svg width="18" height="18" viewBox="0 0 48 48" style={{ marginRight: 10 }}>
            <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.5 35.5 26.9 36 24 36c-5.2 0-9.6-2.9-11.3-7.1l-6.6 5C9.6 39.6 16.3 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.4-2.5 4.4-4.6 5.8l6.2 5.2C40.7 35.7 44 30.3 44 24c0-1.3-.1-2.7-.4-4z"/>
          </svg>
          Continue with Google
        </button>

        <div style={s.divider}><span style={s.dividerText}>or</span></div>

        {/* Email/Password */}
        <div style={s.toggle}>
          <button
            style={isSignup ? s.tabInactive : s.tabActive}
            onClick={() => setIsSignup(false)}
          >Sign in</button>
          <button
            style={isSignup ? s.tabActive : s.tabInactive}
            onClick={() => setIsSignup(true)}
          >Sign up</button>
        </div>

        <input
          style={s.input}
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleEmail()}
        />
        <input
          style={s.input}
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleEmail()}
        />

        {error && <p style={s.error}>{error}</p>}

        <button style={s.btn} onClick={handleEmail} disabled={loading}>
          {loading ? 'Loading...' : isSignup ? 'Create account' : 'Sign in'}
        </button>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: '#f5f5f5',
  },
  card: {
    background: '#fff', borderRadius: 12, padding: '40px 36px',
    width: 360, boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  logo: { margin: 0, fontSize: 28, fontWeight: 700, color: '#1a1a2e' },
  sub:  { margin: 0, color: '#666', fontSize: 14 },
  googleBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '11px 0', borderRadius: 8, border: '1px solid #e0e0e0',
    background: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
    color: '#333',
  },
  divider: {
    display: 'flex', alignItems: 'center', gap: 10,
    borderTop: '1px solid #f0f0f0', marginTop: 4,
  },
  dividerText: { color: '#bbb', fontSize: 12, background: '#fff', padding: '0 8px', marginTop: -12 },
  toggle: { display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #e0e0e0' },
  tabActive: {
    flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
    background: '#1a1a2e', color: '#fff', fontWeight: 600, fontSize: 14,
  },
  tabInactive: {
    flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
    background: '#fff', color: '#666', fontSize: 14,
  },
  input: {
    padding: '10px 14px', borderRadius: 8, border: '1px solid #e0e0e0',
    fontSize: 14, outline: 'none',
  },
  btn: {
    padding: '12px 0', borderRadius: 8, border: 'none',
    background: '#4f46e5', color: '#fff', fontWeight: 600,
    fontSize: 15, cursor: 'pointer', marginTop: 4,
  },
  error: { color: '#dc2626', fontSize: 13, margin: 0 },
}
