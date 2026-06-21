# QuizMe — Developer Guide (Dual toolchain: Excel & CSV)

Personal MCQ revision tool. This README covers the Python toolchain for managing questions in both Excel and CSV formats.

---

## Folder Structure

```
quizme/
├── control/
│   ├── generateQsJSON.py   ← main Excel question manager script
│   ├── generateQsCSV.py    ← main CSV question manager script
│   ├── manifest.json       ← auto-generated, lists all JSON files
│   ├── qid_counter.json    ← tracks last assigned QID number
│   ├── tag_rules.json      ← keyword → tag mapping (you own and edit this)
│   └── symlinks/           ← symlinked spreadsheets and CSV files
│       ├── ObjectiveQuestions.xlsx
│       └── *.csv
├── data/
│   ├── all.json            ← all questions merged (auto-generated)
│   ├── BiharEconomy.json   ← one file per Excel sheet/CSV file (auto-generated)
│   └── ...
└── index.html              ← frontend app shell
```

---

## Schema Columns

Regardless of whether you use Excel (as sheets inside `ObjectiveQuestions.xlsx`) or CSV (as files inside `control/symlinks/`), both formats expect the following columns in the first row/header:

| Column | Required | Notes |
|--------|----------|-------|
| `QID` | Auto | Assigned by scripts. Never edit manually. Format: `Q00001` |
| `Question` | Yes | The question text |
| `Answer` | Yes | The correct choice option itself |
| `Choice1` | Yes | First incorrect option (distractor) |
| `Choice2` | Yes | Second incorrect option (distractor) |
| `Choice3` | Yes | Third incorrect option (distractor) |
| `Information` | Optional | Explanation shown after wrong answer. Add references here too. |
| `Tags` | Optional | Comma-separated camelCase tags e.g. `census2011,biharStats` |

- Each **Excel sheet** in `ObjectiveQuestions.xlsx` or **CSV file** in `control/symlinks/` compiles to its own JSON file in `data/` (e.g. `BiharEconomy.csv` or `Bihar Economy` sheet → `data/BiharEconomy.json`).
- Blank rows (no Question text) are automatically skipped.

---

## Running the Scripts

Navigate to the `control` directory in your terminal and run the toolchain:

### For Excel Workflow:
```bash
cd control
python generateQsJSON.py
```
This toolchain targets the `control/symlinks/ObjectiveQuestions.xlsx` spreadsheet file.

### For CSV Workflow:
```bash
cd control
python generateQsCSV.py
```
This toolchain targets any `control/symlinks/*.csv` files.

### For AI Enrichment (Gemini API):
```bash
cd control
$env:GEMINI_API_KEY="your_api_key_here"
python enrichQuestions.py
```
This script automates filling in missing answers, options, and explanations in your Excel sheet using Google's Gemini API. It targets the `control/symlinks/ObjectiveQuestions.xlsx` file.

---

## Command Modes & Selection

Both scripts present an interactive menu with the same command modes:

```
convert     →  Assign QIDs + export JSONs + update manifest
autotag     →  Auto-tag untagged questions using tag_rules.json
stats       →  Show question counts per subject file
qid-report  →  Show QID health (max, active, gaps)  [read-only]
renumber    →  Full renumber all QIDs from Q00001 (requires resetting stats in app)
```

### Selective Sheet & File Processing
When running `convert`, `autotag`, or `renumber`, the script will list all available worksheets (Excel) or CSV files (CSV) and prompt for selection.

#### Selection Syntax:
* **All sheets/files:** Press Enter or type `all`.
* **Single sheet/file:** Type a single index number (e.g. `3`).
* **Specific list:** Type comma-separated numbers (e.g. `1,3,5`).
* **Continuous range:** Type start and end indices separated by a hyphen (e.g. `2-5`).
* **Combined selection:** Mix list items and ranges (e.g. `1-3,5,7-9`).

#### Excluding Sheets/Files (e.g. `AncientHistoryPYQ`):
* If a sheet/file is **not selected** in `convert` mode, any previously compiled JSON file for it is deleted from the `data/` directory.
* The script then regenerates `all.json` and the `manifest.json` referencing ONLY the active, selected sheets.
* This allows you to temporarily or permanently exclude unready sheets (like `AncientHistoryPYQ` by selecting ranges like `1-2,4-14` in the Excel workflow menu) without deleting the original data from your spreadsheet.

---

## Typical Workflow
1. Add or edit questions in your master spreadsheet (e.g., in your Documents folder `C:\Users\amanb\OneDrive\Documents\ObjectiveQuestions.xlsx`, which is hard-linked to `control/symlinks/ObjectiveQuestions.xlsx`).
2. Run `python generateQsJSON.py`.
3. Choose `convert` and enter the sheets you want to compile (excluding any unready sheets by omitting their index).
4. If you have added new questions, you can optionally run `autotag` (supplying the selected sheet indices) to auto-tag them using `control/tag_rules.json`, then run `convert` again to generate updated database JSONs.
5. In QuizMe, if QIDs were renumbered, reset statistics under Settings.
6. Git commit the updated files and push!

---

## Dependencies
- **Excel script (`generateQsJSON.py`)** requires `openpyxl`:
  ```bash
  pip install openpyxl
  ```
- **CSV script (`generateQsCSV.py`)** has **no external dependencies** (uses standard Python libraries).
- **AI Enricher script (`enrichQuestions.py`)** requires `openpyxl` and `google-generativeai`:
  ```bash
  pip install openpyxl google-generativeai
  ```