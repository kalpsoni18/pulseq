import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { firebaseUser, loading } = useAuth()
  if (loading) return <div style={loadingStyle}>Loading...</div>
  if (!firebaseUser) return <Navigate to="/login" replace />
  return <>{children}</>
}

function OrgRoute({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth()
  if (loading) return <div style={loadingStyle}>Loading...</div>
  if (!me?.org_id) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { firebaseUser, me, loading } = useAuth()
  if (loading) return <div style={loadingStyle}>Loading...</div>

  return (
    <Routes>
      <Route
        path="/login"
        element={
          firebaseUser
            ? <Navigate to={me?.org_id ? '/dashboard' : '/onboarding'} replace />
            : <Login />
        }
      />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            {me?.org_id
              ? <Navigate to="/dashboard" replace />
              : <Onboarding />}
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <OrgRoute>
              <Dashboard />
            </OrgRoute>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}

const loadingStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'system-ui, sans-serif',
  color: '#999',
  fontSize: 16,
}
