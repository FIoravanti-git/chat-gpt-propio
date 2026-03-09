# OCR Comprobantes (Paso 2)

Módulo que procesa imágenes de comprobantes: **Tesseract OCR** → **OpenAI** (estructuración) → **tabla comprobantes**.

## Uso

```js
const { processImageForComprobante } = require('./ocr-comprobante');

// imageBuffer = Buffer (PNG/JPEG de la imagen)
// userId = id del usuario en la tabla users (tipo_usuario = "OCR/OpenAi")
const resultado = await processImageForComprobante(imageBuffer, userId);
// resultado: { id, fechaComprobante, numeroComprobante, importe, descripcion, fechaHoraRegistro }
```

## Dependencias

- **tesseract.js**: OCR sobre el buffer de imagen (español + inglés).
- **openai**: envío del texto a GPT para extraer fecha, número, importe y descripción.

## API key de OpenAI

1. Por usuario: campo `openai_api_key` en la tabla `users`.
2. Global: variable de entorno `OPENAI_API_KEY` en el servidor WhatsApp (`.env`).

Si el usuario tiene `openai_api_key` se usa esa; si no, se usa `OPENAI_API_KEY`.

## Integración

Este módulo se invoca desde el flujo de mensajes de WhatsApp (Paso 3): cuando un usuario con `tipo_usuario = "OCR/OpenAi"` envía una **imagen** por WhatsApp, el backend:

1. Descarga la imagen con `downloadMediaMessage`.
2. Llama a `processImageForComprobante(buffer, userId)`.
3. Envía por WhatsApp un mensaje de confirmación con los datos extraídos (o un mensaje de error si falla).
