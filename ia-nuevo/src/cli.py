"""
Interfaz de línea de comandos para interactuar con Quivr Brain.
"""
import os
import sys
from pathlib import Path
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt
from dotenv import load_dotenv

# Intentar importar como módulo relativo, si falla usar import absoluto
try:
    from .brain_manager import BrainManager
except ImportError:
    # Si se ejecuta como script directo, usar import absoluto
    from brain_manager import BrainManager

# Cargar variables de entorno
load_dotenv()

console = Console()


def check_api_keys():
    """Verifica que las API keys necesarias estén configuradas."""
    required_keys = ["OPENAI_API_KEY"]  # Puedes agregar más según necesites
    missing_keys = []
    
    for key in required_keys:
        if not os.getenv(key):
            missing_keys.append(key)
    
    if missing_keys:
        console.print(
            Panel.fit(
                f"[bold red]⚠️  Faltan variables de entorno:[/bold red]\n"
                f"{', '.join(missing_keys)}\n\n"
                f"Crea un archivo .env con:\n"
                f"{chr(10).join(f'{key}=tu_api_key_aqui' for key in missing_keys)}",
                title="Configuración Requerida"
            )
        )
        return False
    return True


def main():
    """Función principal de la CLI."""
    console.print(
        Panel.fit(
            "[bold magenta]🧠 Quivr - Tu Segundo Cerebro con IA Generativa[/bold magenta]",
            title="Bienvenido"
        )
    )
    
    # Verificar API keys
    if not check_api_keys():
        console.print("\n[bold yellow]Configura tus API keys y vuelve a intentar.[/bold yellow]")
        sys.exit(1)
    
    # Obtener rutas absolutas
    base_dir = Path(__file__).parent.parent
    documents_path = base_dir / "docs" / "documentos"
    config_path = base_dir / "config" / "basic_rag_workflow.yaml"
    
    # Crear gestor de brain
    manager = BrainManager(
        brain_name="mi_cerebro_ia",
        documents_path=str(documents_path),
        config_path=str(config_path)
    )
    
    # Inicializar brain
    if not manager.initialize_brain():
        console.print("\n[bold red]No se pudo inicializar el brain.[/bold red]")
        sys.exit(1)
    
    # Mostrar información
    manager.print_info()
    
    console.print(
        Panel.fit(
            "[bold cyan]Puedes hacer preguntas sobre tus documentos.[n]\n"
            "Escribe 'exit' o 'salir' para terminar.[n]\n"
            "Escribe 'reload' o 'recargar' para recargar documentos.[n]\n"
            "Escribe 'info' o 'informacion' para ver información del brain.[/bold cyan]",
            title="Instrucciones"
        )
    )
    
    # Bucle principal de interacción
    while True:
        try:
            question = Prompt.ask("[bold cyan]❓ Tu pregunta[/bold cyan]")
            
            # Comandos especiales
            if question.lower() in ['exit', 'salir', 'quit', 'q']:
                console.print(Panel("¡Hasta luego! 👋", style="bold yellow"))
                break
            
            if question.lower() in ['reload', 'recargar']:
                console.print("[bold yellow]🔄 Recargando documentos...[/bold yellow]")
                manager.initialize_brain(force_recreate=True)
                manager.print_info()
                continue
            
            if question.lower() in ['info', 'informacion', 'i']:
                manager.print_info()
                continue
            
            if not question.strip():
                continue
            
            # Hacer pregunta al brain
            console.print("[bold blue]💭 Pensando...[/bold blue]")
            answer = manager.ask(question)
            
            if answer:
                console.print(
                    Panel(
                        answer,
                        title="[bold green]🤖 Respuesta[/bold green]",
                        border_style="green"
                    )
                )
            else:
                console.print("[bold red]❌ No se pudo obtener una respuesta.[/bold red]")
            
            console.print("-" * console.width)
            
        except KeyboardInterrupt:
            console.print("\n[bold yellow]¡Hasta luego! 👋[/bold yellow]")
            break
        except Exception as e:
            console.print(f"[bold red]Error: {e}[/bold red]")


if __name__ == "__main__":
    main()
