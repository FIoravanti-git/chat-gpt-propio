/**
 * Módulo OCR para comprobantes.
 * Flujo: imagen (buffer) → Tesseract OCR → texto → OpenAI estructura datos → INSERT en comprobantes.
 * Usado por el backend WhatsApp cuando un usuario OCR/OpenAi envía una imagen.
 */

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { getParaguayDateTime } = require('./timezone-paraguay');
const sharp = require('sharp');

const AUTH_DB_PATH = path.join(__dirname, '../front-chatgpt/server/auth.db');

/**
 * Preprocesa la imagen para mejorar OCR cuando el texto tiene poco contraste (ej. "N° de Comprobante" tenue).
 * Aplica: escala de grises, normalización de contraste y opcionalmente redimensionado para mejorar lectura.
 * @param {Buffer} imageBuffer
 * @returns {Promise<Buffer|null>} Buffer de imagen preprocesada o null si falla (ej. no es imagen)
 */
async function preprocessImageForOcr(imageBuffer) {
  try {
    let pipeline = sharp(imageBuffer);
    const meta = await pipeline.metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;

    // Redimensionar si es muy pequeña (Tesseract rinde mejor con ~30px de altura de letra)
    const minHeight = 400;
    if (height > 0 && height < minHeight) {
      const scale = minHeight / height;
      pipeline = pipeline.resize(Math.round(width * scale), minHeight);
    }

    const out = await pipeline
      .grayscale()
      .normalize() // aumenta contraste
      .toBuffer();
    return out;
  } catch (_) {
    return null;
  }
}

/**
 * Preprocesado agresivo para texto muy claro/tenue: oscurece la imagen para que grises claros
 * se vuelvan más visibles para Tesseract (útil cuando "N° de Comprobante" está muy clarito).
 * @param {Buffer} imageBuffer
 * @returns {Promise<Buffer|null>}
 */
async function preprocessImageForOcrFaintText(imageBuffer) {
  try {
    let pipeline = sharp(imageBuffer);
    const meta = await pipeline.metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;

    const minHeight = 400;
    if (height > 0 && height < minHeight) {
      const scale = minHeight / height;
      pipeline = pipeline.resize(Math.round(width * scale), minHeight);
    }

    const out = await pipeline
      .grayscale()
      .normalize()
      .linear(0.5, 0) // oscurece: texto muy claro se vuelve más legible para OCR
      .toBuffer();
    return out;
  } catch (_) {
    return null;
  }
}

/**
 * Obtiene la API key de OpenAI para un usuario (users.openai_api_key o env OPENAI_API_KEY).
 * @param {number} userId
 * @returns {Promise<string|null>}
 */
function getOpenAiKeyForUser(userId) {
  return new Promise((resolve) => {
    const db = new sqlite3.Database(AUTH_DB_PATH);
    db.get('SELECT openai_api_key FROM users WHERE id = ?', [userId], (err, row) => {
      db.close();
      if (err || !row) return resolve(null);
      const key = (row.openai_api_key && row.openai_api_key.trim()) || null;
      if (key) return resolve(key);
      resolve(process.env.OPENAI_API_KEY || null);
    });
  });
}

/**
 * Ejecuta OCR sobre un buffer de imagen usando Tesseract.js.
 * @param {Buffer} imageBuffer
 * @param {string} [lang='spa+eng']
 * @returns {Promise<string>} Texto extraído
 */
async function runOcr(imageBuffer) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('spa+eng', 1, {
    logger: () => {},
  });
  try {
    const { data } = await worker.recognize(imageBuffer);
    return (data && data.text) ? data.text.trim() : '';
  } finally {
    await worker.terminate();
  }
}

/**
 * Envía el texto del OCR (y opcionalmente el texto que acompaña la imagen) a OpenAI para extraer campos estructurados.
 * Así se contempla tanto lo leído de la imagen como lo que el usuario escribe (ej. "N° de Comprobante: 001-123").
 * @param {string} ocrText - Texto extraído de la imagen por OCR
 * @param {string} apiKey
 * @param {string|null} [textoAcompañante] - Texto que acompaña la imagen (caption); puede contener N° comprobante, fecha, etc.
 * @returns {Promise<{ fechaComprobante: string|null, numeroComprobante: string|null, importe: number|null, descripcion: string|null }>}
 */
async function structureWithOpenAi(ocrText, apiKey, textoAcompañante = null) {
  const OpenAIModule = require('openai');
  const OpenAI = OpenAIModule.default || OpenAIModule;
  const openai = new OpenAI({ apiKey });

  const systemPrompt = `Eres un asistente que extrae datos de comprobantes. Recibes:
1) Texto extraído por OCR de una imagen del comprobante.
2) Opcionalmente, texto que el usuario escribió al enviar la imagen (caption/descripción).

REGLAS PARA numeroComprobante:
- numeroComprobante es SOLO el número que va junto a etiquetas que digan COMPROBANTE: "N° de Comprobante", "Número de comprobante", "Comprobante N°", "Nº de Comprobante". La etiqueta debe contener la palabra "comprobante".
- NO uses nunca el valor de "Cta. N°", "Cuenta N°", "N° de Cuenta", "N° Cta", "Account" ni similares: ese es el número de cuenta, no el número de comprobante. Son campos distintos.
- Si en el texto solo aparece Cta. N° (o cuenta) y no aparece N° de Comprobante, deja numeroComprobante en null. No rellenes con el número de cuenta.
- Prioridad 1: valor junto a "N° de Comprobante" (o equivalente) en el OCR. Prioridad 2: solo si no hay tal etiqueta en el OCR, y el caption contiene "comprobante" y un número, usa ese número.

Para fechaComprobante, importe y descripcion combina imagen y caption como prefieras.

Responde ÚNICAMENTE con un JSON válido (sin markdown, sin explicaciones):
- fechaComprobante: YYYY-MM-DD o null
- numeroComprobante: solo el número del comprobante (etiqueta con "comprobante"); null si no hay o solo hay Cta. N°
- importe: número o null
- descripcion: texto breve o null

Si no encuentras un valor para alguna clave, usa null.`;

  let userPrompt = `Texto del comprobante (OCR de la imagen):\n\n${ocrText || '(sin texto)'}`;
  if (ocrText && ocrText.includes('\n\n---\n')) {
    userPrompt = `El siguiente texto es el mismo comprobante en varias lecturas OCR. Combina las lecturas para extraer los campos. Para numeroComprobante usa solo el valor que corresponda a "N° de Comprobante" (no uses "Cta. N°" ni número de cuenta).\n\n${userPrompt}`;
  }
  if (textoAcompañante && textoAcompañante.trim()) {
    userPrompt += `\n\n---\nTexto que el usuario escribió al enviar la imagen (úsalo para fecha, importe o descripción; para numeroComprobante solo si en el texto de la imagen arriba no hay número y aquí aparece la palabra "comprobante" junto a un número):\n\n${textoAcompañante.trim()}`;
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.1,
  });

  const content = completion.choices && completion.choices[0] && completion.choices[0].message
    ? completion.choices[0].message.content
    : '';
  if (!content) {
    return { fechaComprobante: null, numeroComprobante: null, importe: null, descripcion: null };
  }

  const cleaned = content.replace(/^```json?\s*|\s*```$/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (_) {
    return { fechaComprobante: null, numeroComprobante: null, importe: null, descripcion: null };
  }

  const importe = parsed.importe != null ? Number(parsed.importe) : null;
  return {
    fechaComprobante: typeof parsed.fechaComprobante === 'string' ? parsed.fechaComprobante : null,
    numeroComprobante: typeof parsed.numeroComprobante === 'string' ? parsed.numeroComprobante : null,
    importe: Number.isFinite(importe) ? importe : null,
    descripcion: typeof parsed.descripcion === 'string' ? parsed.descripcion : null,
  };
}

/**
 * Inserta un comprobante en la tabla comprobantes.
 * @param {number} userId
 * @param {object} data
 * @param {string|null} data.fechaComprobante
 * @param {string|null} data.numeroComprobante
 * @param {number|null} data.importe
 * @param {string|null} data.descripcion
 * @returns {Promise<number>} id del registro insertado
 */
function insertComprobante(userId, data) {
  const fechaHoraRegistro = getParaguayDateTime();
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(AUTH_DB_PATH);
    db.run(
      `INSERT INTO comprobantes (user_id, fechaComprobante, numeroComprobante, importe, descripcion, fechaHoraRegistro)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        data.fechaComprobante || null,
        data.numeroComprobante || null,
        data.importe != null ? data.importe : null,
        data.descripcion || null,
        fechaHoraRegistro,
      ],
      function (err) {
        db.close();
        if (err) return reject(err);
        resolve({ lastID: this.lastID, fechaHoraRegistro });
      }
    );
  });
}

/**
 * Procesa una imagen de comprobante: OCR → OpenAI → guardado en BD.
 * @param {Buffer} imageBuffer - Contenido binario de la imagen (PNG/JPEG)
 * @param {number} userId - ID del usuario en la tabla users
 * @param {string|null} [textoAcompañante] - Texto que acompaña la imagen (caption); se guarda en descripcion
 * @returns {Promise<{ id: number, fechaComprobante, numeroComprobante, importe, descripcion, fechaHoraRegistro }>} Registro guardado
 * @throws {Error} Si no hay API key, OCR falla o insert falla
 */
async function processImageForComprobante(imageBuffer, userId, textoAcompañante = null) {
  if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
    throw new Error('Se requiere un buffer de imagen válido');
  }

  const apiKey = await getOpenAiKeyForUser(userId);
  if (!apiKey) {
    throw new Error('No hay API key de OpenAI configurada para el usuario ni OPENAI_API_KEY en el entorno');
  }

  const bufferToUse = await preprocessImageForOcr(imageBuffer) || imageBuffer;
  const bufferFaint = await preprocessImageForOcrFaintText(imageBuffer);

  const ocrParts = [];
  ocrParts.push(await runOcr(bufferToUse));
  if (bufferFaint && bufferFaint !== bufferToUse) {
    ocrParts.push(await runOcr(bufferFaint));
  }
  if (bufferToUse !== imageBuffer) {
    ocrParts.push(await runOcr(imageBuffer));
  }

  const ocrText = ocrParts
    .filter((t) => t && t.trim())
    .filter((t, i, arr) => arr.indexOf(t) === i) // sin duplicados exactos
    .join('\n\n---\n');
  const structured = await structureWithOpenAi(ocrText, apiKey, textoAcompañante);
  const descripcionFinal = (textoAcompañante && textoAcompañante.trim()) ? textoAcompañante.trim() : (structured.descripcion || null);
  const { lastID: id, fechaHoraRegistro } = await insertComprobante(userId, {
    ...structured,
    descripcion: descripcionFinal,
  });

  return {
    id,
    fechaComprobante: structured.fechaComprobante,
    numeroComprobante: structured.numeroComprobante,
    importe: structured.importe,
    descripcion: descripcionFinal,
    fechaHoraRegistro,
  };
}

module.exports = {
  processImageForComprobante,
  runOcr,
  structureWithOpenAi,
  insertComprobante,
  getOpenAiKeyForUser,
};
