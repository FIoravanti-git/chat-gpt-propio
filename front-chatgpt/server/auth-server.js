import express from 'express'
import cors from 'cors'
import sqlite3 from 'sqlite3'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = 3002

// Middleware
app.use(cors())
app.use(express.json())

// Base de datos
const dbPath = path.join(__dirname, 'auth.db')
const db = new sqlite3.Database(dbPath)

// Crear carpeta de documentos para un usuario
function createUserDocumentsFolder(userId) {
  try {
    // Ruta a la carpeta de documentos del backend
    const documentsBasePath = path.join(__dirname, '..', '..', 'ia-nuevo', 'docs', 'documentos')
    const userDocumentsPath = path.join(documentsBasePath, `user_${userId}`)
    
    // Crear la carpeta si no existe
    if (!fs.existsSync(userDocumentsPath)) {
      fs.mkdirSync(userDocumentsPath, { recursive: true })
      console.log(`✅ Carpeta de documentos creada para usuario ${userId}: ${userDocumentsPath}`)
    } else {
      console.log(`📁 Carpeta de documentos ya existe para usuario ${userId}: ${userDocumentsPath}`)
    }
    
    return userDocumentsPath
  } catch (error) {
    console.error(`❌ Error creando carpeta de documentos para usuario ${userId}:`, error)
    return null
  }
}

// Inicializar base de datos
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    token TEXT,
    role TEXT DEFAULT 'user',
    openai_api_key TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  )`)
  
  // Agregar columna role si no existe (para bases de datos existentes)
  db.run(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`, (err) => {
    // Ignorar error si la columna ya existe
  })
  
  // Agregar columna openai_api_key si no existe (para bases de datos existentes)
  db.run(`ALTER TABLE users ADD COLUMN openai_api_key TEXT`, (err) => {
    // Ignorar error si la columna ya existe
  })
  
  // Agregar columna whatsapp_number si no existe (para bases de datos existentes)
  db.run(`ALTER TABLE users ADD COLUMN whatsapp_number TEXT`, (err) => {
    // Ignorar error si la columna ya existe
  })
  
  // Agregar columna whatsapp_id si no existe (para bases de datos existentes)
  db.run(`ALTER TABLE users ADD COLUMN whatsapp_id TEXT`, (err) => {
    // Ignorar error si la columna ya existe
  })
  
  // Tabla de documentos (multi-tenancy)
  db.run(`CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    brain_name TEXT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active',
    metadata TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, filename)
  )`, (err) => {
    if (err) console.error('Error creando tabla documents:', err)
  })
  
  // Tabla de conversaciones (multi-tenancy)
  db.run(`CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    channel TEXT NOT NULL,
    title TEXT,
    whatsapp_session_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (whatsapp_session_id) REFERENCES whatsapp_sessions(id) ON DELETE SET NULL
  )`, (err) => {
    if (err) console.error('Error creando tabla conversations:', err)
  })
  
  // Tabla de mensajes
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  )`, (err) => {
    if (err) console.error('Error creando tabla messages:', err)
  })
  
  // Tabla de sesiones de WhatsApp (multi-tenancy)
  db.run(`CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    phone_number TEXT,
    session_data TEXT,
    status TEXT DEFAULT 'disconnected',
    qr_code TEXT,
    connected_at DATETIME,
    last_message_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`, (err) => {
    if (err) console.error('Error creando tabla whatsapp_sessions:', err)
  })
  
  // Crear índices para mejorar performance
  db.run(`CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id)`, (err) => {
    if (err && !err.message.includes('already exists')) console.error('Error creando índice documents:', err)
  })
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)`, (err) => {
    if (err && !err.message.includes('already exists')) console.error('Error creando índice conversations:', err)
  })
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)`, (err) => {
    if (err && !err.message.includes('already exists')) console.error('Error creando índice messages:', err)
  })
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_user_id ON whatsapp_sessions(user_id)`, (err) => {
    if (err && !err.message.includes('already exists')) console.error('Error creando índice whatsapp_sessions:', err)
  })
  
  // Tabla de auditoría de conversaciones
  db.run(`CREATE TABLE IF NOT EXISTS conversation_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    conversation_id INTEGER,
    channel TEXT NOT NULL,
    direction TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    whatsapp_id TEXT,
    whatsapp_number TEXT,
    message_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT,
    metadata TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
  )`, (err) => {
    if (err) console.error('Error creando tabla conversation_audit:', err)
  })
  
  // Agregar columna whatsapp_id si no existe (migración)
  db.all(`PRAGMA table_info(conversation_audit)`, (err, columns) => {
    if (err) {
      console.error('Error obteniendo columnas de conversation_audit:', err)
      return
    }
    
    const hasWhatsappId = columns.some(col => col.name === 'whatsapp_id')
    if (!hasWhatsappId) {
      db.run(`ALTER TABLE conversation_audit ADD COLUMN whatsapp_id TEXT`, (err2) => {
        if (err2) {
          console.error('Error agregando columna whatsapp_id:', err2)
        } else {
          console.log('✅ Columna whatsapp_id agregada a conversation_audit')
        }
      })
    }
  })
  
  // Índices para la tabla de auditoría
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_user_id ON conversation_audit(user_id)`, (err) => {
    if (err && !err.message.includes('already exists')) console.error('Error creando índice audit user_id:', err)
  })
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_conversation_id ON conversation_audit(conversation_id)`, (err) => {
    if (err && !err.message.includes('already exists')) console.error('Error creando índice audit conversation_id:', err)
  })
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_channel ON conversation_audit(channel)`, (err) => {
    if (err && !err.message.includes('already exists')) console.error('Error creando índice audit channel:', err)
  })
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_created_at ON conversation_audit(created_at)`, (err) => {
    if (err && !err.message.includes('already exists')) console.error('Error creando índice audit created_at:', err)
  })
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_whatsapp_number ON conversation_audit(whatsapp_number)`, (err) => {
    if (err && !err.message.includes('already exists')) console.error('Error creando índice audit whatsapp_number:', err)
  })
  
  // Crear usuario admin por defecto si no existe
  db.get('SELECT * FROM users WHERE username = ?', ['admin'], (err, row) => {
    if (!row) {
      const defaultPassword = 'admin123'
      bcrypt.hash(defaultPassword, 10, (err, hash) => {
        if (!err) {
          const token = crypto.randomBytes(32).toString('hex')
          db.run(
            'INSERT INTO users (username, password, token, role) VALUES (?, ?, ?, ?)',
            ['admin', hash, token, 'admin'],
            function(insertErr) {
              if (!insertErr) {
                const adminUserId = this.lastID
                console.log('Usuario admin creado. Contraseña: admin123')
                // Crear carpeta de documentos para el admin
                createUserDocumentsFolder(adminUserId)
              }
            }
          )
        }
      })
    } else {
      // Actualizar usuario admin existente para asegurar que tenga role='admin'
      db.run('UPDATE users SET role = ? WHERE username = ? AND (role IS NULL OR role != ?)', 
        ['admin', 'admin', 'admin'], 
        (err) => {
          if (!err) {
            console.log('Usuario admin actualizado con rol de administrador')
            // Asegurar que la carpeta de documentos existe para el admin
            db.get('SELECT id FROM users WHERE username = ?', ['admin'], (err, adminUser) => {
              if (!err && adminUser) {
                createUserDocumentsFolder(adminUser.id)
              }
            })
          }
        }
      )
    }
  })
})

// Generar token
function generateToken() {
  return crypto.randomBytes(32).toString('hex')
}

// Middleware de autenticación
function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1] || req.headers['x-auth-token']
  
  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' })
  }
  
  db.get('SELECT * FROM users WHERE token = ?', [token], (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Token inválido' })
    }
    req.user = user
    next()
  })
}

// Rutas
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' })
  }
  
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Error en el servidor' })
    }
    
    if (!user) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' })
    }
    
    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' })
    }
    
    // Generar nuevo token
    const newToken = generateToken()
    db.run(
      'UPDATE users SET token = ?, last_login = CURRENT_TIMESTAMP WHERE id = ?',
      [newToken, user.id],
      (err) => {
        if (err) {
          return res.status(500).json({ error: 'Error al generar token' })
        }
        
        res.json({
          token: newToken,
          username: user.username,
          role: user.role || 'user',
          message: 'Login exitoso'
        })
      }
    )
  })
})

app.post('/api/auth/register', async (req, res) => {
  const { username, password, role = 'user' } = req.body
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' })
  }
  
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })
  }
  
  // Validar que el role sea válido
  if (role !== 'admin' && role !== 'user') {
    return res.status(400).json({ error: 'Rol inválido. Debe ser "admin" o "user"' })
  }
  
  const hashedPassword = await bcrypt.hash(password, 10)
  const token = generateToken()
  
  db.run(
    'INSERT INTO users (username, password, token, role) VALUES (?, ?, ?, ?)',
    [username, hashedPassword, token, role],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint')) {
          return res.status(400).json({ error: 'El usuario ya existe' })
        }
        return res.status(500).json({ error: 'Error al crear usuario' })
      }
      
      const userId = this.lastID
      // Crear carpeta de documentos para el nuevo usuario
      createUserDocumentsFolder(userId)
      
      res.json({
        token: token,
        username: username,
        role: role,
        message: 'Usuario creado exitosamente'
      })
    }
  )
})

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({
    valid: true,
    username: req.user.username,
    role: req.user.role || 'user'
  })
})

// Middleware para verificar si es admin
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requieren privilegios de administrador' })
  }
  next()
}

app.get('/api/auth/users', authenticateToken, requireAdmin, (req, res) => {
  // Filtrar usuarios con ID válido (no NULL) y ordenar por ID (más confiable que created_at)
  db.all('SELECT id, username, role, token, openai_api_key, whatsapp_id, whatsapp_number, created_at, last_login FROM users WHERE id IS NOT NULL ORDER BY id DESC', [], (err, users) => {
    if (err) {
      console.error('Error al obtener usuarios:', err)
      return res.status(500).json({ error: 'Error al obtener usuarios' })
    }
    // Asegurar que todos los campos estén presentes y que el ID sea válido
    const usersWithTokens = users
      .filter(user => user.id !== null && user.id !== undefined && user.id !== 'None') // Filtrar usuarios con ID inválido
      .map(user => ({
        id: user.id,
        username: user.username,
        role: user.role || 'user',
        token: user.token || null,
        openai_api_key: user.openai_api_key || null,
        whatsapp_id: user.whatsapp_id || null,
        whatsapp_number: user.whatsapp_number || null,
        created_at: user.created_at || null,
        last_login: user.last_login || null
      }))
    console.log(`✅ Usuarios obtenidos: ${usersWithTokens.length}`)
    console.log(`✅ IDs de usuarios: ${usersWithTokens.map(u => u.id).join(', ')}`)
    res.json(usersWithTokens)
  })
})

app.post('/api/auth/users/:id/regenerate-token', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params
  
  // No permitir regenerar el token del propio admin
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: 'No puedes regenerar tu propio token' })
  }
  
  const newToken = generateToken()
  db.run('UPDATE users SET token = ? WHERE id = ?', [newToken, id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Error al regenerar token' })
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }
    
    res.json({ 
      message: 'Token regenerado exitosamente',
      token: newToken
    })
  })
})

app.post('/api/auth/users', authenticateToken, requireAdmin, async (req, res) => {
  const { username, password, role = 'user', openai_api_key = null } = req.body
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' })
  }
  
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })
  }
  
  if (role !== 'admin' && role !== 'user') {
    return res.status(400).json({ error: 'Rol inválido' })
  }
  
  const hashedPassword = await bcrypt.hash(password, 10)
  const token = generateToken()
  
  db.run(
    'INSERT INTO users (username, password, token, role, openai_api_key) VALUES (?, ?, ?, ?, ?)',
    [username, hashedPassword, token, role, openai_api_key],
    function(err) {
      if (err) {
        console.error('❌ Error al crear usuario:', err)
        if (err.message.includes('UNIQUE constraint')) {
          return res.status(400).json({ error: 'El usuario ya existe' })
        }
        return res.status(500).json({ error: 'Error al crear usuario' })
      }
      
      const userId = this.lastID
      console.log(`✅ Usuario creado - ID: ${userId}, Username: ${username}`)
      
      // Verificar que el ID sea válido
      if (!userId || userId === null || userId === undefined) {
        console.error('❌ Error: Usuario creado pero sin ID válido')
        return res.status(500).json({ error: 'Error al crear usuario: ID no generado' })
      }
      
      // Crear carpeta de documentos para el nuevo usuario
      createUserDocumentsFolder(userId)
      
      res.json({
        id: userId,
        username: username,
        role: role,
        openai_api_key: openai_api_key,
        message: 'Usuario creado exitosamente'
      })
    }
  )
})

app.put('/api/auth/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params
  const { username, password, role, openai_api_key } = req.body
  
  // Verificar que el usuario existe
  db.get('SELECT * FROM users WHERE id = ?', [id], async (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }
    
    const updates = []
    const values = []
    
    if (username && username !== user.username) {
      updates.push('username = ?')
      values.push(username)
    }
    
    if (role && role !== user.role) {
      if (role !== 'admin' && role !== 'user') {
        return res.status(400).json({ error: 'Rol inválido' })
      }
      updates.push('role = ?')
      values.push(role)
    }
    
    // Procesar openai_api_key - aceptar string vacío, null o undefined como null
    if (openai_api_key !== undefined) {
      const apiKeyValue = openai_api_key === '' || openai_api_key === null ? null : openai_api_key
      const currentApiKey = user.openai_api_key || null
      
      // Solo actualizar si hay cambio (considerando null como igual a vacío)
      if (apiKeyValue !== currentApiKey) {
        updates.push('openai_api_key = ?')
        values.push(apiKeyValue)
      }
    }
    
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })
      }
      const hashedPassword = await bcrypt.hash(password, 10)
      updates.push('password = ?')
      values.push(hashedPassword)
      // Generar nuevo token al cambiar contraseña
      const newToken = generateToken()
      updates.push('token = ?')
      values.push(newToken)
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay cambios para actualizar' })
    }
    
    values.push(id)
    
    db.run(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values,
      (err) => {
        if (err) {
          if (err.message.includes('UNIQUE constraint')) {
            return res.status(400).json({ error: 'El nombre de usuario ya existe' })
          }
          return res.status(500).json({ error: 'Error al actualizar usuario' })
        }
        
        res.json({ message: 'Usuario actualizado exitosamente' })
      }
    )
  })
})

app.delete('/api/auth/users/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params
  
  // No permitir eliminar al propio admin
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' })
  }
  
  db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Error al eliminar usuario' })
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }
    
    res.json({ message: 'Usuario eliminado exitosamente' })
  })
})

// Endpoint para obtener registros de auditoría (solo admin)
app.get('/api/auth/audit', authenticateToken, requireAdmin, (req, res) => {
  const {
    user_id,
    channel,
    direction,
    whatsapp_number,
    date_from,
    date_to,
    limit = 1000,
    offset = 0
  } = req.query
  
  // Construir query con filtros
  let query = 'SELECT * FROM conversation_audit WHERE 1=1'
  const params = []
  
  if (user_id) {
    query += ' AND user_id = ?'
    params.push(parseInt(user_id))
  }
  
  if (channel) {
    query += ' AND channel = ?'
    params.push(channel)
  }
  
  if (direction) {
    query += ' AND direction = ?'
    params.push(direction)
  }
  
  if (whatsapp_number) {
    query += ' AND whatsapp_number LIKE ?'
    params.push(`%${whatsapp_number}%`)
  }
  
  if (date_from) {
    query += ' AND created_at >= ?'
    // Convertir formato datetime-local (YYYY-MM-DDTHH:mm) a formato SQLite
    const dateFromFormatted = date_from.replace('T', ' ')
    params.push(dateFromFormatted)
  }
  
  if (date_to) {
    query += ' AND created_at <= ?'
    // Convertir formato datetime-local (YYYY-MM-DDTHH:mm) a formato SQLite
    // Agregar segundos si no están presentes
    let dateToFormatted = date_to.replace('T', ' ')
    if (!dateToFormatted.includes(':')) {
      dateToFormatted += ':00'
    }
    // Si no tiene segundos, agregarlos
    const parts = dateToFormatted.split(':')
    if (parts.length === 2) {
      dateToFormatted += ':59' // Hasta el final del minuto
    }
    params.push(dateToFormatted)
  }
  
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
  params.push(parseInt(limit), parseInt(offset))
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Error obteniendo auditoría:', err)
      return res.status(500).json({ error: 'Error al obtener registros de auditoría' })
    }
    
    // Obtener total de registros (sin límite) para paginación
    let countQuery = 'SELECT COUNT(*) as total FROM conversation_audit WHERE 1=1'
    const countParams = []
    
    if (user_id) {
      countQuery += ' AND user_id = ?'
      countParams.push(parseInt(user_id))
    }
    if (channel) {
      countQuery += ' AND channel = ?'
      countParams.push(channel)
    }
    if (direction) {
      countQuery += ' AND direction = ?'
      countParams.push(direction)
    }
    if (whatsapp_number) {
      countQuery += ' AND whatsapp_number LIKE ?'
      countParams.push(`%${whatsapp_number}%`)
    }
    if (date_from) {
      countQuery += ' AND created_at >= ?'
      countParams.push(date_from)
    }
    if (date_to) {
      countQuery += ' AND created_at <= ?'
      countParams.push(date_to)
    }
    
    db.get(countQuery, countParams, (err2, countRow) => {
      if (err2) {
        console.error('Error contando registros:', err2)
        return res.json({ records: rows, total: rows.length })
      }
      
      res.json({
        records: rows,
        total: countRow.total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      })
    })
  })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor de autenticación corriendo en http://0.0.0.0:${PORT}`)
  console.log(`Base de datos: ${dbPath}`)
})
