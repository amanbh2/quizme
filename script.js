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
    return array.sort(() => Math.random() - 0.5);
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
    
    updateProgressBar(); // <-- update progress bar here

    currentQuestionIndex = getRandomIndex();
    
    if (currentQuestionIndex === -1) {
        quizContainer.innerHTML = `<h2>Perfect Score! 🎯</h2>`;
        return;
    }
    
    const questionData = questions[currentQuestionIndex];
    const shuffledChoices = shuffleArray([...questionData.choices]);
    
    const questionDiv = document.createElement("div");
    
    questionDiv.innerHTML = `
        <p class="question">${questionData.question}</p>
        <div class="choices">
            ${shuffledChoices.map(choice => `
                <button onclick="checkAnswer(this, '${choice}', '${questionData.answer}')">${choice}</button>
            `).join("")}
        </div>
    `;
    
    quizContainer.appendChild(questionDiv);
}

function checkAnswer(button, selectedChoice, correctAnswer) {
    const buttons = document.querySelectorAll(".choices button");

    buttons.forEach(btn => {
        if (btn.innerText === correctAnswer) {
            btn.classList.add("correct");
        }
        if (btn.innerText === selectedChoice && selectedChoice !== correctAnswer) {
            btn.classList.add("wrong");
        }
        btn.disabled = true;
    });

    if (selectedChoice === correctAnswer) {
        setTimeout(() => {
            showQuestion();
        }, 1000);
    }
}

document.getElementById("restart-btn").addEventListener("click", startQuiz);
