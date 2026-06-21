# 🚀 Gemini Cockpit: QuizMe & BPSC CCE Prep

This file is the central memory bank and coordination dashboard between you and Gemini. It tracks the repository status, architecture, and BPSC preparation roadmap.

---

## 🗂️ Current Repository Structure & Proposal

We propose organizing the repository using a **Hybrid Layout** (keeping frontend app files at the root to avoid breaking the PWA and service worker scope, while isolating study materials):

```
quizme/
├── index.html                  # Frontend Shell
├── script.js                   # Application Logic (Stats, Bookmarks, Audio)
├── style.css                   # Custom Vanilla Styles
├── sw.js                       # Offline Caching Service Worker
├── manifest.json               # Web App Manifest
├── README.md                   # Core App Readme
├── GEMINI.md                   # Coordination Cockpit (This file)
│
├── res/                        # Web App Assets (Icons, favicons)
├── data/                       # Generated Subject JSONs (BiharEconomy.json, etc.)
│   └── timeline/               # Isolated Timeline folder
│       └── timeline.json       # Unified BCE and CE timeline database
│
├── control/                    # Developer CLI Toolchain (Python)
│   ├── generateQsJSON.py       # Excel -> JSON conversion script
│   ├── generateQsCSV.py        # CSV -> JSON conversion script
│   ├── generateTimelineJSON.py # Excel -> Timeline JSON converter script
│   ├── manifest.json           # Registry of data JSONs (excludes timeline.json)
│   ├── qid_counter.json        # Counter tracking QIDs
│   ├── tag_rules.json          # Keyword -> Tag mappings for autotagging
│   └── symlinks/               # Subject spreadsheets and CSV databases (symlinked here)
│       ├── ObjectiveQuestions.xlsx
│       └── History_Timelines_2026.xlsx
│
└── knowledge-base/             # Subject-wise study notes (Markdown)
    ├── bihar-specific/         # Geography, History, Economy of Bihar
    ├── history/                # Ancient, Medieval, and Modern Indian History
    │   ├── ancient-history/    # Ancient history checklist & notes
    │   ├── medieval-history/   # Medieval history checklist & notes
    │   └── modern-history/     # Modern history checklist & notes
    ├── geography/              # Physical & Indian Geography
    │   └── topics.md           # Geography topic checklist & tracker (with NCERT refs)
    ├── polity/                 # Indian Constitution & Governance
    │   └── topics.md           # Polity topic checklist & tracker
    ├── economy/                # Economics core, Budget & Economic Survey
    └── reports-surveys/        # Reports, Surveys, and Censuses (India & Bihar)
        ├── README.md           # Reports Index README
        ├── census/             # Census checklists and notes
        │   ├── topics.md       # Census topic checklist & PYQ tracker
        │   └── notes/          # India & Bihar Census 2011 notes
        ├── economic-survey/    # Economic Survey reports (India & Bihar)
        │   └── notes/          # India & Bihar Economic Survey 2025-26 notes
        ├── nfhs-6/             # National Family Health Survey 6
        │   └── notes/          # NFHS-6 health survey notes
        └── budget/             # Budgets (Union & Bihar)
            └── notes/          # Union & Bihar Budget 2026-27 notes
```

---

## 📊 BPSC CCE Prelims Syllabus & Quiz Database Map

Your CSV files currently map to the following JSON counts (from [database.txt](file:///c:/Users/amanb/Dev/quizme/data/database.txt)):

| Subject Area / JSON | MCQ Count | Tag Rule in `control/tag_rules.json` | Study Notes Status | Syllabus Tag Alignment |
| :--- | :---: | :--- | :---: | :---: |
| **Modern History** ([HistoryModern.json](file:///c:/Users/amanb/Dev/quizme/data/HistoryModern.json)) | **530** | `modernHistory` | `[ ]` Not Started | `[ ]` Pending |
| **Bihar Specific** ([BiharSpecific.json](file:///c:/Users/amanb/Dev/quizme/data/BiharSpecific.json)) | **539** | `biharHistory`, `biharCulture` | `[ ]` Not Started | `[ ]` Pending |
| **Polity** ([Polity.json](file:///c:/Users/amanb/Dev/quizme/data/Polity.json)) | **243** | `constitution`, `parliament`, etc. | `[ ]` Not Started | `[ ]` Pending |
| **Ancient History** ([HistoryAncient.json](file:///c:/Users/amanb/Dev/quizme/data/HistoryAncient.json)) | **158** | `ancientHistory` | `[ ]` Not Started | `[ ]` Pending |
| **Medieval History** ([HistoryMedieval.json](file:///c:/Users/amanb/Dev/quizme/data/HistoryMedieval.json)) | **117** | `medievalHistory` | `[ ]` Not Started | `[ ]` Pending |
| **Geography** ([Geography.json](file:///c:/Users/amanb/Dev/quizme/data/Geography.json)) | **91** | `rivers`, `mountains`, `climate` | `[x]` Complete | `[ ]` Pending |
| **Union Economy** ([UnionEconomy.json](file:///c:/Users/amanb/Dev/quizme/data/UnionEconomy.json)) | **96** | `economy`, `banking` | `[ ]` Not Started | `[ ]` Pending |
| **Bihar Economy** ([BiharEconomy.json](file:///c:/Users/amanb/Dev/quizme/data/BiharEconomy.json)) | **45** | `biharStats` (or explicit economy tags) | `[x]` Complete | `[ ]` Pending |
| **Census** ([Census.json](file:///c:/Users/amanb/Dev/quizme/data/Census.json)) | **57** | Specific topic tags | `[x]` Complete | `[x]` Aligned (Tag-Based) |
| **General Knowledge** ([GeneralKnowledge.json](file:///c:/Users/amanb/Dev/quizme/data/GeneralKnowledge.json)) | **35** | General keywords | `[ ]` Not Started | `[ ]` Pending |
| **History Timeline** ([timeline/timeline.json](file:///c:/Users/amanb/Dev/quizme/data/timeline/timeline.json)) | **635 (events)** | — | `[x]` Complete (Timeline Engine) | — |
| **Total Database** | **2127** | — | — | — |

---

## 🎯 Active Checklist & Progress Tracker

- [x] Merge the legacy Dashboard and Study & Prep Hub into a unified Study & Prep Hub home screen. Reorder tabs to: Prep, Timeline, Quiz, Stats, Settings, Info and update the Quiz icon to fa-graduation-cap.
- [x] Exchange Prep and Quiz icons (Prep = fa-graduation-cap, Quiz = fa-list-check), update Stats icon to fa-chart-line, and add sliding slider transitions to Timeline era selection.
- [x] Add a Danger Zone panel in the Settings tab to wipe local storage, unregister Service Workers, delete CacheStorage caches, and reload the application from the network.
- [x] Drop the separate Stats tab completely, relocating stats health alerts to the Prep hub and data management/reset options to the Settings tab.
- [x] Add the "Exclude Flagged Questions" toggle under settings to prevent flagged questions (typos/irrelevant) from appearing in active quiz sessions.
- [x] Replace the flagging button exclamation icon with standard regular/solid bookmark (fa-bookmark) state changes.
- [x] Add a dynamic flagged questions list in the Settings tab (complete with individual question copy-text and unflag actions).
- [x] Regroup Reset MCQ Statistics and Wipe App buttons under a unified Danger Zone card with clear descriptive differences and outline button styling.
- [x] Add a copy button to quiz question cards to easily copy the MCQ question text.
- [x] Remove Gist sync and backup functionality completely from the application and settings panel.



---

## 📚 Personal Book Library & Reference Preferences

These are the primary books owned/preferred by the user. When generating references for the topics checklist, prioritize referencing these books first. If a topic is not covered in these books, fallback to other standard books (like Tamil Nadu Board for Ancient/Medieval history) or NCERT/Internet/AI.

| Subject Area | Book Title | Author / Source | Citation Prefix |
| :--- | :--- | :--- | :--- |
| **Ancient History** | *India's Ancient Past* (Preferred over TN Board) | R.S. Sharma | `RS Sharma` (e.g., `RS Sharma Ch.5`) |
| **Medieval History** | *History of Medieval India* (Preferred over TN Board) | Satish Chandra | `Satish Chandra` (e.g., `Satish Chandra Ch.8`) |
| **Modern History** | *A Brief History of Modern India* | Spectrum | `Spectrum` (e.g., `Spectrum Ch.12`) |
| **Polity** | *Indian Polity* | M. Laxmikanth | `Laxmikanth` (e.g., `Laxmikanth Ch.5`) |
| **Geography** | NCERT (Class 6-12) | NCERT | `FPG Ch.4`, `IPE Ch.3`, etc. |
| **Economy** | *Indian Economy* / NCERT | Ramesh Singh / NCERT | `Ramesh Singh` / `NCERT` |
| **Environment** | *Environment* | Shankar IAS | `Shankar IAS` |
| **Bihar-Specific** | State Board / Govt sources / Internet | Various | `Internet / AI` |

---

## 🧠 Memory & Context Protocol

> **Short Name**: This file can be referred to as **"cockpit"** in conversation (e.g., *"update the cockpit"*, *"check cockpit"*).

* **Proactive Reorganization Suggestions:** If any note files, checklists, or directories grow too large or unmanageable, Gemini will proactively recommend cleaner organizational methods (such as splitting files or creating subfolders).
* **Integrity & Synchronization:** During study sessions and edits, Gemini will check if updates impact other `.md` files (like checklist indexes, cross-references, or syllabus maps) and update them so that links and references do not become stale or broken.
* **Modular Notes Structure:** Detailed study notes must be kept in separate directories (e.g., in a `notes/` subfolder under each subject area) rather than directly in the checklists, keeping index files clean.
* **Persistent Updates:** If Gemini identifies any context, architecture decisions, study progress, or critical information that needs to be persisted for future reference, Gemini will automatically update the relevant coordination files (such as this one) or other documentation files and present the updates for review.
* **Analyzing and Integrating PYQs:** When the user shares Previous Year Questions (PYQs) to update topic checklists (like [topics.md](file:///c:/Users/amanb/Dev/quizme/knowledge-base/history/ancient-history/topics.md)), Gemini will:
  1. Analyze the questions to identify missing sub-topics or conceptual areas.
  2. Filter out questions that are too random or vague to fit logically into the syllabus.
  3. Integrate the missing topics into the checklist, ensuring they are placed in strict chronological/logical order.
  4. Avoid duplicating existing topics and preserve existing details.
* **Book References in Topic Checklists:** When adding a Book Reference column to topic checklists:
  - **Prioritize the Personal Book Library** (listed under the "Personal Book Library & Reference Preferences" section). Specifically, use **R.S. Sharma** (`RS Sharma`) for Ancient History and **Satish Chandra** (`Satish Chandra`) for Medieval History.
  - If a topic is not covered in the preferred books but is covered in **Tamil Nadu Board** books, use Tamil Nadu Board as a fallback.
  - If no standard book/NCERT reference exists for a topic (e.g., Bihar-specific facts, current affairs, or niche topics), use `Internet / AI` as the reference.
  - Provide **chapter-level references** wherever possible (e.g., `RS Sharma Ch.5`, `Laxmikanth Ch.5`, `Spectrum Ch.12`). Chapter numbers may vary across editions — the user will verify against book contents manually.
  - The goal is to give the user a **direct pointer** to what to read for each topic.
* **Tightly Linked Core Assets Alignment:** Study notes, MCQ questions, topics (syllabus checklists), and keyword tag rules are tightly linked. If any of these assets are updated, modified, or consolidated (e.g., combining syllabus topics), all related parts—including the tag mappings in `tag_rules.json`, column values in `topics.md`, and labels/logic in frontend code like `script.js`—must be proactively updated and aligned immediately to preserve system consistency.
* **Proactive Tag Rule Alignment:** When new topics, subjects, or checklist sections are added, edited, or restructured in the knowledge base, Gemini will proactively check and update the corresponding auto-tagging keys and keyword rules in `control/tag_rules.json` to keep them perfectly aligned.
* **History Timeline Management Protocol:** When updating the historical events spreadsheet and compiling it:
  - Run `python control/generateTimelineJSON.py` to compile the sheets.
  - Do NOT list `timeline.json` in `control/manifest.json`. It must remain isolated inside the `data/timeline/` folder so it does not interfere with the question databases.
  - The Service Worker pre-caches this file as a static shell asset via `STATIC_ASSETS` in `sw.js`. Bump the cache version (`CACHE_VERSION`) when changes occur.
* **Storage Limit & Harm Prevention Protocol:** If any new feature or change will utilize substantial browser storage (e.g., extensive `localStorage` caching) or has any potential to cause data corruption, performance degradation, or security risks, Gemini must explicitly flag this risk to the user beforehand. If the resource usage is confirmed to be minimal and completely safe (well under standard limits), Gemini will explicitly provide a "green flag" in its proposal.
* **Local Verification Preference:** Prefer not to verify changes by running a local server or using browser subagents (as it takes too much time). The agent should apply modifications and update the walkthrough, and the user will verify the changes manually and report back.
* **Syllabus & Question Sync Drill:** When finalising questions for a subject:
  1. The user will share the draft questions that cover the subject.
  2. Gemini will analyze these questions and update/add missing syllabus topics in the corresponding `topics.md` checklist file as necessary.
  3. The user will review, modify, or merge the checklist topics to finalise them.
  4. Once topics are finalised, Gemini will align keyword mappings in `tag_rules.json`, auto-tag the Excel/CSV database, and convert it to JSON.
* **Concise & High-Yield Study Notes Protocol:** Study notes must be kept concise, crisp, and optimized for quick exam review. Avoid bulky or wordy blocks of text that hamper readability, but ensure no essential details, data points, or tables are skipped. For comparative or highly statistical data, prefer structured comparison tables rather than long paragraphs.
