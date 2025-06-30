let questions = [];
let usedIndexes = new Set();
let currentQuestionIndex = 0;
let dataUrl = "data/all.json"; // Default

let availableSheets = [];

document.addEventListener("DOMContentLoaded", function () {
    fetch("control/manifest.json")
        .then(res => res.json())
        .then(sheets => {
            availableSheets = sheets.files; // <-- update here
            loadQuestions();
        });

    document.getElementById("settings-btn").addEventListener("click", function () {
        if (availableSheets.length === 0) return;

        const select = document.createElement("select");
        select.style.padding = "8px 12px";
        select.style.border = "1px solid #888";
        select.style.borderRadius = "6px";
        select.style.background = "#181818";
        select.style.color = "#fff";
        select.style.fontSize = "1rem";
        select.style.marginBottom = "10px";
        select.style.outline = "none";
        select.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
        select.style.width = "100%";
        select.style.marginTop = "10px";
        select.style.cursor = "pointer";

        availableSheets.forEach(sheet => {
            const option = document.createElement("option");
            option.value = sheet;
            option.textContent = sheet.replace('.json', '').toUpperCase();
            select.appendChild(option);
        });
        select.value = dataUrl.split('/').pop();

        const wrapper = document.createElement("div");
        wrapper.style.position = "fixed";
        wrapper.style.top = "50%";
        wrapper.style.left = "50%";
        wrapper.style.transform = "translate(-50%, -50%)";
        wrapper.style.background = "#222";
        wrapper.style.padding = "20px";
        wrapper.style.borderRadius = "10px";
        wrapper.style.zIndex = 1000;
        wrapper.style.color = "#fff";
        wrapper.appendChild(select);

        const btn = document.createElement("button");
        btn.textContent = "Load";
        btn.style.marginLeft = "10px";
        wrapper.appendChild(btn);

        btn.onclick = () => {
            dataUrl = "data/" + select.value;
            document.body.removeChild(wrapper);
            loadQuestions();
        };

        wrapper.addEventListener("click", e => e.stopPropagation());
        document.body.appendChild(wrapper);
        setTimeout(() => {
            document.body.addEventListener("click", function handler() {
                if (document.body.contains(wrapper)) {
                    document.body.removeChild(wrapper);
                }
                document.body.removeEventListener("click", handler);
            });
        }, 0);
    });
});

function loadQuestions() {
    fetch(dataUrl)
        .then(response => response.json())
        .then(data => {
            questions = data;
            const subjectElem = document.getElementById("subject");
            const fileName = dataUrl.split('/').pop().replace('.json', '');
            subjectElem.innerHTML = fileName.charAt(0).toUpperCase() + fileName.slice(1);
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

function showQuestion() {
    const quizContainer = document.getElementById("quiz-container");
    quizContainer.innerHTML = "";

    const streak = document.getElementById("streak");
    streak.innerHTML = `${usedIndexes.size} <i class="fa-solid fa-fire"></i> ${questions.length}`;
    
    currentQuestionIndex = getRandomIndex();
    
    if (currentQuestionIndex === -1) {
        quizContainer.innerHTML = `<h2>Quiz Completed! 🥳</h2>`;
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
