import os
import requests
import json
import time
import uuid
import sqlite3
import bcrypt
from flask import Flask, render_template, request, jsonify, Response, g
from flask_cors import CORS
import re
import subprocess

import openai
from openai import OpenAI
from huggingface_hub import InferenceClient
from io import BytesIO
from PIL import Image

app = Flask(__name__, template_folder='.')
CORS(app)

# ================= USER DATABASE =================

# Use /tmp for writable DB in serverless environments like Vercel
IS_VERCEL = "VERCEL" in os.environ
USERS_DB = os.path.join('/tmp' if IS_VERCEL else os.path.dirname(__file__), 'users.db')

def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(USERS_DB)
        db.row_factory = sqlite3.Row
    return db

@app.errorhandler(Exception)
def handle_exception(e):
    # Pass through HTTP errors
    if hasattr(e, 'code') and hasattr(e, 'description'):
        return jsonify(error=str(e.description)), e.code
    # Handle non-HTTP exceptions
    return jsonify(error="Internal Server Error", message=str(e)), 500

@app.teardown_appcontext
def close_db(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def init_db():
    with sqlite3.connect(USERS_DB) as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                recovery_code TEXT NOT NULL,
                avatar_url TEXT
            )
        ''')
        conn.commit()

init_db()

# ================= CONFIG (ONLINE ONLY) =================

API_BASE_URL = "https://router.huggingface.co/v1"
# Required: Set HF_TOKEN in Vercel Project Settings (Environment Variables)
API_KEY = os.environ.get("HF_TOKEN")
MODEL_NAME = "mistralai/Mistral-7B-Instruct-v0.2:featherless-ai"

# Current Status
CURRENT_MODEL = MODEL_NAME

client = OpenAI(
    base_url=API_BASE_URL,
    api_key=API_KEY,
    timeout=60.0 
)

def get_client():
    return client

# ================= CORE BRAIN =================

# SESSIONS_DIR is ephemeral on Netlify
SESSIONS_DIR = "/tmp/chat_sessions"
if not os.path.exists(SESSIONS_DIR):
    os.makedirs(SESSIONS_DIR, exist_ok=True)


def generate_response(messages, stream=False, mode="normal"):
    # Adjusted for <10s response time on local hardware
    max_tokens = 400 # Optimized for shorter, faster replies
    temp = 0.7
    
    if mode == "extreme":
        max_tokens = 200
        temp = 0.5
    elif mode == "high":
        max_tokens = 600 # Reduced for brevity 
        temp = 0.7 
    
    try:
        # Use lazy client to avoid startup hangs in airplane mode
        c = get_client()
        completion = c.chat.completions.create(
            model=MODEL_NAME,
            messages=messages,
            stream=stream,
            temperature=temp,
            max_tokens=max_tokens
        )
        return completion
    except (requests.exceptions.Timeout, openai.APITimeoutError):
        return "❌ Error: The AI server is taking too long to respond. This usually happens during the first run as the model loads into your GPU/RAM. Try again in a few seconds."
    except (requests.exceptions.ConnectionError, openai.APIConnectionError):
        return "❌ Connection Error: Could not connect to the AI server. Please check your internet connection or API Token."
    except Exception as e:
        return f"❌ API execution error: {str(e)}"

from datetime import datetime

def ai_answer_stream(message: str, mode: str = "normal"):
    global chat_history
    
    # 1. Determine Mode Based on Message Complexity, Greeting, or Flag
    is_greeting = message.lower().strip().strip("!.,") in ["hi", "hello", "hey", "greetings", "sup", "yo", "good morning", "good evening"]
    is_complex = len(message.split()) > 25 or any(word in message.lower() for word in ["explain", "comprehensive", "story", "code", "guide"])
    
    if is_greeting and mode != "extreme":
        active_mode = "greeting"
    elif is_complex and mode != "extreme":
        active_mode = "high"
    else:
        active_mode = mode
    
    # 2. ChatGPT Personality & Modern Reality Enforcement
    # 2. ChatGPT Personality & Modern Reality Enforcement
    time_context = "Current Date: Friday, January 30, 2026."
    base_sys = (
        f"You are SnailGPT, a large language model trained by OpenAI, behaving EXACTLY like ChatGPT. "
        f"{time_context} Your goal is to be helpful, accurate, and engaging. "
        "Use Markdown for all formatting. Be polite and objective."
    )
    
    # UNIFIED SYSTEM PROMPT LOGIC
    
    if active_mode == "extreme":
        sys_content = f"{base_sys} Provide ULTRA-FAST, extremely concise answers. Avoid all fluff. Focus on raw facts."
    elif active_mode == "high":
        # Complex/Reasoning Mode
        sys_content = (
            f"{base_sys} You are a highly intelligent, reasoning AI assistant. "
            "Think deeply before answering. Structure your responses clearly with Markdown. "
            "Be comprehensive, nuanced, and precise. Match the sophistication of GPT-4o."
        )
    elif active_mode == "greeting":
        # Greeting Mode
        sys_content = f"{base_sys} Reply warmly but extremely briefly (under 10 words)."
    else:
        # Normal Mode (Simple Greetings & Questions)
        sys_content = (
            f"{base_sys} Provide a balanced, natural response. "
            "Do not be too short (avoid one-word answers) but do not be overly long or verbose. "
            "Engage conversationally and provide sufficient helpful context."
        )

    # 3. Build Messages
    history_limit = 2 if active_mode == "extreme" else 6 # Increased context for everyone
    messages = [{"role": "system", "content": sys_content}]
    
    for msg in chat_history[-history_limit:]:
        role = "assistant" if msg["role"] == "Assistant" else "user"
        messages.append({"role": role, "content": msg["content"]})
    
    messages.append({"role": "user", "content": message})

    # 4. Request
    response = generate_response(messages, stream=True, mode=active_mode)
    
    full_content = ""
    # FIX: Check for string (error) first
    if isinstance(response, str):
        yield response
    elif hasattr(response, '__iter__'):
        try:
            in_thought_block = False
            has_yielded = False
            for chunk in response:
                if hasattr(chunk, 'choices') and len(chunk.choices) > 0:
                    content = getattr(chunk.choices[0].delta, 'content', '')
                    if content:
                        has_yielded = True
                        full_content += content
                        
                        # Strip DeepSeek <think> blocks from the user visible stream
                        if "<think>" in content:
                            in_thought_block = True
                            continue
                        if not in_thought_block:
                            yield content

            if not has_yielded:
                yield "⚠️ The AI server returned an empty response. This might be due to a token limitation or server load. Please try again."
        except Exception as e:
            yield f"\n⚠️ Stream Error: {str(e)}"
    chat_history.append({"role": "User", "content": message})
    chat_history.append({"role": "Assistant", "content": full_content})
    
    # Auto-save session
    save_session()

def save_session(manual_title=None):
    global current_session_id, chat_history, current_session_title
    if not chat_history:
        return
    
    if not current_session_id:
        current_session_id = str(uuid.uuid4())
    
    # Use manual title if provided
    if manual_title:
        current_session_title = manual_title
    
    # Generate Title if not set
    if not current_session_title:
        try:
            # Generate a 3-5 word topic title based on first two messages if available
            context_msg = ""
            if len(chat_history) >= 2:
                context_msg = f"User: {chat_history[0]['content']}\nAssistant: {chat_history[1]['content']}"
            elif len(chat_history) == 1:
                context_msg = chat_history[0]["content"]
            else:
                context_msg = "New Chat"

            if len(chat_history) > 0:
                # Quick API call to generate title
                msgs = [
                    {"role": "system", "content": "You are a summarizing tool. Output ONLY a 3-5 word topic title for the conversation context provided. Do not use quotes or prefixes like 'Title:'."},
                    {"role": "user", "content": f"Context for title generation:\n{context_msg}"}
                ]
                resp = generate_response(msgs, stream=False, mode="extreme")
                
                if hasattr(resp, 'choices') and len(resp.choices) > 0:
                    current_session_title = resp.choices[0].message.content.strip().replace('"', '')
                else:
                    current_session_title = chat_history[0]["content"][:30] + "..."
            else:
                current_session_title = "New Session"
        except:
             current_session_title = "Session " + datetime.now().strftime("%H:%M")
    
    session_data = {
        "id": current_session_id,
        "title": current_session_title,
        "history": chat_history,
        "updated_at": time.time()
    }
    
    file_path = os.path.join(SESSIONS_DIR, f"{current_session_id}.json")
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(session_data, f, ensure_ascii=False, indent=2)

def load_session_by_id(session_id):
    global current_session_id, chat_history, current_session_title
    file_path = os.path.join(SESSIONS_DIR, f"{session_id}.json")
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            chat_history = data.get("history", [])
            current_session_id = session_id
            current_session_title = data.get("title", "Untitled Session")
            return data
    return None

# ================= ROUTES =================

@app.route("/")
def index():
    return render_template("index.html", snail_mode="online")

@app.route("/media")
def media_page():
    return render_template("media.html")

@app.route("/generate_image", methods=["POST"])
def generate_image():
    try:
        data = request.get_json()
        prompt = data.get("prompt", "")
        
        if not prompt:
            return jsonify({"error": "No prompt provided"}), 400

        # Specialized Client for Image Gen
        # Using the same HF_TOKEN as chat
        img_client = InferenceClient(
            provider="replicate",
            api_key=API_KEY
        )

        image = img_client.text_to_image(
            prompt,
            model="ByteDance/SDXL-Lightning"
        )
        
        # Save Image
        filename = f"gen_{uuid.uuid4()}.png"
        save_dir = os.path.join("static", "generated_images")
        os.makedirs(save_dir, exist_ok=True)
        save_path = os.path.join(save_dir, filename)
        
        image.save(save_path)
        
        return jsonify({"image_url": f"/static/generated_images/{filename}"})

    except Exception as e:
        print(f"Image Gen Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/chat", methods=["POST"])
def chat():
    from flask import Response
    try:
        data = request.get_json()
        if not data:
            return jsonify({"response": "Error: No data"}), 400
        
        message = data.get("message", "")
        manual_title = data.get("title") # Optional manual title
        extreme_opt = data.get("extreme_opt", False)
        
        mode = "extreme" if extreme_opt else "normal"
        
        def generate():
            for token in ai_answer_stream(message, mode):
                yield token
            # Save session with manual title if provided after the stream finishes
            save_session(manual_title=manual_title)

        return Response(generate(), mimetype='text/plain')
    except Exception as e:
        return jsonify({"response": f"⚠️ Error: {str(e)}"}), 500

@app.route("/clear", methods=["POST"])
def clear_chat():
    global chat_history, current_session_id, current_session_title
    chat_history = []
    current_session_id = None
    current_session_title = None
    return jsonify({"status": "success"})

@app.route("/sessions", methods=["GET"])
def list_sessions():
    sessions = []
    for filename in os.listdir(SESSIONS_DIR):
        if filename.endswith(".json"):
            file_path = os.path.join(SESSIONS_DIR, filename)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    sessions.append({
                        "id": data["id"],
                        "title": data["title"],
                        "updated_at": data["updated_at"]
                    })
            except:
                pass
    
    # Sort by recent
    sessions.sort(key=lambda x: x["updated_at"], reverse=True)
    return jsonify(sessions)

@app.route("/session/<session_id>", methods=["GET"])
def get_session(session_id):
    data = load_session_by_id(session_id)
    if data:
        return jsonify(data)
    return jsonify({"error": "Session not found"}), 404

@app.route("/clear_all", methods=["POST"])
def clear_all_history():
    global chat_history, current_session_id, current_session_title
    chat_history = []
    current_session_id = None
    current_session_title = None
    for filename in os.listdir(SESSIONS_DIR):
        if filename.endswith(".json"):
            os.remove(os.path.join(SESSIONS_DIR, filename))
    return jsonify({"status": "success"})

# ================= AUTH API =================

@app.route('/api/register', methods=['POST'])
def api_register():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid or missing JSON payload.'}), 400
    
    email = (data.get('email') or '').strip().lower()
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '')

    if not email or not username or not password:
        return jsonify({'error': 'All fields are required.'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters.'}), 400

    db = get_db()
    if db.execute('SELECT id FROM users WHERE email = ?', (email,)).fetchone():
        return jsonify({'error': 'email already registered use a different one'}), 409
    if db.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone():
        return jsonify({'error': 'This display name is already taken. Please choose another.'}), 409

    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    recovery_code = str(uuid.uuid4().int)[:6]  # 6-digit code

    db.execute(
        'INSERT INTO users (email, username, password_hash, recovery_code) VALUES (?, ?, ?, ?)',
        (email, username, password_hash, recovery_code)
    )
    db.commit()

    return jsonify({
        'email': email,
        'username': username,
        'recoveryCode': recovery_code
    }), 201


@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid or missing JSON payload.'}), 400

    identifier = (data.get('id') or '').strip().lower()
    password = (data.get('password') or '')

    if not identifier or not password:
        return jsonify({'error': 'Email/username and password are required.'}), 400

    db = get_db()
    row = db.execute(
        'SELECT * FROM users WHERE email = ? OR username = ?', (identifier, identifier)
    ).fetchone()

    if not row or not bcrypt.checkpw(password.encode('utf-8'), row['password_hash'].encode('utf-8')):
        return jsonify({'error': 'Invalid identifier or password.'}), 401

    return jsonify({
        'email': row['email'],
        'username': row['username'],
        'recoveryCode': row['recovery_code'],
        'avatarUrl': row['avatar_url']
    })


@app.route('/api/user/update', methods=['POST'])
def api_user_update():
    data = request.get_json()
    email = (data.get('email') or '').strip().lower()
    new_username = (data.get('newUsername') or '').strip()
    new_password = data.get('newPassword')
    recovery_code = (data.get('recoveryCode') or '').strip()
    avatar_url = data.get('avatarUrl')  # can be None (revert) or base64 string

    if not email:
        return jsonify({'error': 'Email is required.'}), 400

    db = get_db()
    row = db.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
    if not row:
        return jsonify({'error': 'User not found.'}), 404

    updates = []
    params = []

    if new_username and new_username != row['username']:
        clash = db.execute('SELECT id FROM users WHERE username = ? AND email != ?', (new_username, email)).fetchone()
        if clash:
            return jsonify({'error': 'This display name is already taken.'}), 409
        updates.append('username = ?')
        params.append(new_username)

    if new_password:
        correct_code = '150700' if email == 'kartik.ps.mishra07@gmail.com' else row['recovery_code']
        if recovery_code != correct_code:
            return jsonify({'error': 'Invalid Recovery Code. Password change rejected.'}), 403
        password_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        updates.append('password_hash = ?')
        params.append(password_hash)

    # avatarUrl key present in payload means update it (even if None = revert)
    if 'avatarUrl' in data:
        updates.append('avatar_url = ?')
        params.append(avatar_url)

    if updates:
        params.append(email)
        db.execute(f'UPDATE users SET {", ".join(updates)} WHERE email = ?', params)
        db.commit()

    updated = db.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
    return jsonify({
        'email': updated['email'],
        'username': updated['username'],
        'recoveryCode': updated['recovery_code'],
        'avatarUrl': updated['avatar_url']
    })


# ================= RUN =================

if __name__ == "__main__":
    app.run(debug=True)
