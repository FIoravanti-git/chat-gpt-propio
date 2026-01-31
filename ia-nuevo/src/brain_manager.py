"""
Gestor de Brain de Quivr para gestionar documentos y consultas.
"""
import os
import uuid
from pathlib import Path
from typing import List, Optional

# En su lugar, usamos threads separados para inicializar el brain

# Importar conversor de archivos
try:
    from .file_converter import preprocess_file
except ImportError:
    try:
        from src.file_converter import preprocess_file
    except ImportError:
        try:
            from file_converter import preprocess_file
        except ImportError:
            # Si no existe el módulo, crear una función dummy
            def preprocess_file(file_path: Path) -> Path:
                """Función dummy si no existe el conversor de archivos"""
                return file_path

try:
    from quivr_core import Brain
    # RetrievalConfig puede no estar disponible en todas las versiones
    try:
        from quivr_core.config import RetrievalConfig
    except ImportError:
        RetrievalConfig = None
    QUIVR_AVAILABLE = True
except ImportError as e:
    QUIVR_AVAILABLE = False
    Brain = None
    RetrievalConfig = None
    IMPORT_ERROR = str(e)


class BrainManager:
    """Gestor para manejar el Brain de Quivr y las operaciones con documentos."""
    
    def __init__(
        self,
        brain_name: str = "mi_cerebro_inteligente",
        documents_path: str = "./docs/documentos",
        config_path: str = "./config/basic_rag_workflow.yaml",
        user_id: Optional[int] = None
    ):
        """
        Inicializa el gestor de Brain.
        
        Args:
            brain_name: Nombre del brain
            documents_path: Ruta a la carpeta de documentos
            config_path: Ruta al archivo de configuración YAML
            user_id: ID del usuario para aislamiento multi-tenancy (opcional)
        """
        self.user_id = user_id
        # Si hay user_id, crear brain_name y documents_path específicos para el usuario
        if user_id is not None:
            self.brain_name = f"brain_user_{user_id}" if brain_name == "mi_cerebro_inteligente" else brain_name
            # Crear subdirectorio por usuario
            base_path = Path(documents_path)
            self.documents_path = base_path / f"user_{user_id}"
        else:
            self.brain_name = brain_name
            self.documents_path = Path(documents_path)
        
        self.config_path = config_path
        self.brain: Optional[Brain] = None if not QUIVR_AVAILABLE else None
        self.retrieval_config: Optional[RetrievalConfig] = None if not QUIVR_AVAILABLE else None
        
        # Crear carpeta de documentos si no existe
        self.documents_path.mkdir(parents=True, exist_ok=True)
        
    def initialize_brain(self, force_recreate: bool = False):
        """
        Inicializa o carga el brain con los documentos disponibles.
        
        Args:
            force_recreate: Si True, recrea el brain incluso si ya existe
        """
        # Buscar todos los archivos en la carpeta de documentos
        file_paths = self._get_document_files()
        
        if not file_paths:
            print(f"⚠️  No se encontraron documentos en {self.documents_path}")
            print("   Por favor, coloca algunos documentos (PDF, TXT, MD, etc.) en la carpeta.")
            return False
        
        if not QUIVR_AVAILABLE:
            print(f"❌ quivr-core no está disponible. Error: {IMPORT_ERROR}")
            print("   Por favor, instala quivr-core usando: pip install quivr-core")
            return False
        
        try:
            if force_recreate or self.brain is None:
                # Si se fuerza recrear, limpiar el brain anterior
                if force_recreate and self.brain is not None:
                    print(f"🔄 Forzando recarga del brain '{self.brain_name}'...")
                    self.brain = None
                
                print(f"📚 Inicializando brain '{self.brain_name}' con {len(file_paths)} documento(s)...")
                
                # Preprocesar archivos: convertir Excel a TXT
                processed_files = []
                
                for fp in file_paths:
                    ext = fp.suffix.lower()
                    # Preprocesar solo archivos Excel (convertir a TXT)
                    # PDFs se procesan directamente con UnstructuredPDFProcessor
                    if ext in ['.xls', '.xlsx']:
                        print(f"  🔄 Preprocesando {fp.name} (Excel)...")
                        converted = preprocess_file(str(fp))
                        if converted and converted != str(fp):
                            processed_files.append(converted)
                        else:
                            # Si falla la conversión, intentar con el original
                            processed_files.append(str(fp))
                    else:
                        # Para PDFs y otros archivos, usar directamente
                        processed_files.append(str(fp))
                
                try:
                    # Forzar procesadores que no requieren NATS
                    try:
                        from quivr_core.processor.registry import register_processor, FileExtension
                        from quivr_core.processor.implementations.simple_txt_processor import SimpleTxtProcessor
                        from quivr_core.processor.implementations.default import _build_processor
                        from langchain_community.document_loaders import UnstructuredPDFLoader
                        
                        # Crear procesador PDF con UnstructuredPDFLoader (procesa localmente sin servidor externo)
                        UnstructuredPDFProcessor = _build_processor(
                            'UnstructuredPDFProcessor',
                            UnstructuredPDFLoader,
                            [FileExtension.pdf]
                        )
                        
                        # Registrar UnstructuredPDFProcessor con alta prioridad para PDFs (no requiere NATS ni Tika)
                        register_processor(
                            FileExtension.pdf,
                            UnstructuredPDFProcessor,
                            override=True,
                            priority=1  # Alta prioridad
                        )
                        print("✅ UnstructuredPDFProcessor registrado para PDFs (sin NATS, sin Tika, procesamiento local)")
                        
                        # Registrar SimpleTxtProcessor con alta prioridad para TXT
                        register_processor(
                            FileExtension.txt,
                            SimpleTxtProcessor,
                            override=True,
                            priority=1  # Alta prioridad
                        )
                        print("✅ SimpleTxtProcessor registrado para TXT")
                    except Exception as proc_error:
                        print(f"⚠️  No se pudo forzar procesadores: {proc_error}")
                        import traceback
                        traceback.print_exc()
                    
                    # Brain.from_files internamente usa asyncio, necesita un event loop
                    import concurrent.futures
                    import asyncio
                    
                    def create_brain():
                        # Crear un nuevo event loop en el thread
                        new_loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(new_loop)
                        try:
                            # Brain.from_files internamente usa asyncio
                            return Brain.from_files(
                                name=self.brain_name,
                                file_paths=processed_files,
                            )
                        finally:
                            # Cerrar el loop después de usar
                            try:
                                new_loop.close()
                            except:
                                pass
                    
                    # Ejecutar en thread separado con timeout
                    with concurrent.futures.ThreadPoolExecutor() as executor:
                        future = executor.submit(create_brain)
                        self.brain = future.result(timeout=300)  # 5 minutos timeout para procesar PDFs grandes
                    
                    print(f"✅ Brain inicializado correctamente con {len(processed_files)} archivo(s)")
                        
                except Exception as brain_error:
                    print(f"❌ Error al crear brain: {brain_error}")
                    import traceback
                    traceback.print_exc()
                    self.brain = None
                    raise
            else:
                print(f"✅ Brain ya está inicializado")
            
            # Cargar configuración de recuperación si existe y RetrievalConfig está disponible
            if RetrievalConfig and os.path.exists(self.config_path):
                try:
                    self.retrieval_config = RetrievalConfig.from_yaml(self.config_path)
                    print(f"✅ Configuración de recuperación cargada desde {self.config_path}")
                except Exception as e:
                    print(f"⚠️  No se pudo cargar la configuración: {e}")
                    print("   Usando configuración por defecto")
                    self.retrieval_config = None
            else:
                if not RetrievalConfig:
                    print("⚠️  RetrievalConfig no está disponible en esta versión de quivr-core")
                elif not os.path.exists(self.config_path):
                    print(f"⚠️  Archivo de configuración no encontrado en {self.config_path}")
                print("   Usando configuración por defecto")
                self.retrieval_config = None
            
            return True
        except Exception as e:
            print(f"❌ Error al inicializar el brain: {e}")
            return False
    
    def _get_document_files(self) -> List[Path]:
        """
        Obtiene la lista de archivos de documentos disponibles.
        Incluye PDFs (procesados con UnstructuredPDFProcessor), TXT, Excel, y otros formatos.
        
        Returns:
            Lista de rutas a archivos de documentos
        """
        # Extensiones soportadas
        supported_extensions = {
            '.pdf',  # PDFs procesados con UnstructuredPDFProcessor
            '.txt', '.md', '.markdown',  # Texto y Markdown
            '.xls', '.xlsx',  # Excel (se convertirán a TXT)
            '.docx', '.doc',  # Word
            '.csv', '.json', '.xml', '.html', '.rtf'  # Otros formatos
        }
        
        file_paths = []
        processed_base_names = set()  # Para evitar duplicados
        
        # Asegurar que la carpeta existe
        if not self.documents_path.exists():
            print(f"⚠️  Carpeta de documentos no existe: {self.documents_path}, creándola...")
            self.documents_path.mkdir(parents=True, exist_ok=True)
        
        if self.documents_path.exists():
            print(f"📂 Buscando documentos en: {self.documents_path}")
            for file_path in self.documents_path.iterdir():
                if not file_path.is_file():
                    continue
                
                # Ignorar archivos ocultos y temporales
                if file_path.name.startswith('.'):
                    continue
                
                ext = file_path.suffix.lower()
                base_name = file_path.stem.lower()
                
                if ext in supported_extensions:
                    # Para Excel, verificar si ya hay un TXT convertido
                    if ext in ['.xls', '.xlsx']:
                        txt_equivalent = file_path.parent / f"{file_path.stem}.txt"
                        if txt_equivalent.exists() and txt_equivalent.is_file():
                            # Usar el TXT convertido en lugar del Excel
                            if base_name not in processed_base_names:
                                file_paths.append(txt_equivalent)
                                processed_base_names.add(base_name)
                        else:
                            # No hay conversión, incluir el Excel original (se convertirá)
                            if base_name not in processed_base_names:
                                file_paths.append(file_path)
                                processed_base_names.add(base_name)
                    else:
                        # Para PDFs y otros formatos, incluir directamente
                        if base_name not in processed_base_names:
                            file_paths.append(file_path)
                            processed_base_names.add(base_name)
        
        return file_paths
    
    def ask(self, question: str, k: int = 5, temperature: float = 0.3) -> Optional[str]:
        """
        Hace una pregunta al brain.
        
        Args:
            question: La pregunta a realizar
            k: Número de chunks a recuperar (default: 5)
            temperature: Temperatura del modelo (default: 0.3)
            
        Returns:
            La respuesta del brain o None si hay un error
        """
        if self.brain is None:
            print("❌ El brain no está inicializado. Ejecuta initialize_brain() primero.")
            return None
        
        try:
            # Crear una copia de la configuración si existe, o usar None
            config = None
            if self.retrieval_config and QUIVR_AVAILABLE:
                # Intentar crear una copia de la configuración y actualizar valores
                try:
                    # Si el config tiene métodos para actualizar, intentar usarlos
                    config = self.retrieval_config
                    
                    # Actualizar top_n (k) en reranker_config
                    if hasattr(config, 'reranker_config') and config.reranker_config:
                        if hasattr(config.reranker_config, 'top_n'):
                            # Intentar actualizar directamente
                            try:
                                config.reranker_config.top_n = k
                            except (AttributeError, TypeError):
                                # Si no se puede modificar, crear nueva instancia si es posible
                                pass
                    
                    # Actualizar temperature en llm_config
                    if hasattr(config, 'llm_config') and config.llm_config:
                        if hasattr(config.llm_config, 'temperature'):
                            try:
                                config.llm_config.temperature = temperature
                            except (AttributeError, TypeError):
                                pass
                except Exception as config_error:
                    # Si no se puede modificar la config, usar la original
                    print(f"⚠️  No se pudo actualizar la configuración dinámicamente: {config_error}")
                    config = self.retrieval_config
            
            # Generar run_id único para cada pregunta
            run_id = uuid.uuid4()
            
            # Ejecutar ask en thread separado para evitar conflictos con el event loop de uvicorn
            import concurrent.futures
            import asyncio
            
            def ask_brain():
                # Brain.ask() internamente usa asyncio.get_event_loop()
                # Necesitamos crear un loop en este thread
                new_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(new_loop)
                try:
                    # Brain.ask() es síncrono pero internamente usa asyncio
                    # Pasar run_id y question como parámetros posicionales
                    if config:
                        return self.brain.ask(
                            run_id,
                            question,
                            retrieval_config=config
                        )
                    else:
                        return self.brain.ask(run_id, question)
                finally:
                    # Cerrar el loop después de usar
                    try:
                        # Esperar a que todas las tareas pendientes terminen
                        pending = asyncio.all_tasks(new_loop)
                        if pending:
                            new_loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
                    except:
                        pass
                    finally:
                        new_loop.close()
            
            # Ejecutar en thread separado
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(ask_brain)
                response = future.result(timeout=120)  # 2 minutos timeout
            
            # Extraer la respuesta del objeto ParsedRAGResponse
            if hasattr(response, 'answer'):
                return response.answer
            elif hasattr(response, 'answer_text'):
                return response.answer_text
            elif hasattr(response, 'text'):
                return response.text
            else:
                return str(response)
        except Exception as e:
            print(f"❌ Error al hacer la pregunta: {e}")
            return None
    
    def list_documents(self) -> List[str]:
        """
        Lista los documentos disponibles en la carpeta.
        
        Returns:
            Lista de nombres de archivos
        """
        file_paths = self._get_document_files()
        return [fp.name for fp in file_paths]
    
    def print_info(self):
        """Imprime información sobre el brain y los documentos."""
        if self.brain:
            self.brain.print_info()
        else:
            print("Brain no inicializado")
        
        documents = self.list_documents()
        print(f"\n📁 Documentos disponibles ({len(documents)}):")
        for doc in documents:
            print(f"   - {doc}")
