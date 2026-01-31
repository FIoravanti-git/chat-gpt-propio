import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface User {
  username: string
  token: string
  role: 'admin' | 'user'
}

interface AuthContextType {
  user: User | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
  isLoading: boolean
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const AUTH_API = import.meta.env.DEV ? '/api/auth' : 'http://31.220.102.254:3002'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Verificar si hay un token guardado
    const token = localStorage.getItem('authToken')
    const username = localStorage.getItem('username')
    const role = localStorage.getItem('userRole') as 'admin' | 'user' | null
    
    if (token && username) {
      // Verificar si el token es válido
      verifyToken(token)
        .then((userData) => {
          const userRole = userData.role || role || 'user'
          setUser({ username, token, role: userRole as 'admin' | 'user' })
          localStorage.setItem('userRole', userRole)
        })
        .catch(() => {
          localStorage.removeItem('authToken')
          localStorage.removeItem('username')
          localStorage.removeItem('userRole')
        })
        .finally(() => {
          setIsLoading(false)
        })
    } else {
      setIsLoading(false)
    }
  }, [])

  const verifyToken = async (token: string): Promise<{ role: string }> => {
    const url = import.meta.env.DEV 
      ? '/api/auth/verify' 
      : `${AUTH_API}/api/auth/verify`
    
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-auth-token': token
        }
      })
      
      if (!response.ok) {
        throw new Error('Token inválido')
      }
      
      // Verificar que la respuesta sea JSON válido
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json()
        return { role: data.role || 'user' }
      }
      throw new Error('Respuesta inválida')
    } catch (error: any) {
      // Si hay cualquier error, considerar el token inválido
      throw new Error('Token inválido')
    }
  }

  const login = async (username: string, password: string): Promise<void> => {
    const url = import.meta.env.DEV 
      ? '/api/auth/login' 
      : `${AUTH_API}/api/auth/login`
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      })

      // Verificar Content-Type antes de parsear
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text()
        throw new Error(`Error en la respuesta: ${text || response.statusText}`)
      }

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al iniciar sesión')
      }

      if (!data.token || !data.username) {
        throw new Error('Respuesta inválida del servidor')
      }

      const userData = { 
        username: data.username, 
        token: data.token,
        role: data.role || 'user'
      }
      setUser(userData)
      localStorage.setItem('authToken', data.token)
      localStorage.setItem('username', data.username)
      localStorage.setItem('userRole', userData.role)
    } catch (error: any) {
      // Si es un error de red o parseo, lanzarlo con mensaje claro
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Error de conexión. Verifica que el servidor de autenticación esté funcionando.')
      }
      throw error
    }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('authToken')
    localStorage.removeItem('username')
    localStorage.removeItem('userRole')
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAuthenticated: !!user,
        isLoading,
        isAdmin: user?.role === 'admin'
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
