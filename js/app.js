// API Configuration is handled securely via Vercel Serverless Functions (/api)

// UI Logic
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('page-' + pageId).classList.remove('hidden');
    document.getElementById('nav-' + pageId).classList.add('active');
    if (pageId === 'practica') {
        if (currentMode === 'flash') {
            updateFlashcardUI(currentCardIndex);
        } else {
            renderQuiz();
        }
    }
}

// Progress State
let currentProgress = JSON.parse(localStorage.getItem('nexum_stats')) || { retencion: 0, conceptos: 0, sesiones: 1 };
function saveStats() { localStorage.setItem('nexum_stats', JSON.stringify(currentProgress)); }
function updateStats() {
    document.getElementById('stat-retencion').innerText = currentProgress.retencion;
    document.getElementById('stat-conceptos').innerText = currentProgress.conceptos;
    document.getElementById('stat-sesiones').innerText = currentProgress.sesiones;
}
updateStats();

// Initialize Icons
lucide.createIcons();

// File Upload Logic
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const infoEl = document.getElementById('file-info');
    infoEl.innerText = "Extrayendo texto...";
    
    try {
        let text = "";
        if (file.name.endsWith('.txt')) {
            text = await file.text();
        } else if (file.name.endsWith('.pdf')) {
            text = await extractTextFromPdf(file);
        } else if (file.name.endsWith('.docx')) {
            text = await extractTextFromDocx(file);
        }
        
        document.getElementById('doc-text').value = text;
        infoEl.innerText = `Extraídos ${text.length} caracteres. ¡Listo para analizar!`;
        infoEl.classList.add('text-emerald-400');
    } catch (e) {
        console.error(e);
        infoEl.innerText = "Error al leer el archivo.";
        infoEl.classList.add('text-red-400');
    }
}

async function extractTextFromPdf(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(" ") + "\n";
    }
    return text;
}

async function extractTextFromDocx(file) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
}

// Analysis Logic
let currentFlashcards = JSON.parse(localStorage.getItem('nexum_flashcards') || '[]');
let currentQuestions = JSON.parse(localStorage.getItem('nexum_questions') || '[]');
let currentQuestionIndex = 0;
let currentMode = 'flash';

function buildAnalyzePrompt(text) {
    return `Analiza el siguiente texto de estudio y devuélveme EXCLUSIVAMENTE un objeto JSON válido (sin texto antes o después, sin bloques de código markdown) con esta forma EXACTA:
{
  "summary": "string (resumen real con tus palabras, máximo 5 líneas)",
  "concepts": ["concepto 1", "concepto 2", "concepto 3"],
  "questions": [
    {
      "question": "string",
      "options": ["opción A", "opción B", "opción C"],
      "correctIndex": 0,
      "explanation": "string"
    },
    {
      "question": "string",
      "options": ["opción A", "opción B", "opción C"],
      "correctIndex": 1,
      "explanation": "string"
    }
  ],
  "flashcards": [
    { "front": "pregunta breve", "back": "respuesta breve" },
    { "front": "pregunta breve", "back": "respuesta breve" }
  ]
}
Reglas obligatorias:
- "concepts" debe tener EXACTAMENTE 3 elementos.
- "questions" debe tener EXACTAMENTE 2 elementos, cada uno con EXACTAMENTE 3 opciones.
- "correctIndex" debe ser 0, 1 o 2.
- "flashcards" debe tener EXACTAMENTE 2 elementos.
- Todo en español.
- No inventes hechos que no estén en el texto.
Texto a analizar:
"""
${text}
"""`;
}

async function analyzeText() {
    const text = document.getElementById('doc-text').value;
    const btn = document.getElementById('btn-analyze');

    if(text.length < 30) {
        alert("Por favor, ingresa al menos 30 caracteres para el análisis.");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Procesando...';
    lucide.createIcons();

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [
                    {
                        role: "system",
                        content: "Eres un asistente educativo que devuelve únicamente JSON válido siguiendo el esquema solicitado. Responde siempre en español."
                    },
                    { role: "user", content: buildAnalyzePrompt(text) }
                ]
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        
        const content = JSON.parse(data.choices[0].message.content);
        displayResults(content);

    } catch (error) {
        console.error("Analysis Error:", error);
        alert(`Error de Groq:\n${error.message}\n\nSi ves un error de 'rate limit' o 'JSON', intenta con un texto más corto o espera un minuto.`);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="wand-2" class="w-5 h-5"></i> Analizar con IA';
        lucide.createIcons();
    }
}

function displayResults(data) {
    document.getElementById('analyze-results').classList.remove('hidden');
    document.getElementById('res-summary').innerText = data.summary;
    
    const conceptContainer = document.getElementById('res-concepts');
    conceptContainer.innerHTML = '';
    data.concepts.forEach(c => {
        const el = document.createElement('div');
        el.className = 'p-5 nexum-glass rounded-2xl text-center font-bold text-slate-300 border-white/5 hover:border-violet-500/20 transition-all';
        el.innerText = c;
        conceptContainer.appendChild(el);
    });
    if (Array.isArray(data.questions)) {
        currentQuestions = data.questions;
        localStorage.setItem('nexum_questions', JSON.stringify(currentQuestions));
        currentQuestionIndex = 0;
    }
    if (Array.isArray(data.flashcards)) {
        localStorage.setItem('nexum_flashcards', JSON.stringify(data.flashcards));
    }
    currentProgress.conceptos += data.concepts.length;
    saveStats();
    updateStats();
}

function updateFlashcardUI(index) {
    const front = document.getElementById('card-front');
    const back = document.getElementById('card-back');
    if (!currentFlashcards || currentFlashcards.length === 0) {
        front.innerText = "No hay material todavía.";
        back.innerText = "Ve a Documento, analiza un texto y vuelve aquí.";
        return;
    }
    const card = currentFlashcards[index % currentFlashcards.length];
    front.innerText = card.front;
    back.innerText = card.back;
}

// Chat Logic
let chatHistory = [];
const PROFESSOR_SYSTEM = `Actúas como un profesor exigente de pensamiento crítico que conversa en español.
Tu trabajo:
- Cuestionas las ideas del estudiante.
- Detectas vaguedad y exiges precisión.
- Pides ejemplos concretos y contraejemplos.
- Señalas errores lógicos o factuales con claridad.
Reglas estrictas:
- NUNCA repitas respuestas anteriores ni rellenes con frases hechas.
- NUNCA elogies al estudiante sin una razón concreta.
- Sé claro, directo y desafiante.
- Máximo 2 a 3 líneas por respuesta.
- Responde siempre en español.`;

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const container = document.getElementById('chat-messages');
    const msg = input.value.trim();

    if(!msg) return;

    chatHistory.push({ role: "user", content: msg });
    
    const userDiv = document.createElement('div');
    userDiv.className = "flex justify-end";
    userDiv.innerHTML = `<div class="bg-violet-600 text-white p-4 rounded-2xl rounded-tr-none max-w-[80%] shadow-lg">${msg}</div>`;
    container.appendChild(userDiv);
    input.value = '';
    
    const loadingDiv = document.createElement('div');
    loadingDiv.className = "flex items-start gap-4";
    loadingDiv.innerHTML = `<div class="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0 border border-violet-500/30"><i data-lucide="brain" class="w-5 h-5 text-violet-400"></i></div><div class="nexum-glass p-4 rounded-2xl rounded-tl-none max-w-[80%] text-slate-300 animate-pulse">...</div>`;
    container.appendChild(loadingDiv);
    container.scrollTop = container.scrollHeight;
    lucide.createIcons();

    try {
        const apiMessages = [
            { role: "system", content: PROFESSOR_SYSTEM },
            ...chatHistory
        ];

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: apiMessages
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        
        const reply = data.choices[0].message.content.trim();
        chatHistory.push({ role: "assistant", content: reply });
        
        container.removeChild(loadingDiv);
        const botDiv = document.createElement('div');
        botDiv.className = "flex items-start gap-4";
        botDiv.innerHTML = `<div class="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0 border border-violet-500/30"><i data-lucide="brain" class="w-5 h-5 text-violet-400"></i></div><div class="nexum-glass p-4 rounded-2xl rounded-tl-none max-w-[80%] text-slate-300 leading-relaxed">${reply}</div>`;
        container.appendChild(botDiv);

    } catch (error) {
        console.error("Chat Error:", error);
        container.removeChild(loadingDiv);
        const errDiv = document.createElement('div');
        errDiv.className = "text-red-400 text-sm italic";
        errDiv.innerText = `(Error de Groq: ${error.message})`;
        container.appendChild(errDiv);
    }
    
    container.scrollTop = container.scrollHeight;
    lucide.createIcons();
}

function handleKeyPress(e) {
    if(e.key === 'Enter') sendMessage();
}

function clearChat() {
    chatHistory = [];
    document.getElementById('chat-messages').innerHTML = '';
}

// Practice UI & Logic
function flipCard(element) {
    if (!currentFlashcards || currentFlashcards.length === 0) return;
    if (!element) element = document.querySelector('.flashcard');
    element.classList.toggle('flipped');
}

let currentCardIndex = 0;
function nextCard(knewIt) {
    if (!currentFlashcards || currentFlashcards.length === 0) {
        alert("No hay flashcards aún. Analiza un texto en Documento primero.");
        return;
    }
    if (knewIt) {
        currentProgress.retencion = Math.min(100, currentProgress.retencion + 10);
    } else {
        currentProgress.retencion = Math.max(0, currentProgress.retencion - 5);
    }
    saveStats();
    updateStats();
    currentCardIndex++;
    const card = document.querySelector('.flashcard');
    card.classList.remove('flipped');
    setTimeout(() => {
        updateFlashcardUI(currentCardIndex);
    }, 300);
}

// ---------- Quiz ----------
function setPracticeMode(mode) {
    currentMode = mode;
    const flashEl = document.getElementById('flash-container');
    const quizEl = document.getElementById('quiz-container');
    const btnFlash = document.getElementById('btn-mode-flash');
    const btnQuiz = document.getElementById('btn-mode-quiz');
    if (mode === 'flash') {
        flashEl.classList.remove('hidden');
        quizEl.classList.add('hidden');
        btnFlash.className = 'px-6 py-2 rounded-xl text-sm font-bold transition-all bg-violet-600 text-white';
        btnQuiz.className = 'px-6 py-2 rounded-xl text-sm font-bold transition-all text-slate-400';
        updateFlashcardUI(currentCardIndex);
    } else {
        flashEl.classList.add('hidden');
        quizEl.classList.remove('hidden');
        btnFlash.className = 'px-6 py-2 rounded-xl text-sm font-bold transition-all text-slate-400';
        btnQuiz.className = 'px-6 py-2 rounded-xl text-sm font-bold transition-all bg-violet-600 text-white';
        renderQuiz();
    }
}
function renderQuiz() {
    const counter = document.getElementById('quiz-counter');
    const questionEl = document.getElementById('quiz-question');
    const optionsEl = document.getElementById('quiz-options');
    const feedbackEl = document.getElementById('quiz-feedback');
    const nextBtn = document.getElementById('quiz-next');
    feedbackEl.classList.add('hidden');
    feedbackEl.innerHTML = '';
    nextBtn.classList.add('hidden');
    optionsEl.innerHTML = '';
    if (!currentQuestions || currentQuestions.length === 0) {
        counter.innerText = '';
        questionEl.innerText = 'No hay preguntas todavía.';
        const hint = document.createElement('p');
        hint.className = 'text-slate-400';
        hint.innerText = 'Ve a Documento, analiza un texto y vuelve aquí.';
        optionsEl.appendChild(hint);
        return;
    }
    const q = currentQuestions[currentQuestionIndex % currentQuestions.length];
    counter.innerText = `Pregunta ${(currentQuestionIndex % currentQuestions.length) + 1} de ${currentQuestions.length}`;
    questionEl.innerText = q.question;
    q.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'w-full text-left p-4 rounded-xl border border-white/10 bg-white/5 hover:border-violet-500/40 hover:bg-violet-500/10 transition-all';
        btn.innerText = opt;
        btn.onclick = () => answerQuestion(i);
        optionsEl.appendChild(btn);
    });
}
function answerQuestion(selectedIndex) {
    const q = currentQuestions[currentQuestionIndex % currentQuestions.length];
    const optionsEl = document.getElementById('quiz-options');
    const feedbackEl = document.getElementById('quiz-feedback');
    const nextBtn = document.getElementById('quiz-next');
    const isCorrect = selectedIndex === q.correctIndex;
    Array.from(optionsEl.children).forEach((btn, i) => {
        btn.disabled = true;
        btn.classList.remove('hover:border-violet-500/40', 'hover:bg-violet-500/10');
        btn.classList.add('cursor-default', 'opacity-60');
        if (i === q.correctIndex) {
            btn.classList.remove('opacity-60');
            btn.className = 'w-full text-left p-4 rounded-xl border border-emerald-500/50 bg-emerald-500/15 text-emerald-200 font-semibold';
        } else if (i === selectedIndex) {
            btn.classList.remove('opacity-60');
            btn.className = 'w-full text-left p-4 rounded-xl border border-red-500/50 bg-red-500/10 text-red-300 font-semibold';
        }
    });
    feedbackEl.classList.remove('hidden');
    feedbackEl.className = `p-5 rounded-2xl border space-y-2 ${
        isCorrect
            ? 'border-emerald-500/40 bg-emerald-500/10'
            : 'border-red-500/40 bg-red-500/10'
    }`;
    feedbackEl.innerHTML = `
        <p class="font-bold ${isCorrect ? 'text-emerald-300' : 'text-red-300'}">${isCorrect ? '¡Correcto!' : 'Incorrecto'}</p>
        <p class="text-slate-200 leading-relaxed">${q.explanation}</p>
    `;
    nextBtn.classList.remove('hidden');
    if (isCorrect) {
        currentProgress.retencion = Math.min(100, currentProgress.retencion + 10);
    } else {
        currentProgress.retencion = Math.max(0, currentProgress.retencion - 5);
    }
    saveStats();
    updateStats();
}
function nextQuestion() {
    currentQuestionIndex++;
    renderQuiz();
}

// Initialize
showPage('panel');
