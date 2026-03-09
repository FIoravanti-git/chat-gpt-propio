# Nginx - Chat GPT Propio

Configuración para exponer todo el stack por localhost (puerto 80).

## Requisitos

- Nginx instalado.
- Servicios del proyecto en marcha (./start-all.sh o cada uno por separado).

## Activar

```bash
sudo ln -sf /opt/proyectos/chat-gpt-propio/deploy/nginx/chat-gpt-propio.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## Rutas

| Ruta            | Backend        | Puerto |
|-----------------|----------------|--------|
| /               | Frontend (Vite)| 5173   |
| /api/auth       | Auth (Express) | 3002   |
| /api/quivr/*    | Quivr (FastAPI)| 8000   |
| /api/whatsapp/* | API WhatsApp   | 3001   |

Acceso: **http://localhost**
