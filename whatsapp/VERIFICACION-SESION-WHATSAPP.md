# Verificación: sesión WhatsApp y datos en usuario

Después de los cambios que persisten la sesión y actualizan `users.whatsapp_id` / `users.whatsapp_number`, sigue estos pasos para comprobar que todo funciona.

## 1. Reiniciar el servicio de WhatsApp

```bash
# Detener lo que use el puerto 3001 y levantar de nuevo
fuser -k 3001/tcp 2>/dev/null
cd /opt/proyectos/chat-gpt-propio/whatsapp && node index.js
```

(O en segundo plano: `nohup node index.js > /tmp/whatsapp-api.log 2>&1 &`)

## 2. Flujo a verificar (usuario que NO es admin)

1. **Entrar** a la app con un usuario **normal** (no admin).
2. **Abrir el panel de WhatsApp** (botón de vincular WhatsApp) para que se genere el QR.
3. **Escanear el QR** con el teléfono (WhatsApp → Dispositivos vinculados → Vincular dispositivo).
4. **Comprobar en pantalla:** debe mostrarse "Conectado" y el modal puede cerrarse.
5. **Ir a Gestión de usuarios** (como admin, en otra pestaña o con otro usuario admin):
   - En la fila de ese usuario deben aparecer **ID Whatsapp** y **Número WhatsApp** (ya no vacíos).
6. **Cerrar sesión** (o cerrar el navegador) con ese usuario.
7. **Volver a entrar** con el mismo usuario y abrir de nuevo el panel de WhatsApp.
8. **Comprobar:** debe mostrarse **Conectado** sin pedir QR de nuevo (no debe aparecer código QR).

## 3. Comprobar en base de datos (opcional)

```bash
cd /opt/proyectos/chat-gpt-propio/front-chatgpt/server
sqlite3 auth.db "SELECT id, username, whatsapp_id, whatsapp_number FROM users WHERE whatsapp_id IS NOT NULL;"
sqlite3 auth.db "SELECT user_id, phone_number, status, connected_at FROM whatsapp_sessions;"
```

Deberías ver:
- En `users`: el usuario con `whatsapp_id` y `whatsapp_number` rellenados.
- En `whatsapp_sessions`: una fila con `status = connected` para ese `user_id`.

## 4. Si algo falla

- **Sigue pidiendo QR al volver a entrar:** Revisar que exista `whatsapp/baileys_auth/user_<ID>/creds.json` después de escanear. Revisar logs del proceso de WhatsApp (buscar "Sesión restaurada" o "whatsapp_id asignado").
- **No aparecen ID/Número en Gestión de usuarios:** Revisar que el usuario con el que escaneaste no sea admin (los admin no pueden vincular WhatsApp). Revisar logs para "users actualizado - whatsapp_id".
