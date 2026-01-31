# ✅ Flujo Correcto: Asociación 1 a 1 Usuario ↔ WhatsApp

## 📋 Reglas Estrictas Implementadas

1. **NUNCA actualizar automáticamente** `whatsapp_id` o `whatsapp_number` en eventos de conexión
2. **Solo actualizar** cuando el usuario explícitamente llama a `/api/link-phone` después de escanear el QR
3. **Validar** que el WhatsApp no esté ya vinculado a otro usuario antes de permitir la vinculación
4. **Rechazar** intentos de vincular un WhatsApp que ya pertenece a otro usuario

## 🔄 Flujo Paso a Paso

### Paso 1: Usuario A solicita QR

```
Frontend: GET /api/qr
Backend: Genera QR global (currentQR)
Respuesta: { qr: "data:image/png;base64,...", ready: false }
```

**Estado:**
- QR disponible globalmente
- NO hay asociación con usuario aún

### Paso 2: Usuario A escanea el QR

```
WhatsApp: Escanea QR
Backend: connection === 'open' se dispara
```

**Lo que SÍ hace:**
- Actualiza variables globales (`connectedWhatsAppId`, `connectedWhatsAppNumber`)
- Marca `isReady = true`
- NO actualiza la tabla `users`
- NO actualiza la tabla `whatsapp_sessions`

**Lo que NO hace:**
- ❌ NO busca usuario por `whatsapp_id`
- ❌ NO actualiza `users.whatsapp_id`
- ❌ NO actualiza `users.whatsapp_number`
- ❌ NO actualiza `whatsapp_sessions`

### Paso 3: Frontend detecta conexión y llama a `/api/link-phone`

```
Frontend: POST /api/link-phone
Headers: Authorization: Bearer <token_usuario_A>
Body: { phoneNumber: "595972908588" }
```

**Validaciones en el backend:**

1. ✅ Verifica token → Obtiene `userId = usuario_A.id`
2. ✅ Extrae `whatsapp_id` desde `socket.user.id`
3. ✅ Verifica si el WhatsApp ya está vinculado:
   ```sql
   SELECT user_id FROM whatsapp_sessions WHERE phone_number = ?
   ```
4. ✅ Si está vinculado a OTRO usuario → **RECHAZA** (error 409)
5. ✅ Si NO está vinculado o está vinculado al mismo usuario → **PERMITE**

**Actualización (solo si pasa validaciones):**

```sql
-- 1. Actualizar whatsapp_sessions
INSERT OR REPLACE INTO whatsapp_sessions (user_id, phone_number, status, connected_at)
VALUES (usuario_A.id, 'whatsapp_id@s.whatsapp.net', 'connected', NOW())

-- 2. Actualizar users
UPDATE users 
SET whatsapp_id = 'whatsapp_id', whatsapp_number = '595972908588'
WHERE id = usuario_A.id AND role != 'admin'
```

**Resultado:**
- ✅ `whatsapp_id` y `whatsapp_number` guardados en `users` para `usuario_A`
- ✅ Sesión guardada en `whatsapp_sessions` para `usuario_A`

### Paso 4: Usuario B inicia sesión (después de que A ya conectó)

**Escenario:** Usuario B inicia sesión, pero el WhatsApp ya está conectado (porque A lo conectó)

**Lo que NO pasa:**
- ❌ NO se actualiza automáticamente `users` para usuario B
- ❌ NO se reasigna el WhatsApp de A a B
- ❌ El evento `connection === 'open'` NO actualiza la BD

**Si Usuario B intenta vincular el mismo WhatsApp:**

```
Frontend: POST /api/link-phone (con token de usuario_B)
Backend: 
  1. Verifica token → userId = usuario_B.id
  2. Verifica whatsapp_sessions → WhatsApp ya vinculado a usuario_A.id
  3. ❌ RECHAZA con error 409:
     {
       error: "Este número de WhatsApp ya está vinculado a otro usuario. 
               Solo el usuario que escaneó el QR puede vincular su WhatsApp."
     }
```

**Resultado:**
- ✅ Usuario B NO puede vincular el WhatsApp de A
- ✅ La asociación 1 a 1 se mantiene

## 🔒 Protecciones Implementadas

### 1. En `connection === 'open'` (Líneas 662-790)

**ANTES (INCORRECTO):**
```javascript
// Buscaba usuario y actualizaba automáticamente
db.get('SELECT id FROM users WHERE whatsapp_id = ?', (userRow) => {
  if (userRow) {
    db.run('UPDATE users SET whatsapp_id = ? WHERE id = ?', ...); // ❌
  }
});
```

**AHORA (CORRECTO):**
```javascript
// Solo actualiza variables globales, NO la BD
db.get('SELECT id FROM users WHERE whatsapp_id = ?', (userRow) => {
  if (userRow) {
    // Solo actualizar variables globales para estado
    connectedWhatsAppId = whatsappId;
    connectedWhatsAppNumber = existingWhatsappNumber;
    // ❌ NO actualiza users
  }
});
```

### 2. En `/api/link-phone` (Líneas 1454-1473)

**ANTES (INCORRECTO):**
```javascript
if (existingRow.user_id !== userId) {
  // Permitía re-vinculación automática ❌
  console.log('Actualizando al usuario actual');
  // INSERT OR REPLACE sobrescribe usuario anterior
}
```

**AHORA (CORRECTO):**
```javascript
if (existingRow.user_id !== userId) {
  // ❌ RECHAZA si está vinculado a otro usuario
  return res.status(409).json({ 
    error: 'Este número ya está vinculado a otro usuario' 
  });
}
// Solo permite si NO está vinculado o está vinculado al mismo usuario
```

## 📊 Comparación: Antes vs Ahora

| Escenario | Antes (INCORRECTO) | Ahora (CORRECTO) |
|-----------|-------------------|------------------|
| Usuario A conecta WhatsApp | ✅ Se guarda correctamente | ✅ Se guarda correctamente |
| Usuario B inicia sesión (A ya conectó) | ❌ Se reasigna automáticamente a B | ✅ NO se reasigna, queda en A |
| Usuario B intenta vincular WhatsApp de A | ❌ Se permite, sobrescribe A | ✅ Se rechaza (error 409) |
| Reinicio del servidor | ❌ Puede reasignar incorrectamente | ✅ NO reasigna, mantiene estado |

## ✅ Resultado Final

- **Asociación 1 a 1 estricta**: Un WhatsApp solo puede estar vinculado a un usuario
- **Sin reasignaciones automáticas**: Solo se actualiza cuando el usuario explícitamente llama a `/api/link-phone`
- **Protección contra "robo"**: Un usuario no puede vincular el WhatsApp de otro usuario
- **Persistencia correcta**: Los datos se mantienen incluso después de reinicios del servidor
