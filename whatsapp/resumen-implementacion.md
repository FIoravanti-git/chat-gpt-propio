# Resumen de Implementación - Actualización Automática de users

## 📋 Lógica de Actualización

### 1. Al conectar WhatsApp (`connection === 'open'`)

**Extracción de `whatsapp_id`:**
```javascript
const fullId = socket.user.id; // "138916556447751:48@s.whatsapp.net"
const whatsapp_id = fullId.split(':')[0].split('@')[0]; // "138916556447751"
```

**Resultado:** `whatsapp_id = "138916556447751"` (sin sufijo)

### 2. En `/api/link-phone` (vinculación)

**Request Body:**
```json
{
  "phoneNumber": "595972908588"
}
```

**Extracción:**
```javascript
const whatsapp_id = socket.user.id.split(':')[0].split('@')[0]; // "138916556447751"
const whatsapp_number = req.body.phoneNumber; // "595972908588" (valor exacto, sin normalizar)
```

**Resultado:**
- `whatsapp_id = "138916556447751"`
- `whatsapp_number = "595972908588"` (exactamente como viene)

## 💾 Query SQL de Persistencia

```sql
UPDATE users 
SET whatsapp_id = ?, 
    whatsapp_number = ? 
WHERE id = ?;
```

**Parámetros:**
- `?` (1): `whatsapp_id` - Valor exacto (ej: `"138916556447751"`)
- `?` (2): `whatsapp_number` - Valor exacto (ej: `"595972908588"`)
- `?` (3): `id` - ID del usuario

## 📝 Código de Persistencia

```javascript
// En /api/link-phone
const whatsapp_id = socket.user.id.split(':')[0].split('@')[0];
const whatsapp_number = req.body.phoneNumber; // Valor exacto, sin normalizar

db.run(
  'UPDATE users SET whatsapp_id = ?, whatsapp_number = ? WHERE id = ?',
  [whatsapp_id, whatsapp_number, userId],
  function(err) {
    if (err) {
      console.error('❌ Error:', err);
    } else {
      console.log(`✅ Usuario ${userId} actualizado:`);
      console.log(`   whatsapp_id: ${whatsapp_id}`);
      console.log(`   whatsapp_number: ${whatsapp_number}`);
    }
  }
);
```

## ⚠️ Reglas Importantes

1. ✅ **NO normalizar** `whatsapp_number`
2. ✅ **NO transformar** los valores
3. ✅ **NO derivar** uno del otro
4. ✅ **Guardar exactamente** lo que devuelve la API
5. ✅ **Actualizar juntos** en la misma transacción

## 📊 Ejemplo Completo

### Antes de la Conexión
```sql
SELECT id, username, whatsapp_id, whatsapp_number FROM users WHERE id = 3;
-- Resultado:
-- id: 3, username: "diosnel"
-- whatsapp_id: NULL
-- whatsapp_number: NULL
```

### Después de `/api/link-phone`
```sql
SELECT id, username, whatsapp_id, whatsapp_number FROM users WHERE id = 3;
-- Resultado:
-- id: 3, username: "diosnel"
-- whatsapp_id: "138916556447751"
-- whatsapp_number: "595972908588"
```

## 🔄 Flujo Completo

1. **Usuario conecta WhatsApp** → `socket.user.id` disponible
2. **Frontend llama `/api/link-phone`** con:
   - Token del usuario autenticado
   - `phoneNumber: "595972908588"` (valor exacto)
3. **Backend extrae:**
   - `whatsapp_id` desde `socket.user.id`
   - `whatsapp_number` desde `req.body.phoneNumber`
4. **Backend ejecuta:**
   ```sql
   UPDATE users 
   SET whatsapp_id = '138916556447751', 
       whatsapp_number = '595972908588' 
   WHERE id = 3;
   ```
5. **Resultado:** Ambos campos actualizados con valores exactos de la API
