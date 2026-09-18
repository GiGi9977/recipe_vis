from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .matcher import compare_recipes
from .graph_builder import build_full_graph_main_aux
from .graph_builder import extract_branch_info_from_recipe
from .utils import load_recipe, list_recipes

app = FastAPI()

# Serve icons at /icons/<name>.png
_ICONS_DIR = Path(__file__).parent.parent / "data" / "icons"
if _ICONS_DIR.exists():
    app.mount("/icons", StaticFiles(directory=str(_ICONS_DIR)), name="icons")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CompareRequest(BaseModel):
    recipe1: str
    recipe2: str


@app.get("/recipes")
def get_recipes():
    return {"recipes": list_recipes()}


@app.post("/compare")
def compare(req: CompareRequest):
    try:
        recipe1 = load_recipe(req.recipe1)
        recipe2 = load_recipe(req.recipe2)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    graph = build_full_graph_main_aux(
        recipe1,
        recipe2,
        compare_main_fn=compare_recipes
    )
    
    graph["branch_info"] = {
        "R1": extract_branch_info_from_recipe(recipe1),
        "R2": extract_branch_info_from_recipe(recipe2),
    }

    return {
        "recipe1": req.recipe1,
        "recipe2": req.recipe2,
        "graph": graph
    }