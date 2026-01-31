# Respuestas JSON de la API - WhatsApp

## 📡 Endpoint: `/api/status`

### Respuesta cuando está conectado

```json
{
  "ready": true,
  "connected": true,
  "whatsapp_id": "138916556447751",
  "whatsapp_number": "595972908588"
}
```

**Campos:**
- `ready`: `boolean` - Indica si WhatsApp está listo
- `connected`: `boolean` - Indica si hay conexión activa
- `whatsapp_id`: `string` - ID interno de WhatsApp (número entero como string)
- `whatsapp_number`: `string` - Número telefónico real (número entero como string)

### Respuesta cuando NO está conectado

```json
{
  "ready": false,
  "connected": false,
  "whatsapp_id": null,
  "whatsapp_number": null
}
```

### Respuesta cuando está conectando (QR disponible)

```json
{
  "ready": false,
  "connected": false,
  "whatsapp_id": null,
  "whatsapp_number": null
}
```

## 📡 Endpoint: `/api/qr`

### Respuesta con QR disponible

```json
{
  "qr": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "ready": false
}
```

### Respuesta cuando ya está conectado

```json
{
  "qr": null,
  "ready": true,
  "message": "Ya está conectado"
}
```

## 📡 Endpoint: `/api/link-phone` (POST)

### Request Body

```json
{
  "phoneNumber": "595972908588"
}
```

**Campos:**
- `phoneNumber`: `string` (opcional) - Número telefónico real del usuario
  - Si no se proporciona, se usa `whatsapp_id` como fallback temporal

### Respuesta exitosa

```json
{
  "success": true,
  "message": "Número vinculado correctamente",
  "whatsappId": "138916556447751",
  "whatsapp_id": "138916556447751",
  "phoneNumber": "595972908588",
  "whatsapp_number": "595972908588",
  "userId": 3,
  "wasLinked": false,
  "previousUserId": null,
  "rowsAffected": 1
}
```

**Campos:**
- `success`: `boolean` - Indica si la operación fue exitosa
- `whatsappId` / `whatsapp_id`: `string` - ID interno de WhatsApp (sin sufijo)
- `phoneNumber` / `whatsapp_number`: `string` - Número telefónico real
- `userId`: `number` - ID del usuario en la base de datos
- `wasLinked`: `boolean` - Indica si ya estaba vinculado anteriormente
- `rowsAffected`: `number` - Filas afectadas en la base de datos

## 📡 Endpoint: `/api/auth/users` (GET)

### Respuesta con usuarios

```json
[
  {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "token": "abc123...",
    "openai_api_key": null,
    "whatsapp_id": "595986782672",
    "whatsapp_number": "595986782672",
    "created_at": "2026-01-19 16:11:18",
    "last_login": null
  },
  {
    "id": 3,
    "username": "diosnel",
    "role": "user",
    "token": "def456...",
    "openai_api_key": null,
    "whatsapp_id": "138916556447751",
    "whatsapp_number": "595972908588",
    "created_at": "2026-01-26 10:00:00",
    "last_login": null
  }
]
```

**Observación**: Cada usuario tiene `whatsapp_id` y `whatsapp_number` como campos separados e independientes.

## 📡 Endpoint: Mensajes recibidos (webhook)

### Estructura del mensaje recibido

```json
{
  "from": "138916556447751@lid",
  "body": "Hola, este es un mensaje",
  "timestamp": 1706234567,
  "isGroupMsg": false
}
```

**Nota**: El campo `from` contiene el `whatsapp_id` con sufijo. Para obtener el `whatsapp_number`, se debe buscar en la base de datos.

## 📋 Resumen de Campos en Respuestas

| Endpoint | Campo `whatsapp_id` | Campo `whatsapp_number` | Notas |
|----------|---------------------|-------------------------|-------|
| `/api/status` | ✅ Sí | ✅ Sí | Ambos disponibles cuando está conectado |
| `/api/link-phone` | ✅ Sí | ✅ Sí | Ambos en la respuesta |
| `/api/auth/users` | ✅ Sí | ✅ Sí | Ambos por cada usuario |
| `/api/qr` | ❌ No | ❌ No | Solo estado de conexión |

## ⚠️ Reglas de Negocio

1. **Independencia**: `whatsapp_id` y `whatsapp_number` son completamente independientes
2. **Formato**: Ambos son strings que contienen números enteros
3. **Origen**:
   - `whatsapp_id` → Viene de `socket.user.id` (API de WhatsApp)
   - `whatsapp_number` → Viene del frontend o base de datos
4. **Uso**:
   - `whatsapp_id` → Para operaciones internas de WhatsApp
   - `whatsapp_number` → Para identificación y comunicación con el usuario
5. **Validación**: No se debe asumir ninguna relación entre ambos valores
