"""
Manejador de saludos y preguntas genéricas.
Responde a preguntas comunes sin necesidad de consultar documentos.
"""
from typing import Optional


# Diccionario de saludos y respuestas genéricas
GREETINGS_RESPONSES = {
    # Saludos
    "hola": "¡Hola! ¿En qué puedo ayudarte hoy?",
    "hola!": "¡Hola! ¿En qué puedo ayudarte hoy?",
    "hola ": "¡Hola! ¿En qué puedo ayudarte hoy?",
    "buenos días": "¡Buenos días! ¿Cómo puedo ayudarte?",
    "buen día": "¡Buen día! ¿En qué puedo asistirte?",
    "buenas tardes": "¡Buenas tardes! ¿Qué necesitas?",
    "buenas noches": "¡Buenas noches! ¿En qué puedo ayudarte?",
    
    # Cómo estás
    "qué tal": "¡Muy bien, gracias por preguntar! ¿En qué puedo ayudarte?",
    "que tal": "¡Muy bien, gracias por preguntar! ¿En qué puedo ayudarte?",
    "como estas": "¡Muy bien, gracias! ¿Tienes alguna pregunta sobre los documentos?",
    "cómo estás": "¡Muy bien, gracias! ¿Tienes alguna pregunta sobre los documentos?",
    "como estas?": "¡Muy bien, gracias! ¿Tienes alguna pregunta sobre los documentos?",
    "cómo estás?": "¡Muy bien, gracias! ¿Tienes alguna pregunta sobre los documentos?",
    "como estás": "¡Muy bien, gracias! ¿Tienes alguna pregunta sobre los documentos?",
    "cómo estas": "¡Muy bien, gracias! ¿Tienes alguna pregunta sobre los documentos?",
    
    # Gracias
    "gracias": "¡De nada! Si necesitas algo más, no dudes en preguntar.",
    "gracias!": "¡De nada! Si necesitas algo más, no dudes en preguntar.",
    "muchas gracias": "¡De nada! Estoy aquí para ayudarte cuando lo necesites.",
    "muchas gracias!": "¡De nada! Estoy aquí para ayudarte cuando lo necesites.",
    "te agradezco": "¡De nada! Para eso estoy, para ayudarte.",
    "agradecido": "¡De nada! Es un placer poder ayudarte.",
    
    # Despedidas
    "adiós": "¡Hasta luego! Que tengas un buen día.",
    "adios": "¡Hasta luego! Que tengas un buen día.",
    "hasta luego": "¡Hasta luego! Si necesitas algo más, aquí estaré.",
    "nos vemos": "¡Nos vemos! Que estés bien.",
    "chao": "¡Chao! Que tengas un excelente día.",
    
    # Estado/presentación
    "quien eres": "Soy un asistente de IA diseñado para ayudarte a consultar y entender tus documentos. ¿En qué puedo ayudarte?",
    "quién eres": "Soy un asistente de IA diseñado para ayudarte a consultar y entender tus documentos. ¿En qué puedo ayudarte?",
    "que eres": "Soy un asistente de IA especializado en consultar documentos. ¿Tienes alguna pregunta?",
    "qué eres": "Soy un asistente de IA especializado en consultar documentos. ¿Tienes alguna pregunta?",
}


def is_generic_greeting(question: str) -> bool:
    """
    Detecta si una pregunta es un saludo o pregunta genérica.
    
    Args:
        question: La pregunta a analizar
        
    Returns:
        True si es un saludo genérico, False en caso contrario
    """
    if not question:
        return False
    
    # Normalizar la pregunta: minúsculas, sin acentos, sin signos de puntuación al final
    normalized = question.lower().strip()
    
    # Remover signos de puntuación al final
    while normalized and normalized[-1] in '.,!?;:':
        normalized = normalized[:-1].strip()
    
    # Verificar coincidencia exacta o si la pregunta empieza con el saludo
    for greeting in GREETINGS_RESPONSES.keys():
        if normalized == greeting or normalized.startswith(greeting + " "):
            return True
    
    # Verificar patrones comunes
    greeting_patterns = [
        "hola",
        "buenos días",
        "buen día",
        "buenas tardes",
        "buenas noches",
        "qué tal",
        "que tal",
        "como estas",
        "cómo estás",
        "gracias",
        "muchas gracias",
        "adiós",
        "adios",
        "hasta luego",
    ]
    
    normalized_no_spaces = normalized.replace(" ", "").replace("?", "").replace("¿", "").replace("!", "").replace("¡", "")
    
    for pattern in greeting_patterns:
        if normalized_no_spaces == pattern.replace(" ", ""):
            return True
        if normalized.startswith(pattern):
            return True
    
    return False


def get_generic_response(question: str) -> Optional[str]:
    """
    Obtiene una respuesta humana para preguntas genéricas.
    
    Args:
        question: La pregunta genérica
        
    Returns:
        La respuesta humana o None si no es una pregunta genérica reconocida
    """
    if not question:
        return None
    
    # Normalizar la pregunta
    normalized = question.lower().strip()
    
    # Remover signos de puntuación al final
    while normalized and normalized[-1] in '.,!?;:':
        normalized = normalized[:-1].strip()
    
    # Buscar coincidencia exacta
    if normalized in GREETINGS_RESPONSES:
        return GREETINGS_RESPONSES[normalized]
    
    # Buscar por patrones
    for greeting, response in GREETINGS_RESPONSES.items():
        if normalized == greeting or normalized.startswith(greeting + " "):
            return response
    
    # Verificar variaciones comunes
    normalized_no_spaces = normalized.replace(" ", "").replace("?", "").replace("¿", "").replace("!", "").replace("¡", "")
    
    for greeting, response in GREETINGS_RESPONSES.items():
        greeting_clean = greeting.replace(" ", "")
        if normalized_no_spaces == greeting_clean or normalized.startswith(greeting):
            return response
    
    return None
