import pandas as pd
import json

def excel_to_json(excel_file, json_file):
    # Read the Excel file
    df = pd.read_excel(excel_file)
    
    # Convert to a structured JSON format
    questions = []
    for _, row in df.iterrows():
        question = {
            "question": row["Question"],
            "choices": [row["Choice A"], row["Choice B"], row["Choice C"], row["Choice D"]],
            "answer": row["Answer"]
        }
        questions.append(question)
    
    # Save to a JSON file
    with open(json_file, "w", encoding="utf-8") as f:
        json.dump(questions, f, indent=4)
    
    print(f"Converted {excel_file} to {json_file}")

# Run the conversion
excel_to_json("questions.xlsx", "questions.json")