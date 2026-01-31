-- ============================================
-- QUERY SQL: Actualización de users
-- ============================================

-- Actualizar whatsapp_id y whatsapp_number en tabla users
-- IMPORTANTE: Guardar exactamente los valores que devuelve la API
-- NO normalizar, NO transformar, NO derivar uno del otro

UPDATE users 
SET whatsapp_id = ?, 
    whatsapp_number = ? 
WHERE id = ?;

-- ============================================
-- EJEMPLOS DE USO
-- ============================================

-- Ejemplo 1: Actualizar usuario con ID 3
UPDATE users 
SET whatsapp_id = '138916556447751', 
    whatsapp_number = '595972908588' 
WHERE id = 3;

-- Ejemplo 2: Actualizar usuario con ID 1
UPDATE users 
SET whatsapp_id = '595986782672', 
    whatsapp_number = '595986782672' 
WHERE id = 1;

-- ============================================
-- VERIFICACIÓN
-- ============================================

-- Verificar que los valores se guardaron correctamente
SELECT 
  id,
  username,
  whatsapp_id,
  whatsapp_number,
  CASE 
    WHEN whatsapp_id IS NULL AND whatsapp_number IS NULL THEN 'Sin vincular'
    WHEN whatsapp_id IS NOT NULL AND whatsapp_number IS NOT NULL THEN 'Completo'
    ELSE 'Incompleto'
  END as estado
FROM users
WHERE id = 3;

-- ============================================
-- NOTAS
-- ============================================

-- 1. Ambos campos se actualizan juntos en la misma transacción
-- 2. Los valores se guardan exactamente como vienen de la API
-- 3. No se aplica ninguna normalización ni transformación
-- 4. whatsapp_id y whatsapp_number son valores independientes
