import { useState, useEffect, useRef } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { getWhatsAppQR, checkWhatsAppStatus, reloadBrain } from '../services/apiService'
import { uploadDocument, listDocuments } from '../services/documentService'
import './RightPanel.css'

interface RightPanelProps {
  /** En modo OCR solo se muestran tema y vincular WhatsApp */
  ocrMode?: boolean
}

export default function RightPanel({ ocrMode = false }: RightPanelProps) {
  const { theme, toggleTheme } = useTheme()
  const [showWhatsApp, setShowWhatsApp] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [whatsappStatus, setWhatsappStatus] = useState<string>('Desconectado')
  const [isLoadingQR, setIsLoadingQR] = useState(false)
  const [isReloading, setIsReloading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [showDocumentModal, setShowDocumentModal] = useState(false)
  const [documents, setDocuments] = useState<Array<{name: string, path: string}>>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastLinkedStatus = useRef<string>('') // Para evitar llamadas múltiples

  const checkStatus = async () => {
    try {
      const status = await checkWhatsAppStatus()
      const previousStatus = whatsappStatus
      console.log('📱 Estado de WhatsApp:', status, '(anterior:', previousStatus, ')') // Debug
      
      // Actualizar el estado siempre, incluso si es el mismo
      setWhatsappStatus(status)
      
      // Solo cerrar el modal si realmente está conectado Y listo
      // No cerrar si está "Conectando..." o "Desconectado"
      if (status === 'Conectado') {
        // ❌ ELIMINADO: Llamada automática a linkWhatsAppPhone()
        // El usuario DEBE escanear el QR y llamar explícitamente a /api/link-phone
        // NO se debe vincular automáticamente en login/reload
        // Solo actualizar el estado visual
        lastLinkedStatus.current = 'Conectado'
        
        if (showWhatsApp) {
          // Esperar un momento para confirmar la conexión antes de cerrar
          setTimeout(() => {
            setShowWhatsApp(false)
            setQrCode(null)
          }, 1000)
        }
      }
    } catch (error) {
      console.error('Error al verificar estado:', error)
      // Si hay un error de conexión, verificar si el servidor está disponible
      // No cambiar el estado inmediatamente a "Desconectado" si es un error temporal
      // Solo actualizar si realmente está desconectado después de varios intentos fallidos
    }
  }

  // Verificar estado de WhatsApp periódicamente, incluso cuando el modal está cerrado
  useEffect(() => {
    // Verificar estado inicial
    checkStatus()
    
    // Verificar estado cada 5 segundos
    const statusInterval = setInterval(() => {
      checkStatus()
    }, 5000)
    
    return () => {
      clearInterval(statusInterval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (showWhatsApp) {
      // Verificar estado inmediatamente al abrir el modal
      checkStatus()
      
      // Cargar QR inmediatamente
      fetchQRCode()
      
      // Verificar estado inicial después de un pequeño delay
      const initialCheck = setTimeout(() => {
        checkStatus()
      }, 500)
      
      // Refrescar QR cada 10 segundos
      const qrInterval = setInterval(() => {
        fetchQRCode()
      }, 10000)
      
      // Verificar estado cada 2 segundos cuando el modal está abierto
      const statusInterval = setInterval(() => {
        checkStatus()
      }, 2000)
      
      return () => {
        clearTimeout(initialCheck)
        clearInterval(qrInterval)
        clearInterval(statusInterval)
      }
    } else {
      // Si se cierra el modal, NO resetear el estado a "Desconectado"
      // Solo limpiar el QR, mantener el estado actual
      setQrCode(null)
      // No resetear whatsappStatus aquí para mantener el estado real
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWhatsApp])

  const fetchQRCode = async () => {
    setIsLoadingQR(true)
    try {
      const qr = await getWhatsAppQR()
      // Si es una URL o base64, usarla directamente
      setQrCode(qr)
    } catch (error: any) {
      // Manejar diferentes tipos de errores
      if (error.message === 'ALREADY_CONNECTED') {
        // WhatsApp ya está conectado, actualizar estado
        setWhatsappStatus('Conectado')
        setQrCode(null)
        // Cerrar modal después de un momento
        setTimeout(() => {
          setShowWhatsApp(false)
        }, 1000)
      } else if (error.message === 'QR_NOT_READY') {
        // QR no está listo aún, no es un error real - solo esperar
        // No loguear como error, mantener estado actual
        setQrCode(null)
      } else {
        // Error real - loguear y limpiar estado
        console.error('Error al obtener QR:', error)
        setQrCode(null)
      }
    } finally {
      setIsLoadingQR(false)
    }
  }

  const handleReloadBrain = async () => {
    setIsReloading(true)
    try {
      await reloadBrain()
      alert('Brain actualizado correctamente')
    } catch (error) {
      console.error('Error al actualizar brain:', error)
      alert('Error al actualizar el brain. Por favor, intenta de nuevo.')
    } finally {
      setIsReloading(false)
    }
  }

  const loadDocuments = async () => {
    try {
      const files = await listDocuments()
      if (files.length > 0) {
        setDocuments(files)
      } else {
        // Si no hay archivos, usar input file nativo
        fileInputRef.current?.click()
      }
    } catch (error) {
      console.error('Error al cargar documentos:', error)
      // Si falla, usar input file nativo
      fileInputRef.current?.click()
    }
  }

  const handleDocumentSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      await uploadDocument(file)
      // Actualizar brain después de subir
      await reloadBrain()
      alert('Documento cargado y brain actualizado correctamente')
      setShowDocumentModal(false)
    } catch (error: any) {
      console.error('Error al cargar documento:', error)
      const errorMessage = error?.message || error?.response?.data?.message || 'Error al cargar el documento'
      alert(`Error al cargar el documento: ${errorMessage}. Por favor, verifica que el archivo sea válido y que el servidor esté disponible.`)
    } finally {
      setIsUploading(false)
      // Resetear input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDocumentClick = () => {
    setShowDocumentModal(true)
    loadDocuments()
  }

  return (
    <div className={`right-panel ${theme}`}>
      <div className="panel-controls">
        <button className="control-btn" onClick={toggleTheme} title="Cambiar tema">
          {theme === 'dark' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          )}
        </button>
        <button
          className="control-btn"
          onClick={() => {
            setShowWhatsApp(!showWhatsApp)
            if (!showWhatsApp) {
              checkStatus()
            }
          }}
          title={`Conectar WhatsApp - Estado: ${whatsappStatus}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
          </svg>
        </button>
        {!ocrMode && (
          <>
        <button
          className="control-btn"
          onClick={handleDocumentClick}
          disabled={isUploading}
          title="Cargar Documento"
        >
          {isUploading ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spinning">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"></path>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
          )}
        </button>
        <button
          className="control-btn"
          onClick={handleReloadBrain}
          disabled={isReloading}
          title="Actualizar Brain"
        >
          {isReloading ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spinning">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"></path>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"></path>
            </svg>
          )}
        </button>
        </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleDocumentSelect}
        accept=".pdf,.txt,.doc,.docx,.md"
      />

      {showDocumentModal && (
        <div className="whatsapp-modal">
          <div className="modal-content">
            <h3>Cargar Documento</h3>
            <div className="document-options">
              <div className="document-option-section">
                <h4>Desde tu equipo</h4>
                <div className="document-upload-area">
                  <p>Selecciona un archivo desde tu computadora</p>
                  <button onClick={() => fileInputRef.current?.click()} className="select-file-btn" disabled={isUploading}>
                    {isUploading ? 'Subiendo...' : 'Seleccionar Archivo'}
                  </button>
                </div>
              </div>
              
              {documents.length > 0 && (
                <div className="document-option-section">
                  <h4>Lista de archivos</h4>
                  <div className="documents-list">
                    {documents.map((doc, index) => (
                      <div 
                        key={index} 
                        className="document-item"
                        onClick={async () => {
                          try {
                            setIsUploading(true)
                            // Leer el archivo del sistema y subirlo
                            const { uploadDocumentFromPath } = await import('../services/documentService')
                            await uploadDocumentFromPath(doc.path)
                            // Actualizar brain después de subir
                            await reloadBrain()
                            alert('Documento cargado y brain actualizado correctamente')
                            setShowDocumentModal(false)
                          } catch (error: any) {
                            console.error('Error al cargar documento:', error)
                            const errorMessage = error?.message || 'Error al cargar el documento'
                            alert(`Error al cargar el documento: ${errorMessage}. Por favor, intenta de nuevo.`)
                          } finally {
                            setIsUploading(false)
                          }
                        }}
                      >
                        {doc.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowDocumentModal(false)} className="close-btn" disabled={isUploading}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {showWhatsApp && (
        <div className="whatsapp-modal">
          <div className="modal-content">
            <h3>Conectar WhatsApp</h3>
            <div className="status-indicator">
              <div className="status-wrapper">
                <span className="status-label">Estado:</span>
                <span className={`status ${whatsappStatus.toLowerCase().replace(/\s+/g, '-').replace(/\./g, '')}`}>{whatsappStatus}</span>
              </div>
              <button 
                onClick={() => checkStatus()} 
                className="status-refresh-btn"
                title="Actualizar estado"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"></path>
                </svg>
              </button>
            </div>
            {isLoadingQR ? (
              <div className="qr-loading">Generando código QR...</div>
            ) : qrCode ? (
              <div className="qr-container">
                <img src={qrCode} alt="QR Code" style={{ maxWidth: '256px', height: 'auto' }} />
                <p style={{ marginTop: '12px', fontSize: '12px', opacity: 0.7, textAlign: 'center' }}>
                  El QR se actualiza automáticamente cada 10 segundos
                </p>
              </div>
            ) : (
              <div className="qr-waiting">
                <div className="qr-waiting-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                </div>
                <p>Esperando código QR...</p>
                <p style={{ fontSize: '12px', marginTop: '8px', opacity: 0.8 }}>
                  El código QR se generará automáticamente en unos segundos.
                  {!isLoadingQR && (
                    <span> Si tarda mucho, verifica que el servidor de WhatsApp esté funcionando.</span>
                  )}
                </p>
                {!isLoadingQR && (
                  <button onClick={fetchQRCode} className="refresh-btn" style={{ marginTop: '12px' }}>
                    Reintentar
                  </button>
                )}
              </div>
            )}
            <div className="qr-instructions">
              <p><strong>Instrucciones:</strong></p>
              <ol>
                <li>Abre WhatsApp en tu teléfono</li>
                <li>Ve a <strong>Configuración</strong> → <strong>Dispositivos vinculados</strong></li>
                <li>Toca <strong>Vincular un dispositivo</strong></li>
                <li>Escanea el código QR que aparece arriba</li>
              </ol>
            </div>
            <div className="modal-actions">
              <button onClick={fetchQRCode} className="refresh-btn">
                Actualizar QR
              </button>
              <button 
                onClick={async () => {
                  try {
                    const WHATSAPP_API = import.meta.env.DEV ? '/api/whatsapp' : 'http://31.220.102.254:3001'
                    const token = localStorage.getItem('authToken')
                    const response = await fetch(`${WHATSAPP_API}/api/force-qr`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${token}`,
                        'x-auth-token': token || ''
                      }
                    })
                    if (response.ok) {
                      alert('Sesión limpiada. Se generará nuevo QR en unos segundos...')
                      setTimeout(() => fetchQRCode(), 2000)
                    } else {
                      alert('Error al forzar nuevo QR')
                    }
                  } catch (error) {
                    console.error('Error:', error)
                    alert('Error al forzar nuevo QR')
                  }
                }} 
                className="force-qr-btn"
                title="Limpiar sesión y generar nuevo QR"
              >
                Forzar Nuevo QR
              </button>
              <button onClick={() => setShowWhatsApp(false)} className="close-btn">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
