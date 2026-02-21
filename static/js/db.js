
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

    // ---- Conversations (local cache – per device) ----
    getConversations: (userId) => {
        const allConvos = JSON.parse(localStorage.getItem('snail_convos')) || {};
        return allConvos[userId] || [];
    },

    saveConversation: (userId, convo) => {
        const allConvos = JSON.parse(localStorage.getItem('snail_convos')) || {};
        if (!allConvos[userId]) allConvos[userId] = [];

        const index = allConvos[userId].findIndex(c => c.id === convo.id);
        if (index > -1) {
            allConvos[userId][index] = convo;
        } else {
            allConvos[userId].push(convo);
        }
        localStorage.setItem('snail_convos', JSON.stringify(allConvos));
    },

    clearConversations: (userId) => {
        const allConvos = JSON.parse(localStorage.getItem('snail_convos')) || {};
        delete allConvos[userId];
        localStorage.setItem('snail_convos', JSON.stringify(allConvos));
    }
};

export default DB;
