// Hacer crypto disponible globalmente ANTES de importar Baileys
const cryptoModule = require('crypto');
if (typeof global.crypto === 'undefined') {
  global.crypto = cryptoModule.webcrypto || cryptoModule;
}

const express = require('express');
const { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, downloadMediaMessage } = require('baileys');
const QRCode = require('qrcode');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const sqlite3 = require('sqlite3').verbose();

const { processImageForComprobante } = require('./ocr-comprobante');
const { getParaguayDateTime } = require('./timezone-paraguay');

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3001;
const QUIVR_URL = process.env.QUIVR_URL || 'http://localhost:8000';

// Archivo de log para poder ver actividad con: tail -f whatsapp/whatsapp.log
const LOG_FILE = path.join(__dirname, 'whatsapp.log');
function writeToLogFile(line) {
  try {
    fs.appendFileSync(LOG_FILE, new Date().toISOString() + ' ' + line + '\n');
  } catch (e) {}
}

// Ruta a la base de datos de autenticación (compartida con auth-server)
const AUTH_DB_PATH = path.join(__dirname, '../front-chatgpt/server/auth.db');

// Logger
const logger = pino({ level: 'silent' });

// Almacenamiento de webhooks
let webhooks = [];

// Configuración de Quivr
let quivrConfig = {
  enabled: process.env.QUIVR_ENABLED === 'true' || true, // Por defecto habilitado
  url: QUIVR_URL,
  endpoint: process.env.QUIVR_ENDPOINT || '/ask',
  ignoreGroups: process.env.QUIVR_IGNORE_GROUPS === 'true' || false,
  chatId: process.env.QUIVR_CHAT_ID || null
};

// ✅ REFACTORIZADO: Clientes de WhatsApp por usuario (NO global)
// Cada usuario tiene su propia conexión de WhatsApp
const userSockets = new Map(); // Map<userId, { socket, isReady, currentQR, whatsappId, whatsappNumber, qrScannedBy }>

// Estructura de datos por usuario:
// {
//   socket: WebSocket de Baileys,
//   isReady: boolean,
//   currentQR: string | null,
//   whatsappId: string | null,
//   whatsappNumber: string | null,
//   qrScannedBy: userId | null  // Usuario que escaneó el QR (vinculación exclusiva)
// }

// Función helper para acceder a la base de datos
function getDb() {
  return new sqlite3.Database(AUTH_DB_PATH);
}

/** Obtiene tipo_usuario del usuario: "Quivr/OpenAi" | "OCR/OpenAi" */
function getUserTipoUsuario(userId) {
  return new Promise((resolve) => {
    const db = getDb();
    db.get('SELECT tipo_usuario FROM users WHERE id = ?', [userId], (err, row) => {
      db.close();
      if (err || !row) return resolve('Quivr/OpenAi');
      resolve((row.tipo_usuario && row.tipo_usuario.trim()) || 'Quivr/OpenAi');
    });
  });
}

// Normalizar número de teléfono para búsqueda consistente
function normalizePhoneNumber(phoneNumber) {
  // Remover sufijos de WhatsApp (@s.whatsapp.net, @g.us, etc.)
  let normalized = phoneNumber.replace(/@[^@]+$/, '');
  // Remover caracteres no numéricos excepto +
  normalized = normalized.replace(/[^\d+]/g, '');
  return normalized;
}

// Obtener número de WhatsApp real del usuario (solo dígitos)
function getUserRealPhoneNumber(userId) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    // PRIORIDAD 1: Buscar en users.whatsapp_number (número real normalizado)
    db.get(
      'SELECT whatsapp_number FROM users WHERE id = ?',
      [userId],
      (err, row) => {
        if (err) {
          db.close();
          console.error('Error obteniendo número real del usuario:', err);
          resolve(null);
        } else if (row && row.whatsapp_number) {
          db.close();
          resolve(row.whatsapp_number);
        } else {
          // PRIORIDAD 2: Si no hay whatsapp_phone_number, obtener desde whatsapp_sessions y normalizar
          const db2 = getDb();
          db2.get(
            'SELECT phone_number FROM whatsapp_sessions WHERE user_id = ? LIMIT 1',
            [userId],
            (err2, row2) => {
              db2.close();
              if (err2) {
                console.error('Error obteniendo número desde whatsapp_sessions:', err2);
                resolve(null);
              } else if (row2 && row2.phone_number) {
                const normalized = normalizePhoneNumber(row2.phone_number);
                resolve(normalized);
              } else {
                console.warn(`⚠️  No se encontró número de WhatsApp para usuario ${userId}`);
                resolve(null);
              }
            }
          );
        }
      }
    );
  });
}

// Obtener user_id desde número de teléfono o sesión
// PRIORIDAD: Buscar primero por whatsapp_number (número real) para validar usuario conectado
function getUserFromPhoneNumber(phoneNumber) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    // Normalizar número para búsqueda consistente (solo dígitos)
    const normalizedNumber = normalizePhoneNumber(phoneNumber);

    // PRIORIDAD 1: Buscar en users.whatsapp_number (número real del usuario)
    // Este es el campo principal para validar si corresponde al usuario conectado
    db.get(
      `SELECT id FROM users 
       WHERE whatsapp_number = ? 
       OR whatsapp_number = ?`,
      [normalizedNumber, phoneNumber],
      (err1, userRow1) => {
        if (err1) {
          console.error('Error buscando usuario por whatsapp_number:', err1);
        } else if (userRow1) {
          db.close();
          console.log(`✅ Usuario encontrado en tabla users (whatsapp_number): ${userRow1.id}`);
          console.log(`✅ Validación: El número ${normalizedNumber} corresponde al usuario ${userRow1.id}`);
          resolve(userRow1.id);
          return;
        }
        
        // PRIORIDAD 2: Buscar en whatsapp_sessions por número exacto (formato completo con sufijos)
        // Esto es importante porque los mensajes pueden llegar con diferentes formatos (@s.whatsapp.net, @lid, etc.)
        db.get(
          'SELECT user_id FROM whatsapp_sessions WHERE phone_number = ?',
          [phoneNumber],
          (err2, row2) => {
            if (err2) {
              console.error('Error buscando en whatsapp_sessions (formato exacto):', err2);
            } else if (row2) {
              db.close();
              resolve(row2.user_id);
              return;
            }
            
            // PRIORIDAD 3: Buscar en whatsapp_sessions con número normalizado + diferentes sufijos
            // Probar con @s.whatsapp.net, @lid, y otros formatos comunes
            db.get(
              `SELECT user_id FROM whatsapp_sessions 
               WHERE phone_number LIKE ? 
               OR phone_number LIKE ?
               OR phone_number = ?`,
              [`${normalizedNumber}@%`, `%${normalizedNumber}%`, normalizedNumber],
              (err3, row3) => {
                if (err3) {
                  console.error('Error buscando en whatsapp_sessions (variantes):', err3);
                } else if (row3) {
                  db.close();
                  resolve(row3.user_id);
                  return;
                }
                
                // PRIORIDAD 4: Buscar en la tabla users por whatsapp_id (formato completo con sufijo)
                // Los mensajes llegan con formato @lid, así que debemos buscar con ese formato
                // También buscar variantes para compatibilidad
                const searchVariantsForUsers = [
                  phoneNumber, // Formato exacto del mensaje (ej: 138916556447751@lid)
                  `${normalizedNumber}@lid`, // Formato normalizado con @lid
                  `${normalizedNumber}@s.whatsapp.net`, // Formato alternativo
                  normalizedNumber // Solo número para compatibilidad
                ];
                db.get(
                  `SELECT id FROM users 
                   WHERE whatsapp_id = ? 
                   OR whatsapp_id = ?
                   OR whatsapp_id = ?
                   OR whatsapp_id = ?
                   OR whatsapp_id LIKE ?`,
                  [...searchVariantsForUsers, `%${normalizedNumber}%`],
                  (err4, userRow2) => {
                    db.close();
                    if (err4) {
                      console.error('Error buscando usuario por whatsapp_id:', err4);
                      reject(err4);
                    } else if (userRow2) {
                      resolve(userRow2.id);
                    } else {
                      console.warn(`⚠️ No se encontró usuario para número: ${phoneNumber}`);
                      resolve(null);
                    }
                  }
                );
              }
            );
          }
        );
      }
    );
  });
}

// Obtener token del usuario
function getUserToken(userId) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    db.get(
      'SELECT token FROM users WHERE id = ?',
      [userId],
      (err, row) => {
        db.close();
        if (err) {
          reject(err);
        } else if (row && row.token) {
          resolve(row.token);
        } else {
          resolve(null);
        }
      }
    );
  });
}

// Obtener user_id desde token de autenticación
function getUserIdFromToken(token) {
  return new Promise((resolve, reject) => {
    if (!token) {
      resolve(null);
      return;
    }
    
    const db = getDb();
    // Limpiar el token (puede venir con "Bearer " prefix)
    const cleanToken = token.replace(/^Bearer\s+/i, '');
    
    db.get(
      'SELECT id, username FROM users WHERE token = ?',
      [cleanToken],
      (err, row) => {
        db.close();
        if (err) {
          reject(err);
        } else if (row) {
          resolve(row.id);
        } else {
          resolve(null);
        }
      }
    );
  });
}

// Obtener o crear conversación de WhatsApp para un usuario
function getOrCreateWhatsAppConversation(userId, phoneNumber) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    // Buscar conversación existente de WhatsApp para este usuario
    db.get(
      `SELECT c.id, c.title, c.updated_at 
       FROM conversations c
       JOIN whatsapp_sessions w ON c.whatsapp_session_id = w.id
       WHERE c.user_id = ? AND c.channel = 'whatsapp' AND w.phone_number = ?
       ORDER BY c.updated_at DESC
       LIMIT 1`,
      [userId, phoneNumber],
      (err, row) => {
        if (err) {
          db.close();
          reject(err);
        } else if (row) {
          db.close();
          resolve(row.id);
        } else {
          // Crear nueva conversación
          // Primero obtener o crear sesión de WhatsApp
          db.get(
            'SELECT id FROM whatsapp_sessions WHERE user_id = ?',
            [userId],
            (err2, sessionRow) => {
              if (err2) {
                db.close();
                reject(err2);
              } else {
                let sessionId = sessionRow ? sessionRow.id : null;
                
                // Si no hay sesión, crear una
                if (!sessionId) {
                  db.run(
                    'INSERT INTO whatsapp_sessions (user_id, phone_number, status) VALUES (?, ?, ?)',
                    [userId, phoneNumber, 'connected'],
                    function(err3) {
                      if (err3) {
                        db.close();
                        reject(err3);
                      } else {
                        sessionId = this.lastID;
                        // Crear conversación
                        db.run(
                          'INSERT INTO conversations (user_id, channel, whatsapp_session_id, title) VALUES (?, ?, ?, ?)',
                          [userId, 'whatsapp', sessionId, `Chat WhatsApp ${phoneNumber}`],
                          function(err4) {
                            db.close();
                            if (err4) {
                              reject(err4);
                            } else {
                              resolve(this.lastID);
                            }
                          }
                        );
                      }
                    }
                  );
                } else {
                  // Crear conversación con sesión existente
                  db.run(
                    'INSERT INTO conversations (user_id, channel, whatsapp_session_id, title) VALUES (?, ?, ?, ?)',
                    [userId, 'whatsapp', sessionId, `Chat WhatsApp ${phoneNumber}`],
                    function(err4) {
                      db.close();
                      if (err4) {
                        reject(err4);
                      } else {
                        resolve(this.lastID);
                      }
                    }
                  );
                }
              }
            }
          );
        }
      }
    );
  });
}

// Guardar mensaje en la base de datos y auditoría
function saveMessage(conversationId, userId, role, content, phoneNumber = null, whatsappId = null) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    db.run(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
      [conversationId, role, content],
      function(err) {
        if (err) {
          db.close();
          reject(err);
          return;
        }
        
        const messageId = this.lastID;
        
        // Actualizar updated_at de la conversación
        db.run(
          'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [conversationId],
          (err2) => {
            if (err2) {
              console.error('Error actualizando conversación:', err2);
            }
            
            // AUDITORÍA: Registrar en tabla de auditoría
            // IMPORTANTE: Aplicar la misma lógica que en la tabla users
            // whatsapp_id: ID de WhatsApp sin sufijo (ej: 138916556447751) - sin @s.whatsapp.net ni @lid
            // whatsapp_number: Número real de teléfono (solo dígitos, ej: 595972908588) - diferente al whatsapp_id
            const direction = role === 'user' ? 'incoming' : 'outgoing';
            
            // Normalizar número real (solo dígitos) - este es whatsapp_number
            // Debe ser el número real de teléfono del usuario, no el ID de WhatsApp
            const phoneNumberOnly = phoneNumber ? (phoneNumber.includes('@') ? normalizePhoneNumber(phoneNumber) : phoneNumber) : null;
            
            // Normalizar ID de WhatsApp (solo número, sin sufijo) - este es whatsapp_id
            // Debe ser el ID de WhatsApp sin sufijo (ej: 138916556447751), sin @s.whatsapp.net ni @lid
            let whatsappIdOnly = null;
            if (whatsappId) {
              // Remover cualquier sufijo (@s.whatsapp.net, @lid, :algo, etc.)
              whatsappIdOnly = whatsappId.split('@')[0].split(':')[0];
            }
            
            db.run(
              `INSERT INTO conversation_audit 
               (user_id, conversation_id, channel, direction, role, content, whatsapp_id, whatsapp_number, message_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [userId, conversationId, 'whatsapp', direction, role, content, whatsappIdOnly, phoneNumberOnly, messageId],
              (err3) => {
                db.close();
                if (err3) {
                  console.error('Error guardando auditoría:', err3);
                  // No fallar si falla la auditoría, solo loguear
                }
                resolve(messageId);
              }
            );
          }
        );
      }
    );
  });
}

// Función para consultar Quivr con contexto del usuario
async function queryQuivr(message, userToken, conversationId = null) {
  try {
    const quivrEndpoint = `${quivrConfig.url}${quivrConfig.endpoint}`;

    const payload = {
      question: message
    };
    
    // Agregar conversation_id si está disponible (para contexto histórico)
    if (conversationId) {
      payload.conversation_id = conversationId;
    }
    
    // Agregar channel
    payload.channel = 'whatsapp';
    
    if (quivrConfig.k) payload.k = quivrConfig.k;
    if (quivrConfig.temperature !== undefined) payload.temperature = quivrConfig.temperature;

    // Enviar token del usuario para que Quivr use su contexto
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (userToken) {
      headers['Authorization'] = `Bearer ${userToken}`;
      // También soportar X-Auth-Token como alternativa
      headers['X-Auth-Token'] = userToken;
    }

    const response = await axios.post(quivrEndpoint, payload, {
      headers: headers,
      timeout: 30000
    });

    let answer = null;
    if (response.data) {
      answer = response.data.answer || 
               response.data.response || 
               response.data.message || 
               response.data.text ||
               (typeof response.data === 'string' ? response.data : JSON.stringify(response.data));
    }

    return answer || 'No pude obtener una respuesta de Quivr.';
  } catch (error) {
    console.error('Error consultando Quivr:', error.message);
    if (error.response) {
      console.error('Respuesta de Quivr:', error.response.status, error.response.data);
    }
    // NO usar fallback a contexto global - lanzar error si no hay token válido
    if (error.response && error.response.status === 401) {
      throw new Error('Usuario no autenticado. No se puede acceder al contexto del usuario.');
    }
    throw error;
  }
}

// ✅ REFACTORIZADO: Inicializar cliente de WhatsApp para un usuario específico
// IMPORTANTE: Cada usuario debe tener su propia conexión
async function initializeWhatsApp(userId) {
  if (!userId) {
    throw new Error('userId es requerido para inicializar WhatsApp');
  }
  
  // ✅ CRÍTICO: Asegurar que solo haya UN socket por usuario
  // Si ya existe un socket para este usuario, cerrarlo primero
  const existingUserData = userSockets.get(userId);
  if (existingUserData && existingUserData.socket) {
    console.log(`⚠️ [Usuario ${userId}] Ya existe un socket activo. Cerrando antes de crear uno nuevo...`);
    try {
      // Cerrar el socket existente de forma limpia
      if (existingUserData.socket.end) {
        existingUserData.socket.end(undefined);
      }
      // Limpiar la entrada de userSockets
      userSockets.delete(userId);
      // Esperar un momento para que se cierre completamente
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`[Usuario ${userId}] Error cerrando socket existente:`, err);
      // Forzar eliminación de userSockets incluso si hay error
      userSockets.delete(userId);
    }
  }
  
  console.log(`🔧 Inicializando WhatsApp para usuario ${userId}`);
  
  // Directorio de autenticación específico por usuario
  const authDir = path.join(__dirname, 'baileys_auth', `user_${userId}`);
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  
  const { version } = await fetchLatestBaileysVersion();
  
  // ✅ CRÍTICO: Crear socket como variable local, NO global
  const socket = makeWASocket({
    version,
    logger,
    printQRInTerminal: true,
    auth: state,
    browser: ['Chrome', 'Chrome', '120.0'],
    // Configuración adicional para mejorar la conexión
    connectTimeoutMs: 90000,
    defaultQueryTimeoutMs: 90000,
    keepAliveIntervalMs: 30000,
    qrTimeout: 120000, // 120 segundos para escanear el QR
    // Configuración adicional para evitar errores de conexión
    markOnlineOnConnect: true,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    // Configuración para evitar errores 428
    retryRequestDelayMs: 250,
    maxMsgRetryCount: 3,
    getMessage: async (key) => {
      return {
        conversation: 'Mensaje no disponible'
      };
    }
  });

  socket.ev.on('creds.update', saveCreds);
  
  // ✅ CRÍTICO: Guardar datos en userSockets ANTES de registrar event handlers
  // Esto asegura que cuando se disparen los eventos, los datos ya estén disponibles
  const userData = {
    socket: socket,
    isReady: false,
    currentQR: null,
    whatsappId: null,
    whatsappNumber: null,
    qrScannedBy: userId // Marcar que este QR pertenece a este usuario
  };
  userSockets.set(userId, userData);
  
  // ✅ NUEVO FLUJO: Validar sesión restaurada SOLO para lectura, NO para actualizar BD
  // Si hay sesión restaurada, validar que pertenece a este usuario
  // Si NO pertenece, destruirla y forzar nuevo QR
  setTimeout(async () => {
    const userDataCheck = userSockets.get(userId);
    if (userDataCheck && userDataCheck.socket && userDataCheck.socket.user) {
      const fullId = userDataCheck.socket.user.id;
      const whatsappIdFromSession = fullId.split(':')[0].split('@')[0];
      
      // ✅ Validar que este whatsapp_id pertenece a este usuario, o asignarlo si es la primera vez
      const db = getDb();
      db.get(
        'SELECT id, whatsapp_id FROM users WHERE id = ?',
        [userId],
        (err, userRow) => {
          db.close();
          
          if (err) {
            console.error(`❌ [Usuario ${userId}] Error validando sesión restaurada:`, err);
            destroyInvalidSession(userId);
            return;
          }
          
          const belongsToUser = userRow && userRow.whatsapp_id === whatsappIdFromSession;
          if (belongsToUser) {
            // ✅ Sesión válida: ya vinculada a este usuario
            console.log(`✅ [Usuario ${userId}] Sesión restaurada válida - pertenece a este usuario`);
            userDataCheck.isReady = true;
            userDataCheck.currentQR = null;
            userDataCheck.whatsappId = whatsappIdFromSession;
            updateWhatsAppSessionsOnRestore(userId, whatsappIdFromSession);
            return;
          }
          
          // Primera vez tras escanear: users.whatsapp_id aún no está; asignar y aceptar sesión
          if (userRow && (userRow.whatsapp_id == null || userRow.whatsapp_id === '')) {
            const db2 = getDb();
            db2.run(
              'UPDATE users SET whatsapp_id = ?, whatsapp_number = ? WHERE id = ?',
              [whatsappIdFromSession, whatsappIdFromSession, userId],
              function(updateErr) {
                db2.close();
                if (updateErr) {
                  console.error(`❌ [Usuario ${userId}] Error asignando whatsapp_id en restauración:`, updateErr);
                  destroyInvalidSession(userId);
                  return;
                }
                console.log(`✅ [Usuario ${userId}] Sesión restaurada - whatsapp_id asignado por primera vez: ${whatsappIdFromSession}`);
                userDataCheck.isReady = true;
                userDataCheck.currentQR = null;
                userDataCheck.whatsappId = whatsappIdFromSession;
                updateWhatsAppSessionsOnRestore(userId, whatsappIdFromSession);
              }
            );
            return;
          }
          
          // whatsapp_id asignado a otro usuario: invalidar sesión
          console.error(`❌ [Usuario ${userId}] Sesión restaurada NO válida - whatsapp_id ${whatsappIdFromSession} no pertenece a este usuario`);
          destroyInvalidSession(userId);
        }
      );
    }
  }, 3000);

  // ✅ REFACTORIZADO: Manejo de QR y conexión específico por usuario
  socket.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    let userData = userSockets.get(userId);

    // Si no hay userData, intentar obtenerlo nuevamente (puede haberse actualizado)
    if (!userData) {
      console.warn(`⚠️ [Usuario ${userId}] No se encontró userData en connection.update, intentando obtener nuevamente...`);
      userData = userSockets.get(userId);
      if (!userData) {
        console.error(`❌ [Usuario ${userId}] Error: No se encontró datos para usuario después de reintento`);
        return;
      }
    }

    // Generar QR si está disponible
    if (qr) {
      QRCode.toDataURL(qr, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1
      }).then((dataUrl) => {
        userData.currentQR = dataUrl;
        userData.qrScannedBy = userId;
      }).catch((err) => {
        console.error(`❌ [Usuario ${userId}] Error generando QR:`, err);
        userData.currentQR = null;
      });
    } else {
      // Si no hay QR y no está conectado, limpiar QR anterior
      if (connection !== 'open' && !userData.isReady) {
        // Si está en estado 'connecting' y no hay QR después de un tiempo, puede necesitar forzar QR
        if (connection === 'connecting') {
          // Timeout opcional
        }
        userData.currentQR = null;
      }
    }

    // ✅ REFACTORIZADO: Manejar estado de conexión específico por usuario
    if (connection === 'close') {
      const error = lastDisconnect?.error;
      const statusCode = error?.output?.statusCode;
      const errorMessage = error?.message || error?.toString() || '';
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      userData.isReady = false;
      // ✅ CRÍTICO: Limpiar referencia al socket para que el estado se actualice correctamente
      // Esto asegura que las verificaciones posteriores detecten que está desconectado
      if (userData.socket) {
        try {
          // No cerrar aquí, solo marcar como desconectado
          // El socket se cerrará automáticamente por Baileys
        } catch (err) {
          console.error(`[Usuario ${userId}] Error manejando socket en close:`, err);
        }
      }
      
      // ✅ ACTUALIZAR estado de conexión en whatsapp_sessions a 'disconnected'
      // Esto permite que el panel de administración muestre el estado correcto
      const db = getDb();
      db.run(
        `UPDATE whatsapp_sessions 
         SET status = 'disconnected' 
         WHERE user_id = ?`,
        [userId],
        (updateErr) => {
          db.close();
          if (updateErr) {
            console.error(`❌ [Usuario ${userId}] Error actualizando estado desconectado en whatsapp_sessions:`, updateErr);
          }
        }
      );
      
      // Detectar errores específicos que requieren limpiar sesión
      // NOTA: "restart required" (515) puede ser temporal, no siempre requiere limpiar sesión
      // Solo limpiar si es un error crítico de autenticación o sesión corrupta
      const needsSessionCleanup = 
        statusCode === 401 || 
        statusCode === DisconnectReason.badSession ||
        (statusCode === DisconnectReason.restartRequired && errorMessage.includes('conflict')) ||
        errorMessage.includes('conflict') ||
        (errorMessage.includes('Stream Errored') && errorMessage.includes('conflict'));
      
      // Para "restart required" sin conflicto, solo reconectar sin limpiar sesión
      const isRestartRequired = 
        statusCode === DisconnectReason.restartRequired ||
        (errorMessage.includes('restart required') && !errorMessage.includes('conflict'));
      
      if (needsSessionCleanup) {
        console.log(`⚠️ [Usuario ${userId}] Error crítico detectado que requiere limpiar sesión. Eliminando sesión para generar nuevo QR...`);
        console.log(`⚠️ [Usuario ${userId}] Detalles del error - StatusCode: ${statusCode}, Message: ${errorMessage}`);
        userData.currentQR = null;
        userData.isReady = false;
        
        // Cerrar socket actual si existe
        if (userData.socket) {
          try {
            userData.socket.end();
            userData.socket = null;
          } catch (err) {
            console.error(`[Usuario ${userId}] Error cerrando socket:`, err);
          }
        }
        
        // Limpiar sesión corrupta específica del usuario
        const fs = require('fs');
        const authDir = path.join(__dirname, 'baileys_auth', `user_${userId}`);
        try {
          // Eliminar creds.json si existe
          const credsPath = path.join(authDir, 'creds.json');
          if (fs.existsSync(credsPath)) {
            fs.unlinkSync(credsPath);
          }
          
          // Limpiar también otros archivos de sesión críticos
          if (fs.existsSync(authDir)) {
            const files = fs.readdirSync(authDir);
            const criticalFiles = files.filter(f => 
              f.startsWith('app-state-sync-key-') || 
              f.startsWith('app-state-sync-version-') ||
              f.startsWith('pre-key-') ||
              f.startsWith('session-') ||
              f.startsWith('sender-key-')
            );
            
            if (criticalFiles.length > 0) {
              criticalFiles.forEach(file => {
                try {
                  fs.unlinkSync(path.join(authDir, file));
                } catch (err) {
                  console.error(`[Usuario ${userId}] Error eliminando ${file}:`, err);
                }
              });
            }
          }
          
        } catch (err) {
          console.error(`[Usuario ${userId}] Error eliminando sesión:`, err);
        }
        
        // Esperar un poco antes de reinicializar para asegurar que se genere QR
        setTimeout(() => {
          // ✅ CRÍTICO: Verificar que no haya otro socket ya inicializándose
          const checkUserData = userSockets.get(userId);
          if (!checkUserData || !checkUserData.socket) {
            initializeWhatsApp(userId);
          }
        }, 5000); // Aumentar tiempo de espera para asegurar limpieza completa
      } else if (isRestartRequired) {
        userData.currentQR = null;
        setTimeout(() => {
          const checkUserData = userSockets.get(userId);
          if (!checkUserData || !checkUserData.socket) {
            initializeWhatsApp(userId);
          }
        }, 8000);
      } else if (shouldReconnect) {
        userData.currentQR = null;
        const currentUserData = userSockets.get(userId);
        if (currentUserData && currentUserData.socket) {
          return;
        }
        const waitTime = statusCode === 428 ? 15000 : 5000;
        setTimeout(() => {
          const checkUserData = userSockets.get(userId);
          if (!checkUserData || !checkUserData.socket) {
            initializeWhatsApp(userId);
          }
        }, waitTime);
      } else {
        userData.currentQR = null;
        console.warn(`⚠️ [Usuario ${userId}] No se puede reconectar. Usa /api/force-qr para nuevo QR.`);
      }
    } else if (connection === 'open') {
      userData.isReady = true;
      userData.currentQR = null;
      
      // ⚠️ PROHIBIDO: NO actualizar users aquí
      // Los event handlers NO deben actualizar users.whatsapp_id o users.whatsapp_number
      // La actualización de users SOLO ocurre cuando el usuario llama explícitamente a /api/link-phone
      try {
        const fullId = userData.socket.user?.id || null;
        if (fullId) {
          const whatsappId = fullId.split(':')[0].split('@')[0];
          userData.whatsappId = whatsappId;
          
          // ⚠️ CRÍTICO: whatsapp_number NO viene de socket.user.id
          // El número real del teléfono debe obtenerse de otra forma
          // Por ahora, se deja null y se espera que venga en /api/link-phone
          // O se puede intentar obtener desde socket.user si hay algún campo disponible
          // NOTA: socket.user.id contiene el ID de WhatsApp, NO el número real del teléfono
          userData.whatsappNumber = null;
          
          const db = getDb();
          const formattedNumberForSession = `${whatsappId}@s.whatsapp.net`;

          // 1) Actualizar o crear whatsapp_sessions
          db.get(
            'SELECT id FROM whatsapp_sessions WHERE user_id = ?',
            [userId],
            (err, sessionRow) => {
              if (err) {
                db.close();
                console.error(`❌ [Usuario ${userId}] Error verificando sesión en whatsapp_sessions:`, err);
                return;
              }

              const runAfterSession = () => {
                // 2) Actualizar users.whatsapp_id (y whatsapp_number con el mismo valor para que persista sesión y se vea en gestión)
                // Así la sesión restaurada pasa la validación y no se pide QR de nuevo
                const db2 = getDb();
                db2.run(
                  'UPDATE users SET whatsapp_id = ?, whatsapp_number = ? WHERE id = ?',
                  [whatsappId, whatsappId, userId],
                  function(updateUserErr) {
                    db2.close();
                    if (updateUserErr) {
                      console.error(`❌ [Usuario ${userId}] Error actualizando users (whatsapp_id/whatsapp_number):`, updateUserErr);
                    } else {
                      console.log(`✅ [Usuario ${userId}] users actualizado - whatsapp_id: ${whatsappId}, whatsapp_number: ${whatsappId}`);
                    }
                  }
                );
              };

              if (sessionRow) {
                db.run(
                  `UPDATE whatsapp_sessions 
                   SET status = 'connected', connected_at = ?, phone_number = ?
                   WHERE user_id = ?`,
                  [getParaguayDateTime(), formattedNumberForSession, userId],
                  function(updateErr) {
                    if (updateErr) {
                      console.error(`❌ [Usuario ${userId}] Error actualizando estado en whatsapp_sessions:`, updateErr);
                    } else {
                      console.log(`✅ [Usuario ${userId}] Estado de conexión actualizado en whatsapp_sessions: connected`);
                    }
                    db.close();
                    runAfterSession();
                  }
                );
              } else {
                db.run(
                  `INSERT INTO whatsapp_sessions (user_id, phone_number, status, connected_at) 
                   VALUES (?, ?, 'connected', ?)`,
                  [userId, formattedNumberForSession, getParaguayDateTime()],
                  function(insertErr) {
                    if (insertErr) {
                      console.error(`❌ [Usuario ${userId}] Error creando sesión en whatsapp_sessions:`, insertErr);
                    } else {
                      console.log(`✅ [Usuario ${userId}] Nueva sesión creada en whatsapp_sessions: connected`);
                    }
                    db.close();
                    runAfterSession();
                  }
                );
              }
            }
          );
        } else {
          console.warn(`⚠️ [Usuario ${userId}] No se pudo obtener el ID de WhatsApp desde socket.user`);
          userData.whatsappId = null;
          userData.whatsappNumber = null;
        }
      } catch (err) {
        console.error(`❌ [Usuario ${userId}] Error procesando conexión:`, err);
        userData.whatsappId = null;
        userData.whatsappNumber = null;
      }
    } else if (connection === 'connecting') {
      setTimeout(() => {
        if (!userData.isReady && !userData.currentQR && connection === 'connecting') {
          // Timeout opcional para forzar QR si tarda mucho
        }
      }, 10000);
    }
  });

  // LÓGICA PRINCIPAL: el usuario vinculado se identifica por el SOCKET que recibe el mensaje (un socket por usuario).
  socket.ev.on('messages.upsert', async (m) => {
    const messages = m.messages;
    
    for (const msg of messages) {
      // Ignorar mensajes propios
      if (msg.key.fromMe) {
        continue;
      }

      // Ignorar mensajes de grupos si está configurado
      if (quivrConfig.ignoreGroups && msg.key.remoteJid?.includes('@g.us')) {
        continue;
      }

      const from = msg.key.remoteJid;
      if (!from) continue;

      // ---------- FLUJO OCR COMPROBANTES: imagen de usuario OCR/OpenAi ----------
      if (msg.message && msg.message.imageMessage) {
        const tipoUsuario = await getUserTipoUsuario(userId);
        if (tipoUsuario === 'OCR/OpenAi') {
          writeToLogFile(`[Usuario ${userId}] Imagen recibida (OCR/OpenAi) de ${from}`);
          try {
            const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: socket.updateMediaMessage });
            if (!buffer || !Buffer.isBuffer(buffer)) {
              throw new Error('No se pudo descargar la imagen');
            }
            const caption = (msg.message.imageMessage.caption || '').trim() || null;
            const result = await processImageForComprobante(buffer, userId, caption);
            const replyText = [
              '✅ Comprobante registrado.',
              `Fecha: ${result.fechaComprobante || '-'}`,
              `Número: ${result.numeroComprobante || '-'}`,
              `Importe: ${result.importe != null ? result.importe : '-'}`,
              `Descripción: ${result.descripcion || '-'}`
            ].join('\n');
            const userData = userSockets.get(userId);
            if (userData && userData.socket && userData.isReady) {
              await userData.socket.sendMessage(from, { text: replyText });
              writeToLogFile(`[Usuario ${userId}] Respuesta OCR enviada a ${from}`);
            }
          } catch (ocrErr) {
            console.error('❌ Error OCR comprobante:', ocrErr.message);
            writeToLogFile(`[Usuario ${userId}] Error OCR: ${ocrErr.message}`);
            const userData = userSockets.get(userId);
            const errorReply = 'No pude procesar la imagen como comprobante. Verifica que sea legible y que tengas configurada la API key de OpenAI.';
            if (userData && userData.socket && userData.isReady) {
              await userData.socket.sendMessage(from, { text: errorReply });
            }
          }
          continue;
        }
      }

      // Solo procesar mensajes con texto
      if (!msg.message || (!msg.message.conversation && !msg.message.extendedTextMessage)) {
        continue;
      }

      const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

      if (!messageText) {
        continue;
      }

      writeToLogFile(`[Usuario ${userId}] MENSAJE RECIBIDO de ${from}: ${(messageText || '').substring(0, 80)}`);

      // Enviar a webhooks
      for (const webhook of webhooks) {
        try {
          await axios.post(webhook.url, {
            from: from,
            body: messageText,
            timestamp: msg.messageTimestamp,
            isGroupMsg: from?.includes('@g.us') || false
          }, {
            headers: webhook.headers || {},
            timeout: 10000
          });
        } catch (error) {
          console.error(`Error enviando webhook a ${webhook.url}:`, error.message);
        }
      }

      // ✅ REFACTORIZADO: Si Quivr está habilitado, procesar mensaje con aislamiento por usuario
      // El mensaje llegó al socket del usuario ${userId}, así que el procesamiento es para ese usuario
      if (quivrConfig.enabled && messageText.trim().length > 0) {
        console.log(`📨 [Usuario ${userId}] Procesando mensaje con aislamiento por usuario`);
        console.log(`📱 [Usuario ${userId}] Número de teléfono del remitente:`, from);

        try {
          // Identidad del usuario: viene del socket que recibió el mensaje (userId en este closure).
          // Varios usuarios = varios sockets; cada mensaje llega solo al socket de la cuenta correspondiente.
          let messageUserId = userId;

          // Validación cruzada: comprobar que "from" coincide con este usuario en BD (whatsapp_number/whatsapp_id).
          // Si "from" es @lid (dispositivo vinculado), no estará en BD → se acepta igual porque el socket ya identifica al usuario.
          const dbValidation = getDb();
          const normalizedFrom = normalizePhoneNumber(from);
          const validationResult = await new Promise((resolve) => {
            dbValidation.get(
              `SELECT id FROM users 
               WHERE id = ? 
               AND (whatsapp_number = ? OR whatsapp_number = ? OR whatsapp_id = ? OR whatsapp_id LIKE ?)`,
              [userId, normalizedFrom, from, normalizedFrom, `%${normalizedFrom}%`],
              (err, userRow) => {
                dbValidation.close();
                if (err || !userRow || userRow.id !== userId) {
                  resolve(false);
                } else {
                  resolve(true);
                }
              }
            );
          });

          if (validationResult) {
            // "from" coincide en BD con este usuario.
            messageUserId = userId;
          } else if (typeof from === 'string' && from.endsWith('@lid')) {
            // Mensaje desde dispositivo vinculado (@lid): "from" no está en BD, pero el mensaje llegó a ESTE socket,
            // por tanto pertenece a este usuario vinculado (misma cuenta, otro dispositivo).
            messageUserId = userId;
            } else {
              const foundUserId = await getUserFromPhoneNumber(from);
              if (foundUserId && foundUserId === userId) {
              messageUserId = userId;
            } else if (foundUserId && foundUserId !== userId) {
              // El número corresponde a OTRO usuario - NO responder (aislamiento estricto)
              console.error(`❌ [Usuario ${userId}] El número del remitente corresponde a otro usuario (${foundUserId}). NO responder.`);
              continue;
            } else {
              // No se encontró usuario - NO responder (aislamiento estricto)
              console.error(`❌ [Usuario ${userId}] No se encontró usuario asociado al número del remitente: ${from}`);
              console.error('⚠️ El número debe estar explícitamente vinculado a un usuario');
              continue;
            }
          }
          
          // Usar el userId validado
          userId = messageUserId;
          
          // PASO 2: Obtener token del usuario
          const userToken = await getUserToken(userId);
          
          if (!userToken) {
            console.error('❌ No se encontró token para el usuario:', userId);
            // NO responder si no hay token (aislamiento estricto)
            continue;
          }

          const realPhoneNumber = await getUserRealPhoneNumber(userId);

          const db = getDb();
          const whatsappId = await new Promise((resolve) => {
            db.get('SELECT whatsapp_id FROM users WHERE id = ?', [userId], (err, row) => {
              db.close();
              if (err || !row || !row.whatsapp_id) {
                const normalizedFrom = normalizePhoneNumber(from);
                resolve(normalizedFrom || null);
              } else {
                resolve(row.whatsapp_id);
              }
            });
          });

          const conversationId = await getOrCreateWhatsAppConversation(userId, from);

          await saveMessage(conversationId, userId, 'user', messageText, realPhoneNumber || null, whatsappId || null);

          let answer = null;
          try {
            answer = await queryQuivr(messageText, userToken, conversationId);
          } catch (quivrError) {
            console.error('❌ Error consultando Quivr:', quivrError.message);
            // NO usar fallback - lanzar error
            answer = `Lo siento, ocurrió un error al procesar tu mensaje. Por favor, intenta de nuevo.`;
            // Guardar error en BD también - usar número real del usuario y ID de WhatsApp
            await saveMessage(conversationId, userId, 'assistant', answer, realPhoneNumber || null, whatsappId || null).catch(err => {
              console.error('Error guardando mensaje de error:', err);
            });
          }

          // PASO 6: Guardar respuesta del asistente en BD y auditoría
          // IMPORTANTE: Guardar tanto el ID de WhatsApp como el número real
          if (answer) {
            await saveMessage(conversationId, userId, 'assistant', answer, realPhoneNumber || null, whatsappId || null);
          }

          // PASO 7: Enviar respuesta por WhatsApp
          if (answer && from) {
            let chatId = null; // declarado fuera del try para que esté en scope en el catch
            try {
              // Siempre responder al remitente (from): al número que escribió, no al número vinculado.
              // El número vinculado (595986782672) es la cuenta que recibe; el "from" es quien envió el mensaje.
              chatId = from;

              const numberPartForLog = from && typeof from === 'string' ? from.split('@')[0].split(':')[0] : from;

              // ✅ CRÍTICO: Usar directamente el socket del usuario que recibió el mensaje
              // El mensaje llegó al socket del usuario ${userId}, así que usamos ese socket directamente
              const userDataForResponse = userSockets.get(userId);
              
              if (!userDataForResponse || !userDataForResponse.socket) {
                console.error(`❌ [Usuario ${userId}] No se encontró socket para enviar respuesta`);
                throw new Error('Socket no encontrado para este usuario');
              }
              
              // Verificar que el socket esté listo antes de enviar
              if (!userDataForResponse.isReady) {
                console.error(`❌ [Usuario ${userId}] Socket no está listo para enviar mensajes (isReady: ${userDataForResponse.isReady})`);
                throw new Error('Socket no está listo');
              }

              writeToLogFile(`[Usuario ${userId}] Intentando responder a: ${chatId} (remitente: ${from})`);
              await userDataForResponse.socket.sendMessage(chatId, { text: answer });
              writeToLogFile(`[Usuario ${userId}] Mensaje enviado OK a: ${chatId}`);
            } catch (sendError) {
              writeToLogFile(`[Usuario ${userId}] ERROR al enviar: ${sendError.message} | ChatId: ${chatId || 'N/A'} | from: ${from}`);
              console.error('❌ Error al enviar mensaje:', sendError.message);
              console.error('❌ Detalles del error:', sendError);
              console.error('❌ Formato original (from):', from);
              console.error('❌ ChatId usado:', chatId || 'N/A');
              console.error('❌ whatsapp_id del usuario:', whatsappId || 'No disponible');
              console.error('❌ whatsapp_number del usuario:', realPhoneNumber || 'No disponible');
              
              // Intentar con formato alternativo si falla
              if (sendError.message.includes('No sessions') || sendError.message.includes('session')) {
                try {
                  // ✅ CRÍTICO: Usar directamente el socket del usuario que recibió el mensaje
                  const userDataForRetry = userSockets.get(userId);
                  
                  if (userDataForRetry && userDataForRetry.socket && userDataForRetry.isReady) {
                    // Extraer solo el número (sin sufijos)
                    const numberPart = from.split('@')[0].split(':')[0];
                    const alternativeChatId = `${numberPart}@s.whatsapp.net`;
                    await userDataForRetry.socket.sendMessage(alternativeChatId, { text: answer });
                  } else {
                    console.error(`❌ [Usuario ${userId}] Socket no disponible para reintento`);
                  }
                } catch (retryError) {
                  console.error(`❌ [Usuario ${userId}] Error en reintento:`, retryError.message);
                  console.error('❌ Esto puede indicar que el número no está en la lista de contactos o hay un problema de sesión');
                }
              }
            }
          }
        } catch (error) {
          console.error('❌ Error en el procesamiento del mensaje:', error);
          console.error('❌ Stack:', error.stack);
          // NO responder si hay error (aislamiento estricto - no fallback)
        }
      }
    }
  });
}

// ✅ FUNCIÓN HELPER: Validar sesión y retornar estado
function validateAndReturnStatus(userId, userData, res) {
  if (!userData.socket || !userData.socket.user) {
    return res.json({ 
      qr: null, 
      ready: false,
      message: 'QR aún no disponible, esperando...' 
    });
  }
  
  const fullId = userData.socket.user.id;
  const whatsappIdFromSession = fullId.split(':')[0].split('@')[0];
  
  // ✅ CRÍTICO: Verificar tanto en users como en whatsapp_sessions
  // Esto asegura que se reconozca la conexión incluso si users.whatsapp_id aún no está actualizado
  const db = getDb();
  
  // Primero verificar en whatsapp_sessions (más confiable para estado de conexión)
  db.get(
    'SELECT user_id, status FROM whatsapp_sessions WHERE user_id = ? AND status = ?',
    [userId, 'connected'],
    (err, sessionRow) => {
      if (!err && sessionRow && sessionRow.user_id === userId && sessionRow.status === 'connected') {
        // ✅ Usuario está conectado según whatsapp_sessions
        console.log(`✅ [Usuario ${userId}] Sesión válida - conectado según whatsapp_sessions`);
        db.close();
        return res.json({ 
          qr: null, 
          ready: true,
          message: 'Ya está conectado' 
        });
      } else {
        // Si no está en whatsapp_sessions, verificar en users como fallback
        db.get(
          'SELECT id, whatsapp_id FROM users WHERE id = ? AND whatsapp_id = ?',
          [userId, whatsappIdFromSession],
          (err2, userRow) => {
            db.close();
            
            if (!err2 && userRow && userRow.id === userId && userRow.whatsapp_id === whatsappIdFromSession) {
              // ✅ Sesión válida según users
              console.log(`✅ [Usuario ${userId}] Sesión válida - conectado según users`);
              return res.json({ 
                qr: null, 
                ready: true,
                message: 'Ya está conectado' 
              });
            } else {
              // ❌ Sesión inválida - destruir y forzar nuevo QR
              console.error(`❌ [Usuario ${userId}] Sesión NO pertenece a este usuario - destruyendo`);
              destroyInvalidSession(userId);
              // Reinicializar para generar nuevo QR
              setTimeout(async () => {
                await initializeWhatsApp(userId);
              }, 1000);
              return res.json({ 
                qr: null, 
                ready: false,
                message: 'QR aún no disponible, esperando...' 
              });
            }
          }
        );
      }
    }
  );
}

// ✅ Actualizar whatsapp_sessions al restaurar sesión (para no duplicar lógica)
function updateWhatsAppSessionsOnRestore(userId, whatsappIdFromSession) {
  const formattedNumberForSession = `${whatsappIdFromSession}@s.whatsapp.net`;
  const db = getDb();
  db.get('SELECT id FROM whatsapp_sessions WHERE user_id = ?', [userId], (err2, sessionRow) => {
    if (err2) {
      db.close();
      console.error(`❌ [Usuario ${userId}] Error verificando sesión en whatsapp_sessions:`, err2);
      return;
    }
    if (sessionRow) {
      db.run(
        `UPDATE whatsapp_sessions SET status = 'connected', connected_at = ?, phone_number = ? WHERE user_id = ?`,
        [getParaguayDateTime(), formattedNumberForSession, userId],
        (updateErr) => {
          db.close();
          if (updateErr) {
            console.error(`❌ [Usuario ${userId}] Error actualizando estado en whatsapp_sessions:`, updateErr);
          } else {
            console.log(`✅ [Usuario ${userId}] Estado actualizado en whatsapp_sessions: connected (sesión restaurada)`);
          }
        }
      );
    } else {
      db.run(
        `INSERT INTO whatsapp_sessions (user_id, phone_number, status, connected_at) VALUES (?, ?, 'connected', ?)`,
        [userId, formattedNumberForSession, getParaguayDateTime()],
        (insertErr) => {
          db.close();
          if (insertErr) {
            console.error(`❌ [Usuario ${userId}] Error creando sesión en whatsapp_sessions:`, insertErr);
          } else {
            console.log(`✅ [Usuario ${userId}] Sesión creada en whatsapp_sessions: connected (sesión restaurada)`);
          }
        }
      );
    }
  });
}

// ✅ FUNCIÓN HELPER: Destruir sesión inválida
function destroyInvalidSession(userId) {
  const userData = userSockets.get(userId);
  if (userData && userData.socket) {
    try {
      userData.socket.end();
    } catch (err) {
      console.error(`[Usuario ${userId}] Error cerrando socket:`, err);
    }
  }
  userSockets.delete(userId);
  
  // Limpiar directorio de autenticación
  const fs = require('fs');
  const authDir = path.join(__dirname, 'baileys_auth', `user_${userId}`);
  try {
    const credsPath = path.join(authDir, 'creds.json');
    if (fs.existsSync(credsPath)) {
      fs.unlinkSync(credsPath);
      console.log(`✅ [Usuario ${userId}] Sesión inválida eliminada`);
    }
  } catch (cleanErr) {
    console.error(`[Usuario ${userId}] Error limpiando sesión:`, cleanErr);
  }
}

// ✅ ÚNICA FUNCIÓN QUE ACTUALIZA users: Se llama SOLO en connection.open
function updateUsersTableOnConnection(userId, whatsappId) {
  const db = getDb();
  
  // Validar que este whatsapp_id NO esté asignado a otro usuario
  db.get(
    'SELECT id, username FROM users WHERE whatsapp_id = ? AND id != ?',
    [whatsappId, userId],
    (checkErr, existingUser) => {
      if (checkErr) {
        db.close();
        console.error(`❌ [Usuario ${userId}] Error validando whatsapp_id:`, checkErr);
        return;
      }
      
      if (existingUser) {
        db.close();
        console.error(`❌ [Usuario ${userId}] ERROR: whatsapp_id ${whatsappId} ya está asignado al usuario ${existingUser.id} (${existingUser.username})`);
        console.error(`❌ [Usuario ${userId}] NO se puede actualizar users - WhatsApp pertenece a otro usuario`);
        return;
      }
      
      // ✅ Actualizar users SOLO para este userId
      // whatsapp_number se puede obtener más tarde, por ahora solo whatsapp_id
      db.run(
        'UPDATE users SET whatsapp_id = ? WHERE id = ?',
        [whatsappId, userId],
        function(updateErr) {
          db.close();
          if (updateErr) {
            console.error(`❌ [Usuario ${userId}] Error actualizando users:`, updateErr);
          } else {
            console.log(`✅ [Usuario ${userId}] users actualizado - whatsapp_id: ${whatsappId}`);
          }
        }
      );
    }
  );
}

// ==================== RUTAS API ====================

// ✅ NUEVO FLUJO: Estado del cliente por usuario - SOLO LECTURA, NO ACTUALIZA BD
app.get('/api/status', async (req, res) => {
  try {
    // Obtener token de los headers
    const authHeader = req.headers.authorization || req.headers['x-auth-token'];
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null;
    
    if (!token) {
      return res.status(401).json({ error: 'Token de autenticación requerido' });
    }
    
    // Obtener user_id desde el token
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: 'Token inválido o usuario no encontrado' });
    }
    
    // Solo lectura de estado
    const db = getDb();
    
    // Buscar datos del usuario en la BD (SOLO LECTURA)
    db.get(
      'SELECT whatsapp_id, whatsapp_number FROM users WHERE id = ?',
      [userId],
      (err, userRow) => {
        db.close();
        
        if (err) {
          console.error(`❌ [Usuario ${userId}] Error obteniendo estado:`, err);
          return res.status(500).json({ error: 'Error al obtener estado' });
        }
        
        // Obtener datos del socket del usuario (SOLO LECTURA)
        const userData = userSockets.get(userId);
        
        // ✅ Verificación más robusta del estado de conexión
        const socketExists = userData && userData.socket && typeof userData.socket === 'object';
        const socketHasUser = socketExists && !!userData.socket.user; // ✅ CRÍTICO: Convertir a booleano
        const isActuallyReady = !!(userData && userData.isReady && socketExists && socketHasUser); // ✅ CRÍTICO: Asegurar que sea booleano
        
        // ✅ Verificar también el estado en whatsapp_sessions
        const db3 = getDb();
        db3.get(
          'SELECT status FROM whatsapp_sessions WHERE user_id = ?',
          [userId],
          (err3, sessionRow) => {
            db3.close();
            
            const isConnectedFromDB = sessionRow && sessionRow.status === 'connected';
            
            // ✅ CRÍTICO: Si está conectado en BD pero el socket no está listo, verificar si el socket está activo
            // Esto evita que el estado "pestañee" entre conectado y desconectado
            let isActuallyConnected = isActuallyReady || isConnectedFromDB;
            
            // Si está conectado en BD pero el socket no está listo, verificar si el socket existe y está activo
            if (isConnectedFromDB && !isActuallyReady && socketExists) {
              isActuallyConnected = true;
            }
            
            // ✅ CRÍTICO: Si está conectado en BD, siempre retornar connected=true
            // Esto evita el "pestañeo" cuando el socket está reconectando
            if (isConnectedFromDB) {
              isActuallyConnected = true;
            }
            
            let status = {
              ready: isActuallyReady || false,
              connected: isActuallyConnected || false,
              whatsapp_id: userRow ? userRow.whatsapp_id : null,
              whatsapp_number: userRow ? userRow.whatsapp_number : null
            };
            
            res.json(status);
          }
        );
      }
    );
  } catch (error) {
    console.error('Error en /api/status:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Endpoint para obtener estado de todos los usuarios (solo admin)
app.get('/api/status/all', async (req, res) => {
  try {
    // Obtener token de los headers
    const authHeader = req.headers.authorization || req.headers['x-auth-token'];
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null;
    
    if (!token) {
      return res.status(401).json({ error: 'Token de autenticación requerido' });
    }
    
    // Obtener user_id desde el token
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: 'Token inválido o usuario no encontrado' });
    }
    
    // Verificar que el usuario es admin
    const db = getDb();
    db.get(
      'SELECT role FROM users WHERE id = ?',
      [userId],
      (err, userRow) => {
        db.close();
        
        if (err || !userRow) {
          return res.status(401).json({ error: 'Usuario no encontrado' });
        }
        
        if (userRow.role !== 'admin') {
          return res.status(403).json({ error: 'Acceso denegado. Solo administradores pueden ver el estado de todos los usuarios.' });
        }
        
        // Obtener todos los usuarios con sus estados de WhatsApp
        const db2 = getDb();
        db2.all(
          'SELECT id, whatsapp_id, whatsapp_number FROM users WHERE id IS NOT NULL',
          [],
          (err2, users) => {
            db2.close();
            
            if (err2) {
              console.error('Error obteniendo usuarios:', err2);
              return res.status(500).json({ error: 'Error al obtener usuarios' });
            }
            
            // Mapear usuarios con su estado de conexión
            // Obtener estados de whatsapp_sessions para verificación adicional
            const db3 = getDb();
            db3.all(
              'SELECT user_id, status FROM whatsapp_sessions WHERE user_id IS NOT NULL',
              [],
              (err3, sessions) => {
                db3.close();
                
                const sessionStatusMap = {};
                if (!err3 && sessions) {
                  sessions.forEach(session => {
                    sessionStatusMap[session.user_id] = session.status === 'connected';
                  });
                }
                
                const usersStatus = users.map(user => {
                  const userData = userSockets.get(user.id);
                  
                  // ✅ Verificación más robusta del estado de conexión
                  const socketExists = userData && userData.socket && typeof userData.socket === 'object';
                  const socketHasUser = socketExists && userData.socket.user;
                  const isConnectedFromSocket = userData && userData.isReady && socketExists && socketHasUser;
                  
                  // ✅ Verificar también el estado en whatsapp_sessions
                  const isConnectedFromDB = sessionStatusMap[user.id] === true;
                  
                  // El usuario está conectado si cualquiera de las dos fuentes indica conexión
                  const isConnected = isConnectedFromSocket || isConnectedFromDB;
                  
                  return {
                    user_id: user.id,
                    whatsapp_id: user.whatsapp_id || null,
                    whatsapp_number: user.whatsapp_number || null,
                    connected: isConnected || false,
                    ready: userData ? userData.isReady : false
                  };
                });
                
                res.json({ users: usersStatus });
              }
            );
          }
        );
      }
    );
  } catch (error) {
    console.error('Error en /api/status/all:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ REFACTORIZADO: Enviar mensaje usando socket del usuario autenticado
app.post('/api/send-message', async (req, res) => {
  try {
    // Obtener token de los headers
    const authHeader = req.headers.authorization || req.headers['x-auth-token'];
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null;
    
    if (!token) {
      return res.status(401).json({ error: 'Token de autenticación requerido' });
    }
    
    // Obtener user_id desde el token
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: 'Token inválido o usuario no encontrado' });
    }
    
    const { number, message } = req.body;

    if (!number || !message) {
      return res.status(400).json({ error: 'Se requieren number y message' });
    }
    
    // Obtener socket del usuario
    const userData = userSockets.get(userId);
    if (!userData || !userData.socket || !userData.isReady) {
      return res.status(503).json({ error: 'WhatsApp no está conectado para este usuario' });
    }

    try {
      let chatId = number;
      if (!chatId.includes('@')) {
        chatId = `${chatId}@s.whatsapp.net`;
      }

      await userData.socket.sendMessage(chatId, { text: message });
      
      res.json({
        success: true,
        message: 'Mensaje enviado'
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener QR
// ✅ REFACTORIZADO: Generar QR en el contexto del usuario autenticado
app.get('/api/qr', async (req, res) => {
  try {
    // Obtener token de los headers
    const authHeader = req.headers.authorization || req.headers['x-auth-token'];
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null;
    
    if (!token) {
      return res.status(401).json({ error: 'Token de autenticación requerido' });
    }
    
    // Obtener user_id desde el token
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: 'Token inválido o usuario no encontrado' });
    }
    
    console.log(`📱 [Usuario ${userId}] Solicitud de QR`);
    
    // ✅ CRÍTICO: Verificar estado de conexión desde whatsapp_sessions ANTES de generar QR
    // Si el usuario ya está conectado, no generar un nuevo QR
    const db = getDb();
    const sessionStatus = await new Promise((resolve) => {
      db.get(
        'SELECT status FROM whatsapp_sessions WHERE user_id = ?',
        [userId],
        (err, sessionRow) => {
          db.close();
          if (err) {
            console.error(`❌ [Usuario ${userId}] Error verificando estado en whatsapp_sessions:`, err);
            resolve(null);
          } else {
            resolve(sessionRow ? sessionRow.status : null);
          }
        }
      );
    });
    
    const isConnectedInDB = sessionStatus === 'connected';
    
    if (isConnectedInDB) {
      console.log(`🔍 [Usuario ${userId}] Sesión encontrada en BD con estado 'connected', verificando socket...`);
      
      // Obtener datos del usuario
      let userData = userSockets.get(userId);
      
      // ✅ CRÍTICO: Si hay userData activo, verificar primero si está realmente conectado
      if (userData) {
        const socketExists = userData.socket && typeof userData.socket === 'object';
        const socketHasUser = socketExists && userData.socket.user;
        const isActuallyReady = userData.isReady && socketExists && socketHasUser;
        
        if (isActuallyReady) {
          // ✅ Ya hay una sesión activa y conectada, retornar estado conectado inmediatamente
          console.log(`✅ [Usuario ${userId}] Sesión activa encontrada, retornando estado conectado`);
          return validateAndReturnStatus(userId, userData, res);
        } else {
          // Socket existe pero no está listo, puede estar reconectando
          console.log(`⚠️ [Usuario ${userId}] Socket existe pero no está listo (isReady=${userData.isReady}), puede estar reconectando...`);
        }
      }
      
      // Si no hay userData pero está conectado en BD, intentar restaurar la sesión
      if (!userData) {
        console.log(`⚠️ [Usuario ${userId}] No hay userData pero está conectado en BD, verificando si necesita restaurar sesión...`);
        // Verificar si hay creds.json para restaurar
        const fs = require('fs');
        const authDir = path.join(__dirname, 'baileys_auth', `user_${userId}`);
        const credsPath = path.join(authDir, 'creds.json');
        
        if (fs.existsSync(credsPath)) {
          // ✅ CRÍTICO: Verificar que no haya un socket activo antes de restaurar
          const existingSocket = userSockets.get(userId);
          if (existingSocket && existingSocket.socket) {
            console.log(`⚠️ [Usuario ${userId}] Ya existe un socket activo, no restaurar sesión`);
            userData = existingSocket;
          } else {
            console.log(`✅ [Usuario ${userId}] Creds encontrados, restaurando sesión...`);
            await initializeWhatsApp(userId);
          }
          
          // ✅ CRÍTICO: Esperar con polling periódico para que Baileys reconecte automáticamente
          // Baileys puede tardar varios segundos en reconectar cuando restaura desde creds.json
          console.log(`⏳ [Usuario ${userId}] Esperando reconexión automática de sesión restaurada...`);
          let restoreAttempts = 0;
          const maxRestoreAttempts = 30; // 30 intentos x 1 segundo = 30 segundos máximo
          
          while (restoreAttempts < maxRestoreAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo entre verificaciones
            restoreAttempts++;
            
            userData = userSockets.get(userId);
            if (!userData) {
              console.log(`⏳ [Usuario ${userId}] Restauración - Intento ${restoreAttempts}/${maxRestoreAttempts}: userData aún no disponible`);
              continue;
            }
            
            const socketExists = userData.socket && typeof userData.socket === 'object';
            const socketHasUser = socketExists && userData.socket.user;
            const isActuallyReady = userData.isReady && socketExists && socketHasUser;
            
            if (isActuallyReady) {
              // ✅ Sesión reconectada exitosamente
              console.log(`✅ [Usuario ${userId}] Sesión reconectada exitosamente después de ${restoreAttempts} segundos`);
              return validateAndReturnStatus(userId, userData, res);
            }
          }
          
          // Si después de todos los intentos no se reconectó, verificar una última vez
          userData = userSockets.get(userId);
          if (userData) {
            const socketExists = userData.socket && typeof userData.socket === 'object';
            const socketHasUser = socketExists && userData.socket.user;
            const isActuallyReady = userData.isReady && socketExists && socketHasUser;
            
            if (isActuallyReady) {
              return validateAndReturnStatus(userId, userData, res);
            }
          }
        }
      }
      
      // Verificar estado real del socket (puede haberse actualizado durante el polling)
      userData = userSockets.get(userId);
      if (userData) {
        const socketExists = userData.socket && typeof userData.socket === 'object';
        const socketHasUser = socketExists && userData.socket.user;
        const isActuallyReady = userData.isReady && socketExists && socketHasUser;
        
        if (isActuallyReady) {
          return validateAndReturnStatus(userId, userData, res);
        }
      }
      
      const db2 = getDb();
      await new Promise((resolve) => {
        db2.run(
          'UPDATE whatsapp_sessions SET status = ? WHERE user_id = ?',
          ['disconnected', userId],
          (updateErr) => {
            db2.close();
            if (updateErr) {
              console.error(`❌ [Usuario ${userId}] Error actualizando estado:`, updateErr);
            }
            resolve();
          }
        );
      });
    }
    
    // Continuar con la lógica normal de generación de QR
    await continueQRGeneration(userId, res);
  } catch (error) {
    console.error('Error en /api/qr:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Función auxiliar para continuar con la generación de QR
async function continueQRGeneration(userId, res) {
  try {
    // Obtener datos del usuario
    let userData = userSockets.get(userId);
    
    // ✅ CRÍTICO: Verificar estado real de conexión antes de generar QR
    // Si hay userData pero el socket está cerrado o no está realmente conectado, limpiarlo
    if (userData) {
      const socketExists = userData.socket && typeof userData.socket === 'object';
      const socketHasUser = socketExists && userData.socket.user;
      const isActuallyReady = userData.isReady && socketExists && socketHasUser;

      // Si el socket existe pero no está realmente conectado, limpiarlo
      if (socketExists && !isActuallyReady) {
        console.log(`⚠️ [Usuario ${userId}] Socket existe pero no está realmente conectado. Limpiando estado...`);
        try {
          if (userData.socket) {
            userData.socket.end();
          }
        } catch (err) {
          console.error(`[Usuario ${userId}] Error cerrando socket:`, err);
        }
        // Limpiar entrada de userSockets para forzar nueva inicialización
        userSockets.delete(userId);
        userData = null;
      }
    }
    
    if (!userData) {
      // Si no existe socket para este usuario, inicializarlo
      // ✅ CRÍTICO: Verificar nuevamente antes de inicializar (evitar race conditions)
      const doubleCheckUserData = userSockets.get(userId);
      if (!doubleCheckUserData || !doubleCheckUserData.socket) {
        await initializeWhatsApp(userId);
      } else {
        userData = doubleCheckUserData;
      }
      
      // Esperar y verificar periódicamente si se generó el QR (hasta 10 segundos)
      let attempts = 0;
      const maxAttempts = 20; // 20 intentos x 500ms = 10 segundos máximo
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const newUserData = userSockets.get(userId);
        
        if (!newUserData) {
          attempts++;
          continue;
        }
        
        const socketExists = newUserData.socket && typeof newUserData.socket === 'object';
        const hasQR = !!newUserData.currentQR;
        const isReady = newUserData.isReady && newUserData.socket && newUserData.socket.user;
        
        if (isReady) {
          return validateAndReturnStatus(userId, newUserData, res);
        }
        
        if (hasQR) {
          return res.json({ 
            qr: newUserData.currentQR, 
            ready: false 
          });
        }
        
        attempts++;
      }
      
      // Si después de esperar no hay QR, verificar una última vez y retornar error si no hay socket
      const finalUserData = userSockets.get(userId);
      if (finalUserData && finalUserData.currentQR) {
        return res.json({ 
          qr: finalUserData.currentQR, 
          ready: false 
        });
      }
      
      // Verificar si el socket existe pero no generó QR
      if (finalUserData && finalUserData.socket) {
        console.error(`❌ [Usuario ${userId}] Socket existe pero no se generó QR después de ${maxAttempts * 500}ms`);
        return res.status(500).json({ 
          error: 'No se pudo generar el QR. La sesión de Baileys no está lista para generar el QR.',
          message: 'Intenta nuevamente en unos segundos o reinicia la conexión.'
        });
      }
      
      console.error(`❌ [Usuario ${userId}] No se pudo inicializar el socket después de ${maxAttempts * 500}ms`);
      return res.status(500).json({ 
        error: 'No se pudo inicializar la conexión de WhatsApp.',
        message: 'Intenta nuevamente en unos segundos.'
      });
    }
    
    // Si está listo, validar que la sesión pertenece a este usuario
    if (userData.isReady && userData.socket && userData.socket.user) {
      return validateAndReturnStatus(userId, userData, res);
    }
    
    // Si hay QR disponible, retornarlo
    if (userData.currentQR) {
      return res.json({ 
        qr: userData.currentQR, 
        ready: false 
      });
    }
    
    // Si no hay QR y no está listo, forzar generación de nuevo QR
    if (!userData.socket || !userData.isReady) {
      console.log(`🔧 [Usuario ${userId}] No hay QR disponible, reinicializando para generar nuevo QR...`);
      // Cerrar socket existente si hay uno
      if (userData.socket) {
        try {
          userData.socket.end();
        } catch (err) {
          console.error(`[Usuario ${userId}] Error cerrando socket:`, err);
        }
      }
      // Limpiar entrada de userSockets
      userSockets.delete(userId);
      // Reinicializar para generar nuevo QR
      await initializeWhatsApp(userId);
      
      // Esperar y verificar periódicamente si se generó el QR (hasta 10 segundos)
      let attempts = 0;
      const maxAttempts = 20; // 20 intentos x 500ms = 10 segundos máximo
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const newUserData = userSockets.get(userId);
        
        if (!newUserData) {
          attempts++;
          continue;
        }
        
        const socketExists = newUserData.socket && typeof newUserData.socket === 'object';
        const hasQR = !!newUserData.currentQR;
        const isReady = newUserData.isReady && newUserData.socket && newUserData.socket.user;
        
        if (isReady) {
          return validateAndReturnStatus(userId, newUserData, res);
        }
        
        if (hasQR) {
          return res.json({ 
            qr: newUserData.currentQR, 
            ready: false 
          });
        }
        
        attempts++;
      }
      
      // Si después de esperar no hay QR, verificar una última vez y retornar error si no hay socket
      const finalUserData = userSockets.get(userId);
      if (finalUserData && finalUserData.currentQR) {
        console.log(`✅ [Usuario ${userId}] QR encontrado en verificación final después de reinicialización`);
        return res.json({ 
          qr: finalUserData.currentQR, 
          ready: false 
        });
      }
      
      // Verificar si el socket existe pero no generó QR
      if (finalUserData && finalUserData.socket) {
        console.error(`❌ [Usuario ${userId}] Socket existe pero no se generó QR después de reinicialización (${maxAttempts * 500}ms)`);
        return res.status(500).json({ 
          error: 'No se pudo generar el QR después de reinicializar. La sesión de Baileys no está lista para generar el QR.',
          message: 'Intenta nuevamente en unos segundos o reinicia la conexión.'
        });
      }
      
      console.error(`❌ [Usuario ${userId}] No se pudo reinicializar el socket después de ${maxAttempts * 500}ms`);
      return res.status(500).json({ 
        error: 'No se pudo reinicializar la conexión de WhatsApp.',
        message: 'Intenta nuevamente en unos segundos.'
      });
    }
    
    // Si aún no hay QR, retornar null (el frontend esperará)
    res.json({ 
      qr: null, 
      ready: false,
      message: 'QR aún no disponible, esperando...'
    });
  } catch (error) {
    console.error('Error en continueQRGeneration:', error);
    res.status(500).json({ error: error.message });
  }
}

// Registrar webhook
app.post('/api/webhooks', (req, res) => {
  const { url, headers } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Se requiere la URL del webhook' });
  }

  const webhook = {
    id: Date.now().toString(),
    url,
    headers: headers || {},
    createdAt: new Date().toISOString()
  };

  webhooks.push(webhook);

  res.json({
    success: true,
    webhook
  });
});

// Listar webhooks
app.get('/api/webhooks', (req, res) => {
  res.json({
    webhooks: webhooks.map(w => ({
      id: w.id,
      url: w.url,
      createdAt: w.createdAt
    }))
  });
});

// Eliminar webhook
app.delete('/api/webhooks/:id', (req, res) => {
  const { id } = req.params;
  const index = webhooks.findIndex(w => w.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Webhook no encontrado' });
  }

  webhooks.splice(index, 1);
  res.json({ success: true, message: 'Webhook eliminado' });
});

// ✅ REFACTORIZADO: Obtener chats del usuario autenticado
app.get('/api/chats', async (req, res) => {
  try {
    // Obtener token de los headers
    const authHeader = req.headers.authorization || req.headers['x-auth-token'];
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null;
    
    if (!token) {
      return res.status(401).json({ error: 'Token de autenticación requerido' });
    }
    
    // Obtener user_id desde el token
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: 'Token inválido o usuario no encontrado' });
    }
    
    // ✅ CRÍTICO: Usar userData del usuario, NO variable global isReady
    const userData = userSockets.get(userId);
    if (!userData || !userData.socket || !userData.isReady) {
      return res.status(503).json({ error: 'WhatsApp no está conectado para este usuario' });
    }

    res.json({
      chats: [],
      message: 'Endpoint de chats no disponible con Baileys en esta implementación'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ REFACTORIZADO: Desconectar socket del usuario autenticado
app.post('/api/disconnect', async (req, res) => {
  try {
    // Obtener token de los headers
    const authHeader = req.headers.authorization || req.headers['x-auth-token'];
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null;
    
    if (!token) {
      return res.status(401).json({ error: 'Token de autenticación requerido' });
    }
    
    // Obtener user_id desde el token
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: 'Token inválido o usuario no encontrado' });
    }
    
    const userData = userSockets.get(userId);
    if (userData && userData.socket) {
      await userData.socket.end(undefined);
      userSockets.delete(userId);
      console.log(`✅ [Usuario ${userId}] Desconectado exitosamente`);
    }
    res.json({ success: true, message: 'Desconectado exitosamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ REFACTORIZADO: Reiniciar conexión del usuario autenticado
app.post('/api/reconnect', async (req, res) => {
  try {
    // Obtener token de los headers
    const authHeader = req.headers.authorization || req.headers['x-auth-token'];
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null;
    
    if (!token) {
      return res.status(401).json({ error: 'Token de autenticación requerido' });
    }
    
    // Obtener user_id desde el token
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: 'Token inválido o usuario no encontrado' });
    }
    
    const userData = userSockets.get(userId);
    if (userData && userData.socket) {
      await userData.socket.end(undefined);
    }
    await initializeWhatsApp(userId);
    res.json({ success: true, message: 'Reiniciando conexión...' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ REFACTORIZADO: Forzar nuevo QR para el usuario autenticado
app.post('/api/force-qr', async (req, res) => {
  try {
    // Obtener token de los headers
    const authHeader = req.headers.authorization || req.headers['x-auth-token'];
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null;
    
    if (!token) {
      return res.status(401).json({ error: 'Token de autenticación requerido' });
    }
    
    // Obtener user_id desde el token
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: 'Token inválido o usuario no encontrado' });
    }
    
    console.log(`🔄 [Usuario ${userId}] Forzando generación de nuevo QR...`);
    
    // ✅ CRÍTICO: Cerrar socket del usuario específico, NO global
    const userData = userSockets.get(userId);
    if (userData && userData.socket) {
      await userData.socket.end(undefined);
      userSockets.delete(userId);
    }
    
    // Limpiar sesión guardada para forzar nuevo QR
    const fs = require('fs');
    const authDir = path.join(__dirname, 'baileys_auth', `user_${userId}`);
    
    try {
      // Eliminar creds.json para forzar nuevo QR
      const credsPath = path.join(authDir, 'creds.json');
      if (fs.existsSync(credsPath)) {
        fs.unlinkSync(credsPath);
        console.log(`✅ [Usuario ${userId}] Sesión anterior eliminada`);
      }
    } catch (err) {
      console.error(`[Usuario ${userId}] Error limpiando sesión:`, err);
    }
    
    // ✅ CRÍTICO: Reinicializar WhatsApp para este usuario específico (esto generará nuevo QR)
    setTimeout(async () => {
      await initializeWhatsApp(userId);
    }, 1000);
    
    res.json({ 
      success: true, 
      message: 'Sesión limpiada. Se generará nuevo QR en unos segundos...' 
    });
  } catch (error) {
    console.error('Error forzando QR:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== CONFIGURACIÓN QUIVR ====================

// Obtener configuración de Quivr
app.get('/api/quivr/config', (req, res) => {
  res.json({
    success: true,
    config: {
      enabled: quivrConfig.enabled,
      url: quivrConfig.url,
      endpoint: quivrConfig.endpoint,
      ignoreGroups: quivrConfig.ignoreGroups,
      chatId: quivrConfig.chatId
    }
  });
});

// Configurar Quivr
app.post('/api/quivr/config', (req, res) => {
  const { enabled, url, endpoint, ignoreGroups, chatId } = req.body;

  if (enabled !== undefined) quivrConfig.enabled = Boolean(enabled);
  if (url) quivrConfig.url = url;
  if (endpoint !== undefined) quivrConfig.endpoint = endpoint;
  if (ignoreGroups !== undefined) quivrConfig.ignoreGroups = Boolean(ignoreGroups);
  if (chatId !== undefined) quivrConfig.chatId = chatId;

  res.json({
    success: true,
    message: 'Configuración de Quivr actualizada',
    config: quivrConfig
  });
});

// Probar conexión con Quivr
app.post('/api/quivr/test', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Se requiere un mensaje de prueba' });
  }

  try {
    const response = await queryQuivr(message || 'Hola, esta es una prueba de conexión');
    res.json({
      success: true,
      testMessage: message || 'Hola, esta es una prueba de conexión',
      response: response,
      config: {
        url: quivrConfig.url,
        endpoint: quivrConfig.endpoint
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Vincular número de WhatsApp a usuario (usa token de autenticación)
app.post('/api/link-phone', async (req, res) => {
  try {
    // Obtener token de los headers
    const authHeader = req.headers.authorization || req.headers['x-auth-token'];
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null;
    
    if (!token) {
      return res.status(401).json({ error: 'Token de autenticación requerido' });
    }
    
    // Obtener user_id desde el token
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: 'Token inválido o usuario no encontrado' });
    }
    
    // ❌ CRÍTICO: Prevenir que usuarios admin vinculen WhatsApp
    // Verificar el role del usuario antes de continuar
    const dbCheckRole = getDb();
    dbCheckRole.get(
      'SELECT id, username, role FROM users WHERE id = ?',
      [userId],
      (errRole, userRow) => {
        dbCheckRole.close();
        if (errRole) {
          console.error('❌ Error verificando role del usuario:', errRole);
          return res.status(500).json({ error: 'Error al verificar permisos del usuario' });
        }
        
        if (!userRow) {
          return res.status(401).json({ error: 'Usuario no encontrado' });
        }
        
        // ❌ BLOQUEAR ADMIN: No permitir que admin vincule WhatsApp
        if (userRow.role === 'admin') {
          console.error(`❌ BLOQUEADO: Usuario admin (ID: ${userId}, username: ${userRow.username}) intentó vincular WhatsApp`);
          console.error(`❌ Los usuarios admin NO pueden vincular WhatsApp por seguridad`);
          return res.status(403).json({ 
            error: 'Los usuarios administradores no pueden vincular WhatsApp. Esta funcionalidad está reservada para usuarios regulares.' 
          });
        }
        
        // Continuar con el proceso de vinculación solo si NO es admin
        continueLinkPhoneProcess(userId, req, res);
      }
    );
  } catch (error) {
    console.error('Error en /api/link-phone:', error);
    res.status(500).json({ error: error.message });
  }
});

// Función auxiliar para continuar el proceso de vinculación (separada para evitar anidación excesiva)
function continueLinkPhoneProcess(userId, req, res) {
  try {
    // ✅ REFACTORIZADO: Obtener ID de WhatsApp desde el socket del usuario específico
    // El formato de socket.user.id puede ser: "138916556447751:lid" o "138916556447751@s.whatsapp.net:something"
    // IMPORTANTE: Según la lógica establecida:
    // - whatsapp_id debe guardar el ID SIN sufijo (solo número, ej: 138916556447751)
    // - whatsapp_number debe guardar el número real (solo dígitos, ej: 595972908588)
    let whatsappIdFull = null; // ID completo con sufijo (ej: 138916556447751@lid o 138916556447751@s.whatsapp.net)
    let whatsappIdNumber = null; // Solo el número del ID (ej: 138916556447751) - para búsquedas
    
    const userData = userSockets.get(userId);
    if (!userData || !userData.socket) {
      return res.status(400).json({ error: 'No hay conexión de WhatsApp activa para este usuario' });
    }
    
    if (userData.socket && userData.socket.user && userData.socket.user.id) {
      const fullId = userData.socket.user.id;

      // Extraer el ID completo con sufijo para guardar en whatsapp_id
      // El formato puede ser: "138916556447751:lid" o "595986782672:36@s.whatsapp.net"
      // IMPORTANTE: Necesitamos preservar el formato completo con sufijo
      // Si tiene formato "numero:lid", convertir a "numero@lid"
      // Si tiene formato "numero:algo@s.whatsapp.net", extraer el número y usar formato "@lid"
      
      // Primero, intentar detectar si tiene formato ":lid" (formato más común para IDs de WhatsApp)
      if (fullId.includes(':lid')) {
        // Formato: "138916556447751:lid" -> convertir a "138916556447751@lid"
        const numberPart = fullId.split(':')[0];
        whatsappIdFull = `${numberPart}@lid`;
      } else if (fullId.includes(':')) {
        // Formato: "595986782672:36@s.whatsapp.net" o "numero:algo"
        // Extraer solo el número (antes del primer ':') y usar formato @lid
        const numberPart = fullId.split(':')[0];
        whatsappIdFull = `${numberPart}@lid`;
      } else if (fullId.includes('@')) {
        // Formato: "595986782672@s.whatsapp.net"
        // Extraer el número y convertir a formato @lid
        const numberPart = fullId.split('@')[0];
        whatsappIdFull = `${numberPart}@lid`;
      } else {
        // Solo número, agregar sufijo por defecto @lid
        whatsappIdFull = `${fullId}@lid`;
      }
      
      // Extraer solo el número (sin sufijo) para búsquedas y comparaciones
      whatsappIdNumber = fullId.split(':')[0].split('@')[0];
      
    }
    
    // Si se proporciona whatsappId en el body, usarlo (permite override)
    if (req.body.whatsappId) {
      whatsappIdFull = req.body.whatsappId;
      whatsappIdNumber = req.body.whatsappId.split('@')[0].split(':')[0];
    }

    if (!whatsappIdNumber) {
      console.error('❌ /api/link-phone: No se pudo obtener el ID de WhatsApp desde el socket');
      return res.status(400).json({ error: 'No se pudo obtener el ID de WhatsApp. Asegúrate de que WhatsApp esté conectado.' });
    }
    
    // ✅ REGLA: whatsapp_number debe venir desde userSockets (memoria)
    // Si no está en userSockets, intentar obtenerlo del body
    // Si no está en el body, NO usar whatsappIdNumber como fallback (son diferentes)
    let whatsappNumberToSave = userData.whatsappNumber;
    
    if (!whatsappNumberToSave) {
      whatsappNumberToSave = req.body.phoneNumber || req.body.whatsapp_number;
      if (whatsappNumberToSave) {
        userData.whatsappNumber = whatsappNumberToSave;
      }
    }
    
    // Si aún no hay whatsapp_number, verificar si existe en BD (solo lectura)
    if (!whatsappNumberToSave) {
      console.log('⚠️  /api/link-phone: whatsapp_number no disponible, verificando si existe en BD...');
      const dbCheck = getDb();
      dbCheck.get(
        'SELECT whatsapp_number FROM users WHERE id = ?',
        [userId],
        (err, userRow) => {
          dbCheck.close();
          if (!err && userRow && userRow.whatsapp_number) {
            whatsappNumberToSave = userRow.whatsapp_number;
            userData.whatsappNumber = whatsappNumberToSave;
          } else {
            // ⚠️ CRÍTICO: NO usar whatsappIdNumber como fallback
            // whatsapp_id y whatsapp_number son diferentes
            console.error(`❌ [Usuario ${userId}] whatsapp_number NO disponible`);
            console.error(`❌ [Usuario ${userId}] whatsapp_id (${whatsappIdNumber}) NO es lo mismo que whatsapp_number`);
            console.error(`❌ [Usuario ${userId}] whatsapp_number debe proporcionarse explícitamente`);
            // Continuar sin whatsapp_number (solo actualizar whatsapp_id)
            whatsappNumberToSave = null;
          }
        }
      );
    }
    
    // IMPORTANTE: Guardar exactamente el valor que viene (sin normalizar)
    if (whatsappNumberToSave) {
      console.log(`✅ [Usuario ${userId}] whatsapp_number final: ${whatsappNumberToSave}`);
    } else {
      console.log(`⚠️  [Usuario ${userId}] whatsapp_number NO disponible - solo se actualizará whatsapp_id`);
    }
    
    // Para whatsapp_sessions, usar el ID completo con sufijo (para compatibilidad)
    // Usar whatsappIdFull si está disponible, sino construir desde whatsappIdNumber
    const formattedNumberForSession = whatsappIdFull || `${whatsappIdNumber}@s.whatsapp.net`; // Para whatsapp_sessions
    
    const db = getDb();
    
    // Verificar si el número ya está vinculado a otro usuario y continuar con la actualización
    db.get(
      'SELECT user_id, phone_number FROM whatsapp_sessions WHERE phone_number = ?',
      [formattedNumberForSession],
      async (err, existingRow) => {
        if (err) {
          db.close();
          console.error('Error verificando sesión existente:', err);
          return res.status(500).json({ error: 'Error al verificar sesión existente' });
        }
        
        if (existingRow) {
          if (existingRow.user_id !== userId) {
            // ❌ CRÍTICO: El WhatsApp ya está vinculado a OTRO usuario
            // NO permitir re-vinculación automática - esto previene que un usuario "robe" el WhatsApp de otro
            db.close();
            console.error(`❌ ERROR: El número ${formattedNumberForSession} ya está vinculado al usuario ${existingRow.user_id}`);
            console.error(`❌ El usuario ${userId} NO puede vincular este WhatsApp porque pertenece a otro usuario`);
            return res.status(409).json({ 
              error: `Este número de WhatsApp ya está vinculado a otro usuario. Solo el usuario que escaneó el QR puede vincular su WhatsApp.` 
            });
          } else {
            // Ya está vinculado al mismo usuario, solo actualizar status y fecha
            console.log(`ℹ️  El número ${formattedNumberForSession} ya está vinculado al usuario ${userId}, actualizando estado`);
          }
        }
        
        // Vincular o actualizar la sesión (INSERT OR REPLACE actualiza si existe)
        db.run(
          `INSERT OR REPLACE INTO whatsapp_sessions (user_id, phone_number, status, connected_at) 
           VALUES (?, ?, 'connected', ?)`,
          [userId, formattedNumberForSession, getParaguayDateTime()],
          function(insertErr) {
            if (insertErr) {
              db.close();
              console.error('Error vinculando número en whatsapp_sessions:', insertErr);
              return res.status(500).json({ error: 'Error al vincular número de teléfono' });
            }
            
            console.log(`✅ Sesión de WhatsApp guardada/actualizada en whatsapp_sessions para usuario ${userId}`);
            
            // ✅ ÚNICO PUNTO DE ACTUALIZACIÓN DE users: /api/link-phone
            // Aquí y SOLO aquí se actualiza users.whatsapp_id y users.whatsapp_number
            const db2 = getDb();
            
            // Validar que este whatsapp_id NO esté asignado a otro usuario
            db2.get(
              'SELECT id, username FROM users WHERE whatsapp_id = ? AND id != ?',
              [whatsappIdNumber, userId],
              (checkErr, existingUser) => {
                if (checkErr) {
                  db2.close();
                  db.close();
                  console.error(`❌ [Usuario ${userId}] Error validando whatsapp_id:`, checkErr);
                  return res.status(500).json({ error: 'Error al verificar duplicados' });
                }
                
                if (existingUser) {
                  db2.close();
                  db.close();
                  console.error(`❌ [Usuario ${userId}] ERROR: whatsapp_id ${whatsappIdNumber} ya está asignado al usuario ${existingUser.id} (${existingUser.username})`);
                  return res.status(409).json({ 
                    error: `Este número de WhatsApp ya está vinculado a otro usuario (${existingUser.username}).` 
                  });
                }
                
                // ✅ Actualizar users SOLO para este userId
                // Si whatsappNumberToSave es null, solo actualizar whatsapp_id
                const updateQuery = whatsappNumberToSave 
                  ? 'UPDATE users SET whatsapp_id = ?, whatsapp_number = ? WHERE id = ?'
                  : 'UPDATE users SET whatsapp_id = ? WHERE id = ?';
                const updateParams = whatsappNumberToSave 
                  ? [whatsappIdNumber, whatsappNumberToSave, userId]
                  : [whatsappIdNumber, userId];
                
                db2.run(
                  updateQuery,
                  updateParams,
                  function(updateErr) {
                    db2.close();
                    db.close();
                    
                    if (updateErr) {
                      console.error(`❌ [Usuario ${userId}] Error actualizando users:`, updateErr);
                      return res.status(500).json({ error: 'Error al actualizar users' });
                    }
                    
                    if (whatsappNumberToSave) {
                      console.log(`✅ [Usuario ${userId}] users actualizado - whatsapp_id: ${whatsappIdNumber}, whatsapp_number: ${whatsappNumberToSave}`);
                    } else {
                      console.log(`✅ [Usuario ${userId}] users actualizado - whatsapp_id: ${whatsappIdNumber}, whatsapp_number: NULL (no disponible)`);
                    }
                    
                    const action = existingRow ? 'actualizado' : 'vinculado';
                    res.json({ 
                      success: true, 
                      message: `Usuario ${action} correctamente`,
                      whatsappId: whatsappIdNumber,
                      whatsapp_id: whatsappIdNumber,
                      phoneNumber: whatsappNumberToSave || null,
                      whatsapp_number: whatsappNumberToSave || null,
                      userId: userId,
                      wasLinked: !!existingRow,
                      previousUserId: existingRow ? existingRow.user_id : null,
                      note: whatsappNumberToSave ? null : 'whatsapp_number no disponible - solo whatsapp_id actualizado'
                    });
                  }
                );
              }
            );
          }
        );
      }
    );
  } catch (error) {
    console.error('Error en continueLinkPhoneProcess:', error);
    res.status(500).json({ error: error.message });
  }
}

// Servir página principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ✅ REFACTORIZADO: Iniciar servidor sin inicializar WhatsApp global
// Cada usuario inicializará su propia conexión cuando solicite el QR
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Servidor API corriendo en http://0.0.0.0:${PORT}`);
  console.log(`Accede desde tu navegador usando la IP del servidor: http://<IP_SERVIDOR>:${PORT}`);
  console.log('✅ Sistema de WhatsApp por usuario activado');
  console.log('💡 Cada usuario debe solicitar su QR en /api/qr para inicializar su conexión');
});
