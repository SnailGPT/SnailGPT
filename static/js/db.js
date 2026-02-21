
const DB = {
    // --- User Management ---
    getUsers: () => JSON.parse(localStorage.getItem('snail_users')) || [],
    saveUsers: (users) => localStorage.setItem('snail_users', JSON.stringify(users)),

    addUser: (user) => {
        const users = DB.getUsers();
        users.push(user);
        DB.saveUsers(users);
    },

    findUser: (id) => DB.getUsers().find(u => u.email === id || u.username === id),

    // --- Current Session ---
    getCurrentUser: () => JSON.parse(localStorage.getItem('snail_user')),
    setCurrentUser: (user) => localStorage.setItem('snail_user', JSON.stringify(user)),
    logout: () => localStorage.removeItem('snail_user'),

    // --- Conversations ---
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
