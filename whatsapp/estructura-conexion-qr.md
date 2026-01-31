# Estructura del JSON cuando se conecta un nuevo dispositivo con QR

## 1. Evento `connection.update` - Cuando hay QR disponible

Este es el objeto que recibe el handler cuando Baileys genera un nuevo QR:

```json
{
  "connection": "connecting",
  "qr": "2@abc123def456ghi789jkl012mno345pqr678stu901vwx234yz",
  "lastDisconnect": null,
  "isNewLogin": false,
  "isOnline": false,
  "receivedPendingNotifications": false
}
```

### Campos:
- `connection`: Estado de la conexión (`"connecting"`, `"open"`, `"close"`)
- `qr`: String del código QR (se convierte a imagen base64 con QRCode.toDataURL)
- `lastDisconnect`: Objeto con información del último desconexión (si aplica)
- `isNewLogin`: `true` si es un nuevo login, `false` si es reconexión
- `isOnline`: Estado online/offline
- `receivedPendingNotifications`: Si se recibieron notificaciones pendientes

## 2. Evento `connection.update` - Cuando se conecta exitosamente

Cuando el dispositivo escanea el QR y se conecta:

```json
{
  "connection": "open",
  "qr": null,
  "lastDisconnect": null,
  "isNewLogin": true,
  "isOnline": true,
  "receivedPendingNotifications": false,
  "user": {
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
}
```

### Campos adicionales cuando está conectado:
- `user`: Información del usuario conectado
  - `id`: ID de WhatsApp (formato: `numero:algo@s.whatsapp.net`)
  - `name`: Nombre del usuario
  - `phone`: Información del dispositivo
    - `wa_version`: Versión de WhatsApp
    - `mcc`: Mobile Country Code
    - `mnc`: Mobile Network Code
    - `os_version`: Versión del sistema operativo
    - `device_manufacturer`: Fabricante del dispositivo
    - `device_model`: Modelo del dispositivo
    - `os_build_number`: Número de build del OS

## 3. Respuesta del endpoint `/api/qr` - QR disponible

Cuando se consulta `/api/qr` y hay un QR disponible:

```json
{
  "qr": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "ready": false
}
```

### Campos:
- `qr`: String base64 de la imagen QR (formato data URL: `data:image/png;base64,...`)
- `ready`: `false` si aún no está conectado

## 4. Respuesta del endpoint `/api/qr` - Ya conectado

Cuando se consulta `/api/qr` y ya está conectado:

```json
{
  "qr": null,
  "ready": true,
  "message": "Ya está conectado"
}
```

### Campos:
- `qr`: `null` (no hay QR porque ya está conectado)
- `ready`: `true` (conectado)
- `message`: Mensaje informativo

## 5. Respuesta del endpoint `/api/qr` - QR no disponible aún

Cuando se consulta `/api/qr` pero el QR aún no está disponible:

```json
{
  "qr": null,
  "ready": false,
  "message": "QR aún no disponible, esperando..."
}
```

## 6. Respuesta del endpoint `/api/status`

Estado general de la conexión:

```json
{
  "ready": true,
  "connected": true
}
```

### Campos:
- `ready`: `true` si está listo y conectado, `false` si no
- `connected`: `true` si hay un socket activo, `false` si no

## Flujo de conexión:

1. **Inicialización**: Se llama a `initializeWhatsApp()`
2. **QR generado**: Baileys emite `connection.update` con `qr` disponible
3. **QR convertido**: El código QR se convierte a imagen base64 y se guarda en `currentQR`
4. **Frontend consulta**: El frontend llama a `/api/qr` y recibe la imagen base64
5. **Usuario escanea**: El usuario escanea el QR con WhatsApp
6. **Conexión exitosa**: Baileys emite `connection.update` con `connection: "open"`
7. **Estado actualizado**: `isReady = true`, `currentQR = null`
8. **Frontend detecta**: El frontend detecta `ready: true` en `/api/status`

## Notas importantes:

- El QR expira en aproximadamente 20 segundos
- Si el QR expira, Baileys genera uno nuevo automáticamente
- El formato del QR es un string que se convierte a imagen con `QRCode.toDataURL()`
- Cuando se conecta, `socket.user.id` contiene el ID de WhatsApp del dispositivo conectado
- El ID puede tener formato: `"595986782672:48@s.whatsapp.net"` o `"595986782672:lid"`
