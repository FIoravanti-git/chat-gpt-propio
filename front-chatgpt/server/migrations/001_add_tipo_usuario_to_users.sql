-- Migración OCR/Comprobantes - Paso 1
-- Ejecutada automáticamente al arrancar auth-server.js
-- Valores TipoUsuario: "Quivr/OpenAi" | "OCR/OpenAi"

-- 1. Columna tipo_usuario en users
ALTER TABLE users ADD COLUMN tipo_usuario TEXT DEFAULT 'Quivr/OpenAi';
