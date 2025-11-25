// --- CONFIGURATION ---
const AUTHORIZED_EMAILS = ['docente@eduai.com', 'admin@eduai.com', 'test@eduai.com'];
const DB_NAME = 'EduAIDB';
const DB_VERSION = 1;

// --- STATE ---
let currentUser = localStorage.getItem('currentUser');
let db = null;

// --- INDEXED DB (File Database) ---
const FileDatabase = {
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => reject('Database error: ' + event.target.error);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('files')) {
                    db.createObjectStore('files', { keyPath: 'id', autoIncrement: true });
                }
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                resolve(db);
            };
        });
    },

    async addFile(fileObj) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['files'], 'readwrite');
            const store = transaction.objectStore('files');
            const request = store.add(fileObj);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getAllFiles() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['files'], 'readonly');
            const store = transaction.objectStore('files');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async deleteFile(id) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['files'], 'readwrite');
            const store = transaction.objectStore('files');
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
};

// --- NAVIGATION ---
const pages = document.querySelectorAll('.page');
const navLinks = document.querySelectorAll('.nav-links a');
const loginModal = document.getElementById('login-modal');

function navigateTo(pageId) {
    // Auth Check for Dashboard
    if (pageId === 'dashboard' && !currentUser) {
        showLoginModal();
        return;
    }

    // Update active page
    pages.forEach(page => {
        if (page.id === pageId) {
            page.classList.add('active');
            if (pageId === 'dashboard') loadFiles(); // Load files when entering dashboard
        } else {
            page.classList.remove('active');
        }
    });

    // Update active nav link
    navLinks.forEach(link => {
        if (link.dataset.page === pageId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const pageId = link.dataset.page;
        navigateTo(pageId);
    });
});

// --- AUTHENTICATION ---
function showLoginModal() {
    loginModal.classList.add('active');
}

function hideLoginModal() {
    loginModal.classList.remove('active');
    document.getElementById('login-error').textContent = '';
    document.getElementById('email-input').value = '';
    document.getElementById('password-input').value = '';
}

document.getElementById('login-btn').addEventListener('click', () => {
    const email = document.getElementById('email-input').value.trim().toLowerCase();
    const password = document.getElementById('password-input').value.trim();
    const errorMsg = document.getElementById('login-error');

    if (AUTHORIZED_EMAILS.includes(email) && password.length > 0) {
        currentUser = email;
        localStorage.setItem('currentUser', email);
        hideLoginModal();
        navigateTo('dashboard');
    } else {
        if (!password) {
            errorMsg.textContent = 'Si us plau, introdueix la contrasenya.';
        } else {
            errorMsg.textContent = 'Accés denegat. Correu no autoritzat.';
        }
    }
});

// Close modal on outside click
loginModal.addEventListener('click', (e) => {
    if (e.target === loginModal) hideLoginModal();
});

// Logout Logic
document.getElementById('logout-btn').addEventListener('click', () => {
    currentUser = null;
    localStorage.removeItem('currentUser');
    navigateTo('home');
});

// --- FILE UPLOAD & MANAGEMENT ---
const fileInput = document.getElementById('file-upload');
const fileList = document.getElementById('file-list');
const activeTopicsCount = document.getElementById('active-topics-count');

fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);

    for (const file of files) {
        const content = await readFileContent(file);
        const fileObj = {
            name: file.name,
            type: file.type,
            size: file.size,
            content: content, // Store text content for AI
            date: new Date().toISOString()
        };

        await FileDatabase.addFile(fileObj);
    }

    loadFiles();
    fileInput.value = ''; // Reset input
});

async function readFileContent(file) {
    if (file.type === 'application/pdf') {
        return await readPdfContent(file);
    } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
        return await readDocxContent(file);
    } else {
        // Default to text for everything else (including .txt)
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsText(file);
        });
    }
}

async function readPdfContent(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
    }

    return fullText;
}

async function readDocxContent(file) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return result.value;
}

async function loadFiles() {
    if (!db) await FileDatabase.init();
    const files = await FileDatabase.getAllFiles();

    fileList.innerHTML = '';
    activeTopicsCount.textContent = files.length;

    files.forEach(file => {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.innerHTML = `
            <div class="file-info">
                <i data-lucide="file-text" class="file-icon"></i>
                <span class="file-name">${file.name}</span>
            </div>
            <button class="delete-btn" onclick="deleteFile(${file.id})">
                <i data-lucide="trash-2"></i>
            </button>
        `;
        fileList.appendChild(div);
    });

    lucide.createIcons();
}

window.deleteFile = async (id) => {
    if (confirm('Estàs segur de voler eliminar aquest arxiu?')) {
        await FileDatabase.deleteFile(id);
        loadFiles();
    }
};

// --- CHAT LOGIC (AI) ---
const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

// Predefined responses
const staticKnowledgeBase = [
    {
        keywords: ['hola', 'bon dia', 'salut'],
        response: "Hola! Soc el teu assistent educatiu. En què et puc ajudar avui?"
    },
    {
        keywords: ['ia', 'intel·ligència artificial', 'què és'],
        response: "La Intel·ligència Artificial (IA) és una branca de la informàtica que busca crear sistemes capaços de realitzar tasques que normalment requereixen intel·ligència humana."
    },
    {
        keywords: ['educació', 'escola', 'aprendre'],
        response: "La IA en l'educació pot personalitzar l'aprenentatge i oferir tutoria 24/7."
    },
    {
        keywords: ['riscos', 'perills'],
        response: "Alguns riscos inclouen la privacitat de les dades i el biaix algorítmic."
    },
    {
        keywords: ['autor', 'treball'],
        response: "Aquest és un Treball de Recerca sobre l'impacte de la IA en l'educació."
    }
];

function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender);

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    contentDiv.textContent = text;

    const metaDiv = document.createElement('div');
    metaDiv.classList.add('message-meta');
    const now = new Date();
    metaDiv.textContent = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;

    messageDiv.appendChild(contentDiv);
    messageDiv.appendChild(metaDiv);

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function getBotResponse(input) {
    const lowerInput = input.toLowerCase();

    // 1. Check Static Knowledge Base
    const staticMatch = staticKnowledgeBase.find(item =>
        item.keywords.some(keyword => lowerInput.includes(keyword))
    );

    if (staticMatch) return staticMatch.response;

    // 2. Check Uploaded Files (RAG Simulation)
    if (!db) await FileDatabase.init();
    const files = await FileDatabase.getAllFiles();

    // Simple search: check if any file content contains the keywords from the input
    // We split input into words and check if significant words appear in file content
    const words = lowerInput.split(' ').filter(w => w.length > 3); // Filter short words

    for (const file of files) {
        const contentLower = file.content.toLowerCase();
        // Check if significant words match
        const matchCount = words.filter(w => contentLower.includes(w)).length;

        if (matchCount > 0 && matchCount >= words.length * 0.5) { // If 50% of words match
            // Extract a snippet
            const index = contentLower.indexOf(words[0]);
            const snippet = file.content.substring(Math.max(0, index - 50), Math.min(file.content.length, index + 200));
            return `Basat en el document "${file.name}": ...${snippet}...`;
        }
    }

    return "Ho sento, no tinc informació sobre això en la meva base de dades ni en els arxius pujats.";
}

async function handleSendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    userInput.value = '';

    // Simulate thinking
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message bot';
    loadingDiv.innerHTML = '<div class="message-content">...</div>';
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    setTimeout(async () => {
        chatMessages.removeChild(loadingDiv);
        const response = await getBotResponse(text);
        addMessage(response, 'bot');
    }, 1000);
}

sendBtn.addEventListener('click', handleSendMessage);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSendMessage();
});

// Initialize
(async () => {
    await FileDatabase.init();
    lucide.createIcons();

    // Check if we are on dashboard and need auth (refresh case)
    if (window.location.hash === '#dashboard' && !currentUser) {
        navigateTo('home'); // Redirect to home if trying to deep link without auth
    }
})();
