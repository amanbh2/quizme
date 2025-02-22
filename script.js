let questions = [];
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
    currentQuestionIndex = 0;
    showQuestion();
}

function showQuestion() {
    const quizContainer = document.getElementById("quiz-container");
    quizContainer.innerHTML = "";

    if (currentQuestionIndex >= questions.length) {
        quizContainer.innerHTML = `<h2>Quiz Completed!</h2>`;
        return;
    }

    const questionData = questions[currentQuestionIndex];
    const questionDiv = document.createElement("div");

    questionDiv.innerHTML = `
        <p class="question">${questionData.question}</p>
        <div class="choices">
            ${questionData.choices.map(choice => `
                <button onclick="checkAnswer('${choice}', '${questionData.answer}')">${choice}</button>
            `).join("")}
        </div>
    `;

    quizContainer.appendChild(questionDiv);
}

function checkAnswer(selectedChoice, correctAnswer) {
    const buttons = document.querySelectorAll(".choices button");

    buttons.forEach(button => {
        if (button.innerText === correctAnswer) {
            button.classList.add("correct");
        }
        if (button.innerText === selectedChoice && selectedChoice !== correctAnswer) {
            button.classList.add("wrong");
        }
        button.disabled = true;
    });

    setTimeout(() => {
        if (selectedChoice === correctAnswer) {
            currentQuestionIndex++;
            showQuestion();
        }
    }, 1000);
}

document.getElementById("restart-btn").addEventListener("click", startQuiz);
