import pandas as pd
import json
import os
import re
import sys
from datetime import datetime
from tqdm import tqdm  # pip install tqdm
import subprocess

# ── Config ────────────────────────────────────────────────────
input_file  = r'C:\Users\amanb\OneDrive\Documents\ObjectiveQuestions.xlsx'
output_dir  = r"C:\Users\amanb\Dev\quizme\data"
GIT_AUTO_PUSH = False   # Set True to auto-commit & push to GitHub after conversion
GIT_REPO_DIR  = r"C:\Users\amanb\Dev\quizme"

os.makedirs(output_dir, exist_ok=True)

# ── Helpers ───────────────────────────────────────────────────
def sanitize_filename(name):
    return re.sub(r'[\\/*?:"<>|]', "_", name)

def normalize(text):
    """Lowercase + strip for duplicate detection."""
    return str(text).strip().lower()

def print_banner():
    print("\n" + "═" * 55)
    print("  QuizMe · Excel → JSON Converter")
    print(f"  {datetime.now().strftime('%d %b %Y  %H:%M:%S')}")
    print("═" * 55)

def print_section(title):
    print(f"\n── {title} {'─' * (50 - len(title))}")

# ── Load workbook ─────────────────────────────────────────────
print_banner()
print(f"\n📂 Loading: {input_file}")
try:
    excel_file = pd.ExcelFile(input_file)
except FileNotFoundError:
    print(f"\n❌  File not found: {input_file}")
    sys.exit(1)

sheet_names = excel_file.sheet_names

print_section("Available Sheets")
for idx, sheet in enumerate(sheet_names, 1):
    print(f"  {idx:>2}. {sheet}")

print("\nOptions:")
print("  • Enter a sheet number to process one sheet")
print("  • Type 'all'  to process all sheets")
print("  • Type 'stats' to show question counts without converting")
choice = input("\nYour choice: ").strip()

# ── Stats-only mode ───────────────────────────────────────────
if choice.lower() == "stats":
    print_section("Question Counts")
    grand_total = 0
    for sheet in sheet_names:
        try:
            df = pd.read_excel(input_file, sheet_name=sheet)
            valid = df.dropna(subset=["Question", "Answer", "Choice1", "Choice2", "Choice3", "Choice4"])
            print(f"  {sheet:<30} {len(valid):>4} questions")
            grand_total += len(valid)
        except Exception:
            print(f"  {sheet:<30}  (skipped — format error)")
    print(f"\n  {'TOTAL':<30} {grand_total:>4} questions")
    sys.exit(0)

# ── State ─────────────────────────────────────────────────────
quiz_data_by_sheet = {}
question_counts    = {}
all_quiz_data      = []
total_questions    = 0

# Validation report
warnings = []   # non-fatal issues
errors   = []   # rows skipped

REQUIRED = {"Question", "Answer", "Choice1", "Choice2", "Choice3", "Choice4"}

# ── Process one sheet ─────────────────────────────────────────
def process_sheet(sheet_name):
    df = pd.read_excel(input_file, sheet_name=sheet_name)

    # ── Column check ──────────────────────────────────────────
    missing_cols = REQUIRED - set(df.columns)
    if missing_cols:
        errors.append(f"Sheet '{sheet_name}': missing columns {missing_cols} — skipped entirely.")
        return

    info_col = next((c for c in df.columns if str(c).strip().lower() == "information"), None)
    sno_col  = next((c for c in df.columns if str(c).strip().lower() in ("s.no", "sno", "sr", "sr.no")), None)

    sheet_data     = []
    seen_questions = set()   # for duplicate detection within sheet
    skipped_rows   = 0

    for i, row in tqdm(df.iterrows(), total=len(df), desc=f"  {sheet_name}", ncols=70):
        row_id = f"Row {i+2}" if sno_col is None else f"S.No {row[sno_col]}"

        # ── Skip incomplete rows ───────────────────────────────
        required_vals = [row["Question"], row["Answer"],
                         row["Choice1"],  row["Choice2"],
                         row["Choice3"],  row["Choice4"]]
        if any(pd.isna(v) for v in required_vals):
            skipped_rows += 1
            errors.append(f"  Sheet '{sheet_name}' · {row_id}: missing required field — skipped.")
            continue

        # ── Answer must be one of the choices ─────────────────
        choices = [str(row["Choice1"]), str(row["Choice2"]),
                   str(row["Choice3"]), str(row["Choice4"])]
        answer  = str(row["Answer"])
        if answer not in choices:
            warnings.append(
                f"  Sheet '{sheet_name}' · {row_id}: answer '{answer}' "
                f"not found in choices — kept but CHECK THIS."
            )

        # ── Duplicate detection ────────────────────────────────
        q_norm = normalize(row["Question"])
        if q_norm in seen_questions:
            warnings.append(
                f"  Sheet '{sheet_name}' · {row_id}: duplicate question detected — kept first occurrence."
            )
            skipped_rows += 1
            continue
        seen_questions.add(q_norm)

        # ── Information field ──────────────────────────────────
        info_val = ""
        if info_col is not None:
            raw = row.get(info_col, None)
            if not pd.isna(raw):
                info_val = str(raw).strip()

        question_data = {
            "sheet":       sheet_name,
            "question":    str(row["Question"]).strip(),
            "answer":      answer.strip(),
            "choices":     [str(c).strip() for c in choices],
            "information": info_val
        }
        sheet_data.append(question_data)
        if choice.lower() == "all":
            all_quiz_data.append(question_data)

    question_counts[sheet_name] = len(sheet_data)
    quiz_data_by_sheet[sheet_name] = sheet_data

    if skipped_rows:
        print(f"    ⚠  {skipped_rows} row(s) skipped in '{sheet_name}'")

# ── Decide which sheets to process ───────────────────────────
if choice.lower() == "all":
    # Wipe existing JSONs cleanly
    removed = 0
    for f in os.listdir(output_dir):
        if f.endswith(".json"):
            os.remove(os.path.join(output_dir, f))
            removed += 1
    if removed:
        print(f"\n🗑  Removed {removed} old JSON file(s) from output directory.")

    print_section("Processing All Sheets")
    for sheet in sheet_names:
        process_sheet(sheet)
else:
    try:
        idx = int(choice) - 1
        if not (0 <= idx < len(sheet_names)):
            print("❌  Invalid sheet number.")
            sys.exit(1)
        selected = sheet_names[idx]
        print_section(f"Processing: {selected}")
        process_sheet(selected)
    except ValueError:
        print("❌  Invalid input.")
        sys.exit(1)

# ── Save individual JSONs ─────────────────────────────────────
print_section("Saving Files")
for sheet_name, data in quiz_data_by_sheet.items():
    out = os.path.join(output_dir, f"{sanitize_filename(sheet_name)}.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  ✅  {sanitize_filename(sheet_name)}.json  ({len(data)} questions)")

# ── Save combined all.json ────────────────────────────────────
if choice.lower() == "all":
    out = os.path.join(output_dir, "all.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(all_quiz_data, f, indent=2, ensure_ascii=False)
    print(f"  ✅  all.json  ({len(all_quiz_data)} questions total)")

# ── Save database.txt ─────────────────────────────────────────
db_file = os.path.join(output_dir, "database.txt")
with open(db_file, "w", encoding="utf-8") as f:
    f.write(f"Generated: {datetime.now().strftime('%d %b %Y %H:%M:%S')}\n\n")
    f.write("Question counts per sheet:\n")
    for name, count in question_counts.items():
        total_questions += count
        f.write(f"  {name}: {count}\n")
    f.write(f"\nTotal Questions: {total_questions}\n")
print(f"\n  📊  database.txt updated.")

# ── Validation report ─────────────────────────────────────────
if warnings or errors:
    print_section("Validation Report")
    if errors:
        print(f"\n  ❌  ERRORS ({len(errors)} — rows skipped):")
        for e in errors:
            print(f"    {e}")
    if warnings:
        print(f"\n  ⚠   WARNINGS ({len(warnings)} — kept but review):")
        for w in warnings:
            print(f"    {w}")
else:
    print("\n  ✅  No validation issues found.")

# ── Summary ───────────────────────────────────────────────────
print_section("Summary")
for name, count in question_counts.items():
    print(f"  {name:<30} {count:>4} questions")
print(f"\n  {'TOTAL':<30} {total_questions:>4} questions")

# ── Manifest ──────────────────────────────────────────────────
manifest_script = os.path.join(os.path.dirname(__file__), "createManifestFile.py")
if os.path.exists(manifest_script):
    subprocess.run(["python", manifest_script], check=True)
    print("\n  📋  Manifest file updated.")
else:
    print("\n  ⚠   createManifestFile.py not found — skipping manifest update.")

# ── Optional: Git auto-commit & push ─────────────────────────
if GIT_AUTO_PUSH:
    print_section("Git Push")
    try:
        subprocess.run(["git", "-C", GIT_REPO_DIR, "add", "data/"], check=True)
        msg = f"chore: update questions [{datetime.now().strftime('%d %b %Y %H:%M')}] — {total_questions} total"
        subprocess.run(["git", "-C", GIT_REPO_DIR, "commit", "-m", msg], check=True)
        subprocess.run(["git", "-C", GIT_REPO_DIR, "push"], check=True)
        print("  🚀  Pushed to GitHub successfully.")
        print(f"  🌐  Live at: https://amanbh2.github.io/quizme/")
    except subprocess.CalledProcessError as e:
        print(f"  ❌  Git push failed: {e}")
        print("      Run manually: cd quizme && git add data/ && git commit -m 'update' && git push")

print("\n" + "═" * 55 + "\n")