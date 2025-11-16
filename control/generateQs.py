import pandas as pd
import json
import os
import re
from tqdm import tqdm  # pip install tqdm
import subprocess

# Define input and output directory paths
input_file = r'C:\Users\amanb\OneDrive\Documents\ObjectiveQuestions.xlsx'
output_dir = r"C:\Users\amanb\Dev\quizme\data"
os.makedirs(output_dir, exist_ok=True)  # Create output directory exists if it doesn't exist

# Load the Excel file to get sheet names
excel_file = pd.ExcelFile(input_file)
sheet_names = excel_file.sheet_names

# Display available sheets
print("Available sheets:")
for idx, sheet in enumerate(sheet_names):
    print(f"{idx + 1}. {sheet}")

# Ask user what to do
choice = input("Enter sheet number to process, or type 'all' to process all sheets: ").strip()

# Prepare to collect quiz data and counts
quiz_data_by_sheet = {}
question_counts = {}
total_questions = 0
all_quiz_data = []

def sanitize_filename(name):
    return re.sub(r'[\\/*?:"<>|]', "_", name)

def process_sheet(sheet_name):
    df = pd.read_excel(input_file, sheet_name=sheet_name)
    expected_columns = {"Question", "Answer", "Choice1", "Choice2", "Choice3", "Choice4"}
    # 'Information' column is optional, treat it case-insensitively and allow missing/NaN to pass
    if not expected_columns.issubset(df.columns):
        print(f"Sheet '{sheet_name}' is missing required columns. Skipping.")
        return
    sheet_data = []
    # detect an optional Information field in a case-insensitive way
    info_col = next((c for c in df.columns if str(c).strip().lower() == "information"), None)

    for _, row in tqdm(df.iterrows(), total=len(df), desc=f"Processing {sheet_name}"):
        # Skip rows with any NaN in required fields
        if (
            pd.isna(row["Question"]) or
            pd.isna(row["Answer"]) or
            pd.isna(row["Choice1"]) or
            pd.isna(row["Choice2"]) or
            pd.isna(row["Choice3"]) or
            pd.isna(row["Choice4"])
        ):
            continue
        # Safely read the optional information field; keep empty string when missing or NaN
        information_value = ""
        if info_col is not None and not pd.isna(row.get(info_col, None)):
            information_value = str(row[info_col])

        question_data = {
            "sheet": sheet_name,
            "question": row["Question"],
            "answer": row["Answer"],
            "choices": [row["Choice1"], row["Choice2"], row["Choice3"], row["Choice4"]]
            , "information": information_value
        }
        sheet_data.append(question_data)
        if choice.lower() == "all":
            all_quiz_data.append(question_data)
    
    question_counts[sheet_name] = len(sheet_data)
    quiz_data_by_sheet[sheet_name] = sheet_data

# Process sheets based on user choice
if choice.lower() == "all":
    # Delete all existing .json files in output_dir
    for filename in os.listdir(output_dir):
        if filename.endswith(".json"):
            os.remove(os.path.join(output_dir, filename))
    for sheet in sheet_names:
        print(f"Processing sheet: {sheet}")
        process_sheet(sheet)
else:
    try:
        sheet_index = int(choice) - 1
        if 0 <= sheet_index < len(sheet_names):
            selected_sheet = sheet_names[sheet_index]
            print(f"Processing sheet: {selected_sheet}")
            process_sheet(selected_sheet)
        else:
            print("Invalid sheet number.")
            exit(1)
    except ValueError:
        print("Invalid input. Please enter a number or 'all'.")
        exit(1)

# Save separate JSON files for each sheet
for sheet_name, data in quiz_data_by_sheet.items():
    output_file = os.path.join(output_dir, f"{sanitize_filename(sheet_name)}.json")
    with open(output_file, "w", encoding="utf-8") as json_file:
        json.dump(data, json_file, indent=4, ensure_ascii=False)
    print(f"JSON file saved to {output_file}")

# Save combined JSON file if 'all' was selected
if choice.lower() == "all":
    output_file = os.path.join(output_dir, "all.json")
    with open(output_file, "w", encoding="utf-8") as json_file:
        json.dump(all_quiz_data, json_file, indent=4, ensure_ascii=False)
    print(f"Combined JSON file saved to {output_file}")

# Save question counts to database.txt
database_file = os.path.join(output_dir, "database.txt")
with open(database_file, "w", encoding="utf-8") as txt_file:
    txt_file.write("Question counts:\n")
    for sheet_name, count in question_counts.items():
        txt_file.write(f"{sheet_name}: {count}\n")
        total_questions += count
    txt_file.write(f"Total Questions: {total_questions}\n")
print(f"Question counts saved to {database_file}")

# Print question counts
print("\nQuestion counts:")
for sheet_name, count in question_counts.items():
    print(f"{sheet_name}: {count}")
print(f"Total Questions: {total_questions}")

# Call createManifestFile.py to update manifest.json
manifest_script = os.path.join(os.path.dirname(__file__), "createManifestFile.py")
subprocess.run(["python", manifest_script], check=True)
print("Manifest file updated.")