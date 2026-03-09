import axios from 'axios'

// Usar proxy en desarrollo, URLs directas en producción
const WHATSAPP_API = import.meta.env.DEV ? '/api/whatsapp' : 'http://31.220.102.254:3001'
const QUIVR_API = import.meta.env.DEV ? '/api/quivr' : 'http://31.220.102.254:8000'

export async function getWhatsAppQR(): Promise<string> {
  try {
    // Obtener token de autenticación
    const token = localStorage.getItem('authToken')
    if (!token) {
      throw new Error('No hay token de autenticación. Por favor, inicia sesión.')
    }
    
    // Usar el endpoint correcto /api/qr que devuelve JSON con formato: {"qr":"data:image/png;base64,...","ready":false}
    const response = await axios.get(`${WHATSAPP_API}/api/qr`, {
      responseType: 'json',
      timeout: 10000,
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Auth-Token': token
      }
    })
    
    // Si WhatsApp ya está conectado
    if (response.data?.ready === true) {
      throw new Error('ALREADY_CONNECTED')
    }
    
    // Si el QR está disponible en formato data URL
    if (response.data?.qr && response.data.qr !== null && response.data.qr !== 'null' && response.data.qr !== '') {
      return response.data.qr
    }
    
    // Si el QR es null, lanzar error especial para que el frontend espere (no es un error real)
    throw new Error('QR_NOT_READY')
  } catch (error: any) {
    // Si el error es porque el QR no está listo o ya está conectado, relanzar sin loguear como error
    if (error.message === 'QR_NOT_READY' || error.message === 'ALREADY_CONNECTED') {
      throw error
    }
    
    // Solo loguear errores reales
    console.error('Error al obtener QR:', error)
    throw new Error(error.response?.data?.message || error.message || 'Error al obtener el código QR')
  }
}

export async function checkWhatsAppStatus(): Promise<string> {
  try {
    // Obtener token de autenticación
    const token = localStorage.getItem('authToken')
    if (!token) {
      throw new Error('No hay token de autenticación. Por favor, inicia sesión.')
    }
    // Usar el endpoint correcto /api/status
    const response = await axios.get(`${WHATSAPP_API}/api/status`, {
      timeout: 5000,
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Auth-Token': token
      }
    })
    
    console.log('📊 Respuesta del servidor WhatsApp:', response.data) // Debug
    
    // El formato de respuesta es: {"ready":false,"connected":true}
    // Solo considerar conectado si connected es true Y ready es true (completamente listo)
    if (response.data?.ready === true && response.data?.connected === true) {
      console.log('✅ WhatsApp está CONECTADO y LISTO')
      return 'Conectado'
    }
    
    // Si connected es true pero ready es false, está en proceso de conexión
    if (response.data?.connected === true && response.data?.ready === false) {
      console.log('⏳ WhatsApp está CONECTANDO...')
      return 'Conectando...'
    }
    
    // Si connected es false, está desconectado
    console.log('❌ WhatsApp está DESCONECTADO')
    return 'Desconectado'
  } catch (error: any) {
    console.error('❌ Error al verificar estado:', error)
    // Si hay error de conexión, intentar verificar si es un problema temporal
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.warn('⚠️ No se pudo conectar al servidor de WhatsApp')
    }
    // Si hay error, asumir desconectado (no cerrar el modal)
    return 'Desconectado'
  }
}

export async function linkWhatsAppPhone(phoneNumber?: string): Promise<void> {
  try {
    const token = localStorage.getItem('authToken')
    if (!token) {
      throw new Error('No hay token de autenticación. Por favor, inicia sesión.')
    }
    
    const response = await axios.post(`${WHATSAPP_API}/api/link-phone`, {
      phoneNumber: phoneNumber || undefined // Número real del usuario (solo dígitos, ej: 595972908588)
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Auth-Token': token
      },
      timeout: 10000
    })
    
    console.log('✅ Número de WhatsApp vinculado:', response.data)
    return response.data
  } catch (error: any) {
    console.error('❌ Error al vincular número de WhatsApp:', error)
    if (error.response) {
      if (error.response.status === 401) {
        throw new Error('No autorizado. Por favor, inicia sesión nuevamente.')
      }
      if (error.response.status === 409) {
        throw new Error(error.response.data?.error || 'El número ya está vinculado a otro usuario.')
      }
      throw new Error(error.response.data?.error || error.response.data?.message || 'Error al vincular número de WhatsApp')
    }
    throw new Error('Error de conexión con el servidor de WhatsApp')
  }
}

export async function reloadBrain(): Promise<void> {
  try {
    // Obtener token de autenticación
    const token = localStorage.getItem('authToken')
    
    if (!token) {
      throw new Error('No hay token de autenticación. Por favor, inicia sesión.')
    }
    
    console.log('🔄 Recargando brain...')
    
    await axios.post(`${QUIVR_API}/reload`, {}, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Auth-Token': token
      },
      timeout: 30000
    })
    
    console.log('✅ Brain recargado correctamente')
  } catch (error: any) {
    console.error('❌ Error al recargar brain:', error)
    if (error.response) {
      if (error.response.status === 401) {
        throw new Error('No autorizado. Por favor, inicia sesión nuevamente.')
      }
      throw new Error(error.response.data?.detail || error.response.data?.message || 'Error al recargar el brain')
    }
    throw new Error('Error de conexión con el servidor')
  }
}
