import { useConversation } from '../contexts/ConversationContext'
import { useTheme } from '../contexts/ThemeContext'
import './Sidebar.css'

export default function Sidebar() {
  const {
    conversations,
    currentConversationId,
    createNewConversation,
    selectConversation,
    deleteConversation
  } = useConversation()
  const { theme } = useTheme()

  const sortedConversations = [...conversations]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10)

  return (
    <div className={`sidebar ${theme}`}>
      <button className="new-chat-btn" onClick={createNewConversation}>
        <span>+</span> Nuevo chat
      </button>
      <div className="conversations-list">
        {sortedConversations.length === 0 ? (
          <div className="empty-state">No hay conversaciones</div>
        ) : (
          sortedConversations.map(conv => (
            <div
              key={conv.id}
              className={`conversation-item ${
                currentConversationId === conv.id ? 'active' : ''
              }`}
              onClick={() => selectConversation(conv.id)}
            >
              <span className="conversation-title">{conv.title}</span>
              <button
                className="delete-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteConversation(conv.id)
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
