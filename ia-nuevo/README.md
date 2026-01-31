# Quivr - Tu Segundo Cerebro con IA Generativa

Implementación completa de Quivr Core para gestionar documentos y realizar consultas usando RAG (Retrieval-Augmented Generation).

## 🎯 Características

- **RAG Opinado**: Sistema RAG rápido y eficiente integrado
- **Múltiples LLMs**: Soporta OpenAI, Anthropic, Mistral, Gemma, etc.
- **Cualquier Archivo**: Funciona con PDF, TXT, Markdown, DOCX, y más
- **Personalizable**: Configurable mediante archivos YAML
- **Fácil de Usar**: Interfaz CLI intuitiva

## 📋 Requisitos

- Python 3.10 o superior
- API Key de OpenAI (u otro proveedor de LLM compatible)

## 🚀 Instalación Rápida

### 1. Instalar dependencias

```bash
pip install -r requirements.txt
```

### 2. Configurar API Keys

Copia el archivo de ejemplo y agrega tu API key:

```bash
cp .env.example .env
```

Edita `.env` y agrega tu API key:

```env
OPENAI_API_KEY=tu_api_key_aqui
```

### 3. Agregar documentos

Coloca tus documentos en la carpeta `./docs/documentos/`:

```bash
# Ejemplo: copiar documentos
cp mis_documentos.pdf ./docs/documentos/
cp mi_nota.txt ./docs/documentos/
```

Formatos soportados: PDF, TXT, Markdown, DOCX, DOC, CSV, JSON, XML, HTML, RTF

## 💻 Uso

### 🌐 API REST (Recomendado)

**Servidor disponible en el puerto 8000**

#### Iniciar el servidor

```bash
# Opción 1: Usar el script de inicio
./start_server.sh

# Opción 2: Iniciar directamente
python3.11 -m uvicorn src.api:app --host 0.0.0.0 --port 8000 --reload
```

Una vez iniciado, accede a:
- **API**: http://localhost:8000
- **Documentación interactiva**: http://localhost:8000/docs
- **Documentación alternativa**: http://localhost:8000/redoc

#### Endpoints principales

- `POST /ask` - Hacer una pregunta sobre los documentos
- `GET /documents` - Listar documentos disponibles
- `POST /documents/upload` - Subir un nuevo documento
- `GET /info` - Información del brain
- `POST /reload` - Recargar brain con documentos actuales

**Ejemplo rápido:**
```bash
# Hacer una pregunta
curl -X POST http://localhost:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "¿De qué trata el documento?"}'

# Subir un documento
curl -X POST http://localhost:8000/documents/upload \
  -F "file=@mi_documento.pdf"
```

📖 **Para documentación completa de la API, consulta**: [API_DOCUMENTATION.md](API_DOCUMENTATION.md)

### Interfaz de Línea de Comandos (CLI)

Ejecuta el script principal:

```bash
python -m src.cli
```

O desde la raíz del proyecto:

```bash
python src/cli.py
```

### Usar como Módulo Python

```python
from src.brain_manager import BrainManager

# Crear gestor
manager = BrainManager(
    brain_name="mi_cerebro",
    documents_path="./docs/documentos",
    config_path="./config/basic_rag_workflow.yaml"
)

# Inicializar brain
manager.initialize_brain()

# Hacer una pregunta
respuesta = manager.ask("¿De qué trata el documento?")
print(respuesta)

# Listar documentos
documentos = manager.list_documents()
print(f"Documentos disponibles: {documentos}")
```

## 📁 Estructura del Proyecto

```
.
├── docs/
│   └── documentos/          # Coloca aquí tus documentos para consultar
├── src/
│   ├── brain_manager.py     # Gestor principal del Brain de Quivr
│   └── cli.py               # Interfaz de línea de comandos
├── config/
│   └── basic_rag_workflow.yaml  # Configuración del workflow RAG
├── requirements.txt         # Dependencias del proyecto
├── .env.example            # Ejemplo de variables de entorno
└── README.md               # Este archivo
```

## ⚙️ Configuración

### Workflow RAG

Puedes personalizar el comportamiento del RAG editando `config/basic_rag_workflow.yaml`:

- **max_history**: Número de iteraciones previas de conversación a incluir
- **reranker_config**: Configuración del reranker (reordenador de resultados)
- **llm_config**: Configuración del modelo de lenguaje (temperatura, tokens máximos)

### Proveedores de LLM

Quivr soporta múltiples proveedores. Configura las variables de entorno según necesites:

- `OPENAI_API_KEY` - Para usar OpenAI (GPT-4, etc.)
- `ANTHROPIC_API_KEY` - Para usar Anthropic (Claude)
- `MISTRAL_API_KEY` - Para usar Mistral

También puedes usar modelos locales con Ollama (consulta la documentación de Quivr).

## 🔧 Comandos de la CLI

Una vez en la interfaz CLI:

- **Pregunta normal**: Escribe tu pregunta y presiona Enter
- `exit` o `salir`: Terminar la sesión
- `reload` o `recargar`: Recargar documentos sin reiniciar
- `info` o `informacion`: Mostrar información del brain y documentos

## 📚 Documentación Adicional

Para más información sobre Quivr, consulta:
- [Documentación oficial de Quivr](https://github.com/QuivrHQ/quivr)
- [Quivr Core](https://core.quivr.com)

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia Apache 2.0 - ver el archivo LICENSE para más detalles.

---

**Nota**: Quivr se encarga del RAG para que puedas enfocarte en tu producto. Simplemente instala `quivr-core` y agrégalo a tu proyecto. Ahora puedes ingerir tus archivos y hacer preguntas.
