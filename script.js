let questions = [];
let usedIndexes = new Set();
let currentQuestionIndex = 0;

document.addEventListener("DOMContentLoaded", function () {
    fetch("data/all.json")
        .then(response => response.json())
        .then(data => {
            questions = data;
            startQuiz();
        })
        .catch(error => console.error("Error loading JSON:", error));
});

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
        quizContainer.innerHTML = `<h2>Quiz Completed!</h2>`;
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
