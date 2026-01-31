// ============================================
// CÓDIGO COMPLETO: Actualización de users al conectar WhatsApp
// ============================================

// ============================================
// 1. LÓGICA DE ACTUALIZACIÓN
// ============================================

// Cuando se conecta WhatsApp (connection === 'open')
socket.ev.on('connection.update', (update) => {
  if (update.connection === 'open') {
    console.log('✅ WhatsApp conectado');
    
    // 1. Extraer whatsapp_id desde socket.user.id
    const fullId = socket.user?.id || null;
    if (!fullId) {
      console.error('❌ No se pudo obtener socket.user.id');
      return;
    }
    
    // Extraer solo el número (sin sufijos)
    const whatsapp_id = fullId.split(':')[0].split('@')[0];
    console.log(`📱 whatsapp_id extraído: ${whatsapp_id}`);
    
    // 2. Obtener whatsapp_number
    // NOTA: En este punto, el whatsapp_number debe venir del frontend
    // cuando se llama a /api/link-phone con el token del usuario autenticado
    // Por eso la actualización se hace en /api/link-phone, no aquí
    
    // 3. Actualizar variables globales
    connectedWhatsAppId = whatsapp_id;
    // connectedWhatsAppNumber se actualizará cuando se vincule el usuario
  }
});

// ============================================
// 2. ENDPOINT /api/link-phone
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
      return res.status(400).json({ error: 'WhatsApp no está conectado' });
    }
    
    const fullId = socket.user.id;
    const whatsapp_id = fullId.split(':')[0].split('@')[0];
    
    // 3. Obtener whatsapp_number desde req.body (valor exacto de la API)
    const whatsapp_number = req.body.phoneNumber || req.body.whatsapp_number;
    
    if (!whatsapp_number) {
      return res.status(400).json({ 
        error: 'whatsapp_number es requerido en el body' 
      });
    }
    
    // IMPORTANTE: NO normalizar, NO transformar
    // Guardar exactamente el valor que viene
    
    // 4. Actualizar tabla users
    const db = getDb();
    db.run(
      'UPDATE users SET whatsapp_id = ?, whatsapp_number = ? WHERE id = ?',
      [whatsapp_id, whatsapp_number, userId],
      function(err) {
        db.close();
        if (err) {
          console.error('❌ Error actualizando users:', err);
          return res.status(500).json({ error: 'Error al actualizar usuario' });
        }
        
        const rowsAffected = this.changes;
        console.log(`✅ Usuario ${userId} actualizado:`);
        console.log(`   - whatsapp_id: ${whatsapp_id}`);
        console.log(`   - whatsapp_number: ${whatsapp_number}`);
        console.log(`   - Filas afectadas: ${rowsAffected}`);
        
        // Actualizar variables globales
        connectedWhatsAppId = whatsapp_id;
        connectedWhatsAppNumber = whatsapp_number;
        
        res.json({
          success: true,
          message: 'Usuario actualizado correctamente',
          whatsapp_id: whatsapp_id,
          whatsapp_number: whatsapp_number,
          userId: userId,
          rowsAffected: rowsAffected
        });
      }
    );
  } catch (err) {
    console.error('❌ Error en /api/link-phone:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 3. QUERY SQL
// ============================================

/*
-- Query de actualización
UPDATE users 
SET whatsapp_id = ?, 
    whatsapp_number = ? 
WHERE id = ?;

-- Parámetros:
-- ? (1): whatsapp_id - Valor exacto de la API (ej: "138916556447751")
-- ? (2): whatsapp_number - Valor exacto de la API (ej: "595972908588")
-- ? (3): id - ID del usuario en la tabla

-- Ejemplo:
UPDATE users 
SET whatsapp_id = '138916556447751', 
    whatsapp_number = '595972908588' 
WHERE id = 3;
*/

// ============================================
// 4. FLUJO COMPLETO
// ============================================

/*
1. Usuario se conecta a WhatsApp
   → socket.user.id disponible: "138916556447751:48@s.whatsapp.net"
   → whatsapp_id extraído: "138916556447751"

2. Frontend detecta conexión
   → Llama a /api/link-phone con:
     - Token del usuario autenticado
     - Body: { phoneNumber: "595972908588" }

3. Backend procesa
   → Extrae whatsapp_id desde socket.user.id
   → Obtiene whatsapp_number desde req.body.phoneNumber
   → Ejecuta: UPDATE users SET whatsapp_id = ?, whatsapp_number = ? WHERE id = ?

4. Resultado
   → users.whatsapp_id = "138916556447751"
   → users.whatsapp_number = "595972908588"
   → Ambos valores guardados exactamente como vienen de la API
*/
