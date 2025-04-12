from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from googletrans import Translator
from gtts import gTTS
import os
import uuid
import google.generativeai as genai
from dotenv import load_dotenv
import speech_recognition as sr
from pydub import AudioSegment
import tempfile
import logging
from jsonschema import validate, ValidationError
import time
from retry import retry
import shutil

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Ensure required directories exist
STATIC_FOLDER = 'static'
AUDIO_FOLDER = os.path.join(STATIC_FOLDER, 'audio')
os.makedirs(STATIC_FOLDER, exist_ok=True)
os.makedirs(AUDIO_FOLDER, exist_ok=True)

app = Flask(__name__)

# Configure CORS with more permissive settings
CORS(app, resources={
    r"/*": {
        "origins": "*",  # Allow all origins in development
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "Accept"],
        "supports_credentials": True,
        "max_age": 3600
    }
})

# Configure rate limiter
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)

# Initialize services
translator = Translator()
recognizer = sr.Recognizer()

# Configure Gemini
genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
model = genai.GenerativeModel('gemini-1.5-pro')

# Input validation schemas
TRANSLATE_SCHEMA = {
    "type": "object",
    "properties": {
        "text": {"type": "string", "minLength": 1, "maxLength": 500},
        "target_lang": {"type": "string", "pattern": "^[a-z]{2}$"}
    },
    "required": ["text"]
}

TTS_SCHEMA = {
    "type": "object",
    "properties": {
        "text": {"type": "string", "minLength": 1, "maxLength": 500},
        "language": {"type": "string", "pattern": "^[a-z]{2}$"}
    },
    "required": ["text"]
}

CONVERSATION_SCHEMA = {
    "type": "object",
    "properties": {
        "message": {"type": "string", "minLength": 1, "maxLength": 1000},
        "scenario": {"type": "string", "enum": ["restaurant", "shopping"]},
        "history": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "sender": {"type": "string", "enum": ["user", "ai"]},
                    "message": {"type": "string"}
                },
                "required": ["sender", "message"]
            }
        }
    },
    "required": ["message"]
}

# Conversation scenarios
CONVERSATION_SCENARIOS = {
    'restaurant': {
        'system_prompt': """You are a helpful AI Hindi language teacher. Your role is to help English speakers learn Hindi through conversation practice. 
        Follow these rules strictly:
        1. First provide the English version of what you want to say
        2. Then provide the Hindi translation in Devanagari script
        3. Then provide the English transliteration in parentheses
        4. Keep responses short (1-2 sentences max)
        5. Correct any mistakes the learner makes in a friendly way
        6. Focus on practical, everyday conversations
        """,
        'initial_message': "English: Hello! Let's practice ordering food in Hindi.\nHindi: नमस्ते! चलो हिंदी में भोजन ऑर्डर करने का अभ्यास करते हैं।\nTransliteration: (Namaste! Chalo Hindi mein bhojan order karne ka abhyas karte hain.)"
    },
    'shopping': {
        'system_prompt': """You are a helpful AI Hindi language teacher. Your role is to help English speakers learn Hindi through conversation practice. 
        Follow these rules strictly:
        1. First provide the English version of what you want to say
        2. Then provide the Hindi translation in Devanagari script
        3. Then provide the English transliteration in parentheses
        4. Keep responses short (1-2 sentences max)
        5. Correct any mistakes the learner makes in a friendly way
        6. Focus on practical, everyday conversations
        """,
        'initial_message': "English: Welcome! Let's practice shopping conversations in Hindi.\nHindi: स्वागत है! चलो हिंदी में खरीदारी की बातचीत का अभ्यास करते हैं।\nTransliteration: (Swagat hai! Chalo Hindi mein kharidari ki baatcheet ka abhyas karte hain.)"
    }
}

def cleanup_old_audio_files():
    """Remove audio files older than 1 hour."""
    now = time.time()
    for filename in os.listdir(AUDIO_FOLDER):
        file_path = os.path.join(AUDIO_FOLDER, filename)
        if os.path.isfile(file_path) and now - os.path.getmtime(file_path) > 3600:
            os.unlink(file_path)
            logger.info(f"Deleted old audio file: {filename}")

@app.route('/translate', methods=['POST'])
@limiter.limit("10 per minute")
def handle_translation():
    data = request.get_json()
    try:
        validate(data, TRANSLATE_SCHEMA)
    except ValidationError as e:
        logger.warning(f"Invalid translation input: {e.message}")
        return jsonify({'error': 'Invalid input data'}), 400

    text = data.get('text')
    target_lang = data.get('target_lang', 'hi')

    try:
        translation = translator.translate(text, dest=target_lang)
        logger.info(f"Translated '{text}' to '{translation.text}' in {target_lang}")
        return jsonify({
            'translatedText': translation.text,
            'pronunciation': translation.pronunciation or translation.text
        })
    except Exception as e:
        logger.error(f"Translation error: {str(e)}")
        return jsonify({'error': 'Translation service unavailable'}), 500

@app.route('/tts', methods=['POST'])
@limiter.limit("10 per minute")
def text_to_speech():
    data = request.get_json()
    try:
        validate(data, TTS_SCHEMA)
    except ValidationError as e:
        logger.warning(f"Invalid TTS input: {e.message}")
        return jsonify({'error': 'Invalid input data'}), 400

    text = data.get('text')
    language = data.get('language', 'hi')

    try:
        filename = f"{uuid.uuid4()}.mp3"
        filepath = os.path.join(AUDIO_FOLDER, filename)
        
        tts = gTTS(text=text, lang=language, slow=False)
        tts.save(filepath)
        
        cleanup_old_audio_files()
        logger.info(f"Generated TTS audio: {filename}")
        return jsonify({
            'audioUrl': f'/static/audio/{filename}'
        })
    except Exception as e:
        logger.error(f"TTS error: {str(e)}")
        return jsonify({'error': 'Text-to-speech service unavailable'}), 500

@app.route('/conversation', methods=['POST'])
@limiter.limit("5 per minute")
@retry(tries=3, delay=1, backoff=2)
def handle_conversation():
    data = request.get_json()
    try:
        validate(data, CONVERSATION_SCHEMA)
    except ValidationError as e:
        logger.warning(f"Invalid conversation input: {e.message}")
        return jsonify({'error': 'Invalid input data'}), 400

    user_message = data.get('message')
    scenario = data.get('scenario', 'restaurant')
    conversation_history = data.get('history', [])

    if scenario not in CONVERSATION_SCENARIOS:
        logger.warning(f"Invalid scenario: {scenario}")
        return jsonify({'error': 'Invalid scenario'}), 400

    try:
        prompt = f"""
        {CONVERSATION_SCENARIOS[scenario]['system_prompt']}
        
        Current conversation context:
        {format_conversation_history(conversation_history)}
        
        User's message: {user_message}
        
        Please respond following the exact format rules provided above.
        """
        
        response = model.generate_content(prompt)
        ai_response = response.text
        
        response_parts = parse_ai_response(ai_response)
        logger.info(f"Conversation response generated for scenario {scenario}")
        return jsonify({
            'english': response_parts['english'],
            'hindi': response_parts['hindi'],
            'transliteration': response_parts['transliteration'],
            'full_response': ai_response
        })
    except Exception as e:
        logger.error(f"Conversation error: {str(e)}")
        return jsonify({'error': 'Conversation service unavailable'}), 500

@app.route('/check-pronunciation', methods=['POST'])
@limiter.limit("5 per minute")
def check_pronunciation():
    if 'audio' not in request.files or 'expected_text' not in request.form:
        logger.warning("Missing audio or expected_text in pronunciation check")
        return jsonify({'error': 'Missing audio or expected text'}), 400

    audio_file = request.files['audio']
    expected_text = request.form.get('expected_text', '')

    if not expected_text or len(expected_text) > 500:
        logger.warning("Invalid expected_text length")
        return jsonify({'error': 'Invalid expected text'}), 400

    try:
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
            audio_file.save(tmp.name)
            
            if not audio_file.filename.lower().endswith('.wav'):
                sound = AudioSegment.from_file(tmp.name)
                sound.export(tmp.name, format="wav")
            
            with sr.AudioFile(tmp.name) as source:
                audio_data = recognizer.record(source)
                recognized_text = recognizer.recognize_google(audio_data, language='hi-IN')
                
                similarity = calculate_similarity(recognized_text, expected_text)
                logger.info(f"Pronunciation check: recognized '{recognized_text}', expected '{expected_text}', similarity {similarity}")
                
                return jsonify({
                    'recognized_text': recognized_text,
                    'expected_text': expected_text,
                    'similarity_score': similarity,
                    'is_correct': similarity >= 0.7
                })
    except Exception as e:
        logger.error(f"Pronunciation check error: {str(e)}")
        return jsonify({'error': 'Speech recognition service unavailable'}), 500
    finally:
        if os.path.exists(tmp.name):
            os.unlink(tmp.name)

@app.route('/static/audio/<filename>')
def serve_audio(filename):
    if not os.path.exists(os.path.join(AUDIO_FOLDER, filename)):
        logger.warning(f"Audio file not found: {filename}")
        return jsonify({'error': 'File not found'}), 404
    return send_from_directory(AUDIO_FOLDER, filename)

def calculate_similarity(text1, text2):
    set1 = set(text1.lower().split())
    set2 = set(text2.lower().split())
    intersection = set1.intersection(set2)
    union = set1.union(set2)
    return len(intersection) / len(union) if union else 0

def format_conversation_history(history):
    if not history:
        return "No previous conversation history."
    
    formatted = []
    for msg in history:
        if msg['sender'] == 'user':
            formatted.append(f"User: {msg['message']}")
        else:
            formatted.append(f"AI: {msg['message']}")
    return "\n".join(formatted)

def parse_ai_response(response_text):
    parts = {'english': '', 'hindi': '', 'transliteration': ''}
    lines = response_text.split('\n')
    for line in lines:
        line = line.strip()
        if line.startswith('English:'):
            parts['english'] = line.replace('English:', '').strip()
        elif line.startswith('Hindi:'):
            parts['hindi'] = line.replace('Hindi:', '').strip()
        elif line.startswith('Transliteration:'):
            parts['transliteration'] = line.replace('Transliteration:', '').strip().strip('()')
    if not parts['hindi']:
        parts['english'] = response_text
        parts['hindi'] = response_text
    return parts

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5000)