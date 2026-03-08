
// -------------------------------------------------------
// DB.js — SnailGPT Data Layer
//
// User ACCOUNTS → stored server-side (SQLite via Flask API)
// Current SESSION → localStorage (which user is logged in now)
// Chat HISTORY   → localStorage (device-specific cache)
// -------------------------------------------------------

const API = '/api';

const DB = {
    // ---- Session (local only – who is logged in on THIS device) ----
    getCurrentUser: () => JSON.parse(localStorage.getItem('snail_user')),
    setCurrentUser: (user) => localStorage.setItem('snail_user', JSON.stringify(user)),
    logout: () => localStorage.removeItem('snail_user'),

    // ---- Account API (cross-device) ----

    /**
     * Register a new user.
     * Resolves with the created user object on success.
     * Rejects with an Error whose message can be shown in the UI.
     */
    registerUser: async (email, username, password) => {
        const res = await fetch(`${API}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, username, password })
        });

        let data;
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            data = await res.json();
        } else {
            const text = await res.text();
            throw new Error(`Server error: ${text.substring(0, 100)}...`);
        }

        if (!res.ok) throw new Error(data.error || 'Registration failed.');
        return data; // { email, username, recoveryCode }
    },

    /**
     * Login with email/username + password.
     * Resolves with the user object on success.
     * Rejects with an Error whose message can be shown in the UI.
     */
    loginUser: async (id, password) => {
        const res = await fetch(`${API}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, password })
        });

        let data;
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            data = await res.json();
        } else {
            const text = await res.text();
            throw new Error(`Server error: ${text.substring(0, 100)}...`);
        }

        if (!res.ok) throw new Error(data.error || 'Login failed.');
        return data; // { email, username, recoveryCode, avatarUrl }
    },

    /**
     * Update user profile.
     * payload: { email, newUsername?, newPassword?, recoveryCode?, avatarUrl? }
     * Resolves with the updated user object.
     */
    updateUser: async (payload) => {
        const res = await fetch(`${API}/user/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        let data;
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            data = await res.json();
        } else {
            const text = await res.text();
            throw new Error(`Server error: ${text.substring(0, 100)}...`);
        }

        if (!res.ok) throw new Error(data.error || 'Update failed.');
        return data; // { email, username, recoveryCode, avatarUrl }
    },

    // ---- Conversations (cross-device via SQLite) ----
    getConversations: async (userEmail) => {
        const res = await fetch(`${API}/sessions?email=${encodeURIComponent(userEmail)}`);
        if (!res.ok) return [];
        return await res.json(); // [{id, title, updated_at}]
    },

    getConversation: async (sessionId) => {
        const res = await fetch(`${API}/session/${sessionId}`);
        if (!res.ok) return null;
        return await res.json(); // {id, title, history, updated_at}
    },

    saveConversation: async (userEmail, session) => {
        // session: { id, title, history }
        const res = await fetch(`${API}/session/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_email: userEmail,
                session_id: session.id,
                title: session.title,
                history: session.history
            })
        });
        return res.ok;
    },

    deleteConversation: async (sessionId) => {
        const res = await fetch(`${API}/session/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });
        return res.ok;
    },

    clearConversations: async (userEmail) => {
        const res = await fetch(`${API}/session/clear_all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_email: userEmail })
        });
        return res.ok;
    },
    /**
     * Get user statistics.
     * returns: { totalSessions, createdAt }
     */
    getUserStats: async (email) => {
        const res = await fetch(`${API}/user/stats?email=${encodeURIComponent(email)}`);
        if (!res.ok) return null;
        return await res.json();
    },

    verifyUser: async (adminEmail, targetEmail) => {
        const res = await fetch(`${API}/user/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_email: adminEmail, target_email: targetEmail })
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Verification failed');
        }
        return await res.json();
    },

    upgradeUser: async (email) => {
        const res = await fetch(`${API}/user/upgrade`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Upgrade failed');
        }
        return await res.json();
    }
};

export default DB;
