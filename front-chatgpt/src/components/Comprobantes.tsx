import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import './Comprobantes.css'

interface Comprobante {
  id: number
  fechaComprobante: string | null
  numeroComprobante: string | null
  importe: number | null
  descripcion: string | null
  fechaHoraRegistro: string
}

const AUTH_API = import.meta.env.DEV ? '/api/auth' : 'http://31.220.102.254:3002'

function parseDateInput(value: string): Date | null {
  if (!value || !value.trim()) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

export default function Comprobantes() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const [list, setList] = useState<Comprobante[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filtros
  const [fechaComprobanteDesde, setFechaComprobanteDesde] = useState('')
  const [fechaComprobanteHasta, setFechaComprobanteHasta] = useState('')
  const [numeroFilter, setNumeroFilter] = useState('')
  const [fechaRegistroDesde, setFechaRegistroDesde] = useState('')
  const [fechaRegistroHasta, setFechaRegistroHasta] = useState('')

  const PAGE_SIZE = 12
  const [page, setPage] = useState(1)

  useEffect(() => {
    const token = localStorage.getItem('authToken')
    const url = import.meta.env.DEV ? '/api/auth/comprobantes' : `${AUTH_API}/api/auth/comprobantes`
    setLoading(true)
    setError(null)
    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-auth-token': token || '',
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Error al cargar comprobantes')
        return res.json()
      })
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message || 'Error de conexión'))
      .finally(() => setLoading(false))
  }, [])

  const filteredList = useMemo(() => {
    return list.filter((row) => {
      const fechaComp = row.fechaComprobante ? new Date(row.fechaComprobante).getTime() : null
      const desdeComp = parseDateInput(fechaComprobanteDesde)?.getTime()
      const hastaComp = parseDateInput(fechaComprobanteHasta)?.getTime()
      if (desdeComp != null && (fechaComp == null || fechaComp < desdeComp)) return false
      if (hastaComp != null && (fechaComp == null || fechaComp > hastaComp)) return false

      const num = (row.numeroComprobante || '').toLowerCase()
      const busquedaNum = numeroFilter.trim().toLowerCase()
      if (busquedaNum && !num.includes(busquedaNum)) return false

      const fechaReg = new Date(row.fechaHoraRegistro).getTime()
      const desdeReg = parseDateInput(fechaRegistroDesde)?.getTime()
      const hastaReg = parseDateInput(fechaRegistroHasta)?.getTime()
      if (desdeReg != null && fechaReg < desdeReg) return false
      if (hastaReg != null && fechaReg > hastaReg) return false

      return true
    })
  }, [list, fechaComprobanteDesde, fechaComprobanteHasta, numeroFilter, fechaRegistroDesde, fechaRegistroHasta])

  const totalPages = Math.max(1, Math.ceil(filteredList.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginatedList = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return filteredList.slice(start, start + PAGE_SIZE)
  }, [filteredList, safePage])

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages))
  }, [totalPages])

  // Ir a página 1 cuando cambian los filtros
  useEffect(() => {
    setPage(1)
  }, [fechaComprobanteDesde, fechaComprobanteHasta, numeroFilter, fechaRegistroDesde, fechaRegistroHasta])

  const formatDate = (s: string | null) => {
    if (!s || !s.trim()) return '-'
    const trimmed = s.trim()
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})/
    const m = trimmed.match(dateOnlyMatch)
    if (m) {
      const [, year, month, day] = m
      return `${parseInt(day, 10)}/${parseInt(month, 10)}/${year}`
    }
    return new Date(trimmed).toLocaleDateString()
  }
  const formatDateTime = (s: string) => (s ? new Date(s).toLocaleString() : '-')
  const formatImporte = (n: number | null) => (n != null ? Number(n).toLocaleString() : '-')

  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const headers = ['Fecha Comprobante', 'Número', 'Importe', 'Descripción', 'Fecha Registro']
    const body = filteredList.map((row) => [
      formatDate(row.fechaComprobante),
      row.numeroComprobante || '-',
      formatImporte(row.importe),
      (row.descripcion || '-').slice(0, 50),
      formatDateTime(row.fechaHoraRegistro),
    ])
    doc.setFontSize(14)
    doc.text('Comprobantes', 14, 15)
    doc.setFontSize(10)
    doc.text(`Usuario: ${user?.username || '-'} | Filtrado: ${filteredList.length} registros`, 14, 22)
    autoTable(doc, {
      startY: 28,
      head: [headers],
      body,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [66, 66, 66] },
      margin: { left: 14, right: 14 },
    })
    const date = new Date().toISOString().slice(0, 10)
    doc.save(`comprobantes_${date}.pdf`)
  }

  const hasActiveFilters =
    fechaComprobanteDesde ||
    fechaComprobanteHasta ||
    numeroFilter.trim() ||
    fechaRegistroDesde ||
    fechaRegistroHasta

  const clearFilters = () => {
    setFechaComprobanteDesde('')
    setFechaComprobanteHasta('')
    setNumeroFilter('')
    setFechaRegistroDesde('')
    setFechaRegistroHasta('')
    setPage(1)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este comprobante?')) return
    const token = localStorage.getItem('authToken')
    const url = import.meta.env.DEV ? `/api/auth/comprobantes/${id}` : `${AUTH_API}/api/auth/comprobantes/${id}`
    try {
      const res = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-auth-token': token || '',
        },
      })
      if (!res.ok) throw new Error('Error al eliminar')
      setList((prev) => prev.filter((row) => row.id !== id))
    } catch {
      setError('No se pudo eliminar el comprobante')
    }
  }

  return (
    <div className={`comprobantes-page ${theme}`}>
      <div className="comprobantes-content">
        <header className="comprobantes-header">
          <div>
            <h1 className="comprobantes-title">Comprobantes</h1>
            <p className="comprobantes-subtitle">
              Registrados desde WhatsApp (OCR) · <strong>{user?.username}</strong>
            </p>
          </div>
        </header>

        <section className="comprobantes-filters">
          <div className="comprobantes-filters-row">
            <div className="comprobantes-filter-group">
              <label>Fecha comprobante</label>
              <div className="comprobantes-filter-dates">
                <input
                  type="date"
                  value={fechaComprobanteDesde}
                  onChange={(e) => setFechaComprobanteDesde(e.target.value)}
                  className="comprobantes-input"
                />
                <span className="comprobantes-filter-sep">–</span>
                <input
                  type="date"
                  value={fechaComprobanteHasta}
                  onChange={(e) => setFechaComprobanteHasta(e.target.value)}
                  className="comprobantes-input"
                />
              </div>
            </div>
            <div className="comprobantes-filter-group">
              <label>Número</label>
              <input
                type="text"
                value={numeroFilter}
                onChange={(e) => setNumeroFilter(e.target.value)}
                placeholder="Buscar por número..."
                className="comprobantes-input"
              />
            </div>
            <div className="comprobantes-filter-group">
              <label>Fecha registro</label>
              <div className="comprobantes-filter-dates">
                <input
                  type="date"
                  value={fechaRegistroDesde}
                  onChange={(e) => setFechaRegistroDesde(e.target.value)}
                  className="comprobantes-input"
                />
                <span className="comprobantes-filter-sep">–</span>
                <input
                  type="date"
                  value={fechaRegistroHasta}
                  onChange={(e) => setFechaRegistroHasta(e.target.value)}
                  className="comprobantes-input"
                />
              </div>
            </div>
            {hasActiveFilters && (
              <button type="button" className="comprobantes-btn comprobantes-btn-clear" onClick={clearFilters}>
                Limpiar filtros
              </button>
            )}
            <div className="comprobantes-filter-pdf">
              <button
                type="button"
                className="comprobantes-btn comprobantes-btn-pdf"
                onClick={handleExportPdf}
                disabled={loading || filteredList.length === 0}
                title="Descargar los comprobantes filtrados en PDF"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Exportar PDF
              </button>
            </div>
          </div>
          <div className="comprobantes-filters-meta">
            Mostrando <strong>{filteredList.length}</strong> de <strong>{list.length}</strong> comprobantes
          </div>
        </section>

        <div className="comprobantes-body">
        {loading && (
          <div className="comprobantes-loading">
            <svg className="spinner" width="40" height="40" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeDasharray="32" strokeDashoffset="32">
                <animate attributeName="stroke-dasharray" dur="2s" values="0 100;100 0" repeatCount="indefinite" />
                <animate attributeName="stroke-dashoffset" dur="2s" values="0;-100" repeatCount="indefinite" />
              </circle>
            </svg>
            <p>Cargando comprobantes...</p>
          </div>
        )}

        {error && (
          <div className="comprobantes-error">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="comprobantes-table-wrap">
            <table className="comprobantes-table">
              <thead>
                <tr>
                  <th>Fecha Comprobante</th>
                  <th>Número</th>
                  <th>Importe</th>
                  <th>Descripción</th>
                  <th>Fecha Registro</th>
                  <th className="comprobantes-th-actions" aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="comprobantes-empty">
                      <p>
                        {list.length === 0
                          ? 'No hay comprobantes registrados.'
                          : 'Ningún comprobante coincide con los filtros.'}
                      </p>
                      {list.length === 0 && (
                        <p className="comprobantes-empty-hint">
                          Envía una foto de un comprobante por WhatsApp para registrarlo.
                        </p>
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedList.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDate(row.fechaComprobante)}</td>
                      <td>{row.numeroComprobante || '-'}</td>
                      <td className="comprobantes-importe">{formatImporte(row.importe)}</td>
                      <td className="comprobantes-desc" title={row.descripcion || undefined}>
                        {row.descripcion || '-'}
                      </td>
                      <td>{formatDateTime(row.fechaHoraRegistro)}</td>
                      <td className="comprobantes-cell-actions">
                        <button
                          type="button"
                          className="comprobantes-btn-delete"
                          onClick={() => handleDelete(row.id)}
                          title="Eliminar comprobante"
                          aria-label="Eliminar comprobante"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18" />
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            <line x1="10" y1="11" x2="10" y2="17" />
                            <line x1="14" y1="11" x2="14" y2="17" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {filteredList.length > PAGE_SIZE && (
              <div className="comprobantes-pagination">
                <button
                  type="button"
                  className="comprobantes-btn comprobantes-btn-page"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Página anterior"
                >
                  Anterior
                </button>
                <span className="comprobantes-pagination-info">
                  Página {safePage} de {totalPages} · {filteredList.length} registros
                </span>
                <button
                  type="button"
                  className="comprobantes-btn comprobantes-btn-page"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Página siguiente"
                >
                  Siguiente
                </button>
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
