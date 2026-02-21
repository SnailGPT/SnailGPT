import CONFIG from './config.js';
import ParticleNetwork from './particles.js';
import DB from './db.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const pages = {
        home: document.getElementById('home-page'),
        auth: document.getElementById('auth-page'),
        app: document.getElementById('app-page'),
        profile: document.getElementById('profile-page')
    };

    // Initialize Interactive Background
    let bgNetwork = null;
    const particleCanvas = document.getElementById('particle-canvas');
    if (particleCanvas) {
        bgNetwork = new ParticleNetwork('particle-canvas');
    }

    // Removed redundant theme dropdown listeners. Handled at the bottom via setupMenuDropdown

    // --- Form Elements ---
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const loginIdInput = document.getElementById('login-id');
    const loginPassInput = document.getElementById('login-password');
    const fullProfileEditForm = document.getElementById('full-profile-edit-form');

    const userInitial = document.getElementById('user-initial');
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    const typingIndicator = document.getElementById('typing-indicator');
    const historyList = document.getElementById('history-list');

    // Auth section refs
    const loginSection = document.getElementById('login-section');
    const signupSection = document.getElementById('signup-section');
    // --- Verification Logic ---
    const sendCode = (email) => {
        if (!email) {
            alert('Please enter an email or username first.');
            return;
        }
        // This function is no longer used for actual verification in the new flow
        // but kept for potential future use or if other parts of the app still call it.
        // The verificationCode and codeExpiry are also removed from state.
        console.log(`%c[EMAIL SIMULATION] Code sent to ${email}: (Verification removed)`, 'color: #4f46e5; font-weight: bold;');
        alert(`A verification code would have been sent to ${email} (Verification removed in this demo).`);
    };

    // --- State ---
    let currentUser = DB.getCurrentUser();
    let currentSessionId = null;
    let chatHistory = [];
    let currentAbortController = null;

    // Developer Credentials (Bypass)
    const DEV_ACCOUNT = {
        email: 'kartik.ps.mishra07@gmail.com',
        password: 'Kartik0711'
    };

    // --- Router Logic ---
    const router = {
        navigate: (page) => {
            Object.values(pages).forEach(p => {
                if (p) {
                    p.classList.add('hidden');
                    p.classList.remove('active');
                }
            });

            if (pages[page]) {
                pages[page].classList.remove('hidden');
                pages[page].classList.add('active');
            }

            // Sync body dataset to allow CSS backgrounds to toggle off (e.g. particle canvas)
            document.body.dataset.currentPage = page;

            if (page === 'app') initApp();
            if (page === 'profile') loadProfileData();
        },
        toggleAuth: (mode) => {
            if (mode === 'login') {
                loginSection.classList.remove('hidden');
                signupSection.classList.add('hidden');
            } else {
                loginSection.classList.add('hidden');
                signupSection.classList.remove('hidden');
            }
        }
    };
    window.router = router; // Global access for inline onclicks

    // --- Auth Logic ---
    // These functions are no longer used for the main auth flow
    function sendSimulatedEmail(code) {
        const toast = document.getElementById('email-notification');
        const codeDisplay = document.getElementById('sent-code-display');
        if (codeDisplay) codeDisplay.textContent = code;
        if (toast) {
            toast.classList.remove('hidden');
            setTimeout(() => toast.classList.add('hidden'), 8000);
        }
    }

    function generateCode() {
        // This function is no longer used for the main auth flow
        return "000000"; // Placeholder
    }

    // Attach Nav Events
    const btnSignup = document.getElementById('nav-signup-btn');
    const btnLogin = document.getElementById('nav-login-btn');
    const btnBackHome = document.getElementById('auth-back-home');
    const btnSwitchSignup = document.getElementById('switch-to-signup-btn');
    const btnSwitchLogin = document.getElementById('switch-to-login-btn');

    if (btnSignup) btnSignup.onclick = () => {
        router.navigate('auth');
        router.toggleAuth('signup');
    };
    if (btnLogin) btnLogin.onclick = () => {
        router.navigate('auth');
        router.toggleAuth('login');
    };
    if (btnBackHome) btnBackHome.onclick = () => router.navigate('home');
    if (btnSwitchSignup) btnSwitchSignup.onclick = () => {
        router.toggleAuth('signup');
    };
    if (btnSwitchLogin) btnSwitchLogin.onclick = () => {
        router.toggleAuth('login');
    };

    // Signup Submit
    if (signupForm) signupForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('signup-email').value.trim();
        const username = document.getElementById('signup-username').value.trim();
        const password = document.getElementById('signup-password').value;
        const confirm = document.getElementById('signup-confirm').value;

        if (password !== confirm) return alert("Passwords do not match");

        // Developer bypass — still works, but now also stored in the DB
        const submitBtn = signupForm.querySelector('button[type=submit]');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating account…'; }

        try {
            const newUser = await DB.registerUser(email, username, password);
            alert(`Account created successfully!\n\nIMPORTANT: Your 6-Digit Recovery Code is: ${newUser.recoveryCode}\n\nPlease save this code. You will need it to change your password in Profile Settings.`);
            DB.setCurrentUser(newUser);
            currentUser = newUser;
            router.navigate('app');
        } catch (err) {
            alert(err.message);
        } finally {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Sign Up'; }
        }
    };

    // Login Submit
    if (loginForm) loginForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('login-id').value.trim();
        const password = document.getElementById('login-password').value;

        const submitBtn = loginForm.querySelector('button[type=submit]');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Logging in…'; }

        try {
            const savedUser = await DB.loginUser(id, password);
            DB.setCurrentUser(savedUser);
            currentUser = savedUser;
            router.navigate('app');
        } catch (err) {
            alert(err.message);
        } finally {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Login'; }
        }
    };


    function initApp() {
        if (!currentUser) return router.navigate('home');
        const initial = currentUser.username.charAt(0).toUpperCase();

        // Handle Sidebar Avatar
        const sidebarAvatar = document.getElementById('user-initial');
        if (sidebarAvatar) {
            if (currentUser.avatarUrl) {
                sidebarAvatar.innerHTML = `<img src="${currentUser.avatarUrl}" style="width:100%; height:100%; border-radius:12px; object-fit:cover;">`;
                sidebarAvatar.style.background = 'transparent';
                sidebarAvatar.style.border = 'none';
            } else {
                sidebarAvatar.textContent = initial;
                sidebarAvatar.style.background = '';
                sidebarAvatar.style.border = '';
            }
        }

        // Handle Header Avatar (Top Left next to Logo)
        const headerAvatar = document.getElementById('header-user-avatar');
        if (headerAvatar) {
            if (currentUser.avatarUrl) {
                headerAvatar.innerHTML = `<img src="${currentUser.avatarUrl}" style="width:32px; height:32px; border-radius:8px; object-fit:cover;">`;
                headerAvatar.style.display = 'block';
            } else {
                headerAvatar.style.display = 'none';
            }
        }

        // Handle Popup Avatar
        const popupInitialEl = document.getElementById('popup-user-initial');
        const popupNameEl = document.getElementById('popup-user-name');
        if (popupInitialEl) {
            if (currentUser.avatarUrl) {
                popupInitialEl.innerHTML = `<img src="${currentUser.avatarUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
                popupInitialEl.style.background = 'transparent';
            } else {
                popupInitialEl.textContent = initial;
                popupInitialEl.style.background = '';
            }
        }
        if (popupNameEl) popupNameEl.textContent = currentUser.username;

        // Developer Mode Access Control
        const devAccessContainer = document.getElementById('dev-access-container');
        if (devAccessContainer) {
            if (currentUser.email === 'kartik.ps.mishra07@gmail.com') {
                devAccessContainer.style.display = 'block';
            } else {
                devAccessContainer.style.display = 'none';
            }
        }

        loadSessions();
    }

    const profileTrigger = document.getElementById('user-profile-trigger');
    if (profileTrigger) profileTrigger.onclick = () => router.navigate('profile');

    // --- Profile Logic ---
    function loadProfileData() {
        if (!currentUser) return router.navigate('home');
        const profUser = document.getElementById('prof-username');
        const profEmail = document.getElementById('prof-email');
        const profAvatar = document.getElementById('profile-avatar-large');
        const profDisp = document.getElementById('profile-display-name');
        const profRole = document.querySelector('.profile-role');
        const fileInput = document.getElementById('prof-avatar-file');
        const revertBtn = document.getElementById('prof-avatar-revert');

        if (profUser) profUser.value = currentUser.username;
        if (profEmail) profEmail.value = currentUser.email;
        if (fileInput) fileInput.value = ''; // Reset input

        let pendingAvatar = currentUser.avatarUrl || null;

        if (profAvatar) {
            if (pendingAvatar) {
                profAvatar.innerHTML = `<img src="${pendingAvatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
                profAvatar.style.background = 'transparent';
                if (revertBtn) revertBtn.style.display = 'flex';
            } else {
                profAvatar.textContent = currentUser.username.charAt(0).toUpperCase();
                profAvatar.style.background = '';
                if (revertBtn) revertBtn.style.display = 'none';
            }
        }
        if (profDisp) profDisp.textContent = currentUser.username;

        if (profRole) {
            if (currentUser.email === 'kartik.ps.mishra07@gmail.com') {
                profRole.innerHTML = '✨ Founder & Lead Developer';
                profRole.style.color = 'var(--primary)';
            } else {
                profRole.textContent = 'SnailGPT Researcher';
                profRole.style.color = '';
            }
        }

        // Live Avatar Preview
        if (fileInput) {
            fileInput.onchange = (ev) => {
                const file = ev.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        pendingAvatar = e.target.result;
                        if (profAvatar) {
                            profAvatar.innerHTML = `<img src="${pendingAvatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
                            profAvatar.style.background = 'transparent';
                        }
                        if (revertBtn) revertBtn.style.display = 'flex';
                    };
                    reader.readAsDataURL(file);
                }
            };
        }

        // Revert Avatar
        if (revertBtn) {
            revertBtn.onclick = () => {
                pendingAvatar = null;
                if (fileInput) fileInput.value = '';
                if (profAvatar) {
                    profAvatar.textContent = currentUser.username.charAt(0).toUpperCase();
                    profAvatar.style.background = '';
                }
                revertBtn.style.display = 'none';
            };
        }

        // --- Profile Form Submit (inside loadProfileData to access pendingAvatar) ---
        if (fullProfileEditForm) {
            fullProfileEditForm.onsubmit = async (e) => {
                e.preventDefault();
                const newUsername = (document.getElementById('prof-username') || {}).value?.trim() || '';
                const newPasswordInput = document.getElementById('prof-password');
                const verifyInput = document.getElementById('prof-verify');
                const newPassword = newPasswordInput ? newPasswordInput.value : '';
                const code = verifyInput ? verifyInput.value.trim() : '';

                if (!newUsername) return alert('Display name cannot be empty');

                const submitBtn = fullProfileEditForm.querySelector('button[type=submit]');
                if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving...'; }

                if (newPassword) {
                    const correctCode = (currentUser.email === 'kartik.ps.mishra07@gmail.com') ? '150700' : currentUser.recoveryCode;
                    if (!correctCode && currentUser.email !== 'kartik.ps.mishra07@gmail.com') {
                        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes'; }
                        return alert('Legacy accounts cannot change password. Contact the administrator.');
                    }
                    if (correctCode && code !== correctCode) {
                        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes'; }
                        return alert('Invalid 6-Digit Recovery Code. Password change rejected.');
                    }
                }

                const doSave = async (avatarData) => {
                    try {
                        const payload = {
                            email: currentUser.email,
                            newUsername: newUsername !== currentUser.username ? newUsername : undefined,
                            avatarUrl: avatarData !== undefined ? avatarData : undefined
                        };
                        payload.avatarUrl = avatarData || null;

                        if (newPassword) {
                            payload.newPassword = newPassword;
                            payload.recoveryCode = code;
                        }

                        const updated = await DB.updateUser(payload);
                        // Update global state and persist
                        currentUser = updated;
                        DB.setCurrentUser(updated);

                        // Force refresh UI
                        initApp();

                        // Navigate back to app
                        router.navigate('app');

                        // Refresh messages if they were cleared or need re-render
                        setTimeout(() => {
                            if (chatMessages) {
                                chatMessages.innerHTML = '';
                                if (!chatHistory || chatHistory.length === 0) {
                                    chatMessages.innerHTML = '<div class="welcome-message"><h1>How can I assist your research?</h1></div>';
                                } else {
                                    chatHistory.forEach(m => appendMessage(m.role === 'assistant' ? 'ai' : 'user', m.content));
                                }
                            }
                        }, 50);
                    } catch (err) {
                        alert(err.message);
                    } finally {
                        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes'; }
                    }
                };

                const currentFileInput = document.getElementById('prof-avatar-file');
                if (currentFileInput && currentFileInput.files && currentFileInput.files[0]) {
                    const file = currentFileInput.files[0];
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            const size = 200;
                            canvas.width = size; canvas.height = size;
                            const minEdge = Math.min(img.width, img.height);
                            const sx = (img.width - minEdge) / 2;
                            const sy = (img.height - minEdge) / 2;
                            ctx.drawImage(img, sx, sy, minEdge, minEdge, 0, 0, size, size);
                            doSave(canvas.toDataURL('image/jpeg', 0.8));
                        };
                        img.src = ev.target.result;
                    };
                    reader.readAsDataURL(file);
                } else {
                    await doSave(pendingAvatar);
                }
            };
        }
    }

    const profileBack = document.getElementById('profile-back-app');
    if (profileBack) profileBack.onclick = () => router.navigate('app');

    // ---- Profile Popup Sidebar ----
    const sidebarProfileBtn = document.getElementById('sidebar-profile-btn');
    const profilePopup = document.getElementById('profile-popup');
    const popupProfileBtn = document.getElementById('popup-profile-btn');
    const popupSignoutBtn = document.getElementById('popup-signout-btn');
    const popupUserInitial = document.getElementById('popup-user-initial');
    const popupUserName = document.getElementById('popup-user-name');

    if (sidebarProfileBtn && profilePopup) {
        sidebarProfileBtn.onclick = (e) => {
            e.stopPropagation();
            profilePopup.classList.toggle('hidden');
        };
    }
    if (popupProfileBtn) popupProfileBtn.onclick = () => {
        if (profilePopup) profilePopup.classList.add('hidden');
        router.navigate('profile');
    };
    if (popupSignoutBtn) popupSignoutBtn.onclick = () => {
        DB.logout();
        currentUser = null;
        if (profilePopup) profilePopup.classList.add('hidden');
        router.navigate('home');
    };
    document.addEventListener('click', (e) => {
        if (profilePopup && !profilePopup.classList.contains('hidden')) {
            const wrapper = document.getElementById('profile-menu-wrapper');
            if (wrapper && !wrapper.contains(e.target)) {
                profilePopup.classList.add('hidden');
            }
        }
    });

    const btnLogout = document.getElementById('logout-btn-large');
    if (btnLogout) btnLogout.onclick = () => {
        DB.logout();
        currentUser = null;
        router.navigate('home');
    };

    // ---- Clear History ----
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    if (clearHistoryBtn) {
        clearHistoryBtn.onclick = () => {
            if (!currentUser) return;
            if (!confirm('Delete all chat history? This cannot be undone.')) return;
            DB.clearConversations(currentUser.email);
            currentSessionId = null;
            chatHistory = [];
            if (chatMessages) chatMessages.innerHTML = '<div class="welcome-message"><h1>How can I assist your research?</h1></div>';
            clearHistoryBtn.classList.add('hidden');
            if (historyList) historyList.innerHTML = '';
        };
    }

    // --- AI Chat Logic ---
    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;

        appendMessage('user', message);
        userInput.value = '';
        userInput.style.height = 'auto';
        userInput.disabled = true;
        sendBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        toggleTyping(true);

        currentAbortController = new AbortController();
        let aiMessageContent = null;
        let fullText = "";

        chatHistory.push({ role: "user", content: message });

        try {
            const isExtremeOpt = document.body.classList.contains('extreme-opt');

            const payload = {
                message: message,
                extreme_opt: isExtremeOpt
            };

            const response = await fetch(`/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: currentAbortController.signal
            });

            if (!response.ok) throw new Error("Server Connection Failed");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            toggleTyping(false);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const token = decoder.decode(value);
                if (token) {
                    fullText += token;
                    if (!aiMessageContent) {
                        const bubble = document.createElement('div');
                        bubble.classList.add('chat-bubble', 'ai');
                        bubble.innerHTML = `<div class="avatar">🐌</div><div class="message-wrap"><div class="message-content"></div></div>`;
                        chatMessages.appendChild(bubble);
                        aiMessageContent = bubble.querySelector('.message-content');
                    }
                    aiMessageContent.innerHTML = marked.parse(fullText);
                    scrollToBottom();
                }
            }
            chatHistory.push({ role: "assistant", content: fullText });
            saveSession();
        } catch (error) {
            toggleTyping(false);
            appendMessage('ai', error.name === 'AbortError' ? "_Cancelled._" : "⚠️ Error: " + error.message);
        } finally {
            currentAbortController = null;
            userInput.disabled = false;
            sendBtn.classList.remove('hidden');
            stopBtn.classList.add('hidden');
            userInput.focus();
        }
    }

    function appendMessage(sender, text) {
        if (!chatMessages) return;
        const bubble = document.createElement('div');
        bubble.classList.add('chat-bubble', sender);

        let avatarHTML = '👤';
        if (sender === 'ai') {
            avatarHTML = '🐌';
        } else if (currentUser && currentUser.avatarUrl) {
            avatarHTML = `<img src="${currentUser.avatarUrl}" style="width:100%; height:100%; border-radius:16px; object-fit:cover; display:block;">`;
        }

        bubble.innerHTML = `<div class="avatar" ${sender === 'user' && currentUser && currentUser.avatarUrl ? 'style="padding:0; background:transparent;"' : ''}>${avatarHTML}</div><div class="message-wrap"><div class="message-content">${sender === 'ai' ? marked.parse(text) : text}</div></div>`;
        chatMessages.appendChild(bubble);
        const welcome = document.querySelector('.welcome-message');
        if (welcome) welcome.remove();
        scrollToBottom();
    }

    function scrollToBottom() {
        const win = document.getElementById('chat-window');
        if (win) win.scrollTo({ top: win.scrollHeight, behavior: 'smooth' });
    }

    function toggleTyping(show) {
        if (typingIndicator) typingIndicator.classList.toggle('hidden', !show);
        scrollToBottom();
    }

    function saveSession() {
        if (!chatHistory.length) return;
        if (!currentUser) return;

        if (!currentSessionId) {
            currentSessionId = Date.now().toString();
        }

        const convo = {
            id: currentSessionId,
            title: chatHistory[0].content.substring(0, 30),
            history: chatHistory,
            timestamp: Date.now()
        };

        DB.saveConversation(currentUser.email, convo);
        loadSessions();
    }

    function loadSessions() {
        if (!historyList || !currentUser) return;
        const sessions = DB.getConversations(currentUser.email);
        historyList.innerHTML = '';
        // Show or hide Clear History button
        const clearBtn = document.getElementById('clear-history-btn');
        if (clearBtn) clearBtn.classList.toggle('hidden', sessions.length === 0);
        sessions.sort((a, b) => b.timestamp - a.timestamp).forEach(s => {
            const item = document.createElement('div');
            item.className = `history-item ${s.id === currentSessionId ? 'active' : ''}`;
            item.innerHTML = `<i class="far fa-comment-alt"></i> <span>${s.title}</span>`;
            item.onclick = () => loadSession(s.id);
            historyList.appendChild(item);
        });
    }

    function loadSession(id) {
        if (!currentUser) return;
        const sessions = DB.getConversations(currentUser.email);
        const s = sessions.find(x => x.id === id);
        if (s) {
            currentSessionId = id;
            chatHistory = s.history;
            chatMessages.innerHTML = '';
            chatHistory.forEach(m => appendMessage(m.role === 'assistant' ? 'ai' : 'user', m.content));
            loadSessions();
        }
    }

    // --- Sidebar Settings UI ---
    const btnSettings = document.getElementById('open-settings-btn');
    const btnBackMain = document.getElementById('back-to-main');
    const sideMain = document.getElementById('sidebar-main-view');
    const sideSettings = document.getElementById('sidebar-settings-view');

    if (btnSettings) btnSettings.onclick = () => {
        if (sideMain) sideMain.classList.remove('active');
        if (sideSettings) sideSettings.classList.add('active');
    };
    if (btnBackMain) btnBackMain.onclick = () => {
        if (sideSettings) sideSettings.classList.remove('active');
        if (sideMain) sideMain.classList.add('active');
    };

    // --- Theme & Anim Dropdowns (Restore basic logic) ---
    function setupMenuDropdown(id, applyFn) {
        const dropdown = document.getElementById(id);
        if (!dropdown) return;
        const selected = dropdown.querySelector('.dropdown-selected');
        const options = dropdown.querySelectorAll('.option');
        if (selected) selected.onclick = (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('active');
        };
        options.forEach(opt => {
            opt.onclick = () => {
                const val = opt.getAttribute('data-theme') || opt.getAttribute('data-anim');
                applyFn(val);
                dropdown.classList.remove('active');
            };
        });
    }

    // Shared theme apply function used by both dropdowns
    function applyTheme(t) {
        if (!t) return;
        // Preserve other body classes (extreme-opt, etc.)
        const extraClasses = [...document.body.classList].filter(c => !c.startsWith('theme-'));
        document.body.className = extraClasses.join(' ');
        document.body.classList.add(`theme-${t}`);
        // Re-trigger mesh animation for the new theme
        const mesh = document.getElementById('background-mesh');
        if (mesh) { mesh.style.animation = 'none'; mesh.offsetHeight; mesh.style.animation = ''; }
        // Persist selection
        localStorage.setItem('snail-gpt-theme', t);
    }

    // Wire both home-page and sidebar theme dropdowns to the same apply function
    setupMenuDropdown('theme-dropdown', applyTheme);
    setupMenuDropdown('sidebar-theme-dropdown', applyTheme);

    setupMenuDropdown('anim-dropdown', (a) => {
        document.body.dataset.anim = a;
        localStorage.setItem('snail-gpt-anim', a);
    });

    // Restore saved theme on load
    const savedTheme = localStorage.getItem('snail-gpt-theme') || 'midnight';
    applyTheme(savedTheme);

    // --- Original GUI Settings Restored ---
    const devAccessBtn = document.getElementById('dev-access-btn');
    const devKeyContainer = document.getElementById('dev-key-container');
    const devTokenInput = document.getElementById('dev-token-override');

    // Toggle Developer Key Input
    if (devAccessBtn && devKeyContainer) {
        devAccessBtn.addEventListener('click', () => {
            devKeyContainer.classList.toggle('hidden');
            if (!devKeyContainer.classList.contains('hidden') && devTokenInput) {
                devTokenInput.focus();
            }
        });
    }

    if (devTokenInput) {
        // Pre-fill if exists
        devTokenInput.value = localStorage.getItem('snail-gpt-hf-token') || "";
        devTokenInput.addEventListener('change', () => {
            const val = devTokenInput.value.trim();
            if (val) {
                localStorage.setItem('snail-gpt-hf-token', val);
                alert("Developer Token saved.");
            } else {
                localStorage.removeItem('snail-gpt-hf-token');
                alert("Developer Token cleared.");
            }
        });
    }

    // Extreme Optimization Logic
    const optBtn = document.getElementById('extreme-opt-btn');
    if (optBtn) {
        const toggleOpt = (forceState = null) => {
            const isOpt = forceState !== null ? forceState : !document.body.classList.contains('extreme-opt');
            document.body.classList.toggle('extreme-opt', isOpt);

            // Visual toggle update (assuming the original used a class to show active state)
            if (isOpt) {
                optBtn.style.background = 'var(--primary)';
                optBtn.style.color = 'white';
            } else {
                optBtn.style.background = '';
                optBtn.style.color = '';
            }

            localStorage.setItem('snail-gpt-extreme-opt', isOpt);
        };

        optBtn.addEventListener('click', () => toggleOpt());

        // Initial Load
        const savedOpt = localStorage.getItem('snail-gpt-extreme-opt') === 'true';
        if (savedOpt) toggleOpt(true);
    }

    // --- Other Hooks ---
    if (sendBtn) sendBtn.onclick = sendMessage;
    if (stopBtn) stopBtn.onclick = () => currentAbortController?.abort();
    if (userInput) {
        userInput.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
        userInput.oninput = function () { this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px'; };
    }

    const btnNewChat = document.getElementById('new-chat-sidebar-btn');
    if (btnNewChat) {
        btnNewChat.onclick = () => {
            currentSessionId = null;
            chatHistory = [];
            if (chatMessages) chatMessages.innerHTML = '<div class="welcome-message"><h1>How can I assist your research?</h1></div>';
            loadSessions();
        };
    }

    const plusBtn = document.querySelector('.chat-input-wrapper .plus-btn');
    const plusMenu = document.querySelector('.chat-input-wrapper .plus-menu');
    if (plusBtn) plusBtn.onclick = (e) => { e.stopPropagation(); plusMenu?.classList.toggle('hidden'); };
    document.addEventListener('click', () => { if (plusMenu) plusMenu.classList.add('hidden'); });
    const navImg = document.getElementById('nav-image-gen');
    if (navImg) navImg.onclick = () => window.location.href = 'media.html';

    // --- Init ---
    if (currentUser) {
        router.navigate('app');
    } else {
        router.navigate('home');
    }
});
