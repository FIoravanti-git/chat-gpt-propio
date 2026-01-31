# Estructura del JSON que recibe la API cuando llega un nuevo mensaje

## Evento: `messages.upsert`

El evento `messages.upsert` de Baileys envía un objeto con la siguiente estructura:

```json
{
  "type": "notify" | "append",
  "messages": [
    {
      "key": {
        "remoteJid": "595986782672@s.whatsapp.net",
        "fromMe": false,
        "id": "3EB0A1B2C3D4E5F6",
        "participant": null
      },
      "messageTimestamp": 1706234567,
      "pushName": "Nombre del Usuario",
      "message": {
        "conversation": "Texto del mensaje simple"
        // O
        "extendedTextMessage": {
          "text": "Texto del mensaje extendido",
          "contextInfo": {
            "quotedMessage": { ... },
            "mentionedJid": ["595986782672@s.whatsapp.net"]
          }
        }
        // O otros tipos: imageMessage, videoMessage, audioMessage, etc.
      },
      "messageType": "conversation" | "extendedTextMessage" | "imageMessage" | ...
    }
  ]
}
```

## Campos principales:

### `type`
- `"notify"`: Mensaje nuevo recibido
- `"append"`: Mensaje añadido a una conversación existente

### `messages[]`
Array de mensajes recibidos

### `key`
- `remoteJid`: ID del remitente (formato: `numero@s.whatsapp.net` o `numero@lid`)
- `fromMe`: `true` si el mensaje es del propio bot, `false` si es de otro usuario
- `id`: ID único del mensaje
- `participant`: En grupos, el ID del participante que envió el mensaje

### `messageTimestamp`
Timestamp Unix del mensaje

### `pushName`
Nombre del contacto que envió el mensaje

### `message`
Objeto que contiene el contenido del mensaje según su tipo:
- `conversation`: Mensaje de texto simple
- `extendedTextMessage`: Mensaje de texto extendido (puede incluir menciones, respuestas, etc.)
- `imageMessage`: Imagen
- `videoMessage`: Video
- `audioMessage`: Audio
- `documentMessage`: Documento
- Y otros tipos...

## Ejemplo de uso en el código:

```javascript
socket.ev.on('messages.upsert', async (m) => {
  const messages = m.messages;
  
  for (const msg of messages) {
    if (msg.key.fromMe) continue; // Ignorar mensajes propios
    
    const from = msg.key.remoteJid; // "595986782672@s.whatsapp.net"
    const messageText = msg.message.conversation 
      || msg.message.extendedTextMessage?.text 
      || '';
    
    // Procesar mensaje...
  }
});
```
