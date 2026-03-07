# QuizMe — Developer Guide

Personal MCQ revision tool. This README covers the Python toolchain for managing questions.

---

## Folder Structure

```
quizme/
├── control/
│   ├── generateQsJSON.py   ← main script (this file)
│   ├── manifest.json       ← auto-generated, lists all JSON files
│   ├── qid_counter.json    ← tracks last assigned QID number
│   └── tag_rules.json      ← keyword → tag mapping (you own and edit this)
├── data/
│   ├── all.json            ← all questions merged (auto-generated)
│   ├── BiharEconomy.json   ← one file per Excel sheet (auto-generated)
│   └── ...
└── ObjectiveQuestions.xlsx ← your source of truth (OneDrive)
```

---

## Excel Format

Your Excel file must have these columns in the header row:

| Column | Required | Notes |
|--------|----------|-------|
| `QID` | Auto | Assigned by script. Never edit manually. Format: `Q00001` |
| `Question` | Yes | The question text |
| `Answer` | Yes | Must exactly match one of Choice1–Choice4 |
| `Choice1` | Yes | First option |
| `Choice2` | Yes | Second option |
| `Choice3` | Yes | Third option |
| `Choice4` | Yes | Fourth option |
| `Information` | Optional | Explanation shown after wrong answer. Add references here too. |
| `Tags` | Optional | Comma-separated camelCase tags e.g. `census2011,biharStats` |

- Each **Excel sheet** becomes one JSON file in `data/`
- Sheet named `Bihar Economy` → `BiharEconomy.json`
- Blank rows (no Question text) are skipped automatically

---

## Running the Script

```bash
cd control
python generateQsJSON.py
```

An interactive menu appears. Choose a mode:

```
convert     →  Assign QIDs + export JSONs + update manifest
autotag     →  Auto-tag untagged questions using tag_rules.json
stats       →  Show question counts per sheet
qid-report  →  Show QID health (max, active, gaps)  [read-only]
renumber    →  Full renumber all QIDs from Q00001
```

---

## Modes Explained

### `convert` — Use this every time you add questions

What it does:
1. Opens `ObjectiveQuestions.xlsx`
2. Adds missing columns (`QID`, `Tags`, etc.) if not present
3. Assigns new QIDs to any blank QID cells (Q00001, Q00002…)
4. Detects and fixes duplicate QIDs (warns you, reassigns)
5. Exports each sheet to `data/SheetName.json`
6. Exports `data/all.json` (all questions merged)
7. Regenerates `control/manifest.json`
8. Saves updated QIDs back to your Excel file

**Run this after every batch of new questions.**

---

### `autotag` — Auto-tag untagged questions

What it does:
1. Reads `control/tag_rules.json`
2. Finds questions where `Tags` column is blank
3. Matches question text + information text against keyword rules
4. Writes matching tags back to the `Tags` column in Excel
5. **Never overwrites** manually set tags

After running autotag, review the tags in Excel before running `convert`.

---

### `stats` — Quick count

Shows how many questions are in each sheet. Useful for a quick sanity check.

---

### `qid-report` — QID health check (read-only)

Shows:
- Highest QID assigned (e.g. `Q00247`)
- How many are active vs deleted (gaps)
- Visual bar showing coverage
- Lists all gap QIDs

Does **not** modify any files.

---

### `renumber` — Full renumber (use with caution)

Reassigns all QIDs sequentially from `Q00001`. Use this if gaps have accumulated and you want a clean slate.

⚠ **After renumber you MUST reset statistics in the app:**
- Open QuizMe → Stats tab → Reset All Statistics
- Or the app will detect orphaned stats and prompt you

The script will warn you loudly and ask you to type `YES` to confirm.

---

## QID Counter

The counter is stored in `control/qid_counter.json`:
```json
{ "last": 247 }
```

If this file is missing, the script rebuilds it from the highest QID in your Excel file. You never need to edit this manually.

---

## Tag Rules (`control/tag_rules.json`)

Format:
```json
{
  "tagName": ["keyword one", "keyword two", "another phrase"],
  "census2011": ["census", "sex ratio", "literacy rate"]
}
```

Rules:
- Tag names are **camelCase single words** e.g. `census2011`, `biharGeography`
- Keywords are **case-insensitive** and matched against question + information text
- A question can match **multiple tags** — all are stored comma-separated
- Add new tags by editing this file directly, then run `autotag`
- Manually set tags in Excel are **never overwritten** by autotag

---

## Typical Workflow

```
1. Add questions to ObjectiveQuestions.xlsx (fill Question, Answer, Choices, Information)
2. python generateQsJSON.py → convert
3. python generateQsJSON.py → autotag   (optional, review tags in Excel)
4. python generateQsJSON.py → convert   (again, to export with tags)
5. git add data/ control/manifest.json
6. git commit -m "Add 20 Bihar Economy questions"
7. git push
```

---

## Common Issues

**"Excel not found"**
Check the `EXCEL_PATH` variable at the top of `generateQsJSON.py` matches your actual OneDrive path.

**Answer not in choices warning**
The `Answer` cell must match one of Choice1–Choice4 exactly (case-sensitive). Fix in Excel and re-run convert.

**Duplicate QID warning**
The script keeps the first occurrence and reassigns a new QID to the duplicate. Review the warned rows in Excel.

**App shows orphaned stats warning**
This means some QIDs in your stats no longer exist in the JSON files. Usually happens after deleting questions. Use the "Clean up" option in the app.

---

## Dependencies

```bash
pip install openpyxl
```

No other dependencies needed.