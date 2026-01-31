#!/bin/bash
# Inicia todos los servicios: front-chatgpt (Vite + Auth), ia-nuevo (Quivr), whatsapp

cd "$(dirname "$0")"
BASE="$(pwd)"
PIDS=()

cleanup() {
  echo ""
  echo "Deteniendo servicios..."
  for p in "${PIDS[@]}"; do
    kill "$p" 2>/dev/null
  done
  exit 0
}

trap cleanup SIGINT SIGTERM

echo "Chat GPT Propio - Iniciando nodos..."
echo ""

echo "[1/3] Frontend + Auth (front-chatgpt) -> :5173, :3002"
(cd "$BASE/front-chatgpt" && npm run dev:all) &
PIDS+=($!)

sleep 2
echo "[2/3] Backend IA / Quivr (ia-nuevo) -> :8000"
(cd "$BASE/ia-nuevo" && ./start_server.sh) &
PIDS+=($!)

sleep 2
echo "[3/3] WhatsApp API (whatsapp) -> :3000"
(cd "$BASE/whatsapp" && npm start) &
PIDS+=($!)

echo ""
echo "Servicios en ejecución. Ctrl+C para detener todos."
echo "  App:     http://localhost:5173"
echo "  Quivr:   http://localhost:8000/docs"
echo "  WhatsApp: http://localhost:3000"
echo ""
wait
