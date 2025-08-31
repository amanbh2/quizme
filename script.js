let questions = [];
let usedIndexes = new Set();
let currentQuestionIndex = 0;
let dataUrl = "data/all.json"; // Default

let availableSheets = [];

document.addEventListener("DOMContentLoaded", function () {
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

function launchStarConfetti() {
    const duration = 1.2 * 1000; // 1.2 seconds
    const animationEnd = Date.now() + duration;

    (function frame() {
        // Random star bursts
        confetti({
            particleCount: 6,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            shapes: ['star'],
        });
        confetti({
            particleCount: 6,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            shapes: ['star'],
        });

        if (Date.now() < animationEnd) {
            requestAnimationFrame(frame);
        }
    }());
}

function launchTomatoSplash() {
    confetti({
        particleCount: 40,
        spread: 90,
        startVelocity: 40,
        origin: { y: 0.6 }, // middle of screen
        colors: ['#ff6347', '#e32636', '#ff4500'], // tomato shades
        shapes: ['circle']
    });
}



function checkAnswer(button, selectedChoice, correctAnswer) {
    const buttons = document.querySelectorAll(".choices button");

    buttons.forEach(btn => {
        if (btn.innerText === correctAnswer.toString()) {
            btn.classList.add("correct");
        }
        if (btn.innerText === selectedChoice && selectedChoice !== correctAnswer.toString()) {
            btn.classList.add("wrong");
        }
        btn.disabled = true;
    });

    if (selectedChoice === correctAnswer.toString()) {
        // 🎉 Star confetti on correct answer
        launchStarConfetti();
        setTimeout(() => {
            showQuestion();
        }, 1500);
    } else {
        // 🍅 Tomato splash on wrong answer
        launchTomatoSplash();
    }
}

// Safely add event listener if element exists
const restartBtn = document.getElementById("restart-btn");
if (restartBtn) {
    restartBtn.addEventListener("click", startQuiz);
}
