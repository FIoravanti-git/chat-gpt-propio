# Modelo de Datos - WhatsApp API

## 📋 Conceptos Clave

### `whatsapp_id`
- **Tipo**: Identificador interno de WhatsApp
- **Origen**: Proporcionado por la API de WhatsApp (Baileys)
- **Formato**: Número entero (sin sufijos)
- **Ejemplo**: `138916556447751`
- **Propósito**: Identificación única del dispositivo/sesión en WhatsApp

### `phone_number` (whatsapp_number)
- **Tipo**: Número telefónico real del usuario
- **Origen**: Número de teléfono real del contacto
- **Formato**: Número entero (solo dígitos)
- **Ejemplo**: `595972908588`
- **Propósito**: Número telefónico real para comunicación

### ⚠️ IMPORTANTE
- **NO son el mismo número**
- **NO se diferencian solo por sufijos**
- **Son valores numéricos completamente distintos**
- **No hay relación matemática entre ellos**
- **Ambos son independientes y deben tratarse por separado**

## 🗄️ Modelo de Datos - Base de Datos

### Tabla `users`

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  token TEXT,
  role TEXT DEFAULT 'user',
  openai_api_key TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  
  -- Campos de WhatsApp (INDEPENDIENTES)
  whatsapp_id TEXT,           -- ID interno de WhatsApp (ej: 138916556447751)
  whatsapp_number TEXT         -- Número telefónico real (ej: 595972908588)
);
```

**Ejemplo de registro:**
```sql
INSERT INTO users (username, whatsapp_id, whatsapp_number) 
VALUES ('usuario1', '138916556447751', '595972908588');
```

### Tabla `whatsapp_sessions`

```sql
CREATE TABLE whatsapp_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  phone_number TEXT,           -- Formato completo con sufijo para compatibilidad
  status TEXT DEFAULT 'connected',
  connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**Ejemplo de registro:**
```sql
INSERT INTO whatsapp_sessions (user_id, phone_number, status) 
VALUES (1, '138916556447751@s.whatsapp.net', 'connected');
```

### Tabla `conversation_audit`

```sql
CREATE TABLE conversation_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  conversation_id INTEGER,
  channel TEXT,
  direction TEXT,
  role TEXT,
  content TEXT,
  whatsapp_id TEXT,            -- ID interno de WhatsApp (sin sufijo)
  whatsapp_number TEXT,        -- Número telefónico real
  message_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);
```

**Ejemplo de registro:**
```sql
INSERT INTO conversation_audit 
(user_id, whatsapp_id, whatsapp_number, content) 
VALUES (1, '138916556447751', '595972908588', 'Mensaje de prueba');
```

## 📊 Ejemplos de Datos Reales

### Ejemplo 1: Usuario con WhatsApp vinculado

| Campo | Valor | Descripción |
|-------|-------|-------------|
| `whatsapp_id` | `138916556447751` | ID interno de WhatsApp |
| `whatsapp_number` | `595972908588` | Número telefónico real |

**Observación**: Son números completamente distintos.

### Ejemplo 2: Otro usuario

| Campo | Valor | Descripción |
|-------|-------|-------------|
| `whatsapp_id` | `595986782672` | ID interno de WhatsApp |
| `whatsapp_number` | `595986782672` | Número telefónico real |

**Nota**: En este caso coinciden, pero no es la regla general.

### Ejemplo 3: Usuario sin relación

| Campo | Valor | Descripción |
|-------|-------|-------------|
| `whatsapp_id` | `123456789012345` | ID interno de WhatsApp |
| `whatsapp_number` | `9876543210` | Número telefónico real |

**Observación**: Claramente diferentes, sin relación matemática.

## 🔄 Flujo de Datos

1. **Conexión inicial**: Se obtiene `whatsapp_id` desde `socket.user.id`
2. **Vinculación**: Se proporciona `phone_number` (número real) desde el frontend
3. **Almacenamiento**: Ambos se guardan por separado en `users`
4. **Uso**: 
   - `whatsapp_id` → Para identificar sesión en WhatsApp
   - `whatsapp_number` → Para mostrar/identificar al usuario
