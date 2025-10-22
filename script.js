let questions = [];
let usedIndexes = new Set();
let currentQuestionIndex = 0;
let dataUrl = "data/all.json"; // Default
let questionStats = JSON.parse(localStorage.getItem('questionStats')) || {};
let lastVisitDate = localStorage.getItem('lastVisitDate');

let availableSheets = [];

document.addEventListener("DOMContentLoaded", function () {
    // Initialize settings panel
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const overlay = document.querySelector('.overlay');
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
            localStorage.clear();
            questionStats = {};
            updateStats();
        }
    });

    fetch("control/manifest.json")
        .then(res => res.json())
        .then(sheets => {
            availableSheets = sheets.files;
            createSubjectDropdown();
            loadQuestions();
        });

    // Add progress bar to container
    const container = document.querySelector('.container');
    if (container && !document.getElementById('progress-bar-container')) {
        const progressBarContainer = document.createElement('div');
        progressBarContainer.id = 'progress-bar-container';
        const progressBar = document.createElement('div');
        progressBar.id = 'progress-bar';
        progressBarContainer.appendChild(progressBar);
        container.prepend(progressBarContainer);
    }
});

function createSubjectDropdown() {
    const subjectElem = document.getElementById("subject");
    subjectElem.innerHTML = ""; // Clear any existing content

    const select = document.createElement("select");
    select.id = "subject-select"; // For CSS targeting

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
    if (usedIndexes.size === questions.length) {
        return -1; // All questions have been used
    }
    
    let randomIndex;
    do {
        randomIndex = Math.floor(Math.random() * questions.length);
    } while (usedIndexes.has(randomIndex));
    
    usedIndexes.add(randomIndex);
    return randomIndex;
}

function shuffleArray(array) {
    // Fisher-Yates shuffle
    let arr = array.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function updateProgressBar() {
    const progressBar = document.getElementById('progress-bar');
    if (!progressBar) return;
    const total = questions.length || 1;
    const answered = usedIndexes.size;
    const percent = Math.round((answered / total) * 100);
    progressBar.style.width = percent + "%";
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

    const questionData = questions[currentQuestionIndex];
    const shuffledChoices = shuffleArray(questionData.choices);
    const questionDiv = document.createElement('div');
    questionDiv.innerHTML = `
        <p class="question"></p>
        <div class="choices"></div>
    `;
    questionDiv.querySelector('.question').textContent = questionData.question;

    const choicesDiv = questionDiv.querySelector('.choices');
    shuffledChoices.forEach(choice => {
        const btn = document.createElement('button');
        btn.textContent = choice.toString(); // Ensure string
        btn.addEventListener('click', function () {
            checkAnswer(btn, choice.toString(), questionData.answer.toString());
        });
        choicesDiv.appendChild(btn);
    });

    quizContainer.appendChild(questionDiv);

    // Add keyboard support
    document.onkeydown = function(e) {
        const keyMap = { 'a': 0, 'b': 1, 'c': 2, 'd': 3 };
        const pressed = e.key.toLowerCase();
        if (keyMap.hasOwnProperty(pressed)) {
            const buttons = document.querySelectorAll(".choices button");
            const idx = keyMap[pressed];
            if (buttons[idx] && !buttons[idx].disabled) {
                buttons[idx].click();
            }
        }
        // Restart quiz on 'r' key
        if (pressed === 'r') {
            startQuiz();
        }
    };
}

function updateStats() {
    const totalAttempts = Object.values(questionStats).reduce((sum, stat) => sum + stat.attempts, 0);
    const totalCorrect = Object.values(questionStats).reduce((sum, stat) => sum + stat.correct, 0);
    const successRate = totalAttempts ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

    document.getElementById('total-attempts').textContent = totalAttempts;
    document.getElementById('total-correct').textContent = totalCorrect;
    document.getElementById('success-rate').textContent = successRate + '%';
}

// Function to update last visited date
function updateLastVisitedDate() {
    const lastVisitedDateElement = document.getElementById('last-visited-date');
    const currentDate = new Date().toLocaleDateString();
    lastVisitedDateElement.textContent = currentDate;
}

// Call the function to set the last visited date on page load
window.onload = updateLastVisitedDate;

function checkAnswer(button, selectedChoice, correctAnswer) {
    const buttons = document.querySelectorAll(".choices button");
    const isCorrect = selectedChoice === correctAnswer.toString();

    // Track statistics
    if (!questionStats[currentQuestionIndex]) {
        questionStats[currentQuestionIndex] = { attempts: 0, correct: 0 };
    }
    questionStats[currentQuestionIndex].attempts++;
    if (isCorrect) {
        questionStats[currentQuestionIndex].correct++;
    }
    
    // Save to localStorage
    localStorage.setItem('questionStats', JSON.stringify(questionStats));
    localStorage.setItem('lastVisitDate', new Date().toDateString());

    buttons.forEach(btn => {
        if (btn.innerText === correctAnswer.toString()) {
            btn.classList.add("correct");
        }
        if (btn.innerText === selectedChoice && !isCorrect) {
            btn.classList.add("wrong");
        }
        btn.disabled = true;
    });

    if (isCorrect) {
        setTimeout(() => {
            showQuestion();
        }, 1000);
    }
}

// Safely add event listener if element exists
const restartBtn = document.getElementById("restart-btn");
if (restartBtn) {
    restartBtn.addEventListener("click", startQuiz);
}
