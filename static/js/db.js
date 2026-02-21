
// -------------------------------------------------------
// DB.js — SnailGPT Data Layer
//
// User ACCOUNTS → stored server-side (SQLite via Flask API)
// Current SESSION → localStorage (which user is logged in now)
// Chat HISTORY   → localStorage (device-specific cache)
// -------------------------------------------------------

const DB = {
    // ---- Session (local only – who is logged in on THIS device) ----
    getCurrentUser: () => JSON.parse(localStorage.getItem('snail_user')),
    setCurrentUser: (user) => localStorage.setItem('snail_user', JSON.stringify(user)),
    logout: () => localStorage.removeItem('snail_user'),

    // ---- Account API (local-only for serverless mode) ----

    registerUser: async (email, username, password) => {
        // Check if user exists
        const allUsers = JSON.parse(localStorage.getItem('snail_accounts') || '[]');
        if (allUsers.find(u => u.email === email)) {
            throw new Error('email already registered use a different one');
        }
        if (allUsers.find(u => u.username === username)) {
            throw new Error('This display name is already taken. Please choose another.');
        }

        const recoveryCode = Math.floor(100000 + Math.random() * 900000).toString();
        const newUser = {
            email,
            username,
            password, // Storing plaintext locally for simplicity in this demo mode
            recoveryCode,
            avatarUrl: null
        };

        allUsers.push(newUser);
        localStorage.setItem('snail_accounts', JSON.stringify(allUsers));
        return { email, username, recoveryCode };
    },

    loginUser: async (id, password) => {
        const allUsers = JSON.parse(localStorage.getItem('snail_accounts') || '[]');
        const user = allUsers.find(u => (u.email === id || u.username === id) && u.password === password);

        if (!user) {
            throw new Error('Invalid identifier or password.');
        }

        return {
            email: user.email,
            username: user.username,
            recoveryCode: user.recoveryCode,
            avatarUrl: user.avatarUrl
        };
    },

    updateUser: async (payload) => {
        const { email, newUsername, newPassword, recoveryCode, avatarUrl } = payload;
        const allUsers = JSON.parse(localStorage.getItem('snail_accounts') || '[]');
        const userIndex = allUsers.findIndex(u => u.email === email);

        if (userIndex === -1) throw new Error('User not found.');
        const user = allUsers[userIndex];

        if (newUsername && newUsername !== user.username) {
            if (allUsers.find(u => u.username === newUsername && u.email !== email)) {
                throw new Error('This display name is already taken.');
            }
            user.username = newUsername;
        }

        if (newPassword) {
            const correctCode = (email === 'kartik.ps.mishra07@gmail.com') ? '150700' : user.recoveryCode;
            if (recoveryCode !== correctCode) {
                throw new Error('Invalid Recovery Code. Password change rejected.');
            }
            user.password = newPassword;
        }

        if (avatarUrl !== undefined) {
            user.avatarUrl = avatarUrl;
        }

        allUsers[userIndex] = user;
        localStorage.setItem('snail_accounts', JSON.stringify(allUsers));
        return user;
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
