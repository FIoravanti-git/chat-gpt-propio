# Lógica de Actualización Automática al Conectar WhatsApp

## 🔄 Flujo de Actualización Automática

### 1. Cuando se conecta un dispositivo (`connection === 'open'`)

**Paso 1: Extracción del whatsapp_id**
```javascript
const fullId = socket.user.id; // "595986782672:48@s.whatsapp.net"
const whatsappId = fullId.split(':')[0].split('@')[0]; // "595986782672"
connectedWhatsAppId = whatsappId;
```

**Paso 2: Búsqueda de usuario vinculado**
```sql
SELECT id, whatsapp_id, whatsapp_number 
FROM users 
WHERE whatsapp_id = ?
```

**Paso 3a: Si encuentra usuario vinculado**
- ✅ Actualiza automáticamente `whatsapp_sessions` con el `user_id`
- ✅ Actualiza variables globales:
  - `connectedWhatsAppId` = `whatsapp_id` extraído
  - `connectedWhatsAppNumber` = `whatsapp_number` existente en BD
- ✅ Si no tiene `whatsapp_number`, usa `whatsapp_id` como temporal

**Paso 3b: Si NO encuentra usuario vinculado**
- ⚠️ Mantiene valores temporales:
  - `connectedWhatsAppId` = `whatsapp_id` extraído
  - `connectedWhatsAppNumber` = `whatsapp_id` (temporal)
- 💡 Espera vinculación manual mediante `/api/link-phone`

### 2. Cuando se vincula manualmente (`/api/link-phone`)

**Request:**
```json
{
  "phoneNumber": "595972908588"
}
```

**Proceso:**
1. Extrae `whatsapp_id` desde `socket.user.id`
2. Obtiene `phoneNumber` del body (número real)
3. Actualiza `whatsapp_sessions`
4. Actualiza `users` con ambos valores:
   - `whatsapp_id` = ID sin sufijo
   - `whatsapp_number` = Número real del body
5. Actualiza variables globales

## 📊 Ejemplo de Flujo Completo

### Escenario 1: Usuario ya vinculado se reconecta

1. **Dispositivo se conecta** → `whatsapp_id: "138916556447751"`
2. **Sistema busca en BD** → Encuentra usuario con ese `whatsapp_id`
3. **Actualización automática:**
   ```sql
   UPDATE whatsapp_sessions 
   SET status = 'connected', connected_at = NOW() 
   WHERE user_id = 3 AND phone_number = '138916556447751@s.whatsapp.net'
   ```
4. **Variables globales actualizadas:**
   - `connectedWhatsAppId = "138916556447751"`
   - `connectedWhatsAppNumber = "595972908588"` (desde BD)
5. **API `/api/status` devuelve:**
   ```json
   {
     "ready": true,
     "connected": true,
     "whatsapp_id": "138916556447751",
     "whatsapp_number": "595972908588"
   }
   ```

### Escenario 2: Nuevo dispositivo (sin usuario vinculado)

1. **Dispositivo se conecta** → `whatsapp_id: "595986782672"`
2. **Sistema busca en BD** → NO encuentra usuario
3. **Valores temporales:**
   - `connectedWhatsAppId = "595986782672"`
   - `connectedWhatsAppNumber = "595986782672"` (temporal)
4. **API `/api/status` devuelve:**
   ```json
   {
     "ready": true,
     "connected": true,
     "whatsapp_id": "595986782672",
     "whatsapp_number": "595986782672"
   }
   ```
5. **Frontend llama `/api/link-phone`** con `phoneNumber: "595972908588"`
6. **Actualización en BD:**
   ```sql
   UPDATE users 
   SET whatsapp_id = '595986782672', whatsapp_number = '595972908588' 
   WHERE id = 3
   ```
7. **Variables globales actualizadas:**
   - `connectedWhatsAppId = "595986782672"`
   - `connectedWhatsAppNumber = "595972908588"`
8. **API `/api/status` devuelve:**
   ```json
   {
     "ready": true,
     "connected": true,
     "whatsapp_id": "595986782672",
     "whatsapp_number": "595972908588"
   }
   ```

## ✅ Ventajas de esta Lógica

1. **Actualización automática**: Si el usuario ya está vinculado, se actualiza automáticamente
2. **Datos correctos**: Siempre devuelve los valores correctos desde la BD
3. **Sin intervención manual**: Para usuarios ya vinculados, no requiere llamar a `/api/link-phone`
4. **Flexibilidad**: Para nuevos dispositivos, permite vinculación manual con número real

## 📋 Resumen

| Situación | whatsapp_id | whatsapp_number | Actualización BD |
|-----------|-------------|-----------------|------------------|
| Usuario ya vinculado | ✅ Automático | ✅ Desde BD | ✅ Automática |
| Nuevo dispositivo | ✅ Automático | ⚠️ Temporal (igual a ID) | ❌ Espera vinculación |
| Después de `/api/link-phone` | ✅ Actualizado | ✅ Número real | ✅ Completa |
