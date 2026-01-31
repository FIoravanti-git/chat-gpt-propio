#!/bin/bash
# Script de instalación para Quivr

echo "🧠 Instalando Quivr..."
echo ""

# Verificar Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 no está instalado. Por favor instálalo primero."
    exit 1
fi

python_version=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
echo "✅ Python $python_version detectado"

# Crear entorno virtual si no existe
if [ ! -d "venv" ]; then
    echo "📦 Creando entorno virtual..."
    python3 -m venv venv
fi

# Activar entorno virtual
echo "🔧 Activando entorno virtual..."
source venv/bin/activate

# Instalar dependencias
echo "📥 Instalando dependencias..."
pip install --upgrade pip
pip install -r requirements.txt

echo ""
echo "✅ Instalación completada!"
echo ""
echo "📋 Próximos pasos:"
echo "1. Crea un archivo .env en la raíz del proyecto"
echo "2. Agrega tu API key: OPENAI_API_KEY=tu_api_key_aqui"
echo "3. Coloca tus documentos en ./docs/documentos/"
echo "4. Ejecuta: python -m src.cli"
echo ""
echo "💡 Para activar el entorno virtual en el futuro, usa:"
echo "   source venv/bin/activate"
