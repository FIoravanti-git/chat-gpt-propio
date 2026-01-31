import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import './AuditLog.css'

interface AuditRecord {
  id: number
  user_id: number
  conversation_id: number | null
  channel: 'web' | 'whatsapp'
  direction: 'incoming' | 'outgoing'
  role: 'user' | 'assistant'
  content: string
  whatsapp_id: string | null
  whatsapp_number: string | null
  message_id: number | null
  created_at: string
  ip_address: string | null
  user_agent: string | null
  metadata: string | null
}

interface AuditLogProps {
  isOpen: boolean
  onClose: () => void
}

export default function AuditLog({ isOpen, onClose }: AuditLogProps) {
  const { isAdmin } = useAuth()
  const { theme } = useTheme()
  const [records, setRecords] = useState<AuditRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState({
    user_id: '',
    channel: '',
    direction: '',
    whatsapp_number: '',
    date_from: '',
    date_to: ''
  })
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(15)

  const AUTH_API = import.meta.env.DEV ? '/api/auth' : 'http://31.220.102.254:3002'

  useEffect(() => {
    if (isOpen && isAdmin) {
      loadAuditRecords()
    }
  }, [isOpen, isAdmin, currentPage, filters])

  const loadAuditRecords = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('authToken')
      const url = import.meta.env.DEV 
        ? '/api/auth/audit' 
        : `${AUTH_API}/api/auth/audit`
      
      // Construir query params
      const params = new URLSearchParams()
      if (filters.user_id) params.append('user_id', filters.user_id)
      if (filters.channel) params.append('channel', filters.channel)
      if (filters.direction) params.append('direction', filters.direction)
      if (filters.whatsapp_number) params.append('whatsapp_number', filters.whatsapp_number)
      // Convertir datetime-local a formato para backend (YYYY-MM-DD HH:mm:ss)
      if (filters.date_from) {
        const dateFrom = new Date(filters.date_from).toISOString().slice(0, 19).replace('T', ' ')
        params.append('date_from', dateFrom)
      }
      if (filters.date_to) {
        // Para date_to, usar el final del día
        const dateTo = new Date(filters.date_to)
        dateTo.setHours(23, 59, 59, 999)
        const dateToFormatted = dateTo.toISOString().slice(0, 19).replace('T', ' ')
        params.append('date_to', dateToFormatted)
      }
      params.append('limit', pageSize.toString())
      params.append('offset', ((currentPage - 1) * pageSize).toString())

      const response = await fetch(`${url}?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-auth-token': token || ''
        }
      })

      if (response.ok) {
        const data = await response.json()
        setRecords(data.records || [])
        setTotal(data.total || 0)
      } else {
        console.error('Error al cargar auditoría')
      }
    } catch (error) {
      console.error('Error al cargar auditoría:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (field: string, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }))
    setCurrentPage(1) // Reset a primera página al cambiar filtros
  }

  const clearFilters = () => {
    setFilters({
      user_id: '',
      channel: '',
      direction: '',
      whatsapp_number: '',
      date_from: '',
      date_to: ''
    })
    setCurrentPage(1)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const truncateContent = (content: string, maxLength: number = 100) => {
    if (content.length <= maxLength) return content
    return content.substring(0, maxLength) + '...'
  }

  const totalPages = Math.ceil(total / pageSize)

  if (!isOpen || !isAdmin) {
    return null
  }

  return (
    <div className="audit-log-overlay" onClick={onClose}>
      <div className={`audit-log-modal ${theme}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            <h2>Registro de Auditoría</h2>
          </div>
          <button className="close-modal-btn" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {/* Filtros */}
          <div className="audit-filters">
            <h3>Filtros</h3>
            <div className="filters-grid">
              <div className="filter-group">
                <label>ID Usuario</label>
                <input
                  type="number"
                  value={filters.user_id}
                  onChange={(e) => handleFilterChange('user_id', e.target.value)}
                  placeholder="Ej: 1"
                />
              </div>

              <div className="filter-group">
                <label>Canal</label>
                <select
                  value={filters.channel}
                  onChange={(e) => handleFilterChange('channel', e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="web">Web</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>

              <div className="filter-group">
                <label>Dirección</label>
                <select
                  value={filters.direction}
                  onChange={(e) => handleFilterChange('direction', e.target.value)}
                >
                  <option value="">Todas</option>
                  <option value="incoming">Entrada</option>
                  <option value="outgoing">Salida</option>
                </select>
              </div>

              <div className="filter-group">
                <label>Número WhatsApp</label>
                <input
                  type="text"
                  value={filters.whatsapp_number}
                  onChange={(e) => handleFilterChange('whatsapp_number', e.target.value)}
                  placeholder="Ej: 521234567890"
                />
              </div>

              <div className="filter-group">
                <label>Fecha Desde</label>
                <input
                  type="datetime-local"
                  value={filters.date_from}
                  onChange={(e) => handleFilterChange('date_from', e.target.value)}
                />
              </div>

              <div className="filter-group">
                <label>Fecha Hasta</label>
                <input
                  type="datetime-local"
                  value={filters.date_to}
                  onChange={(e) => handleFilterChange('date_to', e.target.value)}
                />
              </div>
            </div>

            <div className="filters-actions">
              <button onClick={clearFilters} className="clear-filters-btn">
                Limpiar Filtros
              </button>
              <button onClick={loadAuditRecords} className="refresh-btn">
                Actualizar
              </button>
            </div>
          </div>

          {/* Información de resultados */}
          <div className="audit-info">
            <span>Total de registros: <strong>{total}</strong></span>
            <span>Página {currentPage} de {totalPages}</span>
          </div>

          {/* Tabla de registros */}
          {loading ? (
            <div className="loading-state">Cargando registros...</div>
          ) : records.length === 0 ? (
            <div className="empty-state">No se encontraron registros con los filtros aplicados</div>
          ) : (
            <>
              <div className="audit-table-container">
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Fecha/Hora</th>
                      <th>Usuario</th>
                      <th>Canal</th>
                      <th>Dirección</th>
                      <th>Rol</th>
                      <th>ID WhatsApp</th>
                      <th>Número WhatsApp</th>
                      <th>Contenido</th>
                      <th>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr key={record.id}>
                        <td>{record.id}</td>
                        <td>{formatDate(record.created_at)}</td>
                        <td>{record.user_id}</td>
                        <td>
                          <span className={`channel-badge channel-${record.channel}`}>
                            {record.channel}
                          </span>
                        </td>
                        <td>
                          <span className={`direction-badge direction-${record.direction}`}>
                            {record.direction === 'incoming' ? 'Entrada' : 'Salida'}
                          </span>
                        </td>
                        <td>
                          <span className={`role-badge role-${record.role}`}>
                            {record.role === 'user' ? 'Usuario' : 'Asistente'}
                          </span>
                        </td>
                        <td>{record.whatsapp_id || '-'}</td>
                        <td>{record.whatsapp_number || '-'}</td>
                        <td className="content-cell" title={record.content}>
                          {truncateContent(record.content, 80)}
                        </td>
                        <td>{record.ip_address || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              {totalPages > 1 && (
                <div className="pagination">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="page-btn page-btn-nav"
                    title="Primera página"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="11 17 6 12 11 7"></polyline>
                      <polyline points="18 17 13 12 18 7"></polyline>
                    </svg>
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="page-btn page-btn-nav"
                    title="Página anterior"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                    Anterior
                  </button>
                  
                  <div className="page-numbers">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (currentPage <= 3) {
                        pageNum = i + 1
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = currentPage - 2 + i
                      }
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`page-btn page-number ${currentPage === pageNum ? 'active' : ''}`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                  </div>
                  
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="page-btn page-btn-nav"
                    title="Página siguiente"
                  >
                    Siguiente
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="page-btn page-btn-nav"
                    title="Última página"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="13 17 18 12 13 7"></polyline>
                      <polyline points="6 17 11 12 6 7"></polyline>
                    </svg>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
