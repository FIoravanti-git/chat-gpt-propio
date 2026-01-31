import Sidebar from './components/Sidebar'
import ChatArea from './components/ChatArea'
import RightPanel from './components/RightPanel'
import Header from './components/Header'
import Login from './components/Login'
import { ThemeProvider } from './contexts/ThemeContext'
import { ConversationProvider } from './contexts/ConversationContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import './App.css'

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="app">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <p>Cargando...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Login />
  }

  return (
    <div className="app">
      <ThemeProvider>
        <ConversationProvider>
          <Header />
          <Sidebar />
          <ChatArea />
          <RightPanel />
        </ConversationProvider>
      </ThemeProvider>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
