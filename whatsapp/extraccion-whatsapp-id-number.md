# Extracción de whatsapp_id y whatsapp_number al conectar un dispositivo

## 📍 Ubicación del campo en el objeto de conexión

Cuando se conecta un nuevo dispositivo, el **whatsapp_id** y **whatsapp_number** se obtienen del objeto `socket.user.id` que está disponible **después** de que la conexión se establece (`connection === 'open'`).

## 🔍 Campo origen: `socket.user.id`

El campo que contiene la información es:

```javascript
socket.user.id
```

### Formato del campo `socket.user.id`:

El formato puede variar, pero los más comunes son:

1. **Formato con `:lid`**: `"138916556447751:lid"`
2. **Formato con `:algo@s.whatsapp.net`**: `"595986782672:48@s.whatsapp.net"`
3. **Formato con `@s.whatsapp.net`**: `"595986782672@s.whatsapp.net"`
4. **Solo número**: `"595986782672"`

## 📊 Estructura completa del objeto `socket.user`:

```json
{
  "id": "595986782672:48@s.whatsapp.net",
  "name": "Usuario",
  "phone": {
    "wa_version": "2.24.7.84",
    "mcc": "744",
    "mnc": "01",
    "os_version": "Android 13",
    "device_manufacturer": "Samsung",
    "device_model": "SM-G991B",
    "os_build_number": "TP1A.220624.014"
  }
}
```

## 🔧 Cómo se extraen los valores

### 1. Cuando se conecta (evento `connection.update` con `connection === 'open'`)

**Ubicación en el código**: Línea 662 de `whatsapp/index.js`

```javascript
// Obtener número de teléfono de la sesión conectada
const phoneNumber = socket.user?.id?.split(':')[0] || null;
```

**Extracción**:
- Se toma `socket.user.id`
- Se divide por `:` y se toma la primera parte (antes del `:`)
- Ejemplo: `"595986782672:48@s.whatsapp.net"` → `"595986782672"`

### 2. En el endpoint `/api/link-phone` (cuando se vincula al usuario)

**Ubicación en el código**: Líneas 1249-1283 de `whatsapp/index.js`

```javascript
if (socket && socket.user && socket.user.id) {
  const fullId = socket.user.id;
  console.log(`🔍 socket.user.id completo: ${fullId}`);
  
  // Extraer solo el número (sin sufijo) para whatsapp_id
  whatsappIdNumber = fullId.split(':')[0].split('@')[0];
  
  // Para whatsapp_number, se usa el body o el whatsappIdNumber como fallback
  let phoneNumber = req.body.phoneNumber || whatsappIdNumber;
  phoneNumber = normalizePhoneNumber(phoneNumber);
}
```

## 📝 Proceso completo de extracción

### Paso 1: Conexión exitosa
```javascript
// Cuando connection === 'open'
socket.user.id = "595986782672:48@s.whatsapp.net"
```

### Paso 2: Extracción del ID (whatsapp_id)
```javascript
// En /api/link-phone
const fullId = socket.user.id; // "595986782672:48@s.whatsapp.net"
whatsappIdNumber = fullId.split(':')[0].split('@')[0]; // "595986782672"
```

**Resultado**: `whatsapp_id = "595986782672"` (SIN sufijo)

### Paso 3: Extracción del número real (whatsapp_number)
```javascript
// Opción 1: Desde el body (si se proporciona)
let phoneNumber = req.body.phoneNumber; // "595972908588"

// Opción 2: Fallback al whatsappIdNumber
if (!phoneNumber) {
  phoneNumber = whatsappIdNumber; // "595986782672"
}

// Normalizar (solo dígitos)
phoneNumber = normalizePhoneNumber(phoneNumber);
```

**Resultado**: `whatsapp_number = "595972908588"` o `"595986782672"` (solo dígitos)

## 🗄️ Guardado en la base de datos

### Tabla `users`:

```sql
UPDATE users 
SET whatsapp_id = ?, whatsapp_number = ? 
WHERE id = ?
```

**Valores**:
- `whatsapp_id`: `"595986782672"` (extraído de `socket.user.id`, sin sufijo)
- `whatsapp_number`: `"595972908588"` (del body o fallback al whatsappIdNumber, normalizado)

### Tabla `whatsapp_sessions`:

```sql
INSERT OR REPLACE INTO whatsapp_sessions (user_id, phone_number, status, connected_at) 
VALUES (?, ?, 'connected', CURRENT_TIMESTAMP)
```

**Valores**:
- `phone_number`: `"595986782672@s.whatsapp.net"` (formato completo con sufijo para compatibilidad)

## 📋 Resumen de campos

| Campo | Origen | Extracción | Ejemplo |
|-------|--------|------------|---------|
| `socket.user.id` | Baileys (después de conexión) | Campo directo | `"595986782672:48@s.whatsapp.net"` |
| `whatsapp_id` | `socket.user.id` | `split(':')[0].split('@')[0]` | `"595986782672"` |
| `whatsapp_number` | `req.body.phoneNumber` o `whatsappIdNumber` | `normalizePhoneNumber()` | `"595972908588"` |

## 🔄 Flujo completo

1. **Dispositivo escanea QR** → Baileys genera `connection.update` con `connection: "open"`
2. **Socket se establece** → `socket.user.id` está disponible
3. **Frontend detecta conexión** → Llama a `/api/link-phone`
4. **Backend extrae**:
   - `whatsapp_id` desde `socket.user.id` (sin sufijo)
   - `whatsapp_number` desde `req.body.phoneNumber` o fallback
5. **Backend guarda** en `users` y `whatsapp_sessions`

## ⚠️ Notas importantes

1. **`socket.user.id` solo está disponible DESPUÉS de `connection === 'open'`**
2. **`whatsapp_id` siempre se guarda SIN sufijo** (solo número)
3. **`whatsapp_number` puede ser diferente a `whatsapp_id`** (número real del usuario)
4. **Si no se proporciona `phoneNumber` en el body**, se usa `whatsappIdNumber` como fallback
5. **El formato de `socket.user.id` puede variar**, por eso se normaliza con `split(':')[0].split('@')[0]`
