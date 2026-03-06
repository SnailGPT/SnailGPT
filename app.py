import os
import json
import time
import uuid
import sqlite3
import bcrypt
from flask import Flask, render_template, request, jsonify, Response, g
from flask_cors import CORS

from openai import OpenAI
from huggingface_hub import InferenceClient
from io import BytesIO
from PIL import Image

app = Flask(__name__)
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
                avatar_url TEXT,
                total_sessions INTEGER DEFAULT 0,
                created_at REAL,
                is_verified INTEGER DEFAULT 0
            )
        ''')
        # Add columns if they don't exist for existing databases
        try:
            conn.execute('ALTER TABLE users ADD COLUMN total_sessions INTEGER DEFAULT 0')
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute('ALTER TABLE users ADD COLUMN created_at REAL')
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute('ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0')
        except sqlite3.OperationalError:
            pass
        
        # Backfill created_at for existing users who don't have it
        conn.execute('UPDATE users SET created_at = ? WHERE created_at IS NULL', (time.time(),))
        
        # Initial sync for total_sessions based on existing records
        conn.execute('''
            UPDATE users SET total_sessions = (
                SELECT COUNT(*) FROM sessions WHERE sessions.user_email = users.email
            ) WHERE total_sessions = 0
        ''')
        
        # Ensure Kartik is verified by default
        conn.execute("UPDATE users SET is_verified = 1 WHERE email = 'kartik.ps.mishra07@gmail.com'")
        
        conn.commit()
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
MODEL_NAME = "meta-llama/Llama-3.1-70B-Instruct" # Highly stable for high-token output

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
            timeout=180.0 
        )
    return _client

# ================= CORE BRAIN =================

def generate_response(messages, stream=False, mode="normal"):
    # Max tokens set to high limits to prevent premature stops
    max_tokens = 8192 
    temp = 0.7
    
    if mode == "extreme":
        max_tokens = 2048
        temp = 0.5
    elif mode == "high":
        max_tokens = 16384 # Maximum for deep research
    elif mode == "greeting":
        max_tokens = 300
    elif mode == "title":
        max_tokens = 100
    
    try:
        c = get_client()
        completion = c.chat.completions.create(
            model=MODEL_NAME,
            messages=messages,
            stream=stream,
            temperature=temp,
            max_tokens=max_tokens,
            timeout=180.0
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
    
    # 2. Personality & Response Architecture (Straight-Forward & High-Density)
    time_context = f"Current Date: {datetime.now().strftime('%A, %B %d, %Y')}."
    base_sys = (
        f"You are SnailGPT, a direct and high-density information engine. {time_context} "
        "Your mission is to provide straight-forward, concise answers that pack maximum information into minimum words. "
        "CORE RULES: \n"
        "1. STRAIGHT-FORWARD: Give the answer immediately. Be direct and avoid unnecessary conversational filler.\n"
        "2. HIGH DENSITY: Every sentence must be packed with value. No 'fluff' or redundant words.\n"
        "3. COMPLETENESS: You MUST provide the entire answer or description. Never cut off or leave the user hanging.\n"
        "4. SHORT BUT FULL: Keep the total length optimized for speed, but ensure it is a complete explanation.\n"
        "5. STRUCTURE: Use clean paragraphs and minimal bullet points for readability.\n"
        "6. TONE: Professional, precise, and helpful.\n"
        "7. IDENTITY: If asked who created you, say: 'I was created by Kartik Mishra, a high school student with game development experience in .lua and python.' Also mention that you are powered by SnailGPT and Hugging Face."
    )
    
    if active_mode == "extreme":
        sys_content = f"{base_sys} Extreme Mode: Ultra-dense data only. Maximum precision, minimum character count."
    elif active_mode == "high":
        sys_content = (
            f"{base_sys} Deep Research Mode: Provide comprehensive, detailed, yet word-optimized guidance. "
            "Ensure the full complexity is covered without wasting tokens."
        )
    elif active_mode == "greeting":
        sys_content = (
            f"You are SnailGPT. {time_context} Give a brief, professional greeting. Then stop."
        )
    else:
        sys_content = (
            f"{base_sys} Balanced Mode: Provide direct, short, and complete answers."
        )

    # 3. Build Messages
    history_limit = 6 if active_mode == "extreme" else 15
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
                
                # If it's a new session (not in DB yet), increment user's total_sessions counter
                if not row:
                    db.execute('UPDATE users SET total_sessions = total_sessions + 1 WHERE email = ?', (user_email,))
                    db.commit()
                
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
    created_at = time.time()

    db.execute(
        'INSERT INTO users (email, username, password_hash, recovery_code, created_at, total_sessions) VALUES (?, ?, ?, ?, ?, ?)',
        (email, username, password_hash, recovery_code, created_at, 0)
    )
    db.commit()

    return jsonify({
        'email': email,
        'username': username,
        'recoveryCode': recovery_code,
        'totalSessions': 0,
        'createdAt': created_at,
        'isVerified': 0
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
        'avatarUrl': row['avatar_url'],
        'totalSessions': row['total_sessions'] or 0,
        'createdAt': row['created_at'],
        'isVerified': row['is_verified'] or 0
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
        'avatarUrl': updated['avatar_url'],
        'totalSessions': updated['total_sessions'] or 0,
        'createdAt': updated['created_at'],
        'isVerified': updated['is_verified'] or 0
    })


@app.route('/api/user/stats', methods=['GET'])
def api_user_stats():
    email = request.args.get('email')
    if not email:
        return jsonify({'error': 'Email required'}), 400
    
    db = get_db()
    row = db.execute('SELECT total_sessions, created_at, is_verified FROM users WHERE email = ?', (email,)).fetchone()
    if row:
        return jsonify({
            'totalSessions': row['total_sessions'] or 0,
            'createdAt': row['created_at'],
            'isVerified': row['is_verified'] or 0
        })
    return jsonify({'error': 'User not found'}), 404


@app.route('/api/user/verify', methods=['POST'])
def api_user_verify():
    data = request.get_json()
    admin_email = (data.get('admin_email') or '').lower()
    target_email = (data.get('target_email') or '').lower()

    if admin_email != 'kartik.ps.mishra07@gmail.com':
        return jsonify({'error': 'Unauthorized: Only Kartik can verify researchers.'}), 403
    
    if not target_email:
        return jsonify({'error': 'Target email required.'}), 400
    
    db = get_db()
    user = db.execute('SELECT id, is_verified FROM users WHERE email = ?', (target_email,)).fetchone()
    if not user:
        return jsonify({'error': 'User not found.'}), 404
    
    new_status = 0 if user['is_verified'] else 1
    db.execute('UPDATE users SET is_verified = ? WHERE email = ?', (new_status, target_email))
    db.commit()
    
    return jsonify({'status': 'success', 'isVerified': new_status})


# ================= RUN =================

if __name__ == "__main__":
    app.run(debug=True)
