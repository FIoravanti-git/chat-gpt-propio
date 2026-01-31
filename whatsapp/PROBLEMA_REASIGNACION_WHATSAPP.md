# 🔴 PROBLEMA: Reasignación Incorrecta de WhatsApp entre Usuarios

## 📋 Descripción del Problema

Cuando un usuario A conecta su WhatsApp escaneando el QR, los datos se guardan correctamente:
- `whatsapp_id`: ID de WhatsApp
- `whatsapp_number`: Número real

**PERO** cuando otro usuario B inicia sesión o recarga la app, el sistema **automáticamente reasigna** esos mismos datos de WhatsApp al usuario B, aunque B **NUNCA escaneó el QR**.

## 🔍 Puntos Críticos Identificados

### 1. **Evento `connection === 'open'` (Líneas 662-790)**

**Problema:**
```javascript
// Cuando WhatsApp se conecta, busca usuario por whatsapp_id
db.get(
  'SELECT id, whatsapp_id, whatsapp_number, role FROM users WHERE whatsapp_id = ? AND role != ? LIMIT 1',
  [whatsappId, 'admin'],
  (err, userRow) => {
    if (userRow && userRow.id) {
      // ❌ PROBLEMA: Actualiza automáticamente al usuario encontrado
      // Esto se dispara cada vez que WhatsApp se conecta, incluso si ya estaba conectado
      db2.run('UPDATE users SET whatsapp_id = ? WHERE id = ? AND role != ?', ...);
    }
  }
);
```

**Por qué es incorrecto:**
- Se dispara cada vez que `connection === 'open'`, incluso en reinicios del servidor
- Busca por `whatsapp_id` y actualiza al primer usuario encontrado
- **NO verifica** si ese usuario es el que realmente escaneó el QR en este momento
- Si el usuario A ya conectó, y luego el usuario B inicia sesión, el evento puede reasignar incorrectamente

### 2. **Endpoint `/api/link-phone` (Líneas 1465-1473)**

**Problema:**
```javascript
if (existingRow) {
  if (existingRow.user_id !== userId) {
    // ❌ PROBLEMA: Permite re-vinculación sin validar que el usuario actual escaneó el QR
    console.log(`⚠️  El número estaba vinculado al usuario ${existingRow.user_id}, actualizando al usuario ${userId}`);
  }
}
// Luego hace INSERT OR REPLACE, sobrescribiendo el usuario anterior
```

**Por qué es incorrecto:**
- Permite que cualquier usuario autenticado "robe" el WhatsApp de otro usuario
- No valida que el usuario actual sea el que realmente escaneó el QR
- Solo verifica el token, pero el token puede ser de cualquier usuario

### 3. **QR Global, No por Usuario**

**Problema:**
- El QR se genera de forma global (`currentQR`)
- Cualquier usuario puede escanear cualquier QR
- No hay tracking de qué usuario solicitó qué QR

## ✅ Solución Propuesta

### Regla Fundamental:
**NUNCA actualizar `whatsapp_id` o `whatsapp_number` automáticamente. Solo actualizar cuando el usuario que escaneó el QR explícitamente llama a `/api/link-phone`.**

### Cambios Necesarios:

1. **Eliminar actualización automática en `connection === 'open'`**
   - NO buscar usuario por `whatsapp_id`
   - NO actualizar `users` automáticamente
   - Solo actualizar variables globales para estado del sistema

2. **Validar en `/api/link-phone` que el WhatsApp esté disponible**
   - Verificar que el `whatsapp_id` del socket NO esté ya vinculado a otro usuario
   - Si está vinculado a otro usuario, rechazar la vinculación (error 409)
   - Solo permitir vinculación si:
     - El WhatsApp NO está vinculado a ningún usuario, O
     - El WhatsApp está vinculado al mismo usuario (actualización)

3. **Tracking de QR por usuario (opcional, mejora futura)**
   - Asociar cada QR generado con el `user_id` que lo solicitó
   - Validar que solo ese usuario pueda vincular ese QR

## 🔧 Implementación

Ver archivo: `CORRECCION_REASIGNACION_WHATSAPP.js`
