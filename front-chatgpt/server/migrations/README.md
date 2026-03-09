# Migraciones de base de datos (auth.db)

Las migraciones del módulo OCR/Comprobantes se aplican **automáticamente** al iniciar el servidor de autenticación (`auth-server.js`).

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `001_add_tipo_usuario_to_users.sql` | Añade columna `tipo_usuario` a `users` (default: `Quivr/OpenAi`) |
| `002_create_table_comprobantes.sql` | Crea tabla `comprobantes` e índice por `user_id` |

## Aplicación manual (opcional)

Si quisieras ejecutar el SQL a mano sobre `auth.db`:

```bash
cd /opt/proyectos/chat-gpt-propio/front-chatgpt/server
sqlite3 auth.db < migrations/001_add_tipo_usuario_to_users.sql
sqlite3 auth.db < migrations/002_create_table_comprobantes.sql
```

En SQLite, `ALTER TABLE ... ADD COLUMN` falla si la columna ya existe; en ese caso se puede ignorar el error. El servidor ya maneja eso en código.

## Verificar

```bash
sqlite3 auth.db ".schema users"   # debe listar tipo_usuario
sqlite3 auth.db ".schema comprobantes"
```
