// --- CONFIGURATION ---
const AUTHORIZED_EMAILS = ['direccio@inslescincsenies.cat', 'tic@inslescincsenies.cat', 'capdedepartament@inslescincsenies.cat'];
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

// --- API CONFIGURATION (HARDCODED) ---
// Selecciona el proveïdor: 'gemini' o 'openai'
const API_PROVIDER = 'gemini';

// Posa aquí la teva clau API real (TU_CLAU_API_AQUI)
const API_KEY = 'AIzaSyAN8J05bp2VMKIEj3GI3xF5stViDlPPMgM';

// --- API CLIENTS ---
async function callGemini(prompt, apiKey) {
    let model = 'gemini-2.0-flash';
    let url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    let response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });

    let data = await response.json();

    if (data.error) {
        console.error("Gemini Error:", data.error);

        // Intentem llistar els models disponibles
        try {
            const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const listResp = await fetch(listUrl);
            const listData = await listResp.json();

            if (listData.models) {
                const modelNames = listData.models.map(m => m.name.split('/').pop()).join(', ');
                throw new Error(`Error de model (${model}). Models disponibles per a la teva clau: ${modelNames}`);
            }
        } catch (listError) {
            if (listError.message.includes('Models disponibles')) throw listError;
        }

        throw new Error(data.error.message + " (Verifica que l'API 'Generative Language API' estigui habilitada a Google Cloud Console)");
    }

    return data.candidates[0].content.parts[0].text;
}

async function callOpenAI(prompt, apiKey) {
    const url = 'https://api.openai.com/v1/chat/completions';
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }]
        })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content;
}

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
        keywords: ['agraïment', 'gràcies', 'gracies'],
        response: "De res! Estic aquí per ajudar-te amb tot el que necessitis."
    },
    {
        keywords: ['problemes', 'errors', 'precaucions'],
        response: "La IA pot cometre errors o donar informació incompleta; cal supervisió humana i ús responsable."
    },
    {
        keywords: ["assistent"],
        response: "L'assistent utilitza models d'IA per analitzar documents i generar respostes basades en el contingut carregat per docents."
    },
    {
        keywords: ['autor', 'treball'],
        response: "Aquest és un Treball de Recerca sobre l'impacte de la IA en l'educació i la seva aplicació a l'aula, amb la autoría de Eduardo Muñoz."
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

    // 2. Check for API Config
    if (!API_KEY || API_KEY === 'TU_CLAU_API_AQUI') {
        return "[Error de configuració]: La clau API no està configurada al codi (script.js).";
    }

    // 3. Gather Context (RAG Simulation)
    if (!db) await FileDatabase.init();
    const files = await FileDatabase.getAllFiles();

    if (files.length === 0) {
        return "No hi ha documents carregats per respondre a la teva pregunta. Si us plau, demana a un docent que pugui el material al panell de docents.";
    }

    let context = "";
    files.forEach(file => {
        context += `\n--- Document: ${file.name} ---\n${file.content}\n`;
    });

    // Truncar el context si és massa llarg per evitar càrregues útils enormes (heurística simple)
    if (context.length > 50000) context = context.substring(0, 50000) + "... [truncat]";

    const systemPrompt = `
        Ets un assistent educatiu intel·ligent de l'Institut Les Cinc Sénies.
        Tens accés a la següent informació de context extreta de documents docents:
        
        === CONTEXT ===
        ${context}
        === FI DEL CONTEXT ===

        Instruccions:
        1. Respon a la pregunta de l'usuari utilitzant la informació del context.
        2. Si la resposta es pot deduir del context, fes-ho.
        3. Respon sempre en Català, independentment de l'idioma de la pregunta.
        4. Sigues clar i didàctic.
        5. Si la pregunta no té cap relació amb el context proporcionat, digues: "No tinc informació suficient en els documents proporcionats per respondre aquesta pregunta."
        6. Si existeix text tipus "**text**" o "*text*" en el context, respon amb el text en negreta.
        7. Si existeix text tipus "~~text~~" en el context, respon amb el text en riscada.

        Pregunta de l'usuari: ${input}
        
        Resposta:
    `;

    // console.log("--- DEBUG CONTEXT ---");
    // console.log("Files found:", files.length);
    // console.log("Context length:", context.length);

    try {
        if (API_PROVIDER === 'gemini') {
            return await callGemini(systemPrompt, API_KEY);
        } else {
            return await callOpenAI(systemPrompt, API_KEY);
        }
    } catch (error) {
        console.error(error);
        return `Error connectant amb la IA: ${error.message}. Verifica la teva clau API.`;
    }
}

async function handleSendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    userInput.value = '';

    // Temps de pensament...
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

// Inicialitzar
(async () => {
    await FileDatabase.init();
    lucide.createIcons();

    // Comprovar si som al tauler de control i necessitem autenticació (actualitzar el cas)
    if (window.location.hash === '#dashboard' && !currentUser) {
        navigateTo('home'); // Redirecciona a la pàgina d'inici si s'intenta establir un enllaç profund sense autenticació.
    }
})();
