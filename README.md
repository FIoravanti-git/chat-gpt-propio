# Chat GPT Propio (NeuroChat)

Proyecto unificado que agrupa el frontend tipo ChatGPT, el backend Quivr (IA) y la API de WhatsApp.

## Estructura

```
/opt/proyectos/chat-gpt-propio/
├── front-chatgpt/    # Frontend React + Vite, auth, UI chat
├── ia-nuevo/         # Backend Quivr (FastAPI, RAG, documentos)
├── whatsapp/         # API WhatsApp (Baileys, QR, webhooks)
├── README.md         # Este archivo
└── start-all.sh      # Script para levantar todos los servicios
```

## Nodos

| Nodo | Ruta | Descripción | Puerto |
|------|------|-------------|--------|
| **Frontend** | `front-chatgpt/` | UI NeuroChat, login, chat, usuarios, carga docs | 5173 |
| **Auth** | `front-chatgpt/server/` | Servidor de autenticación (Express + SQLite) | 3002 |
| **Backend IA** | `ia-nuevo/` | Quivr API (ASK, RELOAD, documents/upload) | 8000 |
| **WhatsApp** | `whatsapp/` | API WhatsApp (QR, status, webhooks) | 3001 |

## Cómo arrancar

### Opción 1: Todo junto

```bash
cd /opt/proyectos/chat-gpt-propio
./start-all.sh
```

### Opción 2: Por separado

**Frontend + Auth**
```bash
cd /opt/proyectos/chat-gpt-propio/front-chatgpt
npm run dev:all
```

**Backend IA (Quivr)**
```bash
cd /opt/proyectos/chat-gpt-propio/ia-nuevo
./start_server.sh
```

**WhatsApp**
```bash
cd /opt/proyectos/chat-gpt-propio/whatsapp
npm start
```

## Accesos

- **App:** http://localhost:5173 o http://&lt;tu-ip&gt;:5173  
- **Auth API:** http://localhost:3002  
- **Quivr /docs:** http://localhost:8000/docs  
- **WhatsApp:** http://localhost:3001  

El frontend usa proxy en dev hacia auth (3002). Quivr y WhatsApp se suelen consumir por IP (p. ej. 31.220.102.254) según `vite.config` y servicios.

## Documentos

La carga de documentos desde servidor apunta a:

`/opt/proyectos/chat-gpt-propio/ia-nuevo/docs/documentos/`

Configurado en `front-chatgpt/vite-plugin-list-documents.ts` y `front-chatgpt/server/list-documents.js`.
