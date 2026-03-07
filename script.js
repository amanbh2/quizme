let questions = [];
let usedIndexes = new Set();
let currentQuestionIndex = 0;
let dataUrl = "data/all.json"; // Default
let questionStats = JSON.parse(localStorage.getItem('questionStats')) || {};
let lastVisitDate = localStorage.getItem('lastVisitDate');

let availableSheets = [];

// ── Theme toggle ──────────────────────────────────────────────
(function initTheme() {
    const saved = localStorage.getItem('quizme-theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
})();

document.addEventListener("DOMContentLoaded", function () {

    // Theme toggle
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon   = document.getElementById('theme-icon');

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('quizme-theme', theme);
        if (themeIcon) {
            themeIcon.className = theme === 'dark'
                ? 'fa-solid fa-sun'
                : 'fa-solid fa-moon';
        }
    }

    // Set icon on load
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(currentTheme);

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            applyTheme(current === 'dark' ? 'light' : 'dark');
        });
    }

    // ── Settings panel ────────────────────────────────────────
    const settingsBtn   = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const overlay       = document.querySelector('.overlay');
    const closeSettings = document.querySelector('.close-settings');
    const resetStatsBtn = document.getElementById('reset-stats');

    settingsBtn.addEventListener('click', () => {
        settingsPanel.classList.add('show');
        overlay.classList.add('show');
        updateStats();
    });

    closeSettings.addEventListener('click', () => {
        settingsPanel.classList.remove('show');
        overlay.classList.remove('show');
    });

    overlay.addEventListener('click', () => {
        settingsPanel.classList.remove('show');
        overlay.classList.remove('show');
    });

    resetStatsBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset all statistics? This cannot be undone.')) {
            localStorage.removeItem('questionStats');
            questionStats = {};
            updateStats();
        }
    });

    // ── Load manifest & questions ─────────────────────────────
    fetch("control/manifest.json")
        .then(res => res.json())
        .then(sheets => {
            availableSheets = sheets.files;
            createSubjectDropdown();
            loadQuestions();
        });
});

function createSubjectDropdown() {
    const subjectElem = document.getElementById("subject");
    subjectElem.innerHTML = "";

    const select = document.createElement("select");
    select.id = "subject-select";

    availableSheets.forEach(sheet => {
        const option = document.createElement("option");
        option.value = sheet;
        option.textContent = sheet.replace('.json', '').toUpperCase();
        select.appendChild(option);
    });
    select.value = dataUrl.split('/').pop();

    select.onchange = () => {
        dataUrl = "data/" + select.value;
        loadQuestions();
    };

    subjectElem.appendChild(select);
}

function loadQuestions() {
    fetch(dataUrl)
        .then(response => response.json())
        .then(data => {
            questions = data;
            startQuiz();
        })
        .catch(error => console.error("Error loading JSON:", error));
}

function startQuiz() {
    usedIndexes.clear();
    document.onkeydown = null;
    showQuestion();
}

function getRandomIndex() {
    if (usedIndexes.size === questions.length) return -1;
    let randomIndex;
    do {
        randomIndex = Math.floor(Math.random() * questions.length);
    } while (usedIndexes.has(randomIndex));
    usedIndexes.add(randomIndex);
    return randomIndex;
}

function shuffleArray(array) {
    let arr = array.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function updateProgressBar() {
    const progressBar   = document.getElementById('progress-bar');
    const progressLabel = document.getElementById('progress-label');
    if (!progressBar) return;
    const total    = questions.length || 1;
    const answered = usedIndexes.size;
    const percent  = Math.round((answered / total) * 100);
    progressBar.style.width = percent + "%";
    if (progressLabel) progressLabel.textContent = answered + '/' + total;
}

function showQuestion() {
    const quizContainer = document.getElementById("quiz-container");
    quizContainer.innerHTML = "";

    const streak = document.getElementById("streak");
    streak.innerHTML = `${usedIndexes.size} <i class="fa-solid fa-fire"></i> ${questions.length}`;

    updateProgressBar();

    currentQuestionIndex = getRandomIndex();

    if (currentQuestionIndex === -1) {
        quizContainer.innerHTML = `<h2>Perfect Score! 🎯</h2>`;
        return;
    }

    const questionData    = questions[currentQuestionIndex];
    const shuffledChoices = shuffleArray(questionData.choices);
    const keyLabels       = ['A', 'B', 'C', 'D'];

    const questionDiv = document.createElement('div');
    questionDiv.innerHTML = `
        <p class="question"></p>
        <div class="choices"></div>
    `;

    const infoParagraph = document.createElement('p');
    infoParagraph.className = 'information';
    infoParagraph.style.display = 'none';
    questionDiv.appendChild(infoParagraph);

    questionDiv.querySelector('.question').textContent = questionData.question;

    const choicesDiv = questionDiv.querySelector('.choices');
    shuffledChoices.forEach((choice, idx) => {
        const btn = document.createElement('button');
        btn.textContent = choice.toString();
        btn.setAttribute('data-key', keyLabels[idx] || String(idx + 1));
        btn.addEventListener('click', function () {
            checkAnswer(btn, choice.toString(), questionData.answer.toString());
        });
        choicesDiv.appendChild(btn);
    });

    quizContainer.appendChild(questionDiv);

    if (restartBtn) {
        restartBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Restart';
    }

    // Keyboard shortcuts: A B C D keys, R to restart
    document.onkeydown = function (e) {
        const keyMap = { 'a': 0, 'b': 1, 'c': 2, 'd': 3 };
        const pressed = e.key.toLowerCase();
        if (keyMap.hasOwnProperty(pressed)) {
            const buttons = document.querySelectorAll(".choices button");
            const idx = keyMap[pressed];
            if (buttons[idx] && !buttons[idx].disabled) buttons[idx].click();
        }
        if (pressed === 'r') startQuiz();
    };
}

function updateStats() {
    const totalAttempts = Object.values(questionStats).reduce((sum, s) => sum + s.attempts, 0);
    const totalCorrect  = Object.values(questionStats).reduce((sum, s) => sum + s.correct, 0);
    const successRate   = totalAttempts ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

    document.getElementById('total-attempts').textContent = totalAttempts;
    document.getElementById('total-correct').textContent  = totalCorrect;
    document.getElementById('success-rate').textContent   = successRate + '%';
}

function updateLastVisitedDate() {
    const el = document.getElementById('last-visited-date');
    if (el) el.textContent = new Date().toLocaleDateString();
}

window.onload = updateLastVisitedDate;

function checkAnswer(button, selectedChoice, correctAnswer) {
    const questionData = questions[currentQuestionIndex] || {};
    const buttons      = document.querySelectorAll(".choices button");
    const isCorrect    = selectedChoice === correctAnswer.toString();

    if (!questionStats[currentQuestionIndex]) {
        questionStats[currentQuestionIndex] = { attempts: 0, correct: 0 };
    }
    questionStats[currentQuestionIndex].attempts++;
    if (isCorrect) questionStats[currentQuestionIndex].correct++;

    localStorage.setItem('questionStats', JSON.stringify(questionStats));
    localStorage.setItem('lastVisitDate', new Date().toDateString());

    buttons.forEach(btn => {
        if (btn.innerText === correctAnswer.toString()) btn.classList.add("correct");
        if (btn.innerText === selectedChoice && !isCorrect) btn.classList.add("wrong");
        btn.disabled = true;
    });

    if (isCorrect) {
        setTimeout(showQuestion, 1000);
    } else {
        const infoEl = document.querySelector('.information');
        if (infoEl && questionData.information && questionData.information.toString().trim() !== '') {
            infoEl.textContent = questionData.information;
            infoEl.style.display = 'block';
        }
    }
}

const restartBtn = document.getElementById("restart-btn");
if (restartBtn) {
    restartBtn.addEventListener("click", () => startQuiz());
}