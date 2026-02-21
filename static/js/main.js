import CONFIG from './config.js';

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
    let chatHistory = [];

    // ================= SETTINGS & DROPDOWN LOGIC =================

    function setupDropdown(id, storageKey, applyFn, defaultVal) {
        const dropdown = document.getElementById(id);
        if (!dropdown) return;

        const selected = dropdown.querySelector('.dropdown-selected');
        const options = dropdown.querySelectorAll('.option');

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
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

        const savedValue = localStorage.getItem(storageKey) || defaultVal;
        if (savedValue) {
            const initialOption = [...options].find(opt =>
                (opt.getAttribute('data-theme') === savedValue) ||
                (opt.getAttribute('data-anim') === savedValue) ||
                (opt.getAttribute('data-value') === savedValue) ||
                (opt.getAttribute('data-theme') === savedValue.replace('theme-', ''))
            );
            if (initialOption) {
                const icon = initialOption.querySelector('i') ? initialOption.querySelector('i').className : 'fas fa-cog';
                selected.querySelector('span').innerHTML = `<i class="${icon}"></i> ${initialOption.innerText.trim()}`;
                options.forEach(opt => opt.classList.remove('selected'));
                initialOption.classList.add('selected');
                applyFn(savedValue);
            }
        }
    }

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

    setupDropdown('theme-dropdown', 'snail-gpt-theme', applyTheme, 'midnight');
    setupDropdown('anim-dropdown', 'snail-gpt-anim', applyAnim, 'high');

    document.addEventListener('click', () => {
        document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('active'));
    });

    document.addEventListener('click', () => {
        document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('active'));
    });

    const optBtn = document.getElementById('extreme-opt-btn');
    if (optBtn) {
        const toggleOpt = (forceState = null) => {
            const isOpt = forceState !== null ? forceState : !document.body.classList.contains('extreme-opt');
            document.body.classList.toggle('extreme-opt', isOpt);
            localStorage.setItem('snail-gpt-extreme-opt', isOpt);
        };
        optBtn.addEventListener('click', () => toggleOpt());
        const savedOpt = localStorage.getItem('snail-gpt-extreme-opt') === 'true';
        if (savedOpt) toggleOpt(true);
    }

    // ================= MESSAGE HANDLING =================

    const greetings = [
        "What are you working on?",
        "How can I help you today?",
        "What's the plan for today?",
        "Let's solve some problems."
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

    function toggleTyping(show) {
        if (show) {
            typingIndicator.classList.remove('hidden');
        } else {
            typingIndicator.classList.add('hidden');
        }
        scrollToBottom();
    }

    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;

        const apiKey = CONFIG.DEVELOPER_TOKEN && CONFIG.DEVELOPER_TOKEN !== "REPLACE_WITH_YOUR_HF_TOKEN"
            ? CONFIG.DEVELOPER_TOKEN
            : localStorage.getItem('snail-gpt-hf-token');

        if (!apiKey) {
            alert('Developer Token not set! Please set DEVELOPER_TOKEN in static/js/config.js');
            return;
        }

        appendMessage('user', message);
        userInput.value = '';
        userInput.style.height = 'auto';

        userInput.disabled = true;
        sendBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        toggleTyping(true);

        currentAbortController = new AbortController();
        let aiMessageBubble = null;
        let aiMessageContent = null;
        let fullText = "";

        // Add to history state
        chatHistory.push({ role: "user", content: message });

        try {
            const isExtremeOpt = document.body.classList.contains('extreme-opt');

            // Build messages with system prompt
            const time_context = `Current Date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.`;
            const systemPrompt = `You are Snail GPT, an advanced AI based on GPT-4 architecture. 
            Behavior: Helpful, extremely accurate, and objective. 
            Constraint: For simple questions or greetings, answer in 3 to 4 lines maximum. 
            Context: ${time_context} Use Markdown for formatting.`;

            const messages = [
                { role: "system", content: systemPrompt },
                ...chatHistory.slice(-5) // Send last 5 message for context
            ];

            const response = await fetch(`${CONFIG.API_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: CONFIG.MODEL_NAME,
                    messages: messages,
                    stream: true,
                    max_tokens: isExtremeOpt ? 200 : 800,
                    temperature: 0.7
                }),
                signal: currentAbortController.signal
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'API Error');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            toggleTyping(false);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.replace('data: ', '').trim();
                        if (dataStr === '[DONE]') break;
                        try {
                            const json = JSON.parse(dataStr);
                            const content = json.choices[0].delta.content || "";
                            if (content) {
                                fullText += content;
                                if (!aiMessageBubble) {
                                    aiMessageBubble = document.createElement('div');
                                    aiMessageBubble.classList.add('chat-bubble', 'ai');
                                    aiMessageBubble.innerHTML = `
                                        <div class="avatar">🐌</div>
                                        <div class="message-wrap">
                                            <span class="message-sender">Snail GPT</span>
                                            <div class="message-content"></div>
                                        </div>
                                    `;
                                    chatMessages.appendChild(aiMessageBubble);
                                    aiMessageContent = aiMessageBubble.querySelector('.message-content');
                                }
                                aiMessageContent.innerHTML = marked.parse(fullText);
                                scrollToBottom();
                            }
                        } catch (e) { }
                    }
                }
            }

            chatHistory.push({ role: "assistant", content: fullText });
            saveSession();

        } catch (error) {
            toggleTyping(false);
            if (error.name === 'AbortError') {
                if (aiMessageContent) aiMessageContent.innerHTML += "<br>_Generation cancelled._";
                else appendMessage('ai', "_Generation cancelled._");
            } else {
                appendMessage('ai', `⚠️ **Error:** ${error.message}`);
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

    function saveSession() {
        if (!chatHistory.length) return;

        const sessions = JSON.parse(localStorage.getItem('snail-gpt-sessions') || '[]');
        if (!currentSessionId) {
            currentSessionId = Date.now().toString();
            const title = chatHistory[0].content.substring(0, 30) + (chatHistory[0].content.length > 30 ? '...' : '');
            sessions.unshift({ id: currentSessionId, title, history: chatHistory, updated_at: Date.now() });
        } else {
            const index = sessions.findIndex(s => s.id === currentSessionId);
            if (index !== -1) {
                sessions[index].history = chatHistory;
                sessions[index].updated_at = Date.now();
            }
        }
        localStorage.setItem('snail-gpt-sessions', JSON.stringify(sessions));
        loadSessions();
    }

    function loadSessions() {
        const sessions = JSON.parse(localStorage.getItem('snail-gpt-sessions') || '[]');
        historyList.innerHTML = '';

        const clearHistoryBtn = document.getElementById('clear-history-btn');
        if (clearHistoryBtn) {
            clearHistoryBtn.classList.toggle('hidden', sessions.length === 0);
        }

        sessions.forEach(session => {
            const item = document.createElement('div');
            item.classList.add('history-item');
            if (session.id === currentSessionId) item.classList.add('active');
            item.innerHTML = `<i class="far fa-comment-alt"></i> <span>${session.title}</span>`;
            item.addEventListener('click', () => loadSession(session.id));
            historyList.appendChild(item);
        });
    }

    function loadSession(id) {
        const sessions = JSON.parse(localStorage.getItem('snail-gpt-sessions') || '[]');
        const session = sessions.find(s => s.id === id);
        if (session) {
            currentSessionId = id;
            chatHistory = session.history;
            chatMessages.innerHTML = '';
            chatHistory.forEach(msg => {
                appendMessage(msg.role === 'assistant' ? 'ai' : 'user', msg.content);
            });
            loadSessions();
        }
    }

    // ================= UI INTERACTION =================

    sendBtn.addEventListener('click', sendMessage);
    stopBtn.addEventListener('click', () => currentAbortController?.abort());

    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    const newChatBtn = document.getElementById('new-chat-sidebar-btn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            currentSessionId = null;
            chatHistory = [];
            chatMessages.innerHTML = `<div class="welcome-message"><h1>${getRandomGreeting()}</h1></div>`;
            document.querySelectorAll('.history-item').forEach(item => item.classList.remove('active'));
        });
    }

    const clearHistoryBtn = document.getElementById('clear-history-btn');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            if (confirm('Delete all history?')) {
                localStorage.removeItem('snail-gpt-sessions');
                newChatBtn.click();
                loadSessions();
            }
        });
    }

    openSettingsBtn.addEventListener('click', () => {
        mainView.classList.remove('active');
        settingsView.classList.add('active');
    });

    backBtn.addEventListener('click', () => {
        settingsView.classList.remove('active');
        mainView.classList.add('active');
    });

    userInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    const plusBtn = document.getElementById('plus-btn');
    const plusMenu = document.getElementById('plus-menu');
    const navImageGen = document.getElementById('nav-image-gen');

    if (plusBtn && plusMenu) {
        plusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            plusMenu.classList.toggle('hidden');
        });
        document.addEventListener('click', (e) => {
            if (!plusMenu.contains(e.target) && e.target !== plusBtn) plusMenu.classList.add('hidden');
        });
        navImageGen.addEventListener('click', () => window.location.href = 'media.html');
    }

    loadSessions();
});
