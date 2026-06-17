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

---

## Command Modes

Both scripts present an interactive menu with the same commands:

```
convert     →  Assign QIDs + export JSONs + update manifest
autotag     →  Auto-tag untagged questions using tag_rules.json
stats       →  Show question counts per subject file
qid-report  →  Show QID health (max, active, gaps)  [read-only]
renumber    →  Full renumber all QIDs from Q00001 (requires resetting stats in app)
```

### Typical Workflow
1. Add/edit questions in your Excel sheets or CSV files inside `control/symlinks/`.
2. Run the corresponding script (`python generateQsJSON.py` or `python generateQsCSV.py`) and enter `convert`.
3. Optionally run `autotag` to auto-tag questions, then run `convert` again to build them into the final JSON files.
4. Git commit the updated code and files, then push!

---

## Dependencies
- **Excel script (`generateQsJSON.py`)** requires `openpyxl`:
  ```bash
  pip install openpyxl
  ```
- **CSV script (`generateQsCSV.py`)** has **no external dependencies** (uses standard Python libraries).