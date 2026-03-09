import Sidebar from './components/Sidebar'
import ChatArea from './components/ChatArea'
import RightPanel from './components/RightPanel'
import Header from './components/Header'
import Login from './components/Login'
import Comprobantes from './components/Comprobantes'
import { ThemeProvider } from './contexts/ThemeContext'
import { ConversationProvider } from './contexts/ConversationContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import './App.css'

function AppContent() {
  const { isAuthenticated, isLoading, isOcrUser } = useAuth()

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

  // Usuario OCR/OpenAi: solo pantalla Comprobantes (sin chat) + barra derecha con tema y WhatsApp
  if (isOcrUser) {
    return (
      <div className="app app-layout-ocr">
        <ThemeProvider>
          <Header />
          <div className="app-ocr-body">
            <main className="app-main app-main-ocr">
              <Comprobantes />
            </main>
            <RightPanel ocrMode />
          </div>
        </ThemeProvider>
      </div>
    )
  }

  // Usuario Quivr/OpenAi: chat completo
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
