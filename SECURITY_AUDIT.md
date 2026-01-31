# Auditoría de Seguridad - Multi-Tenancy

## 🔴 FALLOS CRÍTICOS ENCONTRADOS

### 1. **CRÍTICO: Acceso a conversaciones de otros usuarios**
**Ubicación:** `ia-nuevo/src/api.py` - Función `get_conversation_messages()` (línea 139)

**Problema:**
```python
def get_conversation_messages(conversation_id: int, limit: int = 20):
    # ❌ NO valida que conversation_id pertenezca al usuario
    cursor.execute(
        '''SELECT role, content, created_at
           FROM messages 
           WHERE conversation_id = ?
           ORDER BY created_at ASC
           LIMIT ?''',
        (conversation_id, limit)
    )
```

**Impacto:** Un usuario puede enviar un `conversation_id` de otro usuario en el endpoint `/ask` y acceder a todo su historial de conversación.

**Explotación:**
```python
# Usuario malicioso envía:
POST /ask
{
  "question": "¿Qué documentos tengo?",
  "conversation_id": 123  # ID de conversación de otro usuario
}
# → Accede al historial completo del usuario 123
```

**Solución:** Validar que `conversation_id` pertenezca al `user_id` autenticado.

---

### 2. **CRÍTICO: Inyección de mensajes en conversaciones ajenas**
**Ubicación:** `ia-nuevo/src/api.py` - Función `save_message_to_db()` (línea 196) y endpoint `/ask` (línea 398)

**Problema:**
```python
# En /ask endpoint:
if request.conversation_id:
    save_message_to_db(request.conversation_id, 'user', request.question)
    save_message_to_db(request.conversation_id, 'assistant', answer)
```

**Impacto:** Un usuario puede inyectar mensajes (tanto suyos como del asistente) en conversaciones de otros usuarios.

**Explotación:**
```python
POST /ask
{
  "question": "Mensaje malicioso",
  "conversation_id": 456  # Conversación de otro usuario
}
# → Inyecta mensajes en la conversación del usuario 456
```

**Solución:** Validar que `conversation_id` pertenezca al `user_id` antes de guardar.

---

### 3. **CRÍTICO: Acceso a mensajes sin validación de pertenencia**
**Ubicación:** `ia-nuevo/src/api.py` - Endpoint `/ask` (línea 386)

**Problema:**
```python
if request.conversation_id:
    conversation_history = get_conversation_messages(request.conversation_id, limit=20)
    # ❌ Usa historial sin validar pertenencia
```

**Impacto:** El historial de otro usuario se incluye en el contexto de la pregunta, exponiendo información privada.

**Solución:** Validar pertenencia antes de obtener mensajes.

---

### 4. **MEDIO: WhatsApp - Búsqueda ambigua por número**
**Ubicación:** `whatsapp/index.js` - Función `getUserFromPhoneNumber()` (línea 72)

**Problema:**
```javascript
// Si no encuentra exacto, usa LIKE
db.get(
  'SELECT user_id FROM whatsapp_sessions WHERE phone_number LIKE ?',
  [`%${cleanNumber}%`],
  ...
)
```

**Impacto:** Si hay números similares (ej: "123" y "1234"), podría devolver el usuario incorrecto.

**Solución:** Usar búsqueda exacta o validar formato completo del número.

---

### 5. **MEDIO: WhatsApp - Múltiples conversaciones por usuario**
**Ubicación:** `whatsapp/index.js` - Función `getOrCreateWhatsAppConversation()` (línea 113)

**Problema:** Siempre crea nueva conversación si no encuentra una existente, pero la búsqueda podría fallar por formato de número.

**Impacto:** Se crean múltiples conversaciones para el mismo usuario/número, fragmentando el historial.

**Solución:** Mejorar búsqueda y usar conversación existente cuando sea posible.

---

### 6. **BAJO: get_or_create_conversation siempre crea nueva**
**Ubicación:** `ia-nuevo/src/api.py` - Función `get_or_create_conversation()` (línea 166)

**Problema:** La función siempre crea una nueva conversación, nunca busca existente.

**Impacto:** Múltiples conversaciones para el mismo usuario/canal, fragmentando historial.

**Solución:** Buscar conversación existente antes de crear.

---

## ✅ VALIDACIONES ADICIONALES NECESARIAS

### 1. Validar conversation_id pertenece al usuario
```python
def validate_conversation_belongs_to_user(conversation_id: int, user_id: int) -> bool:
    """Valida que una conversación pertenezca al usuario."""
    conn = sqlite3.connect(str(auth_db_path))
    cursor = conn.cursor()
    cursor.execute(
        'SELECT id FROM conversations WHERE id = ? AND user_id = ?',
        (conversation_id, user_id)
    )
    result = cursor.fetchone() is not None
    conn.close()
    return result
```

### 2. Validar document_id pertenece al usuario
```python
def validate_document_belongs_to_user(document_id: int, user_id: int) -> bool:
    """Valida que un documento pertenezca al usuario."""
    conn = sqlite3.connect(str(auth_db_path))
    cursor = conn.cursor()
    cursor.execute(
        'SELECT id FROM documents WHERE id = ? AND user_id = ? AND status = "active"',
        (document_id, user_id)
    )
    result = cursor.fetchone() is not None
    conn.close()
    return result
```

### 3. Validar whatsapp_session_id pertenece al usuario
```python
def validate_whatsapp_session_belongs_to_user(session_id: int, user_id: int) -> bool:
    """Valida que una sesión de WhatsApp pertenezca al usuario."""
    conn = sqlite3.connect(str(auth_db_path))
    cursor = conn.cursor()
    cursor.execute(
        'SELECT id FROM whatsapp_sessions WHERE id = ? AND user_id = ?',
        (session_id, user_id)
    )
    result = cursor.fetchone() is not None
    conn.close()
    return result
```

### 4. Sanitizar y validar números de teléfono en WhatsApp
```javascript
function normalizePhoneNumber(phoneNumber) {
  // Remover caracteres no numéricos excepto +
  let normalized = phoneNumber.replace(/[^\d+]/g, '');
  
  // Validar formato básico
  if (!normalized.match(/^\+\d{10,15}$/)) {
    throw new Error('Formato de número inválido');
  }
  
  return normalized;
}
```

### 5. Rate limiting por usuario
```python
# Implementar límites de requests por usuario para prevenir abuso
from collections import defaultdict
from time import time

request_counts = defaultdict(list)
RATE_LIMIT = 100  # requests por minuto

def check_rate_limit(user_id: int) -> bool:
    now = time()
    user_requests = request_counts[user_id]
    # Limpiar requests antiguos (más de 1 minuto)
    user_requests[:] = [req_time for req_time in user_requests if now - req_time < 60]
    
    if len(user_requests) >= RATE_LIMIT:
        return False
    
    user_requests.append(now)
    return True
```

---

## 🔒 CORRECCIONES PRIORITARIAS

### Prioridad 1 (CRÍTICO - Implementar inmediatamente):

1. **Validar conversation_id en `/ask` endpoint**
2. **Validar conversation_id en `get_conversation_messages()`**
3. **Validar conversation_id en `save_message_to_db()`**

### Prioridad 2 (MEDIO - Implementar pronto):

4. **Mejorar búsqueda de números en WhatsApp**
5. **Mejorar `get_or_create_conversation()` para buscar existentes**

### Prioridad 3 (BAJO - Mejoras):

6. **Implementar rate limiting**
7. **Agregar logging de accesos sospechosos**
8. **Validar formato de inputs (conversation_id, document_id, etc.)**

---

## 📋 CHECKLIST DE SEGURIDAD

- [ ] Todos los endpoints validan `user_id` del token
- [ ] Todos los `conversation_id` se validan contra `user_id`
- [ ] Todos los `document_id` se validan contra `user_id`
- [ ] Todos los `whatsapp_session_id` se validan contra `user_id`
- [ ] No se confía en IDs enviados desde el frontend sin validación
- [ ] Las consultas SQL siempre incluyen filtro por `user_id`
- [ ] Los mensajes de WhatsApp se validan antes de procesar
- [ ] Rate limiting implementado
- [ ] Logging de accesos sospechosos
- [ ] Validación de formato de inputs

---

## 🛡️ PRINCIPIOS DE SEGURIDAD APLICADOS

1. **Never Trust the Client**: Todos los IDs del frontend se validan en el backend
2. **Defense in Depth**: Múltiples capas de validación
3. **Principle of Least Privilege**: Usuarios solo acceden a sus propios datos
4. **Fail Secure**: Si falla la validación, se deniega el acceso
5. **Input Validation**: Todos los inputs se validan y sanitizan
