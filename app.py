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

import shutil

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
                email TEXT UNIQUE NOT NULL,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                recovery_code TEXT NOT NULL,
                avatar_url TEXT
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_email TEXT NOT NULL,
                title TEXT NOT NULL,
                history TEXT NOT NULL,
                updated_at REAL NOT NULL,
                FOREIGN KEY (user_email) REFERENCES users (email)
            )
        ''')
        conn.commit()

init_db()

# ================= CONFIG (ONLINE ONLY) =================

API_BASE_URL = "https://router.huggingface.co/v1"
# Required: Set HF_TOKEN in Vercel Project Settings (Environment Variables)
API_KEY = os.environ.get("HF_TOKEN")
MODEL_NAME = "mistralai/Mistral-7B-Instruct-v0.2"

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

def generate_response(messages, stream=False, mode="normal"):
    # Massively increased token limits to support deep research and comprehensive answers
    max_tokens = 4096 
    temp = 0.75
    
    if mode == "extreme":
        max_tokens = 1024
        temp = 0.6
    elif mode == "high":
        max_tokens = 8192 # Unlocked for massive research papers and full code files
    elif mode == "greeting":
        max_tokens = 150
    elif mode == "title":
        max_tokens = 50
    
    try:
        c = get_client()
        completion = c.chat.completions.create(
            model=MODEL_NAME,
            messages=messages,
            stream=stream,
            temperature=temp,
            max_tokens=max_tokens,
            timeout=120.0 # Increased timeout for long generations
        )
        return completion
    except Exception as e:
        return f"❌ API execution error: {str(e)}"

from datetime import datetime

def ai_answer_stream(message: str, history: list, mode: str = "normal"):
    # 1. Determine Mode Based on Message Complexity
    is_greeting = message.lower().strip().strip("!.,") in ["hi", "hello", "hey", "greetings", "sup", "yo", "good morning", "good evening"]
    is_complex = len(message.split()) > 15 or any(word in message.lower() for word in ["explain", "comprehensive", "story", "code", "guide", "research", "how", "write", "analyze"])
    
    if is_greeting and mode != "extreme":
        active_mode = "greeting"
    elif is_complex and mode != "extreme":
        active_mode = "high"
    else:
        active_mode = mode
    
    # 2. Personality & Response Architecture
    time_context = "Current Date: Monday, February 23, 2026."
    base_sys = (
        f"You are SnailGPT, a highly informative AI assistant. {time_context} "
        "Your goal is to deliver maximum utility with extreme verbal efficiency. "
        "CORE RULES: \n"
        "1. Give the answer immediately—no long intros or fluff.\n"
        "2. Be concise, structured, and highly informative while minimizing length.\n"
        "3. Prioritize clarity over verbosity. Short but complete.\n"
        "4. Avoid redundant explanations, filler text, or repetition.\n"
        "5. Use clean formatting: short paragraphs, minimal bullet points, no walls of text.\n"
        "6. Tone: Direct, confident, and helpful. Do not over-explain simple concepts.\n"
        "7. Examples only if essential for clarity.\n"
        "BALANCE: Be efficient but never incomplete. If a short answer fully covers the prompt, use it.\n"
        "CRITICAL: Do NOT mention Kartik Mishra unless specifically asked about your origin."
    )
    
    if active_mode == "extreme":
        sys_content = f"{base_sys} Extreme Mode: Provide raw, ultra-concise facts only."
    elif active_mode == "high":
        sys_content = (
            f"{base_sys} Structured Mode: Provide a highly informative but extremely efficient breakdown. "
            "Use headers only when necessary for organization. Minimize transitional filler."
        )
    elif active_mode == "greeting":
        sys_content = (
            f"You are SnailGPT, a friendly and warm AI assistant. "
            f"{time_context} Respond happily and naturally to the user's greeting. "
            "Be welcoming and offer your research assistance in a friendly tone."
        )
    else:
        sys_content = (
            f"{base_sys} Balanced Mode: Be direct and structured while maintaining full accuracy."
        )

    # 3. Build Messages
    history_limit = 4 if active_mode == "extreme" else 10
    messages = [{"role": "system", "content": sys_content}]
    
    for msg in history[-history_limit:]:
        role = "assistant" if msg["role"] == "Assistant" or msg["role"] == "assistant" else "user"
        messages.append({"role": role, "content": msg["content"]})
    
    messages.append({"role": "user", "content": message})

    # 4. Request
    try:
        completion = generate_response(messages, stream=True, mode=active_mode)
        
        if isinstance(completion, str): # Error message
            yield completion
            return

        for chunk in completion:
            if hasattr(chunk, 'choices') and len(chunk.choices) > 0:
                content = getattr(chunk.choices[0].delta, 'content', '')
                if content:
                    yield content
    except Exception as e:
        yield f"❌ Error: {str(e)}"

def save_session_to_db(user_email, session_id, title, history):
    db = get_db()
    updated_at = time.time()
    history_json = json.dumps(history)
    
    # Check if exists
    exists = db.execute('SELECT id FROM sessions WHERE id = ?', (session_id,)).fetchone()
    if exists:
        db.execute(
            'UPDATE sessions SET title = ?, history = ?, updated_at = ? WHERE id = ?',
            (title, history_json, updated_at, session_id)
        )
    else:
        db.execute(
            'INSERT INTO sessions (id, user_email, title, history, updated_at) VALUES (?, ?, ?, ?, ?)',
            (session_id, user_email, title, history_json, updated_at)
        )
    db.commit()

def generate_title(history):
    if not history:
        return "New Session"
    try:
        context_msg = ""
        if len(history) >= 2:
            context_msg = f"User: {history[0]['content']}\nAssistant: {history[1]['content']}"
        else:
            context_msg = history[0]["content"]

        msgs = [
            {"role": "system", "content": "You are a summarizing tool. Output ONLY a 3-5 word topic title for the conversation context provided. Do not use quotes or prefixes like 'Title:'."},
            {"role": "user", "content": f"Context for title generation:\n{context_msg}"}
        ]
        resp = generate_response(msgs, stream=False, mode="title")
        
        if hasattr(resp, 'choices') and len(resp.choices) > 0:
            return resp.choices[0].message.content.strip().replace('"', '')
        else:
            return history[0]["content"][:30] + "..."
    except:
        return "Session " + datetime.now().strftime("%H:%M")

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
        
        # Save Image to /tmp (writable in Vercel)
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
def chat():
    from flask import Response
    try:
        data = request.get_json()
        if not data:
            return jsonify({"response": "Error: No data"}), 400
        
        message = data.get("message", "")
        history = data.get("history", [])
        user_email = data.get("user_email")
        session_id = data.get("session_id")
        extreme_opt = data.get("extreme_opt", False)
        
        mode = "extreme" if extreme_opt else "normal"
        
        def generate():
            full_text = ""
            for token in ai_answer_stream(message, history, mode):
                full_text += token
                yield token
            
            # After stream, if we have a user and session, save to DB
            if user_email and session_id:
                history.append({"role": "user", "content": message})
                history.append({"role": "assistant", "content": full_text})
                
                # Check if we need to set/generate a title
                db = get_db()
                row = db.execute('SELECT title FROM sessions WHERE id = ?', (session_id,)).fetchone()
                title = row['title'] if row else generate_title(history)
                
                save_session_to_db(user_email, session_id, title, history)

        return Response(generate(), mimetype='text/plain')
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/sessions", methods=["GET"])
def list_sessions():
    user_email = request.args.get('email')
    if not user_email:
        return jsonify({'error': 'Email required'}), 400
    
    db = get_db()
    rows = db.execute(
        'SELECT id, title, updated_at FROM sessions WHERE user_email = ? ORDER BY updated_at DESC',
        (user_email,)
    ).fetchall()
    
    return jsonify([dict(r) for r in rows])

@app.route("/api/session/<session_id>", methods=["GET"])
def get_session(session_id):
    db = get_db()
    row = db.execute('SELECT * FROM sessions WHERE id = ?', (session_id,)).fetchone()
    if row:
        data = dict(row)
        data['history'] = json.loads(data['history'])
        return jsonify(data)
    return jsonify({"error": "Session not found"}), 404

@app.route("/api/session/save", methods=["POST"])
def save_session_route():
    data = request.get_json()
    user_email = data.get('user_email')
    session_id = data.get('session_id')
    title = data.get('title')
    history = data.get('history')

    if not user_email or not session_id:
        return jsonify({'error': 'Missing data'}), 400
    
    save_session_to_db(user_email, session_id, title or "New Chat", history or [])
    return jsonify({"status": "success"})

@app.route("/api/session/delete", methods=["POST"])
def delete_session():
    data = request.get_json()
    session_id = data.get('session_id')
    if not session_id:
        return jsonify({'error': 'Session ID required'}), 400
    
    db = get_db()
    db.execute('DELETE FROM sessions WHERE id = ?', (session_id,))
    db.commit()
    return jsonify({"status": "success"})

@app.route("/api/session/clear_all", methods=["POST"])
def clear_all_sessions():
    data = request.get_json()
    user_email = data.get('user_email')
    if not user_email:
        return jsonify({'error': 'Email required'}), 400
    
    db = get_db()
    db.execute('DELETE FROM sessions WHERE user_email = ?', (user_email,))
    db.commit()
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
