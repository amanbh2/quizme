import os
import json

DATA_FOLDER = os.path.join(os.path.dirname(__file__), '..', 'data')
MANIFEST_PATH = os.path.join(os.path.dirname(__file__), 'manifest.json')

def list_json_files(folder):
    return [f for f in os.listdir(folder) if f.endswith('.json') and os.path.isfile(os.path.join(folder, f))]

def create_manifest():
    # Delete the original manifest file if it exists
    if os.path.exists(MANIFEST_PATH):
        os.remove(MANIFEST_PATH)
    json_files = list_json_files(DATA_FOLDER)
    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump({"files": json_files}, f, indent=2)

if __name__ == "__main__":
    create_manifest()