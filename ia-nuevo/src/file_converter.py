"""
Conversor de archivos a formato compatible con quivr-core.
Convierte archivos Excel (XLS, XLSX) y PDF a texto antes de procesarlos.
"""
import os
import pandas as pd
from pathlib import Path
from typing import Optional

try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
except ImportError:
    PDFPLUMBER_AVAILABLE = False


def convert_excel_to_txt(excel_path: str, output_dir: Optional[str] = None) -> Optional[str]:
    """
    Convierte un archivo Excel (XLS, XLSX) a formato TXT.
    
    Args:
        excel_path: Ruta al archivo Excel
        output_dir: Directorio donde guardar el archivo TXT (opcional)
        
    Returns:
        Ruta al archivo TXT generado o None si hay error
    """
    try:
        excel_file = Path(excel_path)
        
        if not excel_file.exists():
            print(f"❌ Archivo no encontrado: {excel_path}")
            return None
        
        # Leer el archivo Excel
        try:
            # Intentar leer con openpyxl primero (para XLSX)
            if excel_file.suffix.lower() == '.xlsx':
                df_dict = pd.read_excel(excel_path, sheet_name=None, engine='openpyxl')
            else:
                # Para XLS usar xlrd
                df_dict = pd.read_excel(excel_path, sheet_name=None, engine='xlrd')
        except Exception as e:
            print(f"⚠️  Error leyendo Excel con pandas: {e}")
            # Intentar sin especificar engine
            try:
                df_dict = pd.read_excel(excel_path, sheet_name=None)
            except Exception as e2:
                print(f"❌ Error al leer archivo Excel: {e2}")
                return None
        
        # Convertir todas las hojas a texto
        text_parts = []
        for sheet_name, df in df_dict.items():
            text_parts.append(f"=== Hoja: {sheet_name} ===\n")
            
            # Convertir DataFrame a texto
            # Primero los encabezados
            if not df.empty:
                text_parts.append("\t".join(df.columns.astype(str)) + "\n")
                
                # Luego las filas
                for _, row in df.iterrows():
                    row_text = "\t".join(row.astype(str).fillna("").tolist())
                    text_parts.append(row_text + "\n")
            
            text_parts.append("\n")
        
        full_text = "".join(text_parts)
        
        # Determinar ruta de salida
        if output_dir:
            output_path = Path(output_dir) / f"{excel_file.stem}.txt"
        else:
            output_path = excel_file.parent / f"{excel_file.stem}.txt"
        
        # Guardar como TXT
        output_path.write_text(full_text, encoding='utf-8')
        
        print(f"✅ Excel convertido a TXT: {output_path}")
        return str(output_path)
        
    except Exception as e:
        print(f"❌ Error al convertir Excel a TXT: {e}")
        import traceback
        traceback.print_exc()
        return None


def convert_pdf_to_txt(pdf_path: str, output_dir: Optional[str] = None) -> Optional[str]:
    """
    Convierte un archivo PDF a formato TXT.
    
    Args:
        pdf_path: Ruta al archivo PDF
        output_dir: Directorio donde guardar el archivo TXT (opcional)
        
    Returns:
        Ruta al archivo TXT generado o None si hay error
    """
    if not PDFPLUMBER_AVAILABLE:
        print("⚠️  pdfplumber no está disponible. No se puede convertir PDF a TXT.")
        return None
    
    try:
        pdf_file = Path(pdf_path)
        
        if not pdf_file.exists():
            print(f"❌ Archivo no encontrado: {pdf_path}")
            return None
        
        # Extraer texto del PDF
        text_parts = []
        try:
            with pdfplumber.open(pdf_path) as pdf:
                for i, page in enumerate(pdf.pages):
                    text = page.extract_text()
                    if text:
                        text_parts.append(f"=== Página {i + 1} ===\n")
                        text_parts.append(text)
                        text_parts.append("\n\n")
        except Exception as e:
            print(f"⚠️  Error extrayendo texto del PDF con pdfplumber: {e}")
            return None
        
        if not text_parts:
            print("⚠️  No se pudo extraer texto del PDF")
            return None
        
        full_text = "".join(text_parts)
        
        # Determinar ruta de salida
        if output_dir:
            output_path = Path(output_dir) / f"{pdf_file.stem}.txt"
        else:
            output_path = pdf_file.parent / f"{pdf_file.stem}.txt"
        
        # Guardar como TXT
        output_path.write_text(full_text, encoding='utf-8')
        
        print(f"✅ PDF convertido a TXT: {output_path}")
        return str(output_path)
        
    except Exception as e:
        print(f"❌ Error al convertir PDF a TXT: {e}")
        import traceback
        traceback.print_exc()
        return None


def preprocess_file(file_path: str) -> str:
    """
    Preprocesa un archivo convirtiéndolo si es necesario.
    
    Args:
        file_path: Ruta al archivo original
        
    Returns:
        Ruta al archivo procesado (puede ser el original o un conversión)
    """
    file = Path(file_path)
    ext = file.suffix.lower()
    
    # Si es Excel, convertir a TXT
    if ext in ['.xls', '.xlsx']:
        txt_path = convert_excel_to_txt(file_path, output_dir=str(file.parent))
        if txt_path:
            return txt_path
        # Si falla la conversión, retornar el original y que quivr-core intente procesarlo
        return file_path
    
    # PDFs se procesan directamente con UnstructuredPDFProcessor (no requiere NATS)
    # No convertir PDFs - procesarlos nativamente
    if ext == '.pdf':
        return file_path
    
    # Para otros archivos, retornar el original
    return file_path
