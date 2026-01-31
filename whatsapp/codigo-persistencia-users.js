// ============================================
// CÓDIGO DE PERSISTENCIA - Actualización de users
// ============================================

// Función para actualizar whatsapp_id y whatsapp_number en tabla users
// IMPORTANTE: Guarda exactamente los valores que devuelve la API
function updateUserWhatsAppData(userId, whatsapp_id, whatsapp_number) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    
    // IMPORTANTE: 
    // - NO normalizar los valores
    // - NO transformar los valores
    // - NO derivar uno del otro
    // - Guardar exactamente lo que devuelve la API
    
    console.log(`📝 Actualizando users con valores exactos de la API:`);
    console.log(`   - userId: ${userId}`);
    console.log(`   - whatsapp_id: ${whatsapp_id}`);
    console.log(`   - whatsapp_number: ${whatsapp_number}`);
    
    // Query SQL: Actualizar ambos campos juntos
    db.run(
      'UPDATE users SET whatsapp_id = ?, whatsapp_number = ? WHERE id = ?',
      [whatsapp_id, whatsapp_number, userId],
      function(err) {
        db.close();
        if (err) {
          console.error('❌ Error actualizando users:', err);
          reject(err);
        } else {
          const rowsAffected = this.changes;
          if (rowsAffected > 0) {
            console.log(`✅ Usuario ${userId} actualizado correctamente`);
            console.log(`   - Filas afectadas: ${rowsAffected}`);
            console.log(`   - whatsapp_id guardado: ${whatsapp_id}`);
            console.log(`   - whatsapp_number guardado: ${whatsapp_number}`);
            resolve({ 
              success: true, 
              rowsAffected, 
              whatsapp_id, 
              whatsapp_number 
            });
          } else {
            console.warn(`⚠️  No se actualizó ningún registro para usuario ${userId}`);
            resolve({ 
              success: false, 
              rowsAffected: 0, 
              message: 'Usuario no encontrado' 
            });
          }
        }
      }
    );
  });
}

// ============================================
// EJEMPLO DE USO EN EL EVENTO DE CONEXIÓN
// ============================================

// Cuando connection === 'open'
async function handleWhatsAppConnection(socket, userId) {
  try {
    // 1. Extraer whatsapp_id desde socket.user.id
    const fullId = socket.user?.id || null;
    if (!fullId) {
      throw new Error('No se pudo obtener socket.user.id');
    }
    
    // Extraer solo el número (sin sufijos)
    const whatsapp_id = fullId.split(':')[0].split('@')[0];
    console.log(`📱 whatsapp_id extraído: ${whatsapp_id}`);
    
    // 2. Obtener whatsapp_number
    // OPCIÓN A: Desde req.body.phoneNumber (cuando se llama desde /api/link-phone)
    // OPCIÓN B: Desde la base de datos si ya existe
    // OPCIÓN C: Desde algún campo de socket.user si está disponible
    
    // Por ahora, asumimos que viene del frontend en /api/link-phone
    // O se obtiene desde la BD si ya está vinculado
    
    // 3. Actualizar tabla users
    if (userId && whatsapp_id) {
      // Si tenemos whatsapp_number, actualizar ambos
      // Si no, solo actualizar whatsapp_id y esperar whatsapp_number
      
      // Ejemplo: Si whatsapp_number viene del body
      const whatsapp_number = req.body.phoneNumber; // O desde donde venga
      
      if (whatsapp_number) {
        await updateUserWhatsAppData(userId, whatsapp_id, whatsapp_number);
        console.log('✅ Usuario actualizado automáticamente al conectar');
      } else {
        // Solo actualizar whatsapp_id si no tenemos whatsapp_number aún
        console.log('⚠️  whatsapp_number no disponible, solo se actualizará whatsapp_id');
      }
    }
  } catch (err) {
    console.error('❌ Error en handleWhatsAppConnection:', err);
  }
}

// ============================================
// EJEMPLO DE USO EN /api/link-phone
// ============================================

app.post('/api/link-phone', async (req, res) => {
  try {
    // 1. Obtener userId desde token
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || 
                  req.headers['x-auth-token'];
    const userId = await getUserIdFromToken(token);
    
    if (!userId) {
      return res.status(401).json({ error: 'Token inválido' });
    }
    
    // 2. Extraer whatsapp_id desde socket.user.id
    if (!socket || !socket.user || !socket.user.id) {
      return res.status(400).json({ 
        error: 'WhatsApp no está conectado' 
      });
    }
    
    const fullId = socket.user.id;
    const whatsapp_id = fullId.split(':')[0].split('@')[0];
    
    // 3. Obtener whatsapp_number desde req.body (valor exacto de la API)
    const whatsapp_number = req.body.phoneNumber;
    
    if (!whatsapp_number) {
      return res.status(400).json({ 
        error: 'phoneNumber es requerido' 
      });
    }
    
    // 4. Actualizar tabla users con valores exactos
    const result = await updateUserWhatsAppData(userId, whatsapp_id, whatsapp_number);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Usuario actualizado correctamente',
        whatsapp_id: whatsapp_id,
        whatsapp_number: whatsapp_number,
        userId: userId,
        rowsAffected: result.rowsAffected
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }
  } catch (err) {
    console.error('❌ Error en /api/link-phone:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// QUERY SQL DIRECTA (Ejemplo)
// ============================================

/*
-- Actualizar usuario con valores exactos de la API
UPDATE users 
SET whatsapp_id = '138916556447751', 
    whatsapp_number = '595972908588' 
WHERE id = 3;

-- Verificar actualización
SELECT id, username, whatsapp_id, whatsapp_number 
FROM users 
WHERE id = 3;

-- Resultado esperado:
-- id: 3
-- username: "diosnel"
-- whatsapp_id: "138916556447751"
-- whatsapp_number: "595972908588"
*/
