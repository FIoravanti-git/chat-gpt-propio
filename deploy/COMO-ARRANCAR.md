# Cómo arrancar los servicios (Chat GPT Propio)

Para que la app sea accesible por **http://localhost** (nginx en puerto 80), los backends deben estar en marcha.

## Arranque rápido (recomendado)

Desde la raíz del proyecto:

```bash
cd /opt/proyectos/chat-gpt-propio

# Opción A: Todo en una sola terminal (Ctrl+C detiene todo)
./start-all.sh

# Opción B: En segundo plano (logs en /tmp)
nohup ./start-all.sh >> /tmp/chat-gpt-propio.log 2>&1 &
```

## Arranque por partes

Si prefieres levantar cada servicio en su propia terminal:

```bash
# 1) Frontend + Auth (puertos 5173 y 3002)
cd /opt/proyectos/chat-gpt-propio/front-chatgpt && npm run dev:all

# 2) En otra terminal: Backend IA / Quivr (puerto 8000)
cd /opt/proyectos/chat-gpt-propio/ia-nuevo && ./start_server.sh

# 3) En otra terminal: WhatsApp (puerto 3001)
cd /opt/proyectos/chat-gpt-propio/whatsapp && npm start
```

## Requisitos para Quivr (ia-nuevo)

Si Quivr no arranca con *"No module named uvicorn"* o similar:

1. Instalar dependencias del sistema (requiere sudo):
   ```bash
   sudo apt install python3-pip python3-venv
   ```
2. Crear entorno e instalar dependencias:
   ```bash
   cd /opt/proyectos/chat-gpt-propio/ia-nuevo
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
3. Volver a ejecutar `./start_server.sh` (o `./start-all.sh`).

Sin Quivr, la app y WhatsApp siguen funcionando; solo fallarán las peticiones al chat/IA (nginx devolverá 502 en `/api/quivr/`).

## Comprobar que todo responde

```bash
# Puertos en escucha
ss -tlnp | grep -E ':(5173|3002|8000|3001)'

# Por nginx (localhost)
curl -sI http://localhost/          # Frontend → 200
curl -sI http://localhost/api/auth/verify  # Auth → 401 sin token es normal
```

## Dependencias que se instalaron en esta verificación

- **whatsapp:** se ejecutó `npm install` (faltaba `express` y demás).
- **front-chatgpt:** ya tenía `node_modules` correctos.
- **ia-nuevo:** requiere `python3-venv` y `pip` (y opcionalmente `pip install -r requirements.txt` en un venv) como se indica arriba.
