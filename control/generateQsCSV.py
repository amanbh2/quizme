# ═══════════════════════════════════════════════════════════════
#  generateQsCSV.py  —  QuizMe v5.0 (CSV-Only Edition)
#  Modes: convert | autotag | stats | qid-report | renumber
# ═══════════════════════════════════════════════════════════════

import os
import csv
import json
import re
import sys

# ── Paths ──────────────────────────────────────────────────────
BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
CONTROL_DIR   = BASE_DIR
SYMLINKS_DIR  = os.path.join(CONTROL_DIR, 'symlinks')
DATA_DIR      = os.path.abspath(os.path.join(BASE_DIR, '..', 'data'))
MANIFEST_PATH = os.path.join(CONTROL_DIR, 'manifest.json')
COUNTER_PATH  = os.path.join(CONTROL_DIR, 'qid_counter.json')
TAG_RULES_PATH= os.path.join(CONTROL_DIR, 'tag_rules.json')

# ── Expected Columns ───────────────────────────────────────────
EXPECTED_COLS = ['QID', 'Question', 'Answer', 'Choice1', 'Choice2', 'Choice3', 'Information', 'Tags']
QID_PATTERN   = re.compile(r'^Q\d{5}$')

# ── QID helpers ────────────────────────────────────────────────
def is_valid_qid(val):
    return bool(val and QID_PATTERN.match(str(val).strip()))

def format_qid(n):
    return f"Q{n:05d}"

def load_counter(existing_qids):
    """Load counter — always rebuild from CSV files max to be safe."""
    existing_nums = [int(q[1:]) for q in existing_qids if is_valid_qid(q)]
    max_from_csv = max(existing_nums, default=0)
    if os.path.exists(COUNTER_PATH):
        try:
            saved = json.load(open(COUNTER_PATH))
            max_from_file = saved.get('last', 0)
        except Exception:
            max_from_file = 0
    else:
        max_from_file = 0
    return max(max_from_csv, max_from_file)

def save_counter(n):
    json.dump({'last': n}, open(COUNTER_PATH, 'w'))

# ── CSV File Helpers ───────────────────────────────────────────
def read_csv_file(path):
    """Reads a CSV file returning list of headers and list of dict rows."""
    if not os.path.exists(path):
        return [], []
    with open(path, mode='r', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        try:
            headers = next(reader)
        except StopIteration:
            return [], []
        
        # Normalize headers (strip whitespace)
        headers = [h.strip() for h in headers]
        
        rows = []
        for row in reader:
            if len(row) < len(headers):
                row = row + [''] * (len(headers) - len(row))
            elif len(row) > len(headers):
                row = row[:len(headers)]
            rows.append(dict(zip(headers, row)))
        return headers, rows

def write_csv_file(path, headers, rows):
    """Writes list of dict rows to a CSV file."""
    with open(path, mode='w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            row_to_write = {h: row.get(h, '') for h in headers}
            writer.writerow(row_to_write)

def ensure_headers(headers):
    """Ensures all EXPECTED_COLS are in the list of headers."""
    new_headers = list(headers)
    for col in EXPECTED_COLS:
        if col not in new_headers:
            new_headers.append(col)
    return new_headers

# ── Tag helpers ────────────────────────────────────────────────
def load_tag_rules():
    if not os.path.exists(TAG_RULES_PATH):
        print(f"  ⚠  tag_rules.json not found at {TAG_RULES_PATH}")
        return {}
    return json.load(open(TAG_RULES_PATH, encoding='utf-8'))

def auto_tag_question(text, info, tag_rules):
    """Return comma-separated tags for a question based on rules."""
    combined = (str(text) + ' ' + str(info)).lower()
    matched  = []
    for tag, keywords in tag_rules.items():
        for kw in keywords:
            if kw.lower() in combined:
                matched.append(tag)
                break
    return ','.join(matched)

# ── MANIFEST ───────────────────────────────────────────────────
def create_manifest():
    files = [f for f in os.listdir(DATA_DIR)
             if f.endswith('.json') and os.path.isfile(os.path.join(DATA_DIR, f))]
    files.sort()
    if os.path.exists(MANIFEST_PATH):
        os.remove(MANIFEST_PATH)
    json.dump({"files": files}, open(MANIFEST_PATH, 'w', encoding='utf-8'), indent=2)
    print(f"  ✓  Manifest updated — {len(files)} file(s)")

# ── List CSV Files Helper ──────────────────────────────────────
def get_csv_files():
    """Lists CSV files in symlinks directory."""
    if not os.path.exists(SYMLINKS_DIR):
        return []
    return sorted([f for f in os.listdir(SYMLINKS_DIR) if f.endswith('.csv')])

# ═══════════════════════════════════════════════════════════════
#  MODE: CONVERT
# ═══════════════════════════════════════════════════════════════
def mode_convert():
    print("\n── CONVERT ────────────────────────────────────────────")
    csv_files = get_csv_files()
    if not csv_files:
        print(f"  ✗  No CSV files found in {SYMLINKS_DIR}")
        return

    os.makedirs(DATA_DIR, exist_ok=True)

    # Collect all existing QIDs across all CSV files first
    all_existing_qids = set()
    for f in csv_files:
        path = os.path.join(SYMLINKS_DIR, f)
        _, rows = read_csv_file(path)
        for r in rows:
            val = r.get('QID', '')
            if is_valid_qid(val):
                all_existing_qids.add(str(val).strip())

    counter = load_counter(all_existing_qids)
    all_questions = []
    assigned = 0
    duplicates = 0
    seen_qids = set()

    for f in csv_files:
        subject_name = f.replace('.csv', '')
        path = os.path.join(SYMLINKS_DIR, f)
        headers, rows = read_csv_file(path)
        if not rows: continue
        headers = ensure_headers(headers)
        updated_rows = []
        questions = []

        for r in rows:
            question = r.get('Question', '').strip()
            answer = r.get('Answer', '').strip()
            if not question: continue

            raw_qid = r.get('QID', '').strip()
            if not is_valid_qid(raw_qid): raw_qid = ''
            if raw_qid and raw_qid in seen_qids:
                print(f"  ⚠  Duplicate QID {raw_qid} in '{f}' — reassigning")
                raw_qid = ''
                duplicates += 1

            if not raw_qid:
                counter += 1
                raw_qid = format_qid(counter)
                r['QID'] = raw_qid
                assigned += 1

            seen_qids.add(raw_qid)
            choices = [answer] + [r.get(c, '').strip() for c in ['Choice1', 'Choice2', 'Choice3'] if r.get(c)]
            
            if not answer:
                updated_rows.append(r)
                continue

            questions.append({
                "qid":         raw_qid,
                "question":    question,
                "answer":      answer,
                "choices":     choices,
                "information": r.get('Information', '').strip(),
                "tags":        r.get('Tags', '').strip()
            })
            updated_rows.append(r)

        write_csv_file(path, headers, updated_rows)
        if questions:
            fname = subject_name + '.json'
            json.dump(questions, open(os.path.join(DATA_DIR, fname), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
            all_questions.extend(questions)
            print(f"  ✓  {fname} — {len(questions)} questions")

    # Save counter
    save_counter(counter)

    # Write all.json
    if all_questions:
        all_json_path = os.path.join(DATA_DIR, 'all.json')
        json.dump(all_questions, open(all_json_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        print(f"  ✓  all.json — {len(all_questions)} questions total")

    print(f"\n  ✓  {assigned} new QID(s) assigned")
    if duplicates:
        print(f"  ⚠  {duplicates} duplicate QID(s) detected and reassigned")

    create_manifest()
    print("\n  ✓  Convert complete\n")

# ═══════════════════════════════════════════════════════════════
#  MODE: AUTOTAG
# ═══════════════════════════════════════════════════════════════
def mode_autotag():
    print("\n── AUTOTAG ─────────────────────────────────────────────")
    tag_rules = load_tag_rules()
    if not tag_rules:
        print("  ✗  No tag rules loaded. Check tag_rules.json")
        return

    csv_files = get_csv_files()
    if not csv_files:
        print(f"  ✗  No CSV files found in {SYMLINKS_DIR}")
        return

    tagged  = 0
    skipped = 0

    for f in csv_files:
        path = os.path.join(SYMLINKS_DIR, f)
        headers, rows = read_csv_file(path)
        if not rows: continue
        headers = ensure_headers(headers)
        updated_rows = []

        for r in rows:
            question = r.get('Question', '').strip()
            if not question:
                updated_rows.append(r)
                continue

            existing_tag = r.get('Tags', '').strip()
            if existing_tag:
                skipped += 1
                updated_rows.append(r)
                continue

            info = r.get('Information', '').strip()
            new_tags = auto_tag_question(question, info, tag_rules)
            if new_tags:
                r['Tags'] = new_tags
                tagged += 1
            updated_rows.append(r)

        write_csv_file(path, headers, updated_rows)

    print(f"  ✓  {tagged} question(s) tagged")
    print(f"  ℹ  {skipped} question(s) skipped (already have tags)")
    print("\n  ✓  Autotag complete — review tags in CSV files before running convert\n")

# ═══════════════════════════════════════════════════════════════
#  MODE: STATS
# ═══════════════════════════════════════════════════════════════
def mode_stats():
    print("\n── STATS ───────────────────────────────────────────────")
    if not os.path.exists(DATA_DIR):
        print("  ✗  data/ folder not found. Run convert first.")
        return

    total = 0
    for f in sorted(os.listdir(DATA_DIR)):
        if not f.endswith('.json') or f == 'all.json':
            continue
        path = os.path.join(DATA_DIR, f)
        try:
            data = json.load(open(path, encoding='utf-8'))
            print(f"  {f.replace('.json',''):<30} {len(data):>5} questions")
            total += len(data)
        except Exception as e:
            print(f"  ✗  {f}: {e}")
    print(f"\n  {'TOTAL':<30} {total:>5} questions\n")

# ═══════════════════════════════════════════════════════════════
#  MODE: QID-REPORT
# ═══════════════════════════════════════════════════════════════
def mode_qid_report():
    print("\n── QID REPORT ──────────────────────────────────────────")
    csv_files = get_csv_files()
    if not csv_files:
        print(f"  ✗  No CSV files found in {SYMLINKS_DIR}")
        return

    qids = []
    for f in csv_files:
        path = os.path.join(SYMLINKS_DIR, f)
        _, rows = read_csv_file(path)
        for r in rows:
            val = r.get('QID', '')
            if is_valid_qid(val):
                qids.append(str(val).strip())

    if not qids:
        print("  ℹ  No valid QIDs found. Run convert first.\n")
        return

    nums    = sorted([int(q[1:]) for q in qids])
    max_num = nums[-1]
    active  = len(nums)
    full    = set(range(1, max_num + 1))
    gaps    = sorted(full - set(nums))

    print(f"\n  Max QID reached : Q{max_num:05d}")
    print(f"  Total assigned  : {max_num}")
    print(f"  Currently active: {active}")
    print(f"  Gaps (deleted)  : {len(gaps)}")

    # Visual bar
    bar_len    = 40
    filled     = round((active / max_num) * bar_len) if max_num > 0 else 0
    gap_filled = bar_len - filled
    print(f"\n  Q00001 {'█' * filled}{'░' * gap_filled} Q{max_num:05d}")
    print(f"         ■ {active} Active   □ {len(gaps)} Gaps\n")

    if gaps:
        gap_strs = [f"Q{g:05d}" for g in gaps]
        # Print in rows of 8
        print("  Gap QIDs:")
        for i in range(0, len(gap_strs), 8):
            print("    " + "  ".join(gap_strs[i:i+8]))
    print()

# ═══════════════════════════════════════════════════════════════
#  MODE: RENUMBER
# ═══════════════════════════════════════════════════════════════
def mode_renumber():
    print("\n── RENUMBER ────────────────────────────────────────────")
    print("""
  ⚠  FULL RENUMBER — this will change ALL QIDs in your CSV files.
  ─────────────────────────────────────────────────────────────────
  All existing QIDs will be reassigned sequentially from Q00001.

  YOU MUST manually reset statistics after this operation:
    → Open QuizMe → Stats tab → Reset All Statistics
    OR the app will detect orphaned stats and prompt you.

  Your Gist backup will also be outdated after renumber.
  ─────────────────────────────────────────────────────────────────
    """)
    confirm = input("  Type YES to proceed (anything else cancels): ").strip()
    if confirm != 'YES':
        print("  Cancelled.\n")
        return

    csv_files = get_csv_files()
    if not csv_files:
        print(f"  ✗  No CSV files found in {SYMLINKS_DIR}")
        return

    counter = 0
    for f in csv_files:
        path = os.path.join(SYMLINKS_DIR, f)
        headers, rows = read_csv_file(path)
        if not rows: continue
        headers = ensure_headers(headers)
        updated_rows = []

        for r in rows:
            question = r.get('Question', '').strip()
            if not question:
                updated_rows.append(r)
                continue
            counter += 1
            r['QID'] = format_qid(counter)
            updated_rows.append(r)

        write_csv_file(path, headers, updated_rows)

    save_counter(counter)

    print(f"\n  ✓  Renumber complete — {counter} questions renumbered Q00001–Q{counter:05d}")
    print("""
  ══════════════════════════════════════════════════════
  ⚠  ACTION REQUIRED IN QUIZME:
     Your statistics are now outdated.

     Open QuizMe → Stats tab → Reset All Statistics
     The app will detect and prompt you automatically.
  ══════════════════════════════════════════════════════
    """)
    run_convert = input("  Run convert now to update JSONs? (y/n): ").strip().lower()
    if run_convert == 'y':
        mode_convert()

# ═══════════════════════════════════════════════════════════════
#  MAIN MENU
# ═══════════════════════════════════════════════════════════════
def main():
    print("""
╔═══════════════════════════════════════╗
║       generateQsCSV.py   v5.0         ║
║  QuizMe Question Manager (CSV-Only)   ║
╚═══════════════════════════════════════╝

  What would you like to do?

  convert     →  Assign QIDs + export JSONs + update manifest
  autotag     →  Auto-tag untagged questions using tag_rules.json
  stats       →  Show question counts per CSV file
  qid-report  →  Show QID health (max, active, gaps)
  renumber    →  Full renumber all QIDs from Q00001 (needs stats reset)
    """)

    choice = input("  Enter mode: ").strip().lower()
    modes  = {
        'convert':    mode_convert,
        'autotag':    mode_autotag,
        'stats':      mode_stats,
        'qid-report': mode_qid_report,
        'renumber':   mode_renumber,
    }
    if choice in modes:
        modes[choice]()
    else:
        print(f"\n  ✗  Unknown mode: '{choice}'. Choose from: {', '.join(modes.keys())}\n")

if __name__ == '__main__':
    main()
