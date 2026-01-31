# Tabla de Auditoría de Conversaciones

## 📊 Estructura de la Tabla

La tabla `conversation_audit` registra todas las interacciones del sistema con información detallada para auditoría y análisis.

### Campos

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | INTEGER | ID único del registro (PRIMARY KEY) |
| `user_id` | INTEGER | ID del usuario que generó la interacción |
| `conversation_id` | INTEGER | ID de la conversación (NULL si no aplica) |
| `channel` | TEXT | Canal de origen: `'web'` o `'whatsapp'` |
| `direction` | TEXT | Dirección: `'incoming'` (entrada) o `'outgoing'` (salida) |
| `role` | TEXT | Rol del mensaje: `'user'` o `'assistant'` |
| `content` | TEXT | Contenido completo del mensaje |
| `whatsapp_number` | TEXT | Número de WhatsApp (NULL si canal es 'web') |
| `message_id` | INTEGER | ID del mensaje en tabla `messages` (NULL si no aplica) |
| `created_at` | DATETIME | Fecha y hora de la interacción (automático) |
| `ip_address` | TEXT | Dirección IP del cliente (NULL si no disponible) |
| `user_agent` | TEXT | User-Agent del navegador/cliente (NULL si no disponible) |
| `metadata` | TEXT | Metadata adicional en formato JSON (NULL si no aplica) |

### Índices

- `idx_audit_user_id` - Búsqueda rápida por usuario
- `idx_audit_conversation_id` - Búsqueda rápida por conversación
- `idx_audit_channel` - Filtrado por canal
- `idx_audit_created_at` - Ordenamiento por fecha
- `idx_audit_whatsapp_number` - Búsqueda por número de WhatsApp

---

## 🔍 Ejemplos de Consultas

### 1. Todas las interacciones de un usuario
```sql
SELECT * FROM conversation_audit 
WHERE user_id = 1 
ORDER BY created_at DESC;
```

### 2. Interacciones por canal
```sql
SELECT * FROM conversation_audit 
WHERE channel = 'whatsapp' 
ORDER BY created_at DESC;
```

### 3. Mensajes entrantes vs salientes
```sql
SELECT 
    direction,
    COUNT(*) as total,
    channel
FROM conversation_audit 
GROUP BY direction, channel;
```

### 4. Actividad por fecha
```sql
SELECT 
    DATE(created_at) as fecha,
    COUNT(*) as total_interacciones,
    COUNT(DISTINCT user_id) as usuarios_unicos
FROM conversation_audit 
GROUP BY DATE(created_at)
ORDER BY fecha DESC;
```

### 5. Interacciones de WhatsApp por número
```sql
SELECT 
    whatsapp_number,
    COUNT(*) as total_mensajes,
    MIN(created_at) as primera_interaccion,
    MAX(created_at) as ultima_interaccion
FROM conversation_audit 
WHERE channel = 'whatsapp' 
  AND whatsapp_number IS NOT NULL
GROUP BY whatsapp_number
ORDER BY total_mensajes DESC;
```

### 6. Conversaciones más activas
```sql
SELECT 
    conversation_id,
    COUNT(*) as total_mensajes,
    COUNT(DISTINCT user_id) as usuarios,
    MIN(created_at) as inicio,
    MAX(created_at) as fin
FROM conversation_audit 
WHERE conversation_id IS NOT NULL
GROUP BY conversation_id
ORDER BY total_mensajes DESC
LIMIT 10;
```

### 7. Usuarios más activos
```sql
SELECT 
    user_id,
    COUNT(*) as total_interacciones,
    COUNT(DISTINCT conversation_id) as conversaciones,
    COUNT(CASE WHEN channel = 'web' THEN 1 END) as web,
    COUNT(CASE WHEN channel = 'whatsapp' THEN 1 END) as whatsapp
FROM conversation_audit 
GROUP BY user_id
ORDER BY total_interacciones DESC;
```

### 8. Mensajes por hora del día
```sql
SELECT 
    strftime('%H', created_at) as hora,
    COUNT(*) as total
FROM conversation_audit 
GROUP BY hora
ORDER BY hora;
```

### 9. Interacciones desde una IP específica
```sql
SELECT * FROM conversation_audit 
WHERE ip_address = '192.168.1.100'
ORDER BY created_at DESC;
```

### 10. Resumen completo de actividad
```sql
SELECT 
    channel,
    direction,
    role,
    COUNT(*) as total,
    MIN(created_at) as primera,
    MAX(created_at) as ultima
FROM conversation_audit 
GROUP BY channel, direction, role
ORDER BY channel, direction, role;
```

---

## 📈 Métricas Útiles

### Volumen de mensajes por día
```sql
SELECT 
    DATE(created_at) as fecha,
    COUNT(*) as mensajes,
    COUNT(DISTINCT user_id) as usuarios,
    COUNT(DISTINCT conversation_id) as conversaciones
FROM conversation_audit 
WHERE created_at >= date('now', '-30 days')
GROUP BY fecha
ORDER BY fecha DESC;
```

### Tiempo promedio entre mensajes
```sql
SELECT 
    conversation_id,
    AVG(
        (julianday(created_at) - julianday(LAG(created_at) OVER (PARTITION BY conversation_id ORDER BY created_at))) * 24 * 60
    ) as minutos_promedio
FROM conversation_audit 
WHERE conversation_id IS NOT NULL
GROUP BY conversation_id;
```

### Distribución de canales
```sql
SELECT 
    channel,
    COUNT(*) * 100.0 / (SELECT COUNT(*) FROM conversation_audit) as porcentaje
FROM conversation_audit 
GROUP BY channel;
```

---

## 🔐 Consideraciones de Seguridad

1. **Datos Sensibles**: El campo `content` contiene mensajes completos. Considerar encriptación si se almacenan datos sensibles.

2. **Retención**: Implementar política de retención para no acumular datos indefinidamente:
   ```sql
   DELETE FROM conversation_audit 
   WHERE created_at < date('now', '-1 year');
   ```

3. **Acceso**: Solo usuarios con permisos de administrador deben poder consultar esta tabla.

4. **Privacidad**: El campo `ip_address` puede contener información personal. Considerar anonimización.

---

## 🛠️ Mantenimiento

### Limpiar registros antiguos (más de 1 año)
```sql
DELETE FROM conversation_audit 
WHERE created_at < date('now', '-1 year');
```

### Vaciar tabla (cuidado - irreversible)
```sql
DELETE FROM conversation_audit;
```

### Exportar datos a CSV
```bash
sqlite3 auth.db <<EOF
.headers on
.mode csv
.output audit_export.csv
SELECT * FROM conversation_audit;
.quit
EOF
```

---

## 📝 Notas

- La tabla se crea automáticamente al iniciar el servidor de autenticación
- Los registros se generan automáticamente en cada interacción
- El campo `metadata` puede usarse para almacenar información adicional en formato JSON
- Los índices mejoran significativamente el rendimiento de las consultas
