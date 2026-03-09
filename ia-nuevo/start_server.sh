#!/bin/bash
# Script para iniciar el servidor Quivr API

echo "🧠 Iniciando servidor Quivr API..."
echo ""

# Usar Python 3.11 si está disponible (requerido para quivr-core)
if command -v python3.11 &> /dev/null; then
    PYTHON_CMD=python3.11
    PIP_CMD=python3.11
elif command -v python3 &> /dev/null; then
    PYTHON_CMD=python3
    PIP_CMD=pip3
else
    echo "❌ Python no encontrado. Por favor instala Python 3.11 o superior."
    exit 1
fi

# Activar entorno virtual solo si existe y está completo
if [ -f "venv/bin/activate" ]; then
    echo "🔧 Activando entorno virtual..."
    source venv/bin/activate
    PYTHON_CMD=python3
elif [ -d "venv" ]; then
    echo "⚠️  Carpeta venv existe pero está incompleta (falta venv/bin/activate)."
    echo "   Para arreglarlo: sudo apt install python3-pip python3.10-venv"
    echo "   Luego: rm -rf venv && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
    echo ""
    PYTHON_CMD=python3
else
    :
fi

# Verificar que las dependencias estén instaladas
if ! $PYTHON_CMD -c "import fastapi" 2>/dev/null; then
    echo "❌ FastAPI no está instalado. Instalando dependencias..."
    if $PYTHON_CMD -m pip install fastapi "uvicorn[standard]" python-multipart pydantic python-dotenv rich 2>/dev/null; then
        echo "✅ Dependencias instaladas."
    else
        echo "❌ No se pudo instalar. Instala pip y venv: sudo apt install python3-pip python3.10-venv"
        echo "   Luego recrea el venv: rm -rf venv && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
        exit 1
    fi
fi

# Verificar API key
if [ ! -f ".env" ]; then
    echo "⚠️  Archivo .env no encontrado. Creando desde ejemplo..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "⚠️  Por favor, configura tu OPENAI_API_KEY en .env"
    fi
fi

echo "🚀 Iniciando servidor en http://0.0.0.0:8000"
echo "📚 Documentación interactiva disponible en http://localhost:8000/docs"
echo "📖 Documentación alternativa en http://localhost:8000/redoc"
echo ""
echo "Presiona Ctrl+C para detener el servidor"
echo ""

# Iniciar servidor
$PYTHON_CMD -m uvicorn src.api:app --host 0.0.0.0 --port 8000 --reload
