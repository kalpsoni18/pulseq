import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/AuthContext'

export default function Onboarding() {
  const [orgName, setOrgName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const { refetchMe }         = useAuth()
  const navigate              = useNavigate()

  const createOrg = async () => {
    if (!orgName.trim()) return
    setLoading(true)
    setError('')
    try {
      await api.post('/orgs/', { name: orgName.trim() })
      // Force token refresh so org_id custom claim is visible
      await import('../lib/firebase').then(({ auth }) =>
        auth.currentUser?.getIdToken(true)
      )
      await refetchMe()
      navigate('/dashboard')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Create your organisation</h2>
        <p style={styles.sub}>
          Every org gets its own isolated Pub/Sub queue and autoscaling workers.
        </p>
        <input
          style={styles.input}
          placeholder="Organisation name (e.g. Acme Corp)"
          value={orgName}
          onChange={e => setOrgName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && createOrg()}
          autoFocus
        />
        {error && <p style={styles.error}>{error}</p>}
        <button style={styles.btn} onClick={createOrg} disabled={loading || !orgName.trim()}>
          {loading ? 'Creating...' : 'Create organisation'}
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: '#f5f5f5',
  },
  card: {
    background: '#fff', borderRadius: 12, padding: '40px 36px',
    width: 400, boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
    display: 'flex', flexDirection: 'column', gap: 16,
  },
  title: { margin: 0, fontSize: 22, fontWeight: 700, color: '#1a1a2e' },
  sub:   { margin: 0, fontSize: 14, color: '#666', lineHeight: 1.6 },
  input: {
    padding: '10px 14px', borderRadius: 8, border: '1px solid #e0e0e0',
    fontSize: 15, outline: 'none',
  },
  btn: {
    padding: '12px 0', borderRadius: 8, border: 'none',
    background: '#4f46e5', color: '#fff', fontWeight: 600,
    fontSize: 15, cursor: 'pointer',
  },
  error: { color: '#dc2626', fontSize: 13, margin: 0 },
}
