# 🔄 FLUJO NUEVO DE WHATSAPP - DESDE CERO

## 📋 PRINCIPIOS FUNDAMENTALES (NO NEGOCIABLES)

1. **NO existe estado global de WhatsApp**
2. **Cada userId tiene su propia sesión aislada**
3. **La BD (users) SOLO se actualiza en el evento `connection.open` explícito**
4. **PROHIBIDO actualizar users en: login, reload, restore, init**

---

## 🔄 FLUJO COMPLETO PASO A PASO

### ESCENARIO 1: Usuario conecta WhatsApp por primera vez

```
1. Usuario A (userId=5) autenticado → Frontend llama GET /api/qr
   ↓
2. Backend verifica: ¿Existe userSockets.get(5)?
   - NO existe → Crear nueva sesión WhatsApp SOLO para userId=5
   - SÍ existe → Retornar QR existente o estado
   ↓
3. Backend crea socket WhatsApp en contexto de userId=5
   - authDir: baileys_auth/user_5
   - userSockets.set(5, { socket, isReady: false, currentQR: null, ... })
   ↓
4. Baileys genera QR → socket.ev.on('connection.update', { qr })
   ↓
5. Backend guarda QR en userSockets.get(5).currentQR
   ↓
6. Frontend muestra QR al usuario
   ↓
7. Usuario escanea QR con WhatsApp
   ↓
8. Baileys emite: socket.ev.on('connection.update', { connection: 'open' })
   ↓
9. ⚠️ CRÍTICO: En este momento SOLO:
   - Extraer whatsapp_id desde socket.user.id
   - Extraer whatsapp_number (si está disponible)
   - Validar que userId=5 es el usuario autenticado
   - UPDATE users SET whatsapp_id=?, whatsapp_number=? WHERE id=5
   - NO actualizar ningún otro usuario
   ↓
10. users(5) ahora tiene whatsapp_id y whatsapp_number
```

### ESCENARIO 2: Usuario B hace login/reload (Usuario A ya conectado)

```
1. Usuario B (userId=6) hace login → Frontend llama GET /api/status
   ↓
2. Backend verifica: ¿Existe userSockets.get(6)?
   - NO existe → Retornar { ready: false, connected: false, whatsapp_id: null, whatsapp_number: null }
   - SÍ existe → Validar que la sesión pertenece a userId=6
   ↓
3. Backend consulta BD: SELECT whatsapp_id, whatsapp_number FROM users WHERE id=6
   ↓
4. Si whatsapp_id es NULL → Retornar desconectado
   Si whatsapp_id NO es NULL → Verificar que la sesión activa corresponde
   ↓
5. ⚠️ CRÍTICO: NO actualizar users(6) automáticamente
   - NO buscar por whatsapp_id en otros usuarios
   - NO reasignar WhatsApp de Usuario A a Usuario B
   - users(6) permanece NULL hasta que Usuario B escanee SU QR
```

### ESCENARIO 3: Usuario B solicita QR (Usuario A ya conectado)

```
1. Usuario B (userId=6) autenticado → Frontend llama GET /api/qr
   ↓
2. Backend verifica: ¿Existe userSockets.get(6)?
   - NO existe → Crear nueva sesión WhatsApp SOLO para userId=6
   - SÍ existe → Validar que pertenece a userId=6
   ↓
3. Si existe sesión pero NO pertenece a userId=6:
   - Destruir sesión inválida
   - Limpiar baileys_auth/user_6
   - Crear nueva sesión
   ↓
4. Generar QR para Usuario B
   ↓
5. Usuario B escanea QR
   ↓
6. Evento connection.open → UPDATE users(6) SOLO
   ↓
7. users(5) NO se toca (sigue con su WhatsApp)
   users(6) ahora tiene su propio WhatsApp
```

---

## 🚫 PROHIBICIONES EXPLÍCITAS

### PROHIBIDO #1: Actualizar users en login/reload
```javascript
// ❌ PROHIBIDO
app.get('/api/status', async (req, res) => {
  const userId = await getUserIdFromToken(token);
  // ❌ NO hacer esto:
  // db.run('UPDATE users SET whatsapp_id=? WHERE id=?', [whatsappId, userId]);
  // ✅ SOLO leer:
  db.get('SELECT whatsapp_id, whatsapp_number FROM users WHERE id=?', [userId], ...);
});
```

### PROHIBIDO #2: Auto-restore silencioso
```javascript
// ❌ PROHIBIDO
setTimeout(() => {
  if (socket.user) {
    // ❌ NO actualizar BD automáticamente
    // UPDATE users SET whatsapp_id=... WHERE id=userId;
  }
}, 3000);
```

### PROHIBIDO #3: Buscar usuario por whatsapp_id y reasignar
```javascript
// ❌ PROHIBIDO
db.get('SELECT id FROM users WHERE whatsapp_id=?', [whatsappId], (err, row) => {
  if (row) {
    // ❌ NO actualizar automáticamente
    // UPDATE users SET whatsapp_id=? WHERE id=?;
  }
});
```

### PROHIBIDO #4: Estado global compartido
```javascript
// ❌ PROHIBIDO
let globalSocket = null;
let globalIsReady = false;

// ✅ CORRECTO
const userSockets = new Map(); // Map<userId, { socket, isReady, ... }>
```

---

## ✅ FLUJO CORRECTO DE ACTUALIZACIÓN DE BD

### ÚNICO punto donde se actualiza users:

```javascript
socket.ev.on('connection.update', (update) => {
  if (update.connection === 'open') {
    // ✅ AQUÍ Y SOLO AQUÍ se actualiza la BD
    const fullId = socket.user.id;
    const whatsappId = fullId.split(':')[0].split('@')[0];
    
    // Validar que userId es el usuario autenticado
    // (ya validado en el contexto de initializeWhatsApp(userId))
    
    // UPDATE users SET whatsapp_id=?, whatsapp_number=? WHERE id=?
    db.run(
      'UPDATE users SET whatsapp_id=?, whatsapp_number=? WHERE id=?',
      [whatsappId, whatsappNumber, userId], // userId del contexto, NO buscado
      (err) => {
        if (err) {
          console.error('Error actualizando users:', err);
        } else {
          console.log(`✅ Usuario ${userId} vinculado a WhatsApp ${whatsappId}`);
        }
      }
    );
  }
});
```

---

## 🔍 VALIDACIONES ESTRICTAS

### Validación 1: Sesión restaurada debe pertenecer al userId

```javascript
// Al restaurar sesión (setTimeout o en /api/qr)
if (socket.user && socket.user.id) {
  const whatsappIdFromSession = extractWhatsAppId(socket.user.id);
  
  // Validar en BD
  db.get(
    'SELECT id, whatsapp_id FROM users WHERE id=? AND whatsapp_id=?',
    [userId, whatsappIdFromSession],
    (err, row) => {
      if (err || !row || row.id !== userId) {
        // ❌ Sesión NO válida - destruir
        socket.end();
        userSockets.delete(userId);
        // Limpiar baileys_auth/user_${userId}
        // Forzar nuevo QR
      } else {
        // ✅ Sesión válida - mantener
      }
    }
  );
}
```

### Validación 2: No actualizar si no hay QR escaneado

```javascript
// Si el usuario NO escaneó QR, users.whatsapp_id debe ser NULL
// NO inferir ni buscar automáticamente
```

---

## 📊 ESTRUCTURA DE DATOS

### userSockets Map
```javascript
const userSockets = new Map(); // Map<userId, UserData>

interface UserData {
  socket: WASocket;           // Socket de Baileys
  isReady: boolean;           // true si connection === 'open'
  currentQR: string | null;    // QR actual (data URL)
  whatsappId: string | null;   // ID extraído del socket (temporal, no persistido hasta connection.open)
  whatsappNumber: string | null; // Número (temporal, no persistido hasta connection.open)
  qrScannedBy: number | null; // userId que generó este QR (validación)
}
```

### Base de datos users
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT,
  whatsapp_id TEXT NULL,      -- SOLO se actualiza en connection.open
  whatsapp_number TEXT NULL    -- SOLO se actualiza en connection.open
);
```

---

## 🎯 CRITERIOS DE ACEPTACIÓN

### Test 1: Usuario A conecta WhatsApp
1. Usuario A (id=5) solicita QR
2. Escanea QR
3. ✅ users(5).whatsapp_id y users(5).whatsapp_number actualizados
4. ✅ users(1) y users(6) siguen NULL

### Test 2: Usuario B hace login (Usuario A conectado)
1. Usuario B (id=6) hace login
2. Frontend llama GET /api/status
3. ✅ Retorna: { ready: false, connected: false, whatsapp_id: null, whatsapp_number: null }
4. ✅ users(6) sigue NULL
5. ✅ users(5) NO se toca

### Test 3: Usuario B escanea SU QR
1. Usuario B (id=6) solicita QR
2. Escanea SU QR
3. ✅ users(6).whatsapp_id y users(6).whatsapp_number actualizados
4. ✅ users(5) NO se toca (sigue con su WhatsApp)

---

## 🔧 IMPLEMENTACIÓN TÉCNICA

### Inicialización de WhatsApp (por userId)
```javascript
async function initializeWhatsApp(userId) {
  // 1. Validar userId
  if (!userId) throw new Error('userId es requerido');
  
  // 2. Directorio de auth específico
  const authDir = path.join(__dirname, 'baileys_auth', `user_${userId}`);
  
  // 3. Crear socket
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const socket = makeWASocket({ auth: state, ... });
  
  // 4. Guardar en userSockets
  userSockets.set(userId, {
    socket,
    isReady: false,
    currentQR: null,
    whatsappId: null,
    whatsappNumber: null,
    qrScannedBy: userId
  });
  
  // 5. Event handlers
  socket.ev.on('connection.update', (update) => {
    handleConnectionUpdate(userId, update);
  });
  
  socket.ev.on('creds.update', saveCreds);
}
```

### Manejo de connection.update
```javascript
function handleConnectionUpdate(userId, update) {
  const userData = userSockets.get(userId);
  if (!userData) return;
  
  // QR disponible
  if (update.qr) {
    generateQR(userId, update.qr);
  }
  
  // Conexión abierta - ÚNICO punto de actualización de BD
  if (update.connection === 'open') {
    const fullId = userData.socket.user.id;
    const whatsappId = extractWhatsAppId(fullId);
    
    // ⚠️ CRÍTICO: Actualizar BD SOLO aquí
    updateUsersTable(userId, whatsappId, whatsappNumber);
    
    userData.isReady = true;
    userData.whatsappId = whatsappId;
  }
}
```

### Actualización de BD (ÚNICO punto)
```javascript
function updateUsersTable(userId, whatsappId, whatsappNumber) {
  const db = getDb();
  
  // Validar que no esté asignado a otro usuario
  db.get(
    'SELECT id FROM users WHERE whatsapp_id=? AND id!=?',
    [whatsappId, userId],
    (err, row) => {
      if (err) {
        console.error('Error validando whatsapp_id:', err);
        return;
      }
      
      if (row) {
        console.error(`❌ whatsapp_id ${whatsappId} ya asignado a usuario ${row.id}`);
        return;
      }
      
      // ✅ Actualizar SOLO este usuario
      db.run(
        'UPDATE users SET whatsapp_id=?, whatsapp_number=? WHERE id=?',
        [whatsappId, whatsappNumber, userId],
        (updateErr) => {
          db.close();
          if (updateErr) {
            console.error('Error actualizando users:', updateErr);
          } else {
            console.log(`✅ Usuario ${userId} vinculado a WhatsApp ${whatsappId}`);
          }
        }
      );
    }
  );
}
```

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

- [ ] Eliminar estado global (socket, isReady, currentQR globales)
- [ ] Implementar userSockets Map
- [ ] initializeWhatsApp(userId) requiere userId
- [ ] connection.update SOLO actualiza users para ese userId
- [ ] Eliminar auto-restore que actualiza BD
- [ ] Eliminar updates en login/reload
- [ ] Validar sesiones restauradas
- [ ] Destruir sesiones inválidas
- [ ] Endpoints requieren autenticación
- [ ] /api/status solo lee, no actualiza
- [ ] /api/qr crea sesión por userId
- [ ] Frontend NO llama linkWhatsAppPhone automáticamente
