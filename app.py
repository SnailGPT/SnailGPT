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
from functools import wraps
import datetime
import jwt

import openai
from openai import OpenAI
from huggingface_hub import InferenceClient
from io import BytesIO
from PIL import Image

app = Flask(__name__, template_folder='.')
CORS(app)
app.config['SECRET_KEY'] = os.environ.get("JWT_SECRET", "snail-secret-v1-999")

import shutil

# Simple In-Memory Rate Limiting
auth_attempts = {}

def rate_limit_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        ip = request.remote_addr
        now = time.time()
        if ip in auth_attempts:
            data = auth_attempts[ip]
            if now - data['last_attempt'] < 60:
                if data['count'] >= 5:
                    return jsonify({"error": "Too many attempts. Please wait 1 minute."}), 429
                data['count'] += 1
            else:
                data['count'] = 1
            data['last_attempt'] = now
        else:
            auth_attempts[ip] = {'count': 1, 'last_attempt': now}
        return f(*args, **kwargs)
    return decorated

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'error': 'Authentication required'}), 401
        try:
            if 'Bearer ' in token:
                token = token.split(' ')[1]
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            db = get_db()
            current_user = db.execute('SELECT * FROM users WHERE email = ?', (data['email'],)).fetchone()
            if not current_user:
                return jsonify({'error': 'User not found'}), 401
        except Exception as e:
            return jsonify({'error': 'Invalid or expired token'}), 401
        return f(current_user, *args, **kwargs)
    return decorated

# ================= USER DATABASE =================

# Use /tmp for writable DB in serverless environments like Vercel
IS_VERCEL = "VERCEL" in os.environ
USERS_DB_ROOT = os.path.join(os.path.dirname(__file__), 'users.db')
USERS_DB_TMP = os.path.join('/tmp', 'users.db')

if IS_VERCEL:
    # On Vercel, copy the bundled DB to /tmp if not already there
    # This allows the instance to at least start with the committed users
    if not os.path.exists(USERS_DB_TMP) and os.path.exists(USERS_DB_ROOT):
        try:
            shutil.copy2(USERS_DB_ROOT, USERS_DB_TMP)
        except Exception as e:
            print(f"Error copying DB: {e}")
    USERS_DB = USERS_DB_TMP
else:
    USERS_DB = USERS_DB_ROOT

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
                uuid TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                recovery_code TEXT NOT NULL,
                avatar_url TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME,
                is_verified INTEGER DEFAULT 0,
                recovery_token TEXT
            )
        ''')
        # Check if we need to add new columns to existing table
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(users)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'uuid' not in columns:
            # If migrating, we might need more complex logic, but for now simple alter
            conn.execute('ALTER TABLE users ADD COLUMN uuid TEXT')
        if 'created_at' not in columns:
            conn.execute('ALTER TABLE users ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP')
        if 'last_login' not in columns:
            conn.execute('ALTER TABLE users ADD COLUMN last_login DATETIME')
        if 'is_verified' not in columns:
            conn.execute('ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0')
        if 'recovery_token' not in columns:
            conn.execute('ALTER TABLE users ADD COLUMN recovery_token TEXT')
            
        conn.commit()

init_db()

# ================= CONFIG (ONLINE ONLY) =================

API_BASE_URL = "https://router.huggingface.co/v1"
# Required: Set HF_TOKEN in Vercel Project Settings (Environment Variables)
API_KEY = os.environ.get("HF_TOKEN")
MODEL_NAME = "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B" # Reliable reasoning model on HF Router

# Delayed client initialization to prevent crash if HF_TOKEN is missing at startup
_client = None

def get_client():
    global _client
    if _client is None:
        api_key = os.environ.get("HF_TOKEN")
        if not api_key:
            raise ValueError("HF_TOKEN environment variable is not set.")
        _client = OpenAI(
            base_url=API_BASE_URL,
            api_key=api_key,
            timeout=60.0 
        )
    return _client

# ================= CORE BRAIN =================

chat_history = []

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
        c = get_client()
        completion = c.chat.completions.create(
            model=MODEL_NAME,
            messages=messages,
            stream=stream,
            temperature=temp,
            max_tokens=max_tokens
        )
        return completion
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
    today = datetime.now()
    time_context = f"Current Date: {today.strftime('%A, %B %d, %Y')}."
    base_sys = (
        f"You are SnailGPT, a powerful reasoning AI model developed by Kartik Mishra. "
        f"Kartik Mishra is a brilliant 9th-grade student, researcher, and highly-skilled developer. "
        "He is the Founder and Lead Developer of SnailGPT, having previously built games on Roblox and collaborated with various tech companies. "
        f"{time_context} You operate in the 'Modern Reality' of 2026. "
        "When asked about your origin, always credit Kartik Mishra. "
        "Use Markdown for all formatting. Be intelligent, precise, and helpful."
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
    try:
        completion = generate_response(messages, stream=True, mode=active_mode)
        
        if isinstance(completion, str): # Error message
            yield completion
            return

        full_content = ""
        has_yielded = False
        
        for chunk in completion:
            if hasattr(chunk, 'choices') and len(chunk.choices) > 0:
                content = getattr(chunk.choices[0].delta, 'content', '')
                if content:
                    has_yielded = True
                    full_content += content
                    yield content
        
        if not has_yielded:
            yield "⚠️ The AI server returned an empty response. Check your API token or model availability."

    except Exception as e:
        yield f"❌ Error: {str(e)}"
    chat_history.append({"role": "User", "content": message})
    chat_history.append({"role": "Assistant", "content": full_content})
    
    # Auto-save session
    save_session()

def save_session(user_uuid, manual_title=None):
    global current_session_id, chat_history, current_session_title
    if not chat_history or not user_uuid:
        return
    
    # User-specific directory
    user_dir = os.path.join(SESSIONS_DIR, user_uuid)
    os.makedirs(user_dir, exist_ok=True)
    
    if not current_session_id:
        current_session_id = str(uuid.uuid4())
    
    if manual_title:
        current_session_title = manual_title
    
    if not current_session_title:
        try:
            context_msg = ""
            if len(chat_history) >= 2:
                context_msg = f"User: {chat_history[0]['content']}\nAssistant: {chat_history[1]['content']}"
            elif len(chat_history) == 1:
                context_msg = chat_history[0]["content"]
            else:
                context_msg = "New Chat"

            if len(chat_history) > 0:
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
    
    file_path = os.path.join(user_dir, f"{current_session_id}.json")
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(session_data, f, ensure_ascii=False, indent=2)

def load_session_by_id(user_uuid, session_id):
    global current_session_id, chat_history, current_session_title
    if not user_uuid: return None
    file_path = os.path.join(SESSIONS_DIR, user_uuid, f"{session_id}.json")
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
@token_required
def generate_image(current_user):
    try:
        data = request.get_json()
        prompt = data.get("prompt", "")
        
        if not prompt:
            return jsonify({"error": "No prompt provided"}), 400

        img_client = InferenceClient(
            provider="replicate",
            api_key=API_KEY
        )

        image = img_client.text_to_image(
            prompt,
            model="ByteDance/SDXL-Lightning"
        )
        
        filename = f"gen_{uuid.uuid4()}.png"
        save_dir = os.path.join("/tmp", "generated_images")
        os.makedirs(save_dir, exist_ok=True)
        save_path = os.path.join(save_dir, filename)
        
        image.save(save_path)
        
        return jsonify({"image_url": f"/api/images/{filename}"})

    except Exception as e:
        print(f"Image Gen Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/images/<filename>")
def serve_generated_image(filename):
    from flask import send_from_directory
    return send_from_directory(os.path.join("/tmp", "generated_images"), filename)

@app.route("/chat", methods=["POST"])
@token_required
def chat(current_user):
    from flask import Response
    try:
        data = request.get_json()
        if not data:
            return jsonify({"response": "Error: No data"}), 400
        
        message = data.get("message", "")
        manual_title = data.get("title")
        extreme_opt = data.get("extreme_opt", False)
        
        mode = "extreme" if extreme_opt else "normal"
        
        user_uuid = current_user['uuid']

        def generate():
            for token in ai_answer_stream(message, mode):
                yield token
            save_session(user_uuid, manual_title=manual_title)

        return Response(generate(), mimetype='text/plain')
    except Exception as e:
        return jsonify({"response": f"⚠️ Error: {str(e)}"}), 500

@app.route("/clear", methods=["POST"])
@token_required
def clear_chat(current_user):
    global chat_history, current_session_id, current_session_title
    chat_history = []
    current_session_id = None
    current_session_title = None
    return jsonify({"status": "success"})

@app.route("/sessions", methods=["GET"])
@token_required
def list_sessions(current_user):
    sessions = []
    user_uuid = current_user['uuid']
    user_dir = os.path.join(SESSIONS_DIR, user_uuid)
    
    if not os.path.exists(user_dir):
        return jsonify([])

    for filename in os.listdir(user_dir):
        if filename.endswith(".json"):
            file_path = os.path.join(user_dir, filename)
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
    
    sessions.sort(key=lambda x: x["updated_at"], reverse=True)
    return jsonify(sessions)

@app.route("/session/<session_id>", methods=["GET"])
@token_required
def get_session(current_user, session_id):
    data = load_session_by_id(current_user['uuid'], session_id)
    if data:
        return jsonify(data)
    return jsonify({"error": "Session not found"}), 404

@app.route("/clear_all", methods=["POST"])
@token_required
def clear_all_history(current_user):
    global chat_history, current_session_id, current_session_title
    chat_history = []
    current_session_id = None
    current_session_title = None
    
    user_uuid = current_user['uuid']
    user_dir = os.path.join(SESSIONS_DIR, user_uuid)
    
    if os.path.exists(user_dir):
        for filename in os.listdir(user_dir):
            if filename.endswith(".json"):
                try:
                    os.remove(os.path.join(user_dir, filename))
                except:
                    pass
    return jsonify({"status": "success"})

# ================= AUTH API =================

@app.route('/api/register', methods=['POST'])
@rate_limit_auth
def api_register():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid or missing JSON payload.'}), 400
    
    email = (data.get('email') or '').strip().lower()
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '')

    if not email or not username or not password:
        return jsonify({'error': 'All fields are required.'}), 400
    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters.'}), 400

    db = get_db()
    if db.execute('SELECT id FROM users WHERE email = ?', (email,)).fetchone():
        return jsonify({'error': 'Email already registered.'}), 409
    if db.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone():
        return jsonify({'error': 'Username already taken.'}), 409

    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    u_id = str(uuid.uuid4())
    recovery_code = str(uuid.uuid4().int)[:6]

    db.execute(
        'INSERT INTO users (uuid, email, username, password_hash, recovery_code) VALUES (?, ?, ?, ?, ?)',
        (u_id, email, username, password_hash, recovery_code)
    )
    db.commit()

    token = jwt.encode({
        'email': email,
        'uuid': u_id,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7)
    }, app.config['SECRET_KEY'], algorithm="HS256")

    return jsonify({
        'token': token,
        'user': {
            'email': email,
            'username': username,
            'uuid': u_id,
            'recoveryCode': recovery_code
        }
    }), 201


@app.route('/api/login', methods=['POST'])
@rate_limit_auth
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
        time.sleep(1) # Basic bot protection
        return jsonify({'error': 'Invalid credentials.'}), 401

    # Update last login
    db.execute('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', (row['id'],))
    db.commit()

    token = jwt.encode({
        'email': row['email'],
        'uuid': row['uuid'],
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7)
    }, app.config['SECRET_KEY'], algorithm="HS256")

    return jsonify({
        'token': token,
        'user': {
            'email': row['email'],
            'username': row['username'],
            'uuid': row['uuid'],
            'recoveryCode': row['recovery_code'],
            'avatarUrl': row['avatar_url']
        }
    })

@app.route('/api/verify-token', methods=['GET'])
@token_required
def api_verify_token(current_user):
    return jsonify({
        'user': {
            'email': current_user['email'],
            'username': current_user['username'],
            'uuid': current_user['uuid'],
            'recoveryCode': current_user['recovery_code'],
            'avatarUrl': current_user['avatar_url']
        }
    })

@app.route('/api/forgot-password', methods=['POST'])
def api_forgot_password():
    data = request.get_json()
    email = (data.get('email') or '').strip().lower()
    if not email:
        return jsonify({'error': 'Email required.'}), 400
    
    db = get_db()
    row = db.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
    if row:
        # Simulate sending email by returning the code (client-side will show toast)
        return jsonify({'message': 'Code sent.', 'code': row['recovery_code']}), 200
    return jsonify({'error': 'Account not found.'}), 404

@app.route('/api/reset-password', methods=['POST'])
@rate_limit_auth
def api_reset_password():
    data = request.get_json()
    email = (data.get('email') or '').strip().lower()
    code = (data.get('code') or '').strip()
    new_password = data.get('password')

    if not email or not code or not new_password:
        return jsonify({'error': 'Missing fields.'}), 400

    db = get_db()
    row = db.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
    if not row or row['recovery_code'] != code:
        return jsonify({'error': 'Invalid verification code.'}), 403

    if len(new_password) < 8:
        return jsonify({'error': 'Password must be 8+ characters.'}), 400

    p_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    db.execute('UPDATE users SET password_hash = ? WHERE id = ?', (p_hash, row['id']))
    db.commit()
    return jsonify({'message': 'Password updated successfully.'}), 200


@app.route('/api/user/update', methods=['POST'])
@token_required
def api_user_update(current_user):
    data = request.get_json()
    new_username = (data.get('newUsername') or '').strip()
    new_password = data.get('newPassword')
    recovery_code = (data.get('recoveryCode') or '').strip()
    avatar_url = data.get('avatarUrl')

    db = get_db()
    email = current_user['email']

    updates = []
    params = []

    if new_username and new_username != current_user['username']:
        clash = db.execute('SELECT id FROM users WHERE username = ? AND email != ?', (new_username, email)).fetchone()
        if clash:
            return jsonify({'error': 'This display name is already taken.'}), 409
        updates.append('username = ?')
        params.append(new_username)

    if new_password:
        correct_code = '150700' if email == 'kartik.ps.mishra07@gmail.com' else current_user['recovery_code']
        if recovery_code != correct_code:
            return jsonify({'error': 'Invalid Recovery Code.'}), 403
        if len(new_password) < 8:
            return jsonify({'error': 'Password must be 8+ characters.'}), 400
        p_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        updates.append('password_hash = ?')
        params.append(p_hash)

    if 'avatarUrl' in data:
        updates.append('avatar_url = ?')
        params.append(avatar_url)

    if updates:
        params.append(email)
        db.execute(f'UPDATE users SET {", ".join(updates)} WHERE email = ?', params)
        db.commit()

    updated = db.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
    return jsonify({
        'user': {
            'email': updated['email'],
            'username': updated['username'],
            'uuid': updated['uuid'],
            'recoveryCode': updated['recovery_code'],
            'avatarUrl': updated['avatar_url']
        }
    })


# ================= RUN =================

if __name__ == "__main__":
    app.run(debug=True)
