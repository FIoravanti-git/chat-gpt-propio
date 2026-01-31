import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
}

interface ConversationContextType {
  conversations: Conversation[]
  currentConversationId: string | null
  currentConversation: Conversation | null
  createNewConversation: () => string
  selectConversation: (id: string) => void
  addMessage: (conversationId: string, message: Omit<Message, 'id' | 'timestamp'>) => void
  deleteConversation: (id: string) => void
}

const ConversationContext = createContext<ConversationContextType | undefined>(undefined)

export function ConversationProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const saved = localStorage.getItem('conversations')
    if (saved) {
      const parsed = JSON.parse(saved)
      return parsed.map((conv: any) => ({
        ...conv,
        createdAt: new Date(conv.createdAt),
        messages: conv.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
      }))
    }
    return []
  })
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)

  // Guardar conversaciones en localStorage (mantener solo las últimas 10)
  useEffect(() => {
    const sorted = [...conversations].sort((a, b) => 
      b.createdAt.getTime() - a.createdAt.getTime()
    )
    const last10 = sorted.slice(0, 10)
    localStorage.setItem('conversations', JSON.stringify(last10))
  }, [conversations])

  const createNewConversation = () => {
    const newId = `conv-${Date.now()}`
    const newConversation: Conversation = {
      id: newId,
      title: 'Nueva conversación',
      messages: [],
      createdAt: new Date()
    }
    setConversations(prev => [newConversation, ...prev])
    setCurrentConversationId(newId)
    return newId
  }

  const selectConversation = (id: string) => {
    setCurrentConversationId(id)
  }

  const addMessage = (conversationId: string, message: Omit<Message, 'id' | 'timestamp'>) => {
    const newMessage: Message = {
      ...message,
      id: `msg-${Date.now()}-${Math.random()}`,
      timestamp: new Date()
    }

    setConversations(prev => {
      const updated = prev.map(conv => {
        if (conv.id === conversationId) {
          const updatedConv = {
            ...conv,
            messages: [...conv.messages, newMessage]
          }
          // Actualizar título si es el primer mensaje del usuario
          if (conv.messages.length === 0 && message.role === 'user') {
            updatedConv.title = message.content.slice(0, 50) || 'Nueva conversación'
          }
          return updatedConv
        }
        return conv
      })
      return updated
    })
  }

  const deleteConversation = (id: string) => {
    const isCurrentConversation = currentConversationId === id
    
    setConversations(prev => {
      const filtered = prev.filter(conv => conv.id !== id)
      
      // Si se eliminó la conversación actual
      if (isCurrentConversation) {
        if (filtered.length > 0) {
          // Seleccionar la conversación más reciente
          const sorted = [...filtered].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          setCurrentConversationId(sorted[0].id)
        } else {
          // Si no hay más conversaciones, crear una nueva
          const newId = `conv-${Date.now()}`
          const newConversation: Conversation = {
            id: newId,
            title: 'Nueva conversación',
            messages: [],
            createdAt: new Date()
          }
          setCurrentConversationId(newId)
          return [newConversation]
        }
      }
      return filtered
    })
  }

  const currentConversation = conversations.find(c => c.id === currentConversationId) || null

  return (
    <ConversationContext.Provider
      value={{
        conversations,
        currentConversationId,
        currentConversation,
        createNewConversation,
        selectConversation,
        addMessage,
        deleteConversation
      }}
    >
      {children}
    </ConversationContext.Provider>
  )
}

export function useConversation() {
  const context = useContext(ConversationContext)
  if (context === undefined) {
    throw new Error('useConversation must be used within a ConversationProvider')
  }
  return context
}
