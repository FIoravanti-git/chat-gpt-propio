"""
API REST para consultar documentos usando RAG (Fioravanti).
"""
import os
import sqlite3
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, Header
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from dotenv import load_dotenv

# Intentar importar como módulo relativo, si falla usar import absoluto
try:
    from .brain_manager import BrainManager
    from .greetings_handler import is_generic_greeting, get_generic_response
except ImportError:
    # Si se ejecuta como script directo, usar import absoluto
    from brain_manager import BrainManager
    from greetings_handler import is_generic_greeting, get_generic_response

# Cargar variables de entorno
load_dotenv()

# Inicializar FastAPI
app = FastAPI(
    title="API - Fioravanti",
    description="API REST para consultar documentos usando RAG",
    version="1.0.0",
)

# Configurar CORS para permitir solicitudes desde cualquier origen
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Obtener rutas absolutas
base_dir = Path(__file__).parent.parent
documents_path = base_dir / "docs" / "documentos"
config_path = base_dir / "config" / "basic_rag_workflow.yaml"

# Ruta a la base de datos de autenticación (compartida con auth-server)
auth_db_path = Path(__file__).parent.parent.parent / "front-chatgpt" / "server" / "auth.db"

# Diccionario para almacenar managers por usuario (multi-tenancy)
managers: dict[int, BrainManager] = {}


def get_user_from_token(token: str) -> Optional[dict]:
    """
    Valida el token y retorna la información del usuario.
    
    Args:
        token: Token de autenticación
        
    Returns:
        Diccionario con información del usuario o None si el token es inválido
    """
    try:
        conn = sqlite3.connect(str(auth_db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT id, username, role FROM users WHERE token = ?', (token,))
        user = cursor.fetchone()
        conn.close()
        
        if user:
            return {
                'id': user['id'],
                'username': user['username'],
                'role': user['role']
            }
        return None
    except Exception as e:
        print(f"Error validando token: {e}")
        return None


async def get_current_user(
    authorization: Optional[str] = Header(None),
    x_auth_token: Optional[str] = Header(None, alias="X-Auth-Token")
) -> dict:
    """
    Dependency para obtener el usuario actual desde el token.
    Soporta tanto Bearer token como X-Auth-Token header.
    
    Raises:
        HTTPException: Si el token es inválido o no se proporciona
    """
    token = None
    
    # Intentar obtener token de Bearer Authorization header
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
    # Intentar obtener de X-Auth-Token header
    elif x_auth_token:
        token = x_auth_token
    
    if not token:
        raise HTTPException(status_code=401, detail="Token no proporcionado")
    
    user = get_user_from_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Token inválido")
    
    return user


def save_document_to_db(user_id: int, filename: str, file_path: str, file_size: int, mime_type: str, brain_name: str) -> int:
    """
    Guarda información del documento en la base de datos.
    
    Returns:
        ID del documento guardado
    """
    try:
        conn = sqlite3.connect(str(auth_db_path))
        cursor = conn.cursor()
        cursor.execute(
            '''INSERT INTO documents (user_id, filename, file_path, file_size, mime_type, brain_name, status)
               VALUES (?, ?, ?, ?, ?, ?, 'active')''',
            (user_id, filename, str(file_path), file_size, mime_type, brain_name)
        )
        doc_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return doc_id
    except Exception as e:
        print(f"Error guardando documento en BD: {e}")
        return 0


def validate_conversation_belongs_to_user(conversation_id: int, user_id: int) -> bool:
    """
    Valida que una conversación pertenezca al usuario.
    
    Returns:
        True si la conversación pertenece al usuario, False en caso contrario
    """
    try:
        conn = sqlite3.connect(str(auth_db_path))
        cursor = conn.cursor()
        cursor.execute(
            'SELECT id FROM conversations WHERE id = ? AND user_id = ?',
            (conversation_id, user_id)
        )
        result = cursor.fetchone() is not None
        conn.close()
        return result
    except Exception as e:
        print(f"Error validando conversación: {e}")
        return False


def get_conversation_messages(conversation_id: int, user_id: int, limit: int = 20) -> List[dict]:
    """
    Obtiene los mensajes de una conversación para construir el contexto histórico.
    VALIDA que la conversación pertenezca al usuario antes de acceder.
    
    Args:
        conversation_id: ID de la conversación
        user_id: ID del usuario (para validación de seguridad)
        limit: Número máximo de mensajes a retornar
    
    Returns:
        Lista de mensajes ordenados cronológicamente
    """
    try:
        # SEGURIDAD: Validar que la conversación pertenece al usuario
        if not validate_conversation_belongs_to_user(conversation_id, user_id):
            print(f"⚠️  Intento de acceso no autorizado: usuario {user_id} intentó acceder a conversación {conversation_id}")
            return []
        
        conn = sqlite3.connect(str(auth_db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        # SEGURIDAD: Incluir validación adicional en la query
        cursor.execute(
            '''SELECT m.role, m.content, m.created_at
               FROM messages m
               INNER JOIN conversations c ON m.conversation_id = c.id
               WHERE m.conversation_id = ? AND c.user_id = ?
               ORDER BY m.created_at ASC
               LIMIT ?''',
            (conversation_id, user_id, limit)
        )
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]
    except Exception as e:
        print(f"Error obteniendo mensajes de conversación: {e}")
        return []


def get_or_create_conversation(user_id: int, channel: str, title: str = None) -> int:
    """
    Obtiene o crea una conversación para el usuario.
    
    Returns:
        ID de la conversación
    """
    try:
        conn = sqlite3.connect(str(auth_db_path))
        cursor = conn.cursor()
        
        # Si hay conversation_id, verificar que pertenece al usuario
        # Por ahora, crear nueva conversación si no se especifica
        if not title:
            title = f"Conversación {channel}"
        
        cursor.execute(
            '''INSERT INTO conversations (user_id, channel, title)
               VALUES (?, ?, ?)''',
            (user_id, channel, title)
        )
        conversation_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return conversation_id
    except Exception as e:
        print(f"Error creando conversación: {e}")
        return 0


def save_audit_log(
    user_id: int,
    conversation_id: Optional[int],
    channel: str,
    direction: str,
    role: str,
    content: str,
    whatsapp_number: Optional[str] = None,
    message_id: Optional[int] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    metadata: Optional[str] = None
) -> int:
    """
    Guarda un registro de auditoría de conversación.
    
    Args:
        user_id: ID del usuario
        conversation_id: ID de la conversación (opcional)
        channel: Canal de origen ('web' o 'whatsapp')
        direction: Dirección del mensaje ('incoming' o 'outgoing')
        role: Rol del mensaje ('user' o 'assistant')
        content: Contenido del mensaje
        whatsapp_number: Número de WhatsApp (si aplica)
        message_id: ID del mensaje guardado (si aplica)
        ip_address: Dirección IP del cliente (opcional)
        user_agent: User agent del cliente (opcional)
        metadata: Metadata adicional en JSON (opcional)
    
    Returns:
        ID del registro de auditoría guardado
    """
    try:
        conn = sqlite3.connect(str(auth_db_path))
        cursor = conn.cursor()
        cursor.execute(
            '''INSERT INTO conversation_audit 
               (user_id, conversation_id, channel, direction, role, content, 
                whatsapp_number, message_id, ip_address, user_agent, metadata)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (user_id, conversation_id, channel, direction, role, content,
             whatsapp_number, message_id, ip_address, user_agent, metadata)
        )
        audit_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return audit_id
    except Exception as e:
        print(f"Error guardando registro de auditoría: {e}")
        return 0


def save_message_to_db(conversation_id: int, user_id: int, role: str, content: str, channel: str = 'web', whatsapp_number: Optional[str] = None) -> int:
    """
    Guarda un mensaje en la base de datos.
    VALIDA que la conversación pertenezca al usuario antes de guardar.
    
    Args:
        conversation_id: ID de la conversación
        user_id: ID del usuario (para validación de seguridad)
        role: Rol del mensaje ('user' o 'assistant')
        content: Contenido del mensaje
    
    Returns:
        ID del mensaje guardado, o 0 si falla la validación
    """
    try:
        # SEGURIDAD: Validar que la conversación pertenece al usuario
        if not validate_conversation_belongs_to_user(conversation_id, user_id):
            print(f"⚠️  Intento de inyección de mensaje: usuario {user_id} intentó guardar en conversación {conversation_id}")
            return 0
        
        conn = sqlite3.connect(str(auth_db_path))
        cursor = conn.cursor()
        cursor.execute(
            '''INSERT INTO messages (conversation_id, role, content)
               VALUES (?, ?, ?)''',
            (conversation_id, role, content)
        )
        msg_id = cursor.lastrowid
        # Actualizar updated_at de la conversación (con validación adicional)
        cursor.execute(
            '''UPDATE conversations 
               SET updated_at = CURRENT_TIMESTAMP 
               WHERE id = ? AND user_id = ?''',
            (conversation_id, user_id)
        )
        conn.commit()
        conn.close()
        return msg_id
    except Exception as e:
        print(f"Error guardando mensaje: {e}")
        return 0


def get_user_documents_from_db(user_id: int) -> List[dict]:
    """
    Obtiene los documentos de un usuario desde la base de datos.
    
    Returns:
        Lista de documentos del usuario
    """
    try:
        conn = sqlite3.connect(str(auth_db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(
            '''SELECT id, filename, file_path, file_size, mime_type, uploaded_at, status
               FROM documents WHERE user_id = ? AND status = 'active'
               ORDER BY uploaded_at DESC''',
            (user_id,)
        )
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]
    except Exception as e:
        print(f"Error obteniendo documentos de BD: {e}")
        return []


def get_manager(user_id: int, force_reload: bool = False) -> BrainManager:
    """
    Obtiene o crea el gestor de brain para un usuario específico.
    
    Args:
        user_id: ID del usuario
        force_reload: Si True, fuerza la recarga del brain
        
    Returns:
        BrainManager para el usuario
    """
    global managers
    
    # Si no existe manager para este usuario o se fuerza recarga
    if user_id not in managers or force_reload:
        if force_reload and user_id in managers:
            # Si se fuerza recarga, limpiar el brain existente
            managers[user_id].brain = None
        
        if user_id not in managers:
            # Crear nuevo manager para el usuario
            # El BrainManager creará automáticamente la carpeta user_{user_id} dentro de documents_path
            managers[user_id] = BrainManager(
                brain_name=f"brain_user_{user_id}",
                documents_path=str(documents_path),
                config_path=str(config_path),
                user_id=user_id
            )
            print(f"✅ Manager creado para usuario {user_id}, carpeta: {managers[user_id].documents_path}")
        
        # Intentar inicializar el brain, pero no fallar si hay problemas
        try:
            initialized = managers[user_id].initialize_brain(force_recreate=force_reload)
            if not initialized:
                # Si no se pudo inicializar, intentar de nuevo sin documentos
                # para que al menos el manager exista
                pass
        except Exception as e:
            # Log del error pero continuar
            print(f"⚠️  Error al inicializar brain para usuario {user_id}: {e}")
            import traceback
            traceback.print_exc()
    
    return managers[user_id]


# Modelos Pydantic para requests/responses
class QuestionRequest(BaseModel):
    question: str
    k: Optional[int] = 5  # Número de chunks a recuperar
    temperature: Optional[float] = 0.3  # Temperatura del modelo
    conversation_id: Optional[int] = None  # ID de conversación para contexto histórico
    channel: Optional[str] = None  # Canal de origen: 'web' o 'whatsapp'


class QuestionResponse(BaseModel):
    answer: str
    success: bool


class DocumentInfo(BaseModel):
    name: str
    path: str


class BrainInfoResponse(BaseModel):
    brain_name: str
    documents_count: int
    documents: List[str]
    initialized: bool


class HealthResponse(BaseModel):
    status: str
    message: str


# Endpoints

@app.get("/", response_model=HealthResponse)
async def root():
    """Endpoint raíz con información de salud."""
    return HealthResponse(
        status="ok",
        message="API - Fioravanti está funcionando. Visita /docs para la documentación interactiva."
    )


@app.get("/health", response_model=HealthResponse)
async def health():
    """Endpoint de salud para verificar que la API está funcionando."""
    return HealthResponse(
        status="ok",
        message="API - Fioravanti está funcionando. Autenticación requerida para operaciones."
    )


@app.post("/ask", response_model=QuestionResponse)
async def ask_question(
    request: QuestionRequest,
    current_user: dict = Depends(get_current_user),
    request_client: Optional[str] = Header(None, alias="X-Forwarded-For"),
    user_agent: Optional[str] = Header(None, alias="User-Agent")
):
    """
    Hace una pregunta sobre los documentos del usuario autenticado.
    
    - **question**: La pregunta a realizar
    - **k**: Número de chunks a recuperar (opcional, default: 5)
    - **temperature**: Temperatura del modelo (opcional, default: 0.3)
    """
    try:
        user_id = current_user['id']
        
        if not request.question or not request.question.strip():
            raise HTTPException(status_code=400, detail="La pregunta no puede estar vacía")
        
        # Verificar si es una pregunta genérica (saludo)
        if is_generic_greeting(request.question):
            generic_response = get_generic_response(request.question)
            if generic_response:
                return QuestionResponse(answer=generic_response, success=True)
        
        # Validar y establecer valores por defecto para k y temperature
        k = request.k if request.k is not None else 5
        temperature = request.temperature if request.temperature is not None else 0.3
        
        # Validar rangos
        if k < 1 or k > 20:
            raise HTTPException(status_code=400, detail="k debe estar entre 1 y 20")
        
        if temperature < 0 or temperature > 2:
            raise HTTPException(status_code=400, detail="temperature debe estar entre 0 y 2")
        
        # Obtener manager del usuario (aislamiento por user_id)
        m = get_manager(user_id)
        
        # Verificar si el brain está inicializado, si no, intentar inicializarlo
        if m.brain is None:
            print(f"⚠️  Brain no inicializado para usuario {user_id}, intentando inicializar...")
            initialized = m.initialize_brain(force_recreate=False)
            if not initialized:
                # Si no se pudo inicializar, verificar si hay documentos
                doc_files = m._get_document_files()
                if not doc_files:
                    raise HTTPException(
                        status_code=400,
                        detail="No hay documentos disponibles. Por favor, sube al menos un documento antes de hacer preguntas."
                    )
                else:
                    # Hay documentos pero no se pudo inicializar
                    # Verificar si es porque quivr-core no está disponible
                    try:
                        from .brain_manager import QUIVR_AVAILABLE, IMPORT_ERROR
                    except ImportError:
                        from brain_manager import QUIVR_AVAILABLE, IMPORT_ERROR
                    
                    if not QUIVR_AVAILABLE:
                        import sys
                        python_version = f"{sys.version_info.major}.{sys.version_info.minor}"
                        error_msg = f"El módulo quivr-core no está disponible (requiere Python 3.11+, actual: {python_version}). Error: {IMPORT_ERROR}. Por favor, instala quivr-core usando: pip install quivr-core"
                    else:
                        error_msg = "Error al inicializar el sistema de IA. Por favor, contacta al administrador."
                    raise HTTPException(
                        status_code=500,
                        detail=error_msg
                    )
        
        # Construir contexto con historial de conversación si está disponible
        conversation_history = []
        if request.conversation_id:
            # SEGURIDAD: Validar que conversation_id pertenece al usuario antes de obtener mensajes
            if not validate_conversation_belongs_to_user(request.conversation_id, user_id):
                raise HTTPException(
                    status_code=403, 
                    detail="No tienes permiso para acceder a esta conversación"
                )
            conversation_history = get_conversation_messages(request.conversation_id, user_id, limit=20)
            print(f"📚 Contexto histórico: {len(conversation_history)} mensajes previos")
        
        # Por ahora, Quivr maneja el historial internamente si se pasa en el config
        # El historial se usará para enriquecer el contexto de la pregunta
        # Nota: Quivr puede usar max_history del config para incluir historial automáticamente
        
        answer = m.ask(request.question, k=k, temperature=temperature)
        
        # Verificar si la respuesta es None (error en ask)
        if answer is None:
            raise HTTPException(
                status_code=500,
                detail="No se pudo obtener una respuesta del sistema de IA. Por favor, intenta de nuevo o contacta al administrador."
            )
        
        # Guardar mensajes en BD si hay conversation_id (ya validado arriba)
        channel = request.channel or 'web'  # Default a 'web' si no se especifica
        
        # Obtener IP del cliente (puede venir de proxy)
        ip_address = None
        if request_client:
            # X-Forwarded-For puede tener múltiples IPs, tomar la primera
            ip_address = request_client.split(',')[0].strip()
        
        if request.conversation_id:
            # Guardar pregunta del usuario
            msg_id_user = save_message_to_db(
                request.conversation_id, user_id, 'user', request.question, 
                channel=channel
            )
            # Registrar en auditoría con información adicional
            if msg_id_user:
                save_audit_log(
                    user_id=user_id,
                    conversation_id=request.conversation_id,
                    channel=channel,
                    direction='incoming',
                    role='user',
                    content=request.question,
                    message_id=msg_id_user,
                    ip_address=ip_address,
                    user_agent=user_agent
                )
            
            # Guardar respuesta del asistente
            if answer:
                msg_id_assistant = save_message_to_db(
                    request.conversation_id, user_id, 'assistant', answer,
                    channel=channel
                )
                # Registrar en auditoría
                if msg_id_assistant:
                    save_audit_log(
                        user_id=user_id,
                        conversation_id=request.conversation_id,
                        channel=channel,
                        direction='outgoing',
                        role='assistant',
                        content=answer,
                        message_id=msg_id_assistant,
                        ip_address=ip_address,
                        user_agent=user_agent
                    )
        
        if answer:
            return QuestionResponse(answer=answer, success=True)
        else:
            raise HTTPException(status_code=500, detail="No se pudo obtener una respuesta")
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al procesar la pregunta: {str(e)}")


@app.get("/documents", response_model=List[DocumentInfo])
async def list_documents(current_user: dict = Depends(get_current_user)):
    """
    Lista todos los documentos del usuario autenticado.
    Solo retorna documentos que pertenecen al usuario actual.
    """
    try:
        user_id = current_user['id']
        
        # Obtener documentos desde la base de datos (fuente de verdad)
        db_documents = get_user_documents_from_db(user_id)
        
        # También verificar archivos físicos para compatibilidad
        m = get_manager(user_id)
        file_documents = m.list_documents()
        
        # Combinar información de BD con archivos físicos
        result = []
        for db_doc in db_documents:
            file_path = Path(db_doc['file_path'])
            if file_path.exists():
                result.append(DocumentInfo(
                    name=db_doc['filename'],
                    path=str(file_path)
                ))
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al listar documentos: {str(e)}")


@app.post("/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Sube un nuevo documento a la carpeta de documentos del usuario autenticado.
    
    - **file**: Archivo a subir (PDF, TXT, MD, DOCX, etc.)
    """
    try:
        user_id = current_user['id']
        
        # Verificar que el archivo tenga una extensión válida
        supported_extensions = {'.pdf', '.txt', '.xls', '.xlsx', '.md', '.markdown', 
                               '.docx', '.doc', '.csv', '.json', '.xml', '.html', '.rtf'}
        
        file_extension = Path(file.filename).suffix.lower()
        if file_extension not in supported_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Tipo de archivo no soportado: {file_extension}. "
                       f"Extensiones soportadas: {', '.join(supported_extensions)}"
            )
        
        # Obtener manager del usuario para usar su carpeta específica
        m = get_manager(user_id)
        user_documents_path = m.documents_path
        
        # Asegurar que la carpeta del usuario existe
        user_documents_path.mkdir(parents=True, exist_ok=True)
        
        # Guardar el archivo en la carpeta del usuario
        file_path = user_documents_path / file.filename
        
        print(f"📁 Guardando documento para usuario {user_id} en: {file_path}")
        
        # Si el archivo ya existe, agregar un sufijo numérico
        counter = 1
        original_path = file_path
        while file_path.exists():
            stem = original_path.stem
            suffix = original_path.suffix
            file_path = user_documents_path / f"{stem}_{counter}{suffix}"
            counter += 1
        
        # Leer contenido y guardar
        content = await file.read()
        file_size = len(content)
        
        with open(file_path, "wb") as f:
            f.write(content)
        
        # Guardar información en la base de datos
        mime_type = file.content_type or 'application/octet-stream'
        brain_name = m.brain_name
        save_document_to_db(user_id, file_path.name, str(file_path), file_size, mime_type, brain_name)
        
        # Recargar el brain del usuario para incluir el nuevo documento
        m = get_manager(user_id, force_reload=True)
        
        return JSONResponse(
            content={
                "success": True,
                "message": f"Documento '{file.filename}' subido correctamente",
                "file_path": str(file_path),
                "documents_count": len(m.list_documents())
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al subir documento: {str(e)}")


@app.get("/info", response_model=BrainInfoResponse)
async def get_brain_info(current_user: dict = Depends(get_current_user)):
    """
    Obtiene información sobre el brain y los documentos del usuario autenticado.
    Solo retorna información del usuario actual.
    """
    try:
        user_id = current_user['id']
        m = get_manager(user_id)
        documents = m.list_documents()
        return BrainInfoResponse(
            brain_name=m.brain_name,
            documents_count=len(documents),
            documents=documents,
            initialized=m.brain is not None
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener información: {str(e)}")


@app.post("/reload")
async def reload_brain(current_user: dict = Depends(get_current_user)):
    """
    Recarga el brain del usuario autenticado con sus documentos actuales.
    Solo recarga el brain del usuario actual.
    """
    try:
        user_id = current_user['id']
        m = get_manager(user_id, force_reload=True)
        
        # Verificar que el brain se haya inicializado correctamente
        if m.brain is None:
            raise HTTPException(
                status_code=500, 
                detail="No se pudo inicializar el brain. Verifica los logs del servidor."
            )
        
        return JSONResponse(
            content={
                "success": True,
                "message": "Brain recargado correctamente",
                "documents_count": len(m.list_documents()),
                "initialized": m.brain is not None
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error al recargar brain: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
