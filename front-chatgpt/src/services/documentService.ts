import axios from 'axios'

// Usar proxy en desarrollo, URL directa en producción
const QUIVR_API = import.meta.env.DEV ? '/api/quivr' : 'http://31.220.102.254:8000'

export interface DocumentFile {
  name: string
  path: string
}

export async function uploadDocumentFromPath(filePath: string): Promise<void> {
  try {
    // Leer el archivo del sistema de archivos y subirlo
    const response = await fetch('/api/upload-document', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ filePath })
    })
    
    if (!response.ok) {
      throw new Error('Error al subir el documento')
    }
  } catch (error: any) {
    console.error('Error al subir documento:', error)
    throw new Error('Error al subir el documento')
  }
}

export async function uploadDocument(file: File): Promise<void> {
  try {
    // Obtener token de autenticación
    const token = localStorage.getItem('authToken')
    
    if (!token) {
      throw new Error('No hay token de autenticación. Por favor, inicia sesión.')
    }
    
    const formData = new FormData()
    formData.append('file', file)
    
    // Configurar headers - NO incluir Content-Type para FormData, axios lo maneja automáticamente
    const headers: Record<string, string> = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
      headers['X-Auth-Token'] = token
    }
    
    console.log('📤 Subiendo documento:', file.name, 'a', `${QUIVR_API}/documents/upload`)
    
    // Usar el endpoint correcto /documents/upload con autenticación
    await axios.post(`${QUIVR_API}/documents/upload`, formData, {
      headers: headers,
      timeout: 120000, // 120 segundos para archivos grandes
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    })
    
    console.log('✅ Documento subido correctamente')
  } catch (error: any) {
    console.error('❌ Error al subir documento:', error)
    
    // Mejorar el manejo de errores
    if (error.code === 'ECONNABORTED') {
      throw new Error('Tiempo de espera agotado. El archivo puede ser muy grande.')
    }
    
    if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
      throw new Error('Error de conexión con el servidor. Verifica que el backend esté corriendo.')
    }
    
    const errorMsg = error.response?.data?.detail || 
                     error.response?.data?.message || 
                     error.message || 
                     `Error ${error.response?.status || ''}: ${error.response?.statusText || 'Error al subir el documento'}`
    throw new Error(errorMsg)
  }
}

export async function listDocuments(): Promise<DocumentFile[]> {
  try {
    // Obtener token de autenticación
    const token = localStorage.getItem('authToken')
    
    // Usar el endpoint correcto /documents del backend con autenticación
    const response = await axios.get(`${QUIVR_API}/documents`, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : undefined,
        'X-Auth-Token': token || undefined
      },
      timeout: 5000
    })
    return response.data
  } catch (error) {
    console.error('Error al listar documentos:', error)
    return []
  }
}
