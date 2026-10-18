from pathlib import Path
import json

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

def load_recipe(recipe_id: str):
    path = DATA_DIR / f"{recipe_id}.json"
    if not path.exists():
        raise FileNotFoundError(f"Recipe not found: {recipe_id}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_source_text(recipe_id: str):
    """Load the original prompt input when it is stored alongside the dataset."""
    path = DATA_DIR / "llm_text" / "original_text" / f"{recipe_id}.txt"
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8-sig")


def list_recipes():
    files = sorted(DATA_DIR.glob("*.json"))
    return [{"id": f.stem, "label": f.stem} for f in files]
