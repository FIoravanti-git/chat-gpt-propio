# Lógica de Actualización Automática en Tabla Users

## 📋 Requisitos

Cuando un usuario conecta su cuenta a WhatsApp:
- La API de WhatsApp devuelve:
  - `whatsapp_id` (ej: "138916556447751")
  - `whatsapp_number` (ej: "595972908588")
- Se debe actualizar automáticamente el registro del usuario en `users`
- Guardar exactamente los valores que devuelve la API (sin normalizar ni transformar)

## 🔄 Lógica de Actualización

### 1. Evento de Conexión (`connection === 'open'`)

Cuando WhatsApp se conecta, se ejecuta automáticamente:

```javascript
// 1. Extraer whatsapp_id desde socket.user.id
const fullId = socket.user.id; // "138916556447751:48@s.whatsapp.net"
const whatsapp_id = fullId.split(':')[0].split('@')[0]; // "138916556447751"

// 2. Obtener whatsapp_number desde la API (viene del frontend en /api/link-phone)
// O desde socket.user si está disponible

// 3. Actualizar tabla users
UPDATE users 
SET whatsapp_id = ?, whatsapp_number = ? 
WHERE id = ?
```

### 2. Endpoint `/api/link-phone` (Vinculación Manual)

Cuando el frontend llama a `/api/link-phone` con el token del usuario autenticado:

```javascript
// 1. Obtener userId desde token
const userId = await getUserIdFromToken(token);

// 2. Extraer whatsapp_id desde socket.user.id
const whatsapp_id = socket.user.id.split(':')[0].split('@')[0];

// 3. Obtener whatsapp_number desde req.body.phoneNumber
const whatsapp_number = req.body.phoneNumber;

// 4. Actualizar tabla users
UPDATE users 
SET whatsapp_id = ?, whatsapp_number = ? 
WHERE id = ?
```

## 💾 Query de Persistencia

### SQL - Actualización Directa

```sql
UPDATE users 
SET whatsapp_id = ?, 
    whatsapp_number = ? 
WHERE id = ?
```

**Parámetros:**
- `?` (1): `whatsapp_id` - Valor exacto de la API (ej: "138916556447751")
- `?` (2): `whatsapp_number` - Valor exacto de la API (ej: "595972908588")
- `?` (3): `id` - ID del usuario en la tabla

### Ejemplo de Ejecución

```javascript
db.run(
  'UPDATE users SET whatsapp_id = ?, whatsapp_number = ? WHERE id = ?',
  ['138916556447751', '595972908588', 3],
  function(err) {
    if (err) {
      console.error('Error actualizando users:', err);
    } else {
      console.log(`✅ Usuario ${this.changes} actualizado`);
      console.log(`   whatsapp_id: 138916556447751`);
      console.log(`   whatsapp_number: 595972908588`);
    }
  }
);
```

## 📝 Código Completo de Persistencia

### Función de Actualización

```javascript
function updateUserWhatsAppData(userId, whatsapp_id, whatsapp_number) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    
    // IMPORTANTE: Guardar exactamente los valores que devuelve la API
    // NO normalizar, NO transformar, NO derivar uno del otro
    db.run(
      'UPDATE users SET whatsapp_id = ?, whatsapp_number = ? WHERE id = ?',
      [whatsapp_id, whatsapp_number, userId],
      function(err) {
        db.close();
        if (err) {
          console.error('❌ Error actualizando users:', err);
          reject(err);
        } else {
          const rowsAffected = this.changes;
          console.log(`✅ Usuario ${userId} actualizado - Filas afectadas: ${rowsAffected}`);
          console.log(`   whatsapp_id: ${whatsapp_id}`);
          console.log(`   whatsapp_number: ${whatsapp_number}`);
          resolve({ rowsAffected, whatsapp_id, whatsapp_number });
        }
      }
    );
  });
}
```

### Uso en el Evento de Conexión

```javascript
socket.ev.on('connection.update', (update) => {
  if (update.connection === 'open') {
    // 1. Extraer whatsapp_id desde socket.user.id
    const fullId = socket.user?.id || null;
    if (fullId) {
      const whatsapp_id = fullId.split(':')[0].split('@')[0];
      
      // 2. Buscar usuario vinculado o usuario autenticado actual
      // (depende de cómo se identifique el usuario en el momento de conexión)
      
      // 3. Obtener whatsapp_number (desde API, frontend, o BD existente)
      const whatsapp_number = /* obtener desde donde venga */;
      
      // 4. Actualizar tabla users
      if (userId && whatsapp_id && whatsapp_number) {
        updateUserWhatsAppData(userId, whatsapp_id, whatsapp_number)
          .then(() => {
            console.log('✅ Usuario actualizado automáticamente al conectar');
          })
          .catch(err => {
            console.error('❌ Error actualizando usuario:', err);
          });
      }
    }
  }
});
```

### Uso en `/api/link-phone`

```javascript
app.post('/api/link-phone', async (req, res) => {
  // 1. Obtener userId desde token
  const userId = await getUserIdFromToken(token);
  
  // 2. Extraer whatsapp_id desde socket.user.id
  const whatsapp_id = socket.user.id.split(':')[0].split('@')[0];
  
  // 3. Obtener whatsapp_number desde req.body
  const whatsapp_number = req.body.phoneNumber; // Valor exacto de la API
  
  // 4. Actualizar tabla users
  try {
    await updateUserWhatsAppData(userId, whatsapp_id, whatsapp_number);
    res.json({
      success: true,
      whatsapp_id: whatsapp_id,
      whatsapp_number: whatsapp_number
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

## ⚠️ Reglas Importantes

1. **NO normalizar**: Guardar exactamente como viene de la API
2. **NO transformar**: No aplicar funciones de normalización
3. **NO derivar**: No calcular uno desde el otro
4. **Actualizar juntos**: Ambos campos se actualizan en la misma transacción
5. **Valores exactos**: Persistir exactamente lo que devuelve la API

## 📊 Ejemplo de Datos

### Antes de la Conexión

```sql
SELECT id, username, whatsapp_id, whatsapp_number FROM users WHERE id = 3;
-- Resultado:
-- id: 3
-- username: "diosnel"
-- whatsapp_id: NULL
-- whatsapp_number: NULL
```

### Después de la Conexión

```sql
SELECT id, username, whatsapp_id, whatsapp_number FROM users WHERE id = 3;
-- Resultado:
-- id: 3
-- username: "diosnel"
-- whatsapp_id: "138916556447751"
-- whatsapp_number: "595972908588"
```

## 🔍 Verificación

```sql
-- Verificar que los valores se guardaron correctamente
SELECT 
  id,
  username,
  whatsapp_id,
  whatsapp_number,
  CASE 
    WHEN whatsapp_id IS NULL THEN 'Pendiente'
    WHEN whatsapp_number IS NULL THEN 'Incompleto'
    ELSE 'Completo'
  END as estado
FROM users
WHERE id = 3;
```
