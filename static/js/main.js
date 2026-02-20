document.addEventListener('DOMContentLoaded', () => {
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    const typingIndicator = document.getElementById('typing-indicator');
    const historyList = document.getElementById('history-list');
    const mainView = document.getElementById('sidebar-main-view');
    const settingsView = document.getElementById('sidebar-settings-view');
    const openSettingsBtn = document.getElementById('open-settings-btn');
    const backBtn = document.getElementById('back-to-main');

    let currentAbortController = null;
    let currentSessionId = null;

    // ================= SETTINGS & DROPDOWN LOGIC =================

    function setupDropdown(id, storageKey, applyFn, defaultVal) {
        const dropdown = document.getElementById(id);
        if (!dropdown) return;

        const selected = dropdown.querySelector('.dropdown-selected');
        const options = dropdown.querySelectorAll('.option');

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close other dropdowns
            document.querySelectorAll('.custom-dropdown').forEach(d => {
                if (d !== dropdown) d.classList.remove('active');
            });
            dropdown.classList.toggle('active');
        });

        options.forEach(option => {
            option.addEventListener('click', () => {
                const value = option.getAttribute('data-theme') || option.getAttribute('data-anim') || option.getAttribute('data-value');
                const icon = option.querySelector('i') ? option.querySelector('i').className : 'fas fa-cog';
                const text = option.innerText.trim();

                selected.querySelector('span').innerHTML = `<i class="${icon}"></i> ${text}`;
                options.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');

                applyFn(value);
                localStorage.setItem(storageKey, value);
                dropdown.classList.remove('active');
            });
        });

        // Load Initial Value
        const savedValue = localStorage.getItem(storageKey) || defaultVal;
        if (savedValue) {
            const initialOption = [...options].find(opt =>
                (opt.getAttribute('data-theme') === savedValue) ||
                (opt.getAttribute('data-anim') === savedValue) ||
                (opt.getAttribute('data-value') === savedValue) ||
                (opt.getAttribute('data-theme') === savedValue.replace('theme-', ''))
            );
            if (initialOption) {
                // Manually trigger UI update logic for the initial state
                const icon = initialOption.querySelector('i') ? initialOption.querySelector('i').className : 'fas fa-cog';
                selected.querySelector('span').innerHTML = `<i class="${icon}"></i> ${initialOption.innerText.trim()}`;
                options.forEach(opt => opt.classList.remove('selected'));
                initialOption.classList.add('selected');
                applyFn(savedValue);
            }
        }
    }

    // Apply Functions
    const applyTheme = (theme) => {
        if (!theme) return;
        const themeClass = `theme-${theme.replace('theme-', '')}`;
        document.body.classList.forEach(cls => {
            if (cls.startsWith('theme-')) document.body.classList.remove(cls);
        });
        document.body.classList.add(themeClass);
    };

    const applyAnim = (level) => {
        if (!level) return;
        document.body.setAttribute('data-anim', level);
    };

    // Initialize Dropdowns
    setupDropdown('theme-dropdown', 'snail-gpt-theme', applyTheme, 'midnight');
    setupDropdown('anim-dropdown', 'snail-gpt-anim', applyAnim, 'high');

    // Global click listener to close dropdowns
    document.addEventListener('click', () => {
        document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('active'));
    });

    // ================= EXTREME OPTIMIZATION LOGIC =================
    const optBtn = document.getElementById('extreme-opt-btn');
    if (optBtn) {
        const toggleOpt = (forceState = null) => {
            const isOpt = forceState !== null ? forceState : !document.body.classList.contains('extreme-opt');
            document.body.classList.toggle('extreme-opt', isOpt);
            localStorage.setItem('snail-gpt-extreme-opt', isOpt);
        };

        optBtn.addEventListener('click', () => toggleOpt());

        // Initial Load
        const savedOpt = localStorage.getItem('snail-gpt-extreme-opt') === 'true';
        if (savedOpt) toggleOpt(true);
    }

    // ================= MESSAGE HANDLING =================

    const greetings = [
        "What are you working on?",
        "How can I help you today?",
        "What's on your mind?",
        "Ready to start some research?",
        "What are we building today?",
        "Need a hand with something?",
        "How can Snail GPT assist you?",
        "What's the plan for today?",
        "Looking for some answers?",
        "Let's dive into some data.",
        "What's the next big idea?",
        "How's the project coming along?",
        "Type your prompt to begin.",
        "Snail GPT is ready for orders.",
        "What's the research goal?",
        "Tell me what you're thinking.",
        "Let's solve some problems.",
        "What can I find for you?",
        "How can I make your day easier?",
        "Ready for some high-motion research?"
    ];

    function getRandomGreeting() {
        return greetings[Math.floor(Math.random() * greetings.length)];
    }

    function appendMessage(sender, text) {
        const bubble = document.createElement('div');
        bubble.classList.add('chat-bubble', sender);

        const avatar = document.createElement('div');
        avatar.classList.add('avatar');
        avatar.innerHTML = sender === 'ai' ? '🐌' : '👤';

        const wrap = document.createElement('div');
        wrap.classList.add('message-wrap');

        const content = document.createElement('div');
        content.classList.add('message-content');

        if (sender === 'ai') {
            content.innerHTML = marked.parse(text);
        } else {
            content.textContent = text;
        }

        wrap.appendChild(content);
        bubble.appendChild(avatar);
        bubble.appendChild(wrap);
        chatMessages.appendChild(bubble);

        // Remove welcome message on first interaction
        const welcome = document.querySelector('.welcome-message');
        if (welcome) {
            welcome.style.opacity = '0';
            setTimeout(() => welcome.remove(), 500);
        }

        scrollToBottom();
    }

    function scrollToBottom() {
        const chatWindow = document.getElementById('chat-window');
        chatWindow.scrollTo({
            top: chatWindow.scrollHeight,
            behavior: 'smooth'
        });
    }

    function toggleTyping(show, statusText = "Snail is thinking...") {
        const indicatorText = typingIndicator.querySelector('.status-text') || document.createElement('span');
        if (!typingIndicator.querySelector('.status-text')) {
            indicatorText.classList.add('status-text');
            typingIndicator.appendChild(indicatorText);
        }

        if (show) {
            // indicatorText.textContent = statusText; // Removed per user request
            typingIndicator.classList.remove('hidden');
        } else {
            typingIndicator.classList.add('hidden');
        }
        scrollToBottom();
    }

    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;

        // Display user message
        appendMessage('user', message);
        userInput.value = '';
        userInput.style.height = 'auto';

        // UI State
        userInput.disabled = true;
        sendBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        toggleTyping(true);

        currentAbortController = new AbortController();
        let aiMessageBubble = null;
        let aiMessageContent = null;
        let fullText = "";

        try {
            const isExtremeOpt = document.body.classList.contains('extreme-opt');
            const chatTitleInput = document.getElementById('chat-title-input');
            const chatTitle = chatTitleInput ? chatTitleInput.value.trim() : null;

            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    title: chatTitle,
                    extreme_opt: isExtremeOpt
                }),
                signal: currentAbortController.signal
            });

            if (!response.ok) throw new Error('Network response was not ok');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            toggleTyping(false);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                fullText += chunk;

                if (!aiMessageBubble) {
                    // Create the AI bubble on first chunk
                    aiMessageBubble = document.createElement('div');
                    aiMessageBubble.classList.add('chat-bubble', 'ai');

                    const avatar = document.createElement('div');
                    avatar.classList.add('avatar');
                    avatar.innerHTML = '🐌';

                    const wrap = document.createElement('div');
                    wrap.classList.add('message-wrap');

                    const senderName = document.createElement('span');
                    senderName.classList.add('message-sender');
                    senderName.textContent = 'Snail GPT';

                    aiMessageContent = document.createElement('div');
                    aiMessageContent.classList.add('message-content');

                    wrap.appendChild(senderName);
                    wrap.appendChild(aiMessageContent);
                    aiMessageBubble.appendChild(avatar);
                    aiMessageBubble.appendChild(wrap);
                    chatMessages.appendChild(aiMessageBubble);
                }

                // Update content in real-time
                aiMessageContent.innerHTML = marked.parse(fullText);
                scrollToBottom();
            }

            // Refresh sessions list after first message of a new session
            if (!currentSessionId) {
                // We don't have the ID yet, but the backend created one on save.
                // Fetch the latest sessions to find it.
                await loadSessions();
            }

        } catch (error) {
            toggleTyping(false);
            if (error.name === 'AbortError') {
                if (aiMessageContent) aiMessageContent.innerHTML += "<br>_Generation cancelled._";
                else appendMessage('ai', "_Generation cancelled._");
            } else {
                appendMessage('ai', "⚠️ **Error:** Connection lost. Please check if Ollama is running.");
                console.error('Chat error:', error);
            }
        } finally {
            currentAbortController = null;
            userInput.disabled = false;
            sendBtn.classList.remove('hidden');
            stopBtn.classList.add('hidden');
            userInput.focus();
        }
    }

    // Stop button logic
    stopBtn.addEventListener('click', () => {
        if (currentAbortController) {
            currentAbortController.abort();
        }
    });

    // ================= UI INTERACTION =================

    sendBtn.addEventListener('click', sendMessage);

    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // New Chat functionality
    const newChatBtn = document.getElementById('new-chat-sidebar-btn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', async () => {
            try {
                await fetch('/clear', { method: 'POST' });
                currentSessionId = null;
                const chatTitleInput = document.getElementById('chat-title-input');
                if (chatTitleInput) {
                    chatTitleInput.value = '';
                    chatTitleInput.disabled = false;
                }
                chatMessages.innerHTML = `
                    <div class="welcome-message">
                        <h1>${getRandomGreeting()}</h1>
                    </div>
                `;
                // Remove active state from history items
                document.querySelectorAll('.history-item').forEach(item => item.classList.remove('active'));
            } catch (error) {
                console.error('Error clearing chat:', error);
            }
        });
    }

    // History Loading Logic
    async function loadSessions() {
        try {
            const response = await fetch('/sessions');
            const sessions = await response.json();

            historyList.innerHTML = '';

            // Show/Hide Clear History button
            const clearHistoryBtn = document.getElementById('clear-history-btn');
            if (clearHistoryBtn) {
                if (sessions.length > 0) {
                    clearHistoryBtn.classList.remove('hidden');
                } else {
                    clearHistoryBtn.classList.add('hidden');
                }
            }

            sessions.forEach(session => {
                const item = document.createElement('div');
                item.classList.add('history-item');
                if (session.id === currentSessionId) item.classList.add('active');
                item.innerHTML = `<i class="far fa-comment-alt"></i> <span>${session.title}</span>`;
                item.addEventListener('click', () => loadSession(session.id));
                historyList.appendChild(item);
            });
        } catch (error) {
            console.error('Error loading sessions:', error);
        }
    }

    async function loadSession(id) {
        if (id === currentSessionId) return;

        try {
            const response = await fetch(`/session/${id}`);
            const data = await response.json();

            currentSessionId = id;
            chatMessages.innerHTML = '';

            data.history.forEach(msg => {
                appendMessage(msg.role.toLowerCase() === 'assistant' ? 'ai' : 'user', msg.content);
            });

            // Set manual title input if session has a title
            const chatTitleInput = document.getElementById('chat-title-input');
            if (chatTitleInput) {
                chatTitleInput.value = data.title || '';
                chatTitleInput.disabled = true; // Disable editing for loaded sessions
            }

            // Update active state in UI
            document.querySelectorAll('.history-item').forEach(item => {
                item.classList.toggle('active', item.innerText.trim() === data.title.trim());
            });

            await loadSessions(); // Refresh list to set active class properly
        } catch (error) {
            console.error('Error loading session:', error);
        }
    }

    const clearHistoryBtn = document.getElementById('clear-history-btn');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', async () => {
            if (confirm('Delete all chat history? This cannot be undone.')) {
                try {
                    await fetch('/clear_all', { method: 'POST' });
                    currentSessionId = null;
                    historyList.innerHTML = '';
                    chatMessages.innerHTML = `
                        <div class="welcome-message">
                            <h1>${getRandomGreeting()}</h1>
                        </div>
                    `;
                    if (clearHistoryBtn) clearHistoryBtn.classList.add('hidden');
                } catch (error) {
                    console.error('Error clearing history:', error);
                }
            }
        });
    }

    // Initial Load
    loadSessions();

    // ================= SIDEBAR VIEW LOGIC =================

    if (openSettingsBtn && mainView && settingsView) {
        openSettingsBtn.addEventListener('click', () => {
            mainView.classList.remove('active');
            settingsView.classList.add('active');
        });
    }

    if (backBtn && mainView && settingsView) {
        backBtn.addEventListener('click', () => {
            settingsView.classList.remove('active');
            mainView.classList.add('active');
        });
    }

    // Auto-resize textarea
    userInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    // Initial Greeting Randomization
    const welcomeH1 = document.querySelector('.welcome-message h1');
    if (welcomeH1) {
        welcomeH1.textContent = getRandomGreeting();
    }

    // ================= PLUS MENU LOGIC =================
    const plusBtn = document.getElementById('plus-btn');
    const plusMenu = document.getElementById('plus-menu');
    const navImageGen = document.getElementById('nav-image-gen');

    if (plusBtn && plusMenu) {
        plusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            plusMenu.classList.toggle('hidden');
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!plusMenu.contains(e.target) && e.target !== plusBtn && !plusBtn.contains(e.target)) {
                plusMenu.classList.add('hidden');
            }
        });

        // Navigation
        if (navImageGen) {
            navImageGen.addEventListener('click', () => {
                // Navigate to Media Page
                window.location.href = '/media';
            });
        }
    }
});


