import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import './UserManagement.css'

interface User {
  id: number
  username: string
  role: 'admin' | 'user'
  token?: string
  openai_api_key?: string | null
  whatsapp_id?: string | null
  whatsapp_number?: string | null
  created_at: string
  last_login: string | null
  tipo_usuario?: 'Quivr/OpenAi' | 'OCR/OpenAi'
}

interface UserManagementProps {
  isOpen: boolean
  onClose: () => void
}

export default function UserManagement({ isOpen, onClose }: UserManagementProps) {
  const { isAdmin } = useAuth()
  const { theme } = useTheme()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'user' as 'admin' | 'user',
    openai_api_key: '',
    tipo_usuario: 'Quivr/OpenAi' as 'Quivr/OpenAi' | 'OCR/OpenAi'
  })
  const [showApiKeys, setShowApiKeys] = useState<{ [key: number]: boolean }>({})
  const [whatsappStatus, setWhatsappStatus] = useState<{ connected: boolean; whatsapp_number: string | null; whatsapp_id: string | null }>({ connected: false, whatsapp_number: null, whatsapp_id: null })
  const [usersConnectionStatus, setUsersConnectionStatus] = useState<{ [userId: number]: { connected: boolean; whatsapp_id: string | null } }>({})

  const AUTH_API = import.meta.env.DEV ? '/api/auth' : 'http://31.220.102.254:3002'

  const checkWhatsAppConnectionStatus = async () => {
    try {
      const WHATSAPP_API = import.meta.env.DEV ? '/api/whatsapp' : 'http://31.220.102.254:3001'
      const response = await fetch(`${WHATSAPP_API}/api/status`, {
        method: 'GET'
      })
      
      if (response.ok) {
        const data = await response.json()
        setWhatsappStatus({
          connected: data.ready === true && data.connected === true,
          whatsapp_number: data.whatsapp_number || null,
          whatsapp_id: data.whatsapp_id || null
        })
      } else {
        setWhatsappStatus({ connected: false, whatsapp_number: null, whatsapp_id: null })
      }
    } catch (error) {
      console.error('Error al verificar estado de WhatsApp:', error)
      setWhatsappStatus({ connected: false, whatsapp_number: null, whatsapp_id: null })
    }
  }

  const checkAllUsersConnectionStatus = async () => {
    try {
      const token = localStorage.getItem('authToken')
      const WHATSAPP_API = import.meta.env.DEV ? '/api/whatsapp' : 'http://31.220.102.254:3001'
      const response = await fetch(`${WHATSAPP_API}/api/status/all`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Auth-Token': token || ''
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        // ✅ Mapear el estado de conexión de todos los usuarios por user_id
        const statusMap: { [userId: number]: { connected: boolean; whatsapp_id: string | null } } = {}
        if (data.users && Array.isArray(data.users)) {
          data.users.forEach((user: { user_id: number; whatsapp_id: string | null; connected: boolean }) => {
            statusMap[user.user_id] = {
              connected: user.connected || false,
              whatsapp_id: user.whatsapp_id || null
            }
          })
        }
        setUsersConnectionStatus(statusMap)
      } else {
        console.error('Error al obtener estado de todos los usuarios:', response.status)
      }
    } catch (error) {
      console.error('Error al verificar estado de todos los usuarios:', error)
    }
  }

  useEffect(() => {
    if (isOpen && isAdmin) {
      loadUsers()
      checkWhatsAppConnectionStatus()
      checkAllUsersConnectionStatus() // ✅ Obtener estado de conexión de todos los usuarios
      // Actualizar estado cada 5 segundos
      const interval = setInterval(() => {
        checkWhatsAppConnectionStatus()
        checkAllUsersConnectionStatus() // ✅ Actualizar estado de todos los usuarios
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [isOpen, isAdmin])

  const loadUsers = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('authToken')
      const url = import.meta.env.DEV 
        ? '/api/auth/users' 
        : `${AUTH_API}/api/auth/users`
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-auth-token': token || ''
        }
      })

      if (response.ok) {
        const data = await response.json()
        console.log('✅ Usuarios cargados:', data.length, 'usuarios')
        setUsers(data)
      } else {
        console.error('❌ Error en respuesta:', response.status, response.statusText)
        const errorData = await response.json().catch(() => ({}))
        console.error('❌ Detalles del error:', errorData)
      }
    } catch (error) {
      console.error('❌ Error al cargar usuarios:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const token = localStorage.getItem('authToken')
      const url = import.meta.env.DEV 
        ? '/api/auth/users' 
        : `${AUTH_API}/api/auth/users`
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-auth-token': token || ''
        },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
          role: formData.role,
          openai_api_key: formData.openai_api_key || null,
          tipo_usuario: formData.tipo_usuario || 'Quivr/OpenAi'
        })
      })

      const data = await response.json()

      if (response.ok) {
        alert('Usuario creado exitosamente')
        setShowAddModal(false)
        setFormData({ username: '', password: '', role: 'user', openai_api_key: '', tipo_usuario: 'Quivr/OpenAi' })
        loadUsers()
      } else {
        alert(data.error || 'Error al crear usuario')
      }
    } catch (error) {
      alert('Error al crear usuario')
    }
  }

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return

    try {
      const token = localStorage.getItem('authToken')
      const url = import.meta.env.DEV 
        ? `/api/auth/users/${editingUser.id}` 
        : `${AUTH_API}/api/auth/users/${editingUser.id}`
      
  const updateData: Record<string, unknown> = {
    username: formData.username,
    role: formData.role,
    openai_api_key: formData.openai_api_key.trim() === '' ? null : formData.openai_api_key.trim(),
    tipo_usuario: formData.tipo_usuario === 'OCR/OpenAi' ? 'OCR/OpenAi' : 'Quivr/OpenAi',
    tipoUsuario: formData.tipo_usuario === 'OCR/OpenAi' ? 'OCR/OpenAi' : 'Quivr/OpenAi'
  }
  if (formData.password && formData.password.trim() !== '') {
    updateData.password = formData.password
  }

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-auth-token': token || ''
        },
        body: JSON.stringify(updateData)
      })

      const data = await response.json()

      if (response.ok) {
        alert('Usuario actualizado exitosamente')
        setShowEditModal(false)
        setEditingUser(null)
        setFormData({ username: '', password: '', role: 'user', openai_api_key: '', tipo_usuario: 'Quivr/OpenAi' })
        loadUsers()
      } else {
        alert(data.error || 'Error al actualizar usuario')
      }
    } catch (error) {
      alert('Error al actualizar usuario')
    }
  }

  const handleDeleteUser = async (id: number) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este usuario?')) {
      return
    }

    try {
      const token = localStorage.getItem('authToken')
      const url = import.meta.env.DEV 
        ? `/api/auth/users/${id}` 
        : `${AUTH_API}/api/auth/users/${id}`
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-auth-token': token || ''
        }
      })

      const data = await response.json()

      if (response.ok) {
        alert('Usuario eliminado exitosamente')
        loadUsers()
      } else {
        alert(data.error || 'Error al eliminar usuario')
      }
    } catch (error) {
      alert('Error al eliminar usuario')
    }
  }

  const handleRegenerateToken = async (id: number) => {
    if (!confirm('¿Estás seguro de que quieres regenerar el token de este usuario? El usuario tendrá que iniciar sesión nuevamente.')) {
      return
    }

    try {
      const token = localStorage.getItem('authToken')
      const url = import.meta.env.DEV 
        ? `/api/auth/users/${id}/regenerate-token` 
        : `${AUTH_API}/api/auth/users/${id}/regenerate-token`
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-auth-token': token || '',
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorData = await response.json()
        alert(errorData.error || 'Error al regenerar token')
        return
      }

      const data = await response.json()
      if (data.message) {
        alert(data.message || 'Token regenerado exitosamente')
        loadUsers()
      } else {
        alert('Token regenerado exitosamente')
        loadUsers()
      }
    } catch (error: any) {
      console.error('Error al regenerar token:', error)
      alert('Error al regenerar token: ' + (error.message || 'Error desconocido'))
    }
  }

  const openEditModal = (user: User) => {
    setEditingUser(user)
    setFormData({
      username: user.username,
      password: '',
      role: user.role,
      openai_api_key: user.openai_api_key || '',
      tipo_usuario: user.tipo_usuario || 'Quivr/OpenAi'
    })
    setShowEditModal(true)
  }

  const toggleApiKeyVisibility = (userId: number) => {
    setShowApiKeys(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }))
  }
  
  const maskApiKey = (apiKey: string | undefined | null) => {
    if (!apiKey || apiKey === null || apiKey === '') return 'No configurado'
    if (apiKey.length <= 12) return '****'
    return `${apiKey.substring(0, 8)}${'*'.repeat(Math.max(0, apiKey.length - 12))}${apiKey.substring(apiKey.length - 4)}`
  }

  const copyToClipboard = (text: string) => {
    if (!text || text === '') {
      alert('No hay nada para copiar')
      return
    }
    navigator.clipboard.writeText(text).then(() => {
      alert('Copiado al portapapeles')
    }).catch(() => {
      alert('Error al copiar')
    })
  }

  const truncateToken = (token: string | undefined | null) => {
    if (!token || token === null || token === '') return 'No disponible'
    return token.length > 20 ? `${token.substring(0, 20)}...` : token
  }

  if (!isOpen || !isAdmin) {
    return null
  }

  return (
    <div className="user-management-overlay" onClick={onClose}>
      <div className={`user-management-modal ${theme}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <h2>Gestión de Usuarios</h2>
          </div>
          <button className="close-modal-btn" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-actions-bar">
            <button onClick={() => setShowAddModal(true)} className="add-user-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Agregar Usuario
            </button>
          </div>

          {loading ? (
            <div className="loading-state">
              <svg className="spinner" width="40" height="40" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeDasharray="32" strokeDashoffset="32">
                  <animate attributeName="stroke-dasharray" dur="2s" values="0 100;100 0" repeatCount="indefinite"/>
                  <animate attributeName="stroke-dashoffset" dur="2s" values="0;-100" repeatCount="indefinite"/>
                </circle>
              </svg>
              <p>Cargando usuarios...</p>
            </div>
          ) : (
            <div className="users-table-container">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Usuario</th>
                    <th>Rol</th>
                    <th>Tipo</th>
                    <th>ID Whatsapp</th>
                    <th>Número WhatsApp</th>
                    <th>Token</th>
                    <th>API Key OpenAI</th>
                    <th>Creado</th>
                    <th>Último Login</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                          <circle cx="9" cy="7" r="4"></circle>
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        <p>No hay usuarios</p>
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user.id}>
                        <td>{user.id}</td>
                        <td className="username-cell">{user.username}</td>
                        <td>
                          <span className={`role-badge ${user.role}`}>
                            {user.role === 'admin' ? (
                              <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                                  <path d="M2 17l10 5 10-5"></path>
                                  <path d="M2 12l10 5 10-5"></path>
                                </svg>
                                Administrador
                              </>
                            ) : (
                              <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                  <circle cx="12" cy="7" r="4"></circle>
                                </svg>
                                Usuario
                              </>
                            )}
                          </span>
                        </td>
                        <td className="tipo-usuario-cell">
                          <span className={`tipo-badge ${user.tipo_usuario === 'OCR/OpenAi' ? 'ocr' : 'quivr'}`}>
                            {user.tipo_usuario || 'Quivr/OpenAi'}
                          </span>
                        </td>
                        <td className="whatsapp-id-cell">
                          {user.whatsapp_id ? (
                            <div className="whatsapp-id-display" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <code className="whatsapp-id-text">
                                {user.whatsapp_id}
                              </code>
                              {usersConnectionStatus[user.id]?.connected && usersConnectionStatus[user.id]?.whatsapp_id === user.whatsapp_id ? (
                                <svg 
                                  width="20" 
                                  height="20" 
                                  viewBox="0 0 24 24" 
                                  fill="#25D366"
                                  style={{ cursor: 'pointer' }}
                                >
                                  <title>Conectado</title>
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                                </svg>
                              ) : (
                                <svg 
                                  width="20" 
                                  height="20" 
                                  viewBox="0 0 24 24" 
                                  fill="#ef4444"
                                  style={{ cursor: 'pointer' }}
                                >
                                  <title>Desconectado</title>
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                                </svg>
                              )}
                              <button 
                                className="copy-whatsapp-btn"
                                onClick={() => copyToClipboard(user.whatsapp_id || '')}
                                title="Copiar ID de WhatsApp"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <span className="no-whatsapp">-</span>
                          )}
                        </td>
                        <td className="whatsapp-phone-cell">
                          {user.whatsapp_number ? (
                            <div className="whatsapp-phone-display" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <code className="whatsapp-phone-text">
                                {user.whatsapp_number}
                              </code>
                              {whatsappStatus.connected && whatsappStatus.whatsapp_number === user.whatsapp_number ? (
                                <svg 
                                  width="20" 
                                  height="20" 
                                  viewBox="0 0 24 24" 
                                  fill="#25D366"
                                  style={{ cursor: 'pointer' }}
                                >
                                  <title>Conectado</title>
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                                </svg>
                              ) : (
                                <svg 
                                  width="20" 
                                  height="20" 
                                  viewBox="0 0 24 24" 
                                  fill="#ef4444"
                                  style={{ cursor: 'pointer' }}
                                >
                                  <title>Desconectado</title>
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                                </svg>
                              )}
                              <button 
                                className="copy-whatsapp-btn"
                                onClick={() => copyToClipboard(user.whatsapp_number || '')}
                                title="Copiar número de WhatsApp"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <span className="no-whatsapp">-</span>
                          )}
                        </td>
                        <td className="token-cell">
                          <div className="token-display">
                            <code>{truncateToken(user.token || '')}</code>
                            <button 
                              className="copy-token-btn"
                              onClick={() => copyToClipboard(user.token || '')}
                              title="Copiar token"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                              </svg>
                            </button>
                            <button 
                              className="regenerate-token-btn"
                              onClick={() => handleRegenerateToken(user.id)}
                              title="Regenerar token"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"></path>
                              </svg>
                            </button>
                          </div>
                        </td>
                        <td className="api-key-cell">
                          <div className="api-key-display">
                            {showApiKeys[user.id] ? (
                              <code className="api-key-visible">{user.openai_api_key || 'No configurado'}</code>
                            ) : (
                              <code className="api-key-masked">{maskApiKey(user.openai_api_key)}</code>
                            )}
                            <button 
                              className="toggle-api-key-btn"
                              onClick={() => toggleApiKeyVisibility(user.id)}
                              title={showApiKeys[user.id] ? "Ocultar API Key" : "Mostrar API Key"}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                {showApiKeys[user.id] ? (
                                  <>
                                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                                    <line x1="1" y1="1" x2="23" y2="23"></line>
                                  </>
                                ) : (
                                  <>
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                  </>
                                )}
                              </svg>
                            </button>
                            <button 
                              className="copy-api-key-btn"
                              onClick={() => copyToClipboard(user.openai_api_key || '')}
                              title="Copiar API Key"
                              disabled={!user.openai_api_key}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                              </svg>
                            </button>
                          </div>
                        </td>
                        <td>{new Date(user.created_at).toLocaleDateString()}</td>
                        <td>{user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Nunca'}</td>
                        <td className="actions-cell">
                          <button onClick={() => openEditModal(user)} className="action-btn edit-btn" title="Editar">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                          </button>
                          <button onClick={() => handleDeleteUser(user.id)} className="action-btn delete-btn" title="Eliminar">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal para agregar usuario */}
        {showAddModal && (
          <div className="form-modal-overlay" onClick={() => setShowAddModal(false)}>
            <div className="form-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="form-modal-header">
                <h3>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  Agregar Usuario
                </h3>
                <button onClick={() => setShowAddModal(false)} className="close-form-btn">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <form onSubmit={handleAddUser} className="user-form">
                <div className="form-group">
                  <label>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    Usuario
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                    placeholder="Nombre de usuario"
                  />
                </div>
                <div className="form-group">
                  <label>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    Contraseña
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    minLength={6}
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
                <div className="form-group">
                  <label>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                      <path d="M2 17l10 5 10-5"></path>
                      <path d="M2 12l10 5 10-5"></path>
                    </svg>
                    Rol
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'user' })}
                  >
                    <option value="user">Usuario</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Tipo de usuario</label>
                  <select
                    value={formData.tipo_usuario}
                    onChange={(e) => setFormData({ ...formData, tipo_usuario: e.target.value as 'Quivr/OpenAi' | 'OCR/OpenAi' })}
                  >
                    <option value="Quivr/OpenAi">Quivr/OpenAi (Chat)</option>
                    <option value="OCR/OpenAi">OCR/OpenAi (Comprobantes)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    API Key OpenAI (opcional)
                  </label>
                  <input
                    type="password"
                    value={formData.openai_api_key}
                    onChange={(e) => setFormData({ ...formData, openai_api_key: e.target.value })}
                    placeholder="sk-..."
                  />
                </div>
                <div className="form-modal-actions">
                  <button type="submit" className="save-btn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                      <polyline points="17 21 17 13 7 13 7 21"></polyline>
                      <polyline points="7 3 7 8 15 8"></polyline>
                    </svg>
                    Guardar
                  </button>
                  <button type="button" onClick={() => setShowAddModal(false)} className="cancel-btn">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal para editar usuario */}
        {showEditModal && (
          <div className="form-modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="form-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="form-modal-header">
                <h3>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                  Editar Usuario
                </h3>
                <button onClick={() => setShowEditModal(false)} className="close-form-btn">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <form onSubmit={handleEditUser} className="user-form">
                <div className="form-group">
                  <label>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    Usuario
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                    placeholder="Nombre de usuario"
                  />
                </div>
                <div className="form-group">
                  <label>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    Nueva Contraseña (opcional)
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    minLength={6}
                    placeholder="Dejar vacío para no cambiar"
                  />
                </div>
                <div className="form-group">
                  <label>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                      <path d="M2 17l10 5 10-5"></path>
                      <path d="M2 12l10 5 10-5"></path>
                    </svg>
                    Rol
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'user' })}
                  >
                    <option value="user">Usuario</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Tipo de usuario</label>
                  <select
                    value={formData.tipo_usuario}
                    onChange={(e) => setFormData({ ...formData, tipo_usuario: e.target.value as 'Quivr/OpenAi' | 'OCR/OpenAi' })}
                  >
                    <option value="Quivr/OpenAi">Quivr/OpenAi (Chat)</option>
                    <option value="OCR/OpenAi">OCR/OpenAi (Comprobantes)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    API Key OpenAI (opcional)
                  </label>
                  <input
                    type="password"
                    value={formData.openai_api_key}
                    onChange={(e) => setFormData({ ...formData, openai_api_key: e.target.value })}
                    placeholder="sk-... (dejar vacío para no cambiar)"
                  />
                </div>
                <div className="form-modal-actions">
                  <button type="submit" className="save-btn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                      <polyline points="17 21 17 13 7 13 7 21"></polyline>
                      <polyline points="7 3 7 8 15 8"></polyline>
                    </svg>
                    Guardar
                  </button>
                  <button type="button" onClick={() => setShowEditModal(false)} className="cancel-btn">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
