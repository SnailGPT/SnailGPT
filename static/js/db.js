
// -------------------------------------------------------
// DB.js — SnailGPT Data Layer
//
// User ACCOUNTS → stored server-side (SQLite via Flask API)
// Security      → JWT (stateless, cross-device)
// Cache         → localStorage (device-specific)
// -------------------------------------------------------

const API = '/api';

const DB = {
    // ---- Session & Token Management ----
    getToken: () => localStorage.getItem('snail_token'),
    setToken: (token) => localStorage.setItem('snail_token', token),
    clearToken: () => localStorage.removeItem('snail_token'),

    getCurrentUser: () => JSON.parse(localStorage.getItem('snail_user')),
    setCurrentUser: (user) => localStorage.setItem('snail_user', JSON.stringify(user)),

    logout: () => {
        DB.clearToken();
        localStorage.removeItem('snail_user');
    },

    /**
     * Helper for authenticated requests.
     */
    getAuthHeader: () => {
        const token = DB.getToken();
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    },

    /**
     * Generic API handler with token support.
     */
    request: async (endpoint, options = {}) => {
        const headers = {
            'Content-Type': 'application/json',
            ...DB.getAuthHeader(),
            ...(options.headers || {})
        };

        const res = await fetch(`${API}${endpoint}`, {
            ...options,
            headers
        });

        let data;
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            data = await res.json();
        } else {
            const text = await res.text();
            throw new Error(`Server error: ${text.substring(0, 100)}...`);
        }

        if (!res.ok) throw new Error(data.error || 'Request failed.');
        return data;
    },

    // ---- Account API (cross-device) ----

    registerUser: async (email, username, password) => {
        const data = await DB.request('/register', {
            method: 'POST',
            body: JSON.stringify({ email, username, password })
        });
        if (data.token) DB.setToken(data.token);
        return data.user;
    },

    loginUser: async (id, password) => {
        const data = await DB.request('/login', {
            method: 'POST',
            body: JSON.stringify({ id, password })
        });
        if (data.token) DB.setToken(data.token);
        return data.user;
    },

    verifyToken: async () => {
        if (!DB.getToken()) return null;
        try {
            const data = await DB.request('/verify-token', { method: 'GET' });
            return data.user;
        } catch (e) {
            DB.logout();
            return null;
        }
    },

    updateUser: async (payload) => {
        const data = await DB.request('/user/update', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        return data.user;
    },

    // ---- Forgot Password Flow ----

    forgotPassword: async (email) => {
        return await DB.request('/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
    },

    resetPassword: async (email, code, password) => {
        return await DB.request('/reset-password', {
            method: 'POST',
            body: JSON.stringify({ email, code, password })
        });
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
    },

    // ---- Remote Sessions (Server-side) ----
    getRemoteSessions: async () => {
        return await DB.request('/sessions', { method: 'GET' });
    },

    getRemoteSession: async (id) => {
        return await DB.request(`/session/${id}`, { method: 'GET' });
    },

    saveRemoteSession: async (history, title, sessionId) => {
        // The backend handles saving automatically after the /chat stream
        // but we might want a manual save or title update.
        // For now, /chat handles the creation.
    }
};

export default DB;
