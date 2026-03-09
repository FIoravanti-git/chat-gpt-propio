import { useState } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import UserManagement from './UserManagement'
import AuditLog from './AuditLog'
import './Header.css'

export default function Header() {
  const { theme } = useTheme()
  const { user, logout, isAdmin } = useAuth()
  const [showUserManagement, setShowUserManagement] = useState(false)
  const [showAuditLog, setShowAuditLog] = useState(false)
  
  return (
    <>
      <div className={`header ${theme}`}>
        <div className="header-content">
          <img 
            src="/Logo_tabacman.png" 
            alt="NeuroChat" 
            className="header-logo"
          />
          <h1 className="header-title">NeuroChat</h1>
        </div>
        <div className="header-user">
          {isAdmin && (
            <>
              <button 
                onClick={() => setShowAuditLog(true)} 
                className="audit-btn" 
                title="Registro de Auditoría"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                Auditoría
              </button>
              <button 
                onClick={() => setShowUserManagement(true)} 
                className="users-btn" 
                title="Gestionar Usuarios"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                Usuarios
              </button>
            </>
          )}
          <span className="user-name">{user?.username}</span>
          <button onClick={logout} className="logout-btn" title="Cerrar sesión">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        </div>
      </div>
      {showUserManagement && (
        <UserManagement isOpen={showUserManagement} onClose={() => setShowUserManagement(false)} />
      )}
      {showAuditLog && (
        <AuditLog isOpen={showAuditLog} onClose={() => setShowAuditLog(false)} />
      )}
    </>
  )
}
