# 📚 Documentación de la API Quivr

API REST para consultar documentos usando RAG (Retrieval-Augmented Generation) con Quivr.

## 🚀 Inicio Rápido

### Iniciar el servidor

```bash
# Opción 1: Usar el script de inicio
./start_server.sh

# Opción 2: Iniciar directamente con Python 3.11
python3.11 -m uvicorn src.api:app --host 0.0.0.0 --port 8000 --reload

# Opción 3: Desde Python
python3.11 src/api.py
```

El servidor estará disponible en:
- **API**: http://localhost:8000
- **Documentación interactiva (Swagger)**: http://localhost:8000/docs
- **Documentación alternativa (ReDoc)**: http://localhost:8000/redoc

## 📋 Endpoints Disponibles

### 1. GET `/` - Información de salud
Verifica que la API está funcionando.

**Respuesta:**
```json
{
  "status": "ok",
  "message": "Quivr API está funcionando. Visita /docs para la documentación interactiva."
}
```

**Ejemplo de uso:**
```bash
curl http://localhost:8000/
```

---

### 2. GET `/health` - Estado del servidor
Obtiene información sobre el estado del brain y documentos.

**Respuesta:**
```json
{
  "status": "ok",
  "message": "Brain 'mi_cerebro_ia' está inicializado con 1 documento(s)"
}
```

**Ejemplo de uso:**
```bash
curl http://localhost:8000/health
```

---

### 3. POST `/ask` - Hacer una pregunta
Hace una pregunta sobre los documentos cargados.

**Request Body:**
```json
{
  "question": "¿De qué trata el documento?"
}
```

**Respuesta:**
```json
{
  "answer": "El documento trata sobre...",
  "success": true
}
```

**Ejemplo de uso:**
```bash
curl -X POST http://localhost:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "¿De qué trata el documento?"}'
```

**Ejemplo con Python:**
```python
import requests

response = requests.post(
    "http://localhost:8000/ask",
    json={"question": "¿Qué es Quivr?"}
)
print(response.json())
```

---

### 4. GET `/documents` - Listar documentos
Obtiene la lista de todos los documentos disponibles.

**Respuesta:**
```json
[
  {
    "name": "ejemplo.txt",
    "path": "/ruta/al/proyecto/docs/documentos/ejemplo.txt"
  },
  {
    "name": "documento.pdf",
    "path": "/ruta/al/proyecto/docs/documentos/documento.pdf"
  }
]
```

**Ejemplo de uso:**
```bash
curl http://localhost:8000/documents
```

---

### 5. POST `/documents/upload` - Subir un documento
Sube un nuevo documento a la carpeta de documentos.

**Request:**
- **Content-Type**: `multipart/form-data`
- **Body**: `file` (archivo a subir)

**Formatos soportados:** PDF, TXT, MD, Markdown, DOCX, DOC, CSV, JSON, XML, HTML, RTF

**Respuesta:**
```json
{
  "success": true,
  "message": "Documento 'nuevo_doc.pdf' subido correctamente",
  "file_path": "/ruta/al/proyecto/docs/documentos/nuevo_doc.pdf",
  "documents_count": 2
}
```

**Ejemplo de uso:**
```bash
curl -X POST http://localhost:8000/documents/upload \
  -F "file=@/ruta/al/archivo/documento.pdf"
```

**Ejemplo con Python:**
```python
import requests

with open("documento.pdf", "rb") as f:
    response = requests.post(
        "http://localhost:8000/documents/upload",
        files={"file": f}
    )
print(response.json())
```

---

### 6. GET `/info` - Información del brain
Obtiene información detallada sobre el brain y los documentos cargados.

**Respuesta:**
```json
{
  "brain_name": "mi_cerebro_ia",
  "documents_count": 1,
  "documents": ["ejemplo.txt"],
  "initialized": true
}
```

**Ejemplo de uso:**
```bash
curl http://localhost:8000/info
```

---

### 7. POST `/reload` - Recargar brain
Recarga el brain con los documentos actuales en la carpeta.

**Respuesta:**
```json
{
  "success": true,
  "message": "Brain recargado correctamente",
  "documents_count": 2
}
```

**Ejemplo de uso:**
```bash
curl -X POST http://localhost:8000/reload
```

**Nota:** Úsalo después de subir nuevos documentos para que el brain los procese.

---

## 🔧 Ejemplos de Uso Completo

### Ejemplo 1: Consultar un documento

```python
import requests

# Hacer una pregunta
response = requests.post(
    "http://localhost:8000/ask",
    json={"question": "Resume el contenido del documento en 3 puntos"}
)

if response.status_code == 200:
    data = response.json()
    print(f"Respuesta: {data['answer']}")
else:
    print(f"Error: {response.json()}")
```

### Ejemplo 2: Subir y consultar un documento

```python
import requests
import time

# Subir documento
with open("mi_documento.pdf", "rb") as f:
    upload_response = requests.post(
        "http://localhost:8000/documents/upload",
        files={"file": f}
    )
    print(f"Upload: {upload_response.json()}")

# Recargar brain para incluir el nuevo documento
reload_response = requests.post("http://localhost:8000/reload")
print(f"Reload: {reload_response.json()}")

# Esperar un momento para que se procese
time.sleep(2)

# Hacer una pregunta
ask_response = requests.post(
    "http://localhost:8000/ask",
    json={"question": "¿De qué trata el nuevo documento?"}
)
print(f"Respuesta: {ask_response.json()}")
```

### Ejemplo 3: Listar todos los documentos

```python
import requests

response = requests.get("http://localhost:8000/documents")
documents = response.json()

print(f"Documentos disponibles ({len(documents)}):")
for doc in documents:
    print(f"  - {doc['name']}")
```

## 🌐 CORS

La API tiene CORS habilitado para permitir solicitudes desde cualquier origen. Esto permite usar la API desde aplicaciones web frontend.

## 🔐 Seguridad

- La API usa la API key configurada en el archivo `.env`
- El archivo `.env` está en `.gitignore` y no se sube al repositorio
- Asegúrate de configurar tu `OPENAI_API_KEY` antes de usar la API

## 📝 Notas

1. **Primera consulta:** La primera consulta puede tardar más tiempo ya que el brain necesita inicializarse
2. **Recargar documentos:** Después de subir nuevos documentos, usa `/reload` para que el brain los procese
3. **Documentación interactiva:** Visita `/docs` para probar todos los endpoints directamente desde el navegador
4. **Python 3.11:** El servidor requiere Python 3.11 o superior debido a las dependencias de quivr-core

## 🐛 Solución de Problemas

### Error: "quivr-core no está disponible"
```bash
# Instalar quivr-core con Python 3.11
python3.11 -m pip install git+https://github.com/QuivrHQ/quivr.git#subdirectory=core
```

### Error: "OPENAI_API_KEY no encontrada"
```bash
# Verificar que el archivo .env existe y contiene la API key
cat .env
```

### El servidor no inicia en el puerto 8000
```bash
# Verificar qué proceso está usando el puerto 8000
lsof -i :8000

# O cambiar el puerto en el comando
python3.11 -m uvicorn src.api:app --host 0.0.0.0 --port 8001
```

## 📖 Más Información

- **Documentación de Quivr**: https://github.com/QuivrHQ/quivr
- **Documentación de FastAPI**: https://fastapi.tiangolo.com/
