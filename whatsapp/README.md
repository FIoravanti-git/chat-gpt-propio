# API de WhatsApp

API REST para conectar WhatsApp y gestionar mensajes y webhooks.

## Instalación

1. Instalar dependencias:
```bash
npm install
```

2. Copiar archivo de entorno:
```bash
cp .env.example .env
```

3. Iniciar el servidor:
```bash
npm start
```

## Configuración

### Primer uso

1. Al iniciar el servidor, se generará un código QR en la consola
2. Escanea el QR con WhatsApp desde tu teléfono:
   - Abre WhatsApp
   - Configuración → Dispositivos vinculados → Vincular un dispositivo
   - Escanea el código QR mostrado en la consola

3. Una vez conectado, verás el mensaje: "¡Cliente de WhatsApp listo!"

## Uso de la API

### Base URL
```
http://localhost:3001
```

### Endpoints

#### Estado del cliente
```http
GET /api/status
```

Respuesta:
```json
{
  "ready": true,
  "connected": true
}
```

#### Enviar mensaje
```http
POST /api/send-message
Content-Type: application/json

{
  "number": "1234567890",
  "message": "Hola desde la API"
}
```

**Nota:** El número debe incluir el código de país (ejemplo: 521234567890 para México)

Respuesta:
```json
{
  "success": true,
  "messageId": "true_1234567890@c.us_3EB0...",
  "timestamp": 1234567890
}
```

#### Registrar webhook
```http
POST /api/webhooks
Content-Type: application/json

{
  "url": "https://tu-servidor.com/webhook",
  "headers": {
    "Authorization": "Bearer token123"
  }
}
```

Respuesta:
```json
{
  "success": true,
  "webhook": {
    "id": "1234567890",
    "url": "https://tu-servidor.com/webhook",
    "headers": {},
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Listar webhooks
```http
GET /api/webhooks
```

Respuesta:
```json
{
  "webhooks": [
    {
      "id": "1234567890",
      "url": "https://tu-servidor.com/webhook",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### Eliminar webhook
```http
DELETE /api/webhooks/:id
```

#### Obtener chats
```http
GET /api/chats
```

#### Desconectar
```http
POST /api/disconnect
```

#### Reconectar
```http
POST /api/reconnect
```

## Webhooks

Cuando registres un webhook, recibirás notificaciones automáticas cuando lleguen mensajes a WhatsApp. El payload enviado al webhook será:

```json
{
  "from": "1234567890@c.us",
  "to": "mi-numero@c.us",
  "body": "Mensaje recibido",
  "timestamp": 1234567890,
  "isGroupMsg": false,
  "contact": {
    "name": "Nombre del contacto",
    "pushname": "Push name"
  }
}
```

## Ejemplos con cURL

### Enviar mensaje
```bash
curl -X POST http://localhost:3001/api/send-message \
  -H "Content-Type: application/json" \
  -d '{"number": "1234567890", "message": "Hola!"}'
```

### Registrar webhook
```bash
curl -X POST http://localhost:3001/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{"url": "https://tu-servidor.com/webhook"}'
```

## Notas

- La sesión de WhatsApp se guarda localmente en `whatsapp-session/` para no requerir escanear el QR cada vez
- El servidor debe estar en ejecución para recibir mensajes y activar webhooks
- Los webhooks fallidos no afectan el funcionamiento del sistema (solo se registran en la consola)
