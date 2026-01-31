# Lógica de Actualización Automática de `whatsapp_id` y `whatsapp_number`

## 📋 Requisitos

- Al conectar un usuario a WhatsApp, actualizar automáticamente:
  - `whatsapp_id` (ej: "138916556447751")
  - `whatsapp_number` (ej: "595972908588")
- Identificar al usuario mediante `user_id` o token de autenticación
- Si el usuario ya tiene valores, sobrescribirlos
- No crear registros nuevos

## 🔄 Flujo Completo

### 1. Evento de Conexión (`connection === 'open'`)

**Datos disponibles:**
- `socket.user.id`: ID de WhatsApp completo (ej: "138916556447751:lid" o "595986782672:48@s.whatsapp.net")
- **NO disponible**: `whatsapp_number` real (solo se obtiene cuando el frontend llama a `/api/link-phone`)

**Lógica de actualización:**

```javascript
// 1. Extraer whatsapp_id desde socket.user.id
const fullId = socket.user.id; // "138916556447751:lid"
const whatsappId = fullId.split(':')[0].split('@')[0]; // "138916556447751"

// 2. Buscar usuario vinculado con este whatsapp_id
SELECT id, whatsapp_id, whatsapp_number 
FROM users 
WHERE whatsapp_id = ?

// 3a. Si encuentra usuario vinculado:
// - Actualizar whatsapp_sessions
// - Actualizar users.whatsapp_id
// - Mantener users.whatsapp_number existente (si existe)
// - Si no existe whatsapp_number, esperar a /api/link-phone

// 3b. Si NO encuentra usuario vinculado:
// - Mantener valores temporales
// - Esperar a que se llame a /api/link-phone con token de usuario
```

**Query de actualización al conectar:**

```sql
-- Si encuentra usuario vinculado
UPDATE users 
SET whatsapp_id = ? 
WHERE id = ?
```

**Valores:**
- `whatsapp_id`: `"138916556447751"` (extraído de `socket.user.id`, sin sufijo)
- `whatsapp_number`: Se mantiene el valor existente (no se sobrescribe)

### 2. Endpoint `/api/link-phone` (cuando el frontend vincula el número)

**Request:**
```json
{
  "phoneNumber": "595972908588"
}
```

**Headers:**
```
Authorization: Bearer <token>
```

**Lógica de actualización:**

```javascript
// 1. Obtener user_id desde token
const userId = await getUserIdFromToken(token);

// 2. Extraer whatsapp_id desde socket.user.id
const whatsappId = socket.user.id.split(':')[0].split('@')[0];

// 3. Obtener whatsapp_number desde body
const whatsappNumber = req.body.phoneNumber; // "595972908588"

// 4. Actualizar ambos campos en users
UPDATE users 
SET whatsapp_id = ?, whatsapp_number = ? 
WHERE id = ?
```

**Query de actualización en `/api/link-phone`:**

```sql
UPDATE users 
SET whatsapp_id = ?, whatsapp_number = ? 
WHERE id = ?
```

**Valores:**
- `whatsapp_id`: `"138916556447751"` (extraído de `socket.user.id`, sin sufijo)
- `whatsapp_number`: `"595972908588"` (del body, valor exacto sin normalizar)
- `id`: `userId` (desde token)

## 📊 Ejemplo de Flujo Completo

### Escenario 1: Usuario nuevo conecta por primera vez

1. **Dispositivo escanea QR** → `connection === 'open'`
2. **Sistema busca usuario** → No encuentra usuario vinculado con ese `whatsapp_id`
3. **Frontend detecta conexión** → Llama a `/api/link-phone` con token de usuario
4. **Backend actualiza:**
   ```sql
   UPDATE users 
   SET whatsapp_id = '138916556447751', whatsapp_number = '595972908588' 
   WHERE id = 10
   ```
5. **Resultado:** Usuario vinculado con ambos valores

### Escenario 2: Usuario ya vinculado se reconecta

1. **Dispositivo escanea QR** → `connection === 'open'`
2. **Sistema busca usuario** → Encuentra usuario con `whatsapp_id = '138916556447751'`
3. **Actualización automática:**
   ```sql
   UPDATE users 
   SET whatsapp_id = '138916556447751' 
   WHERE id = 10
   ```
   - `whatsapp_number` se mantiene (no se sobrescribe)
4. **Frontend detecta conexión** → Llama a `/api/link-phone` (opcional, para actualizar `whatsapp_number` si cambió)
5. **Si se llama `/api/link-phone`:**
   ```sql
   UPDATE users 
   SET whatsapp_id = '138916556447751', whatsapp_number = '595972908588' 
   WHERE id = 10
   ```

### Escenario 3: Usuario cambia de número

1. **Dispositivo escanea QR** → `connection === 'open'`
2. **Sistema busca usuario** → Encuentra usuario con `whatsapp_id` diferente
3. **Frontend detecta conexión** → Llama a `/api/link-phone` con nuevo número
4. **Backend actualiza:**
   ```sql
   UPDATE users 
   SET whatsapp_id = '138916556447751', whatsapp_number = '595972908588' 
   WHERE id = 10
   ```
5. **Resultado:** Ambos valores actualizados con los nuevos datos

## 🔍 Código de Persistencia

### Función de actualización al conectar

```javascript
// En connection.update cuando connection === 'open'
if (userRow && userRow.id) {
  const userId = userRow.id;
  const existingWhatsappNumber = userRow.whatsapp_number;
  
  // Actualizar whatsapp_id
  db.run(
    'UPDATE users SET whatsapp_id = ? WHERE id = ?',
    [whatsappId, userId],
    function(updateErr) {
      if (updateErr) {
        console.error('❌ Error actualizando whatsapp_id:', updateErr);
      } else {
        console.log(`✅ whatsapp_id actualizado: ${whatsappId}`);
        if (existingWhatsappNumber) {
          console.log(`✅ whatsapp_number existente mantenido: ${existingWhatsappNumber}`);
        }
      }
    }
  );
}
```

### Función de actualización en `/api/link-phone`

```javascript
// En /api/link-phone
const whatsappIdToSave = whatsappIdNumber; // "138916556447751"
const whatsappNumberToSave = req.body.phoneNumber; // "595972908588"

db.run(
  'UPDATE users SET whatsapp_id = ?, whatsapp_number = ? WHERE id = ?',
  [whatsappIdToSave, whatsappNumberToSave, userId],
  function(updateErr) {
    if (updateErr) {
      console.error('❌ Error actualizando users:', updateErr);
    } else {
      console.log(`✅ Usuario ${userId} actualizado:`);
      console.log(`   - whatsapp_id: ${whatsappIdToSave}`);
      console.log(`   - whatsapp_number: ${whatsappNumberToSave}`);
    }
  }
);
```

## ⚠️ Notas Importantes

1. **`whatsapp_id` y `whatsapp_number` son valores distintos:**
   - `whatsapp_id`: ID interno de WhatsApp (ej: "138916556447751")
   - `whatsapp_number`: Número telefónico real (ej: "595972908588")

2. **Al conectar, solo tenemos `whatsapp_id`:**
   - Se extrae de `socket.user.id`
   - El `whatsapp_number` real solo está disponible cuando el frontend lo proporciona en `/api/link-phone`

3. **Actualización automática:**
   - Al conectar: Solo se actualiza `whatsapp_id` (si encuentra usuario vinculado)
   - En `/api/link-phone`: Se actualizan ambos campos

4. **Identificación del usuario:**
   - Al conectar: Se busca por `whatsapp_id` existente
   - En `/api/link-phone`: Se identifica mediante token de autenticación

5. **No crear registros nuevos:**
   - Solo se actualizan usuarios existentes
   - Si no se encuentra usuario, se espera a `/api/link-phone` con token válido
