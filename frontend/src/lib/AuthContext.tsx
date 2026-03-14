import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { api } from '../lib/api'

interface Me {
  uid: string
  email: string
  org_id: string | null
  role: string
}

interface AuthContextType {
  firebaseUser: FirebaseUser | null
  me: Me | null
  loading: boolean
  refetchMe: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  me: null,
  loading: true,
  refetchMe: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMe = async () => {
    try {
      const data = await api.get<Me>('/auth/me')
      setMe(data)
    } catch {
      setMe(null)
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user)
      if (user) {
        await fetchMe()
      } else {
        setMe(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  return (
    <AuthContext.Provider value={{ firebaseUser, me, loading, refetchMe: fetchMe }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
