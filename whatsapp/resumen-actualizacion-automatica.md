# Resumen: Actualización Automática de `whatsapp_id` y `whatsapp_number`

## 📋 Lógica Implementada

### 1. Al Conectar WhatsApp (`connection === 'open'`)

**Proceso:**
1. Extrae `whatsapp_id` desde `socket.user.id` (sin sufijo)
2. Busca usuario vinculado con ese `whatsapp_id`
3. Si encuentra usuario:
   - Actualiza `whatsapp_sessions`
   - Actualiza `users.whatsapp_id`
   - Mantiene `users.whatsapp_number` existente (si existe)

**Query SQL:**
```sql
UPDATE users 
SET whatsapp_id = ? 
WHERE id = ?
```

### 2. Endpoint `/api/link-phone` (cuando el frontend vincula)

**Proceso:**
1. Obtiene `user_id` desde token
2. Extrae `whatsapp_id` desde `socket.user.id`
3. Obtiene `whatsapp_number`:
   - Del body (si se proporciona)
   - De la BD existente (si no se proporciona)
   - Temporal: `whatsapp_id` (si no hay ninguno)
4. Actualiza ambos campos en `users`

**Query SQL:**
```sql
UPDATE users 
SET whatsapp_id = ?, whatsapp_number = ? 
WHERE id = ?
```

## 🔄 Flujo Completo

### Escenario: Usuario conecta WhatsApp

1. **Dispositivo escanea QR** → `connection === 'open'`
2. **Sistema busca usuario** → Encuentra o no encuentra usuario vinculado
3. **Si encuentra:**
   - Actualiza `whatsapp_id` automáticamente
   - Mantiene `whatsapp_number` existente
4. **Frontend detecta conexión** → Llama a `/api/link-phone` automáticamente
5. **Backend actualiza:**
   - `whatsapp_id` (si cambió)
   - `whatsapp_number` (del body, BD existente, o temporal)

## ✅ Resultado

- **Al conectar:** Se actualiza `whatsapp_id` automáticamente
- **En `/api/link-phone`:** Se actualizan ambos campos (`whatsapp_id` y `whatsapp_number`)
- **Si no hay `whatsapp_number`:** Se usa `whatsapp_id` como temporal hasta que se proporcione el número real
