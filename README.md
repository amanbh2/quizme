<span class="version-badge">QuizMe v5.3</span>

# 🧠 Welcome to QuizMe

**QuizMe** is a personal multiple-choice question (MCQ) revision tool optimized for BPSC / UPSC Civil Services Prelims preparation. Track accuracy, practice weak topics, schedule with Spaced Repetition, and build real subject mastery — question by question.

---

## <i class="fa-solid fa-circle-question"></i> How to Answer Questions

Tap any option to submit your answer. Correct answers will automatically advance to the next question.
- **Auto-Advance timing**: 2.2 seconds (reduced to 1.5 seconds in Revision mode).
- **Wrong answers**: Displays the correct answer, the question explanation (if available), and a button to query **Perplexity AI** for detailed context.

### Keyboard Shortcuts
<table class="kb-table">
  <thead>
    <tr>
      <th>Key</th>
      <th>Action</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><kbd>A</kbd></td>
      <td>Select option A</td>
    </tr>
    <tr>
      <td><kbd>B</kbd></td>
      <td>Select option B</td>
    </tr>
    <tr>
      <td><kbd>C</kbd></td>
      <td>Select option C</td>
    </tr>
    <tr>
      <td><kbd>D</kbd></td>
      <td>Select option D</td>
    </tr>
    <tr>
      <td><kbd>R</kbd></td>
      <td>Start new practice session</td>
    </tr>
  </tbody>
</table>

### Flagging Questions
Tap the warning button `⚠` on any question card to flag it for manual review. Flagged questions are grouped and displayed inside the **Stats** tab, where they can be copied or individually reviewed.

---

## <i class="fa-solid fa-layer-group"></i> Quiz Modes

You can change practice modes instantly via the **⚙️ Settings** tab:

- **Normal Mode**: Uses weighted random selection where weaker questions (lower accuracy) appear more frequently.
- **Weak Mode**: Filters the database to only practice questions with accuracy below 60%, or questions never attempted.
- **Unseen Mode**: Practice only questions you have never attempted.
- **SRS Mode (Spaced Repetition System)**: Schedules questions dynamically based on memory retention intervals.
- **Revision Mode**: Rapid-fire practice containing only mastered questions (4+ consecutive correct). Auto-advances in 1.5 seconds. Stats are not recorded in this mode.

---

## <i class="fa-solid fa-chart-bar"></i> Understanding Your Stats

QuizMe aggregates attempts locally to calculate mastery metrics:

### Mastery Levels
- **Mastered**: 4+ consecutive correct answers.
- **Familiar**: 2 or 3 consecutive correct answers.
- **Learning**: Attempted, but not yet on a streak.
- **Not Seen**: Untouched questions.

### Accuracy Badges
- **New** (Teal): Never attempted.
- **Strong** (Green): Accuracy ≥ 75%.
- **Average** (Amber): Accuracy 50% - 74%.
- **Weak** (Red): Accuracy < 50%.
- **Stale** (Clock icon): Mastered, but not reviewed in 30+ days.

### Exam Readiness Score
A combined metric based on subject-wise coverage and mastery distribution. Target an readiness score of **75%** before exam day.

---

## <i class="fa-solid fa-palette"></i> Customize & Themes

Personalize your workspace with the built-in Theme Engine:

- **Preset Themes**: Toggle light/dark mode and choose from curated color presets:
  - **Warm Scholar**: Academic warm cream paper and forest teal (Default).
  - **Deep Indigo**: Professional deep blue and lavender contrast.
  - **Sunset Amber**: High-contrast solar amber.
  - **Modern Pink**: Contemporary rose-pink accent.
- **Custom Theme**: Pick custom **Accent**, **Background**, and **Text** colors using native color pickers under Settings.
- **Retractable Sidebar**: Collapse the left sidebar on desktop for a distraction-free view. Hovering over sidebar icons reveals tooltip labels.

---

## <i class="fa-solid fa-cloud-arrow-up"></i> Sync & Backup

Your statistics are saved locally on your device. Connect a free private **GitHub Gist** to back up and sync stats across devices safely:

> **Step 1 — Create a GitHub Token**  
> Visit `github.com/settings/tokens`, click *Generate new token (classic)*, check ONLY the `gist` scope, and copy your token.

> **Step 2 — Connect Gist in QuizMe**  
> Go to the **⚙️ Settings** tab inside QuizMe, paste your token, leave Gist ID blank, and click *Connect*. A private Gist is automatically created.

> **Step 3 — Add to Other Devices**  
> On your second device, paste the same token and the generated Gist ID to sync stats automatically. Syncing occurs in the background every 30 seconds.