# Verificación de tecnologías – Chat GPT Propio

Estado comprobado en el proyecto (Node, Python, dependencias de cada módulo).

---

## Resumen

| Componente        | Estado   | Notas                                      |
|-------------------|----------|--------------------------------------------|
| **Node.js / npm** | ✅ OK    | v20.20.0, npm 10.8.2                       |
| **WhatsApp**      | ✅ OK    | node_modules y dependencias instaladas     |
| **Front-chatgpt** | ✅ OK    | node_modules y tipos TypeScript presentes  |
| **Quivr (ia-nuevo)** | ❌ Falta | Sin pip en sistema, venv sin paquetes     |

---

## 1. Node.js (WhatsApp + Frontend + Auth)

- **Node.js:** v20.20.0 (`/usr/bin/node`)
- **npm:** 10.8.2 (`/usr/bin/npm`)

Necesario para: `whatsapp`, `front-chatgpt` (Vite + servidor de auth).

---

## 2. WhatsApp (`whatsapp/`)

- **node_modules:** presente.
- **Dependencias** (express, baileys, axios, qrcode, sqlite3, etc.): todas resueltas, ninguna falta.

No hace falta instalar nada más para WhatsApp.

---

## 3. Front-chatgpt (`front-chatgpt/`)

- **node_modules:** presente.
- **Dependencias de producción y dev** (react, vite, express, sqlite3, etc.): instaladas.
- **@types/react** y **@types/react-dom**: presentes (para TypeScript/build).

No hace falta instalar nada más para el front ni para el auth.

---

## 4. Quivr / Backend IA (`ia-nuevo/`)

Requisitos según `requirements.txt`:

- Python 3.10+
- `pip` y entorno virtual (venv)
- Paquetes: quivr-core, fastapi, uvicorn, pydantic, python-dotenv, rich, pdfplumber, openpyxl, pandas, pypdf, unstructured, etc.

**Estado actual:**

- **Python:** 3.10.12 presente (`/usr/bin/python3`).
- **pip (sistema):** no instalado.  
  - Mensaje: `Command 'pip3' not found` / `No module named pip`.
- **python3-venv:** no instalado (no se puede crear un venv con pip incluido).
- **venv en ia-nuevo:** existe `ia-nuevo/venv/` pero **no tiene pip** (venv creado sin ensurepip), por tanto no se pueden instalar paquetes dentro del venv hasta corregir esto.

**Para dejar Quivr listo hace falta:**

1. Instalar en el sistema (requiere sudo):

   ```bash
   sudo apt update
   sudo apt install python3-pip python3.10-venv
   ```

2. Recrear el venv para que tenga pip:

   ```bash
   cd /opt/proyectos/chat-gpt-propio/ia-nuevo
   rm -rf venv
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. Arrancar Quivr:

   ```bash
   ./start_server.sh
   ```

   (El script ya usa `venv` si existe.)

---

## Cómo volver a verificar

Desde la raíz del proyecto:

```bash
# Node
node -v && npm -v

# WhatsApp: dependencias
cd whatsapp && node -e "require('express'); require('baileys'); console.log('OK')"

# Front: dependencias
cd front-chatgpt && node -e "require('vite'); require('react'); console.log('OK')"

# Quivr: Python y venv
cd ia-nuevo && ./venv/bin/python3 -c "import uvicorn, fastapi; print('OK')"   # cuando esté instalado
```

Cuando Quivr esté bien instalado, el último comando imprimirá `OK` sin error.
