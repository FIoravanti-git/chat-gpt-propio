-- Migración OCR/Comprobantes - Paso 1
-- Tabla Comprobantes para usuarios TipoUsuario = "OCR/OpenAi"

CREATE TABLE IF NOT EXISTS comprobantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  fechaComprobante TEXT,
  numeroComprobante TEXT,
  importe REAL,
  descripcion TEXT,
  fechaHoraRegistro DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comprobantes_user_id ON comprobantes(user_id);
