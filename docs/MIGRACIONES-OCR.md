# Migraciones OCR / Comprobantes

## Cambios aplicados (Paso 1)

### 1. Tabla `users`

- **Nueva columna:** `tipo_usuario` TEXT DEFAULT `'Quivr/OpenAi'`
- **Valores permitidos:** `"Quivr/OpenAi"` | `"OCR/OpenAi"`
- Se aplica con `ALTER TABLE users ADD COLUMN tipo_usuario ...` al arrancar el servidor de auth.

### 2. Tabla `comprobantes`

| Columna            | Tipo     | Descripción                          |
|--------------------|----------|--------------------------------------|
| id                 | INTEGER  | PK, AUTOINCREMENT                    |
| user_id            | INTEGER  | FK users(id), NOT NULL               |
| fechaComprobante   | TEXT     | Fecha del comprobante                |
| numeroComprobante  | TEXT     | Número de comprobante                |
| importe            | REAL     | Importe                              |
| descripcion        | TEXT     | Descripción                          |
| fechaHoraRegistro  | DATETIME | DEFAULT CURRENT_TIMESTAMP           |

- Índice: `idx_comprobantes_user_id` sobre `user_id`.

### 3. API Auth actualizada

- **Login:** respuesta incluye `tipo_usuario`.
- **Verify:** respuesta incluye `tipo_usuario`.
- **GET /api/auth/users:** incluye `tipo_usuario` en cada usuario.
- **POST /api/auth/users:** body puede incluir `tipo_usuario` (`"Quivr/OpenAi"` | `"OCR/OpenAi"`).
- **PUT /api/auth/users/:id:** body puede incluir `tipo_usuario` para actualizar.
- **GET /api/auth/comprobantes:** (nuevo) devuelve los comprobantes del usuario autenticado.

### 4. Valores por defecto

- Usuarios existentes y nuevos sin `tipo_usuario` explícito: `Quivr/OpenAi`.
- Crear/editar usuarios OCR desde el panel de admin usando `tipo_usuario: "OCR/OpenAi"`.

---

## Paso 2: Lógica backend OCR

- Módulo **`whatsapp/ocr-comprobante.js`**: recibe buffer de imagen y `userId`, ejecuta Tesseract OCR, envía texto a OpenAI para estructurar (fechaComprobante, numeroComprobante, importe, descripcion) e inserta en la tabla `comprobantes`.
- Dependencias en WhatsApp: `tesseract.js`, `openai`.
- API key: `users.openai_api_key` o variable de entorno `OPENAI_API_KEY`.
- Documentación: `whatsapp/OCR-COMPROBANTES.md`.

---

## Paso 3: Flujo WhatsApp → OCR

- En `whatsapp/index.js`, dentro de `messages.upsert`: si el mensaje es una **imagen** (`msg.message.imageMessage`) y el usuario tiene `tipo_usuario === 'OCR/OpenAi'`, se descarga la imagen, se llama a `processImageForComprobante(buffer, userId)` y se envía por WhatsApp la confirmación con los datos del comprobante (o mensaje de error).
- El flujo de mensajes de texto y Quivr no se modifica.
