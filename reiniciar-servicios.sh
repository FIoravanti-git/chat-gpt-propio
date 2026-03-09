#!/usr/bin/env bash
# Reinicia servicios y actualiza para nginx (sin tocar configuración de nginx).
# Uso: ./reiniciar-servicios.sh   o   bash reiniciar-servicios.sh

set -e
PROJECT_ROOT="/opt/proyectos/chat-gpt-propio"
cd "$PROJECT_ROOT"

echo "=== 1. Liberando puertos 5173, 3002, 3001 ==="
fuser -k 5173/tcp 2>/dev/null || true
fuser -k 3002/tcp 2>/dev/null || true
fuser -k 3001/tcp 2>/dev/null || true
sleep 2

echo "=== 2. Compilando frontend ==="
cd "$PROJECT_ROOT/front-chatgpt"
npm run build

echo "=== 3. Iniciando Auth (3002) ==="
cd "$PROJECT_ROOT/front-chatgpt"
nohup node server/auth-server.js >> /tmp/auth-server.log 2>&1 &
AUTH_PID=$!
echo "    Auth PID: $AUTH_PID"

echo "=== 4. Iniciando WhatsApp (3001) ==="
cd "$PROJECT_ROOT/whatsapp"
nohup node index.js >> /tmp/whatsapp-api.log 2>&1 &
WA_PID=$!
echo "    WhatsApp PID: $WA_PID"

sleep 2
echo "=== 5. Recargando nginx (sin modificar configuración) ==="
if command -v nginx &>/dev/null; then
  sudo nginx -t 2>/dev/null && sudo nginx -s reload && echo "    Nginx recargado." || echo "    Aviso: no se pudo recargar nginx (revisar permisos o configuración)."
else
  echo "    nginx no encontrado en PATH, omitiendo recarga."
fi

echo ""
echo "=== Listo ==="
echo "  - Frontend compilado en: front-chatgpt/dist/"
echo "  - Auth: http://0.0.0.0:3002 (log: /tmp/auth-server.log)"
echo "  - WhatsApp: http://0.0.0.0:3001 (log: /tmp/whatsapp-api.log)"
echo "  - Nginx recargado para servir los cambios."
