# Ejemplo Completo de Implementación

## 📋 Lógica de Actualización

### 1. Extracción de `whatsapp_id`

```javascript
// Cuando connection === 'open'
const fullId = socket.user.id; // "138916556447751:48@s.whatsapp.net"
const whatsapp_id = fullId.split(':')[0].split('@')[0]; // "138916556447751"
```

**Resultado:** `whatsapp_id = "138916556447751"` (sin sufijo)

### 2. Obtención de `whatsapp_number`

```javascript
// En /api/link-phone
const whatsapp_number = req.body.phoneNumber; // "595972908588"
// IMPORTANTE: Valor exacto, SIN normalizar
```

**Resultado:** `whatsapp_number = "595972908588"` (valor exacto de la API)

## 💾 Query SQL de Persistencia

```sql
UPDATE users 
SET whatsapp_id = ?, 
    whatsapp_number = ? 
WHERE id = ?;
```

**Parámetros:**
- `?` (1): `"138916556447751"` (whatsapp_id)
- `?` (2): `"595972908588"` (whatsapp_number)
- `?` (3): `3` (id del usuario)

## 📝 Código Completo de Persistencia

```javascript
// En /api/link-phone
app.post('/api/link-phone', async (req, res) => {
  // 1. Obtener userId desde token
  const userId = await getUserIdFromToken(token);
  
  // 2. Extraer whatsapp_id desde socket.user.id
  const fullId = socket.user.id; // "138916556447751:48@s.whatsapp.net"
  const whatsapp_id = fullId.split(':')[0].split('@')[0]; // "138916556447751"
  
  // 3. Obtener whatsapp_number desde req.body (valor exacto, sin normalizar)
  const whatsapp_number = req.body.phoneNumber; // "595972908588"
  
  // 4. Actualizar tabla users
  const db = getDb();
  db.run(
    'UPDATE users SET whatsapp_id = ?, whatsapp_number = ? WHERE id = ?',
    [whatsapp_id, whatsapp_number, userId],
    function(err) {
      db.close();
      if (err) {
        console.error('❌ Error:', err);
        return res.status(500).json({ error: 'Error al actualizar usuario' });
      }
      
      console.log(`✅ Usuario ${userId} actualizado:`);
      console.log(`   whatsapp_id: ${whatsapp_id}`);
      console.log(`   whatsapp_number: ${whatsapp_number}`);
      
      res.json({
        success: true,
        whatsapp_id: whatsapp_id,
        whatsapp_number: whatsapp_number,
        userId: userId
      });
    }
  );
});
```

## 📊 Ejemplo de Datos

### Request Body
```json
{
  "phoneNumber": "595972908588"
}
```

### Valores Extraídos
- `whatsapp_id`: `"138916556447751"` (desde `socket.user.id`)
- `whatsapp_number`: `"595972908588"` (desde `req.body.phoneNumber`)

### Query Ejecutada
```sql
UPDATE users 
SET whatsapp_id = '138916556447751', 
    whatsapp_number = '595972908588' 
WHERE id = 3;
```

### Resultado en BD
```sql
SELECT id, username, whatsapp_id, whatsapp_number FROM users WHERE id = 3;
-- id: 3
-- username: "diosnel"
-- whatsapp_id: "138916556447751"
-- whatsapp_number: "595972908588"
```

## ⚠️ Reglas de Implementación

1. ✅ **NO normalizar** `whatsapp_number`
2. ✅ **NO transformar** los valores
3. ✅ **NO derivar** uno del otro
4. ✅ **Guardar exactamente** lo que devuelve la API
5. ✅ **Actualizar juntos** en la misma transacción SQL
