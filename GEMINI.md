# 🚀 Gemini Cockpit: QuizMe & BPSC CCE Prep

This file is the central memory bank and coordination dashboard between you and Gemini. It tracks the repository status, architecture, and BPSC preparation roadmap.

---

## 🗂️ Current Repository Structure & Proposal

We propose organizing the repository using a **Hybrid Layout** (keeping frontend app files at the root to avoid breaking the PWA and service worker scope, while isolating study materials):

```
quizme/
├── index.html                  # Frontend Shell
├── script.js                   # Application Logic (Stats, Gist Sync, Audio)
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
    ├── science-tech/           # General Science & Technology notes
    ├── current-affairs/        # Monthly & Subject-wise current affairs notes
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

| Subject Area / JSON | MCQ Count | Tag Rule in `control/tag_rules.json` | Study Notes Status |
| :--- | :---: | :--- | :---: |
| **Modern History** ([HistoryModern.json](file:///c:/Users/amanb/Dev/quizme/data/HistoryModern.json)) | **530** | `modernHistory` | `[ ]` Not Started |
| **Bihar Specific** ([BiharSpecific.json](file:///c:/Users/amanb/Dev/quizme/data/BiharSpecific.json)) | **287** | `biharHistory`, `biharCulture` | `[ ]` Not Started |
| **Polity** ([Polity.json](file:///c:/Users/amanb/Dev/quizme/data/Polity.json)) | **217** | `constitution`, `parliament`, etc. | `[ ]` Not Started |
| **Science & Tech** ([Science.json](file:///c:/Users/amanb/Dev/quizme/data/Science.json)) | **160** | `science`, `technology` | `[ ]` Not Started |
| **Ancient History** ([HistoryAncient.json](file:///c:/Users/amanb/Dev/quizme/data/HistoryAncient.json)) | **158** | `ancientHistory` | `[ ]` Not Started |
| **Medieval History** ([HistoryMedieval.json](file:///c:/Users/amanb/Dev/quizme/data/HistoryMedieval.json)) | **117** | `medievalHistory` | `[ ]` Not Started |
| **Geography** ([Geography.json](file:///c:/Users/amanb/Dev/quizme/data/Geography.json)) | **91** | `rivers`, `mountains`, `climate` | `[x]` Complete |
| **Union Economy** ([UnionEconomy.json](file:///c:/Users/amanb/Dev/quizme/data/UnionEconomy.json)) | **51** | `economy`, `banking` | `[ ]` Not Started |
| **Bihar Economy** ([BiharEconomy.json](file:///c:/Users/amanb/Dev/quizme/data/BiharEconomy.json)) | **43** | `biharStats` (or explicit economy tags) | `[x]` Complete |
| **Census** ([Census.json](file:///c:/Users/amanb/Dev/quizme/data/Census.json)) | **38** | `census2011` | `[x]` Complete |
| **General Knowledge** ([GeneralKnowledge.json](file:///c:/Users/amanb/Dev/quizme/data/GeneralKnowledge.json)) | **35** | General keywords | `[ ]` Not Started |
| **Current Affairs 2025** ([Recent2025.json](file:///c:/Users/amanb/Dev/quizme/data/Recent2025.json)) | **373** | `currentAffairs` | `[ ]` Not Started |
| **Current Affairs 2026** ([Recent2026.json](file:///c:/Users/amanb/Dev/quizme/data/Recent2026.json)) | **128** | `currentAffairs` | `[ ]` Not Started |
| **History Timeline** ([timeline/timeline.json](file:///c:/Users/amanb/Dev/quizme/data/timeline/timeline.json)) | **635 (events)** | — | `[x]` Complete (Timeline Engine) |
| **Total Database** | **2231** | — | — |

---

## 🎯 Active Checklist & Progress Tracker

- [x] Create the `knowledge-base/history/ancient-history/` directory structure and [topics.md](file:///c:/Users/amanb/Dev/quizme/knowledge-base/history/ancient-history/topics.md).
- [x] Move all symlinks and CSV files to `control/` directory and create the new CSV conversion script.
- [x] Create directory structures and templates for `medieval-history` and `modern-history`.
- [x] Align and integrate ancient/prehistoric PYQs into the ancient [topics.md](file:///c:/Users/amanb/Dev/quizme/knowledge-base/history/ancient-history/topics.md) checklist in chronological order.
- [x] Create directory structures and template READMEs for `bihar-specific`, `geography`, `polity`, `economy`, `science-tech`, and `current-affairs` notes.
- [x] Align tags in `control/tag_rules.json` with the structure of your notes.
- [ ] Split checklist index files from detailed study notes (use `notes/` subfolders for modularity).
- [x] Create the `reports-surveys/` directory structure, fact-check the Census notes, and establish modular notes for India and Bihar Census 2011.
- [x] Create comprehensive Geography [topics.md](file:///c:/Users/amanb/Dev/quizme/knowledge-base/geography/topics.md) checklist (14 sections, ~249 topics, with NCERT chapter-level references).
- [x] Create the History Timeline tab featuring BCE/CE toggle, milestone quick jump bar, compressed layout, and offline support.
- [x] Isolate timeline database inside `data/timeline/` and update Python generator script.

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
* **Proactive Tag Rule Alignment:** When new topics, subjects, or checklist sections are added, edited, or restructured in the knowledge base, Gemini will proactively check and update the corresponding auto-tagging keys and keyword rules in `control/tag_rules.json` to keep them perfectly aligned.
* **History Timeline Management Protocol:** When updating the historical events spreadsheet and compiling it:
  - Run `python control/generateTimelineJSON.py` to compile the sheets.
  - Do NOT list `timeline.json` in `control/manifest.json`. It must remain isolated inside the `data/timeline/` folder so it does not interfere with the question databases.
  - The Service Worker pre-caches this file as a static shell asset via `STATIC_ASSETS` in `sw.js`. Bump the cache version (`CACHE_VERSION`) when changes occur.


