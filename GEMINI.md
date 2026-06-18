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
│
├── control/                    # Developer CLI Toolchain (Python)
│   ├── generateQsJSON.py       # Excel -> JSON conversion script
│   ├── generateQsCSV.py        # CSV -> JSON conversion script
│   ├── manifest.json           # Registry of data JSONs
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
    ├── polity/                 # Indian Constitution & Governance
    └── economy/                # Economics core, Budget & Economic Survey
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
| **Geography** ([Geography.json](file:///c:/Users/amanb/Dev/quizme/data/Geography.json)) | **91** | `rivers`, `mountains`, `climate` | `[ ]` Not Started |
| **Union Economy** ([UnionEconomy.json](file:///c:/Users/amanb/Dev/quizme/data/UnionEconomy.json)) | **51** | `economy`, `banking` | `[ ]` Not Started |
| **Bihar Economy** ([BiharEconomy.json](file:///c:/Users/amanb/Dev/quizme/data/BiharEconomy.json)) | **43** | `biharStats` (or explicit economy tags) | `[ ]` Not Started |
| **Census** ([Census.json](file:///c:/Users/amanb/Dev/quizme/data/Census.json)) | **38** | `census2011` | `[ ]` Not Started |
| **General Knowledge** ([GeneralKnowledge.json](file:///c:/Users/amanb/Dev/quizme/data/GeneralKnowledge.json)) | **35** | General keywords | `[ ]` Not Started |
| **Current Affairs 2025** ([Recent2025.json](file:///c:/Users/amanb/Dev/quizme/data/Recent2025.json)) | **373** | `currentAffairs` | `[ ]` Not Started |
| **Current Affairs 2026** ([Recent2026.json](file:///c:/Users/amanb/Dev/quizme/data/Recent2026.json)) | **128** | `currentAffairs` | `[ ]` Not Started |
| **Total Database** | **2231** | — | — |

---

## 🎯 Active Checklist & Progress Tracker

- [x] Create the `knowledge-base/history/ancient-history/` directory structure and [topics.md](file:///c:/Users/amanb/Dev/quizme/knowledge-base/history/ancient-history/topics.md).
- [x] Move all symlinks and CSV files to `control/` directory and create the new CSV conversion script.
- [x] Create directory structures and templates for `medieval-history` and `modern-history`.
- [x] Align and integrate ancient/prehistoric PYQs into the ancient [topics.md](file:///c:/Users/amanb/Dev/quizme/knowledge-base/history/ancient-history/topics.md) checklist in chronological order.
- [ ] Align tags in `control/tag_rules.json` with the structure of your notes.

---

## 🧠 Memory & Context Protocol

* If Gemini identifies any context, architecture decisions, study progress, or critical information that needs to be persisted for future reference, Gemini will automatically update the relevant `.md` files (such as this one) or other documentation files.
* All updates will be highlighted and presented to the user for review.

