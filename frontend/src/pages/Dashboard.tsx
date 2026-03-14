import { useState, useEffect, useCallback } from 'react'
import { signOut } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import { auth } from '../lib/firebase'
import { api } from '../lib/api'
import { useAuth } from '../lib/AuthContext'

interface QueueStatus {
  subscription: string
  undelivered_messages: number
  oldest_unacked_age_seconds: number | null
  replicas: number | null
}

interface PublishResult {
  message_ids: string[]
  count: number
  topic: string
}

export default function Dashboard() {
  const { me }                              = useAuth()
  const navigate                            = useNavigate()
  const [status, setStatus]                 = useState<QueueStatus | null>(null)
  const [history, setHistory]               = useState<number[]>([])
  const [replicaHistory, setReplicaHistory] = useState<number[]>([])
  const [payload, setPayload]               = useState('Hello from PulseQ!')
  const [burstCount, setBurstCount]         = useState(25)
  const [publishing, setPublishing]         = useState(false)
  const [lastResult, setLastResult]         = useState<PublishResult | null>(null)
  const [error, setError]                   = useState('')
  const [totalPublished, setTotalPublished] = useState(0)

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.get<QueueStatus>('/messages/status')
      setStatus(data)
      setHistory(h => [...h.slice(-29), data.undelivered_messages])
      setReplicaHistory(h => [...h.slice(-29), data.replicas ?? 0])
    } catch {
      // silently retry next tick
    }
  }, [])

  // Poll every 3 seconds
  useEffect(() => {
    fetchStatus()
    const id = setInterval(fetchStatus, 3000)
    return () => clearInterval(id)
  }, [fetchStatus])

  const publish = async () => {
    setPublishing(true)
    setError('')
    try {
      const result = await api.post<PublishResult>('/messages/publish', {
        payload,
        count: burstCount,
      })
      setLastResult(result)
      setTotalPublished(t => t + result.count)
      await fetchStatus()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setPublishing(false)
    }
  }

  const logout = async () => {
    await signOut(auth)
    navigate('/login')
  }

  const maxQ = Math.max(...history, 1)
  const maxR = Math.max(...replicaHistory, 1)

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <span style={s.logo}>PulseQ</span>
          <span style={s.orgBadge}>{me?.email}</span>
        </div>
        <button style={s.logoutBtn} onClick={logout}>Sign out</button>
      </div>

      <div style={s.body}>
        {/* ── Stat cards ── */}
        <div style={s.statsRow}>
          <StatCard
            label="Queue depth"
            value={status?.undelivered_messages ?? '—'}
            sub="unacked messages"
            accent="#4f46e5"
          />
          <StatCard
            label="Active replicas"
            value={status?.replicas ?? '—'}
            sub="consumer pods"
            accent="#0891b2"
          />
          <StatCard
            label="Published (session)"
            value={totalPublished}
            sub="total messages sent"
            accent="#059669"
          />
          <StatCard
            label="Subscription"
            value={status?.subscription ? 'active' : '—'}
            sub={status?.subscription ?? 'no subscription'}
            accent="#d97706"
          />
        </div>

        <div style={s.twoCol}>
          {/* ── Publish panel ── */}
          <div style={s.card}>
            <h2 style={s.cardTitle}>Publish messages</h2>
            <p style={s.cardSub}>
              Messages land in your org's Pub/Sub topic. KEDA watches the queue
              depth and scales consumer pods within ~5 seconds.
            </p>

            <label style={s.label}>Message payload</label>
            <input
              style={s.input}
              value={payload}
              onChange={e => setPayload(e.target.value)}
            />

            <label style={s.label}>Burst count (1–100)</label>
            <input
              style={s.input}
              type="number"
              min={1}
              max={100}
              value={burstCount}
              onChange={e => setBurstCount(Number(e.target.value))}
            />

            {error && <p style={s.error}>{error}</p>}

            {lastResult && (
              <div style={s.successBox}>
                Published {lastResult.count} message{lastResult.count !== 1 ? 's' : ''} to{' '}
                <code>{lastResult.topic}</code>
              </div>
            )}

            <button
              style={{ ...s.btn, opacity: publishing ? 0.6 : 1 }}
              onClick={publish}
              disabled={publishing}
            >
              {publishing ? 'Publishing...' : `Publish ${burstCount} message${burstCount !== 1 ? 's' : ''}`}
            </button>

            <div style={s.quickBursts}>
              {[10, 25, 50, 100].map(n => (
                <button
                  key={n}
                  style={s.quickBtn}
                  onClick={() => { setBurstCount(n); }}
                >
                  {n}
                </button>
              ))}
              <span style={{ fontSize: 12, color: '#999', alignSelf: 'center' }}>quick burst</span>
            </div>
          </div>

          {/* ── Charts panel ── */}
          <div style={s.card}>
            <h2 style={s.cardTitle}>Live scaling view</h2>
            <p style={s.cardSub}>Updates every 3 seconds. Queue depth drives replica count.</p>

            <label style={s.label}>Queue depth (last 30 polls)</label>
            <MiniChart
              data={history}
              max={maxQ}
              color="#4f46e5"
              label="msgs"
            />

            <label style={{ ...s.label, marginTop: 20 }}>Consumer replicas (last 30 polls)</label>
            <MiniChart
              data={replicaHistory}
              max={maxR}
              color="#0891b2"
              label="pods"
              maxY={10}
            />

            <div style={s.scalingRule}>
              <span>Scaling rule: </span>
              <strong>1 replica per 5 messages</strong>
              <span style={{ color: '#999' }}> · min 0 · max 10 pods</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Sub-components ── */

function StatCard({
  label, value, sub, accent,
}: {
  label: string; value: string | number; sub: string; accent: string
}) {
  return (
    <div style={{ ...s.statCard, borderTop: `3px solid ${accent}` }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#1a1a2e' }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#444', marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function MiniChart({
  data, max, color, label, maxY,
}: {
  data: number[]; max: number; color: string; label: string; maxY?: number
}) {
  const h = 80
  const w = 100
  const effectiveMax = maxY ?? max

  if (data.length === 0) {
    return <div style={s.chartEmpty}>Waiting for data...</div>
  }

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1 || 1)) * w
    const y = h - (v / (effectiveMax || 1)) * (h - 4) - 2
    return `${x},${y}`
  }).join(' ')

  const current = data[data.length - 1] ?? 0

  return (
    <div style={s.chartWrap}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: h, display: 'block' }}
      >
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Fill under the line */}
        <polyline
          points={`0,${h} ${pts} ${w},${h}`}
          fill={color}
          fillOpacity={0.08}
          stroke="none"
        />
      </svg>
      <div style={s.chartLabel}>
        <span style={{ color, fontWeight: 700 }}>{current}</span>
        <span style={{ color: '#999', marginLeft: 4 }}>{label} now</span>
      </div>
    </div>
  )
}

/* ── Styles ── */
const s: Record<string, React.CSSProperties> = {
  page:        { minHeight: '100vh', background: '#f5f5f7', fontFamily: 'system-ui, sans-serif' },
  header:      { background: '#1a1a2e', color: '#fff', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logo:        { fontWeight: 700, fontSize: 20, marginRight: 16 },
  orgBadge:    { fontSize: 13, color: '#aaa' },
  logoutBtn:   { background: 'transparent', border: '1px solid #444', color: '#ccc', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13 },
  body:        { maxWidth: 1100, margin: '0 auto', padding: '28px 20px' },
  statsRow:    { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 },
  statCard:    { background: '#fff', borderRadius: 10, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  twoCol:      { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  card:        { background: '#fff', borderRadius: 10, padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 10 },
  cardTitle:   { margin: 0, fontSize: 17, fontWeight: 700, color: '#1a1a2e' },
  cardSub:     { margin: 0, fontSize: 13, color: '#666', lineHeight: 1.6 },
  label:       { fontSize: 12, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input:       { padding: '9px 12px', borderRadius: 7, border: '1px solid #e0e0e0', fontSize: 14, outline: 'none' },
  btn:         { padding: '11px 0', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer' },
  quickBursts: { display: 'flex', gap: 8, alignItems: 'center' },
  quickBtn:    { padding: '5px 14px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#f9f9f9', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  error:       { color: '#dc2626', fontSize: 13, margin: 0 },
  successBox:  { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7, padding: '9px 12px', fontSize: 13, color: '#166534' },
  chartWrap:   { border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 12px', background: '#fafafa' },
  chartEmpty:  { height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 13, border: '1px solid #f0f0f0', borderRadius: 8 },
  chartLabel:  { fontSize: 13, marginTop: 6 },
  scalingRule: { fontSize: 13, color: '#555', marginTop: 4, padding: '8px 12px', background: '#f5f3ff', borderRadius: 7 },
}
