import pandas as pd
import json

# Define input and output file paths
input_file = "data/quizMeData.xlsx"
output_file = "data/all.json"

# Read the Excel file
df = pd.read_excel(input_file)

# Convert the dataframe to a list of dictionaries
quiz_data = []
for _, row in df.iterrows():
    quiz_data.append({
        "question": row["Question"],
        "answer": row["Answer"],
        "choices": [row["Choice1"], row["Choice2"], row["Choice3"], row["Choice4"]]
    })

# Save as JSON
with open(output_file, "w", encoding="utf-8") as json_file:
    json.dump(quiz_data, json_file, indent=4, ensure_ascii=False)

print(f"JSON file saved to {output_file}")