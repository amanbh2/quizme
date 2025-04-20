import pandas as pd
import json

# Define input and output file paths
input_file = r'C:\Users\amanb\OneDrive\Documents\ObjectiveQuestions.xlsx'
output_file = "data/all.json"

# Load the Excel file to get sheet names
excel_file = pd.ExcelFile(input_file)
sheet_names = excel_file.sheet_names

# Show available sheets
print("Available sheets:")
for idx, sheet in enumerate(sheet_names):
    print(f"{idx + 1}. {sheet}")

# Ask user what to do
choice = input("Enter sheet number to process, or type 'all' to process all sheets: ").strip()

# Prepare to collect quiz data
quiz_data = []
question_id = 1  # Start ID from 1

def process_sheet(sheet_name):
    global question_id
    df = pd.read_excel(input_file, sheet_name=sheet_name)
    for _, row in df.iterrows():
        quiz_data.append({
            "id": question_id,
            "sheet": sheet_name,
            "question": row["Question"],
            "answer": row["Answer"],
            "choices": [row["Choice1"], row["Choice2"], row["Choice3"], row["Choice4"]]
        })
        question_id += 1

if choice.lower() == "all":
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

# Save as JSON
with open(output_file, "w", encoding="utf-8") as json_file:
    json.dump(quiz_data, json_file, indent=4, ensure_ascii=False)

print(f"\nJSON file saved to {output_file}")

