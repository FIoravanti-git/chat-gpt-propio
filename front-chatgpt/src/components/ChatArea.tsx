import { useState, useRef, useEffect } from 'react'
import { useConversation } from '../contexts/ConversationContext'
import { useTheme } from '../contexts/ThemeContext'
import { askQuivr } from '../services/quivrService'
import './ChatArea.css'

export default function ChatArea() {
  const { currentConversation, addMessage, createNewConversation, currentConversationId, conversations } = useConversation()
  const { theme } = useTheme()
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Crear una nueva conversación automáticamente solo al montar el componente por primera vez
  useEffect(() => {
    if (!currentConversationId && conversations.length === 0) {
      createNewConversation()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Solo al montar, no cuando cambia currentConversationId

  // Enfocar el input cuando hay una conversación activa
  useEffect(() => {
    if (currentConversationId) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }, [currentConversationId])

  useEffect(() => {
    scrollToBottom()
  }, [currentConversation?.messages])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const conversationId = currentConversationId || createNewConversation()
    const userMessage = input.trim()
    
    setInput('')
    setIsLoading(true)

    // Agregar mensaje del usuario
    addMessage(conversationId, {
      role: 'user',
      content: userMessage
    })

    try {
      // Obtener respuesta de Quivr con conversation_id y channel
      const response = await askQuivr(userMessage, conversationId, 'web')
      
      // Agregar respuesta del asistente
      addMessage(conversationId, {
        role: 'assistant',
        content: response.answer || response.message || 'No se pudo obtener una respuesta'
      })
    } catch (error: any) {
      console.error('Error al obtener respuesta:', error)
      const errorMessage = error?.message || 'Lo siento, ocurrió un error al procesar tu mensaje. Por favor, intenta de nuevo.'
      addMessage(conversationId, {
        role: 'assistant',
        content: errorMessage
      })
    } finally {
      setIsLoading(false)
      // Enfocar el input después de enviar el mensaje
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={`chat-area ${theme}`}>
      <div className="messages-container">
        {currentConversation ? (
          <>
            {currentConversation.messages.map(message => (
              <div key={message.id} className={`message ${message.role}`}>
                {message.role === 'assistant' && (
                  <img 
                    src="/intelligence.png" 
                    alt="Agente IA" 
                    className="agent-icon"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                )}
                <div className="message-content">
                  {message.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="message assistant">
                <img 
                  src="/intelligence.png" 
                  alt="Agente IA" 
                  className="agent-icon"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
                <div className="message-content">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        ) : (
          <div className="empty-chat">
            <h2>Tabacman IA</h2>
            <p>Escribe un mensaje para comenzar a chatear</p>
          </div>
        )}
      </div>
      <div className="input-container">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Escribe un mensaje..."
          rows={1}
          disabled={isLoading}
          className="chat-input"
          autoFocus
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="send-button"
        >
          Enviar
        </button>
      </div>
    </div>
  )
}
