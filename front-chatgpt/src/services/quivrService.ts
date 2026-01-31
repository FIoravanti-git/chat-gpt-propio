import axios from 'axios'

// Usar proxy en desarrollo, URL directa en producción
const QUIVR_API = import.meta.env.DEV ? '/api/quivr' : 'http://31.220.102.254:8000'

export interface AskResponse {
  answer?: string
  message?: string
  [key: string]: any
}

export async function askQuivr(question: string, conversationId?: number, channel: string = 'web'): Promise<AskResponse> {
  try {
    // Obtener token de autenticación
    const token = localStorage.getItem('authToken')
    
    if (!token) {
      throw new Error('No hay token de autenticación. Por favor, inicia sesión.')
    }
    
    console.log('❓ Enviando pregunta a Quivr:', question.substring(0, 50) + '...')
    
    const payload: any = {
      question: question.trim()
    }
    
    // Agregar channel si está definido
    if (channel) {
      payload.channel = channel
    }
    
    // Agregar conversation_id solo si está definido y es un número válido
    if (conversationId !== undefined && conversationId !== null && !isNaN(Number(conversationId))) {
      payload.conversation_id = Number(conversationId)
    }
    
    console.log('📤 Payload enviado:', JSON.stringify(payload))
    
    const response = await axios.post(`${QUIVR_API}/ask`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Auth-Token': token
      },
      timeout: 60000 // 60 segundos para respuestas largas
    })
    
    console.log('✅ Respuesta recibida de Quivr')
    return response.data
  } catch (error: any) {
    console.error('❌ Error al hacer pregunta a Quivr:', error)
    
    if (error.response) {
      if (error.response.status === 401) {
        throw new Error('No autorizado. Por favor, inicia sesión nuevamente.')
      }
      if (error.response.status === 403) {
        throw new Error('No tienes permiso para acceder a esta conversación.')
      }
      if (error.response.status === 422) {
        // Error de validación - mostrar detalles del error
        const errorDetail = error.response.data?.detail
        let errorMessage = 'Error de validación en la pregunta'
        
        if (Array.isArray(errorDetail)) {
          // Si es un array de errores de validación de Pydantic
          const errors = errorDetail.map((e: any) => {
            const field = e.loc?.join('.') || 'campo'
            const msg = e.msg || 'error de validación'
            return `${field}: ${msg}`
          }).join(', ')
          errorMessage = `Error de validación: ${errors}`
        } else if (typeof errorDetail === 'string') {
          errorMessage = errorDetail
        } else if (errorDetail && typeof errorDetail === 'object') {
          errorMessage = JSON.stringify(errorDetail)
        }
        
        console.error('❌ Error de validación:', errorDetail)
        throw new Error(errorMessage)
      }
      
      // Para otros errores, intentar extraer el mensaje
      const errorDetail = error.response.data?.detail || error.response.data?.message
      let errorMessage = 'Error al procesar la pregunta'
      
      if (typeof errorDetail === 'string') {
        errorMessage = errorDetail
      } else if (errorDetail && typeof errorDetail === 'object') {
        errorMessage = JSON.stringify(errorDetail)
      }
      
      throw new Error(errorMessage)
    }
    
    if (error.code === 'ECONNABORTED') {
      throw new Error('Tiempo de espera agotado. La pregunta puede ser muy compleja.')
    }
    
    if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
      throw new Error('Error de conexión con el servidor. Verifica que el backend esté corriendo.')
    }
    
    throw new Error('Error de conexión con el servidor')
  }
}
