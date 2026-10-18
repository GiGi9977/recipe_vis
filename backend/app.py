from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .matcher import compare_recipes
from .graph_builder import build_full_graph_main_aux, canon_action
from .graph_builder import extract_branch_info_from_recipe
from .utils import load_recipe, load_source_text, list_recipes


def _dedupe(values):
    return list(dict.fromkeys(values))


def _synchronize_text_alignment(recipe):
    """Rebuild step-node links from the current edge endpoints.

    Edge text_step_ids are the stable source-text anchors. For older data that
    lacks them, the existing text_steps.edge_indices mapping is used once as a
    fallback. Node mappings and node/action pairs are always derived from the
    current node1/node2 connections, so manual rewiring cannot leave the UI
    pointing at the old nodes.
    """
    original_steps = recipe.get("text_steps", [])
    steps = []
    step_by_id = {}
    fallback_edge_steps = {}

    for original in original_steps:
        raw_id = original.get("id")
        if raw_id is None:
            continue
        step_id = str(raw_id)
        step = dict(original)
        step["id"] = step_id
        step["node_indices"] = []
        step["edge_indices"] = []
        step["node_action_pairs"] = []
        steps.append(step)
        step_by_id[step_id] = step

        for edge_index in original.get("edge_indices", []):
            fallback_edge_steps.setdefault(int(edge_index), []).append(step_id)
        for pair in original.get("node_action_pairs", []):
            edge_index = pair.get("edge_index")
            if edge_index is not None:
                fallback_edge_steps.setdefault(int(edge_index), []).append(step_id)

    node_map = {
        int(node["index"]): node
        for node in recipe.get("nodes", [])
    }
    node_step_ids = {index: [] for index in node_map}
    edge_step_ids = {}

    for edge in recipe.get("edges", []):
        edge_index = int(edge["index"])
        explicit_ids = [
            str(step_id)
            for step_id in edge.get("text_step_ids", [])
            if str(step_id) in step_by_id
        ]
        step_ids = _dedupe(
            explicit_ids or fallback_edge_steps.get(edge_index, [])
        )
        edge_step_ids[edge_index] = step_ids

        source_index = int(edge["node1"])
        target_index = int(edge["node2"])
        action = canon_action(edge.get("action", ""))
        source_role = (
            "source" if action == "add"
            else "environment" if node_map.get(source_index, {}).get("type") == "container"
            else "input"
        )
        target_role = "receiver" if action == "add" else "output"

        for step_id in step_ids:
            step = step_by_id[step_id]
            step["edge_indices"].append(edge_index)
            for node_index, role in (
                (source_index, source_role),
                (target_index, target_role),
            ):
                if node_index not in node_map:
                    continue
                step["node_indices"].append(node_index)
                step["node_action_pairs"].append({
                    "node_index": node_index,
                    "edge_index": edge_index,
                    "role": role,
                })
                node_step_ids[node_index].append(step_id)

    for step in steps:
        step["node_indices"] = _dedupe(step["node_indices"])
        step["edge_indices"] = _dedupe(step["edge_indices"])

    node_step_ids = {
        index: _dedupe(step_ids)
        for index, step_ids in node_step_ids.items()
    }
    return steps, node_step_ids, edge_step_ids


def _attach_text_alignment(graph, recipe1, recipe2, recipe1_id, recipe2_id):
    recipes = {"R1": recipe1, "R2": recipe2}
    synchronized = {
        side: _synchronize_text_alignment(recipe)
        for side, recipe in recipes.items()
    }
    graph["text_alignment"] = {
        side: {
            "id": recipe_id,
            "source_text": recipe.get("source_text") or load_source_text(recipe_id) or "",
            "text_steps": synchronized[side][0],
        }
        for side, recipe, recipe_id in (
            ("R1", recipe1, recipe1_id),
            ("R2", recipe2, recipe2_id),
        )
    }

    node_by_id = {node["id"]: node for node in graph.get("nodes", [])}
    node_maps = {side: synchronized[side][1] for side in recipes}
    edge_maps = {side: synchronized[side][2] for side in recipes}

    for node in graph.get("nodes", []):
        for side, field in (("R1", "r1_node"), ("R2", "r2_node")):
            raw_index = node.get(field)
            node[f"text_step_keys_{side.lower()}"] = [
                f"{side}:{step_id}"
                for step_id in node_maps[side].get(int(raw_index), [])
            ] if raw_index is not None else []

    for edge in graph.get("edges", []):
        source = node_by_id.get(edge.get("source"), {})
        target = node_by_id.get(edge.get("target"), {})
        for side, field in (("R1", "r1_node"), ("R2", "r2_node")):
            keys = []
            applies = edge.get("style") in (side, "shared")
            source_index = source.get(field)
            target_index = target.get(field)
            if applies and source_index is not None and target_index is not None:
                for raw_edge in recipes[side].get("edges", []):
                    if (
                        int(raw_edge.get("node1", -1)) == int(source_index)
                        and int(raw_edge.get("node2", -1)) == int(target_index)
                        and canon_action(raw_edge.get("action", ""))
                        == canon_action(edge.get("action", ""))
                    ):
                        keys.extend(
                            f"{side}:{step_id}"
                            for step_id in edge_maps[side].get(int(raw_edge["index"]), [])
                        )
            edge[f"text_step_keys_{side.lower()}"] = list(dict.fromkeys(keys))

app = FastAPI()

# Serve icons at /icons/<name>.png
_ICONS_DIR = Path(__file__).parent.parent / "data" / "icons"
class _FreshStaticFiles(StaticFiles):
    """Icons are replaced while the app is running: make the browser revalidate each time
    (a 304 when unchanged) instead of showing a heuristically cached older image."""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-cache"
        return response


if _ICONS_DIR.exists():
    app.mount("/icons", _FreshStaticFiles(directory=str(_ICONS_DIR)), name="icons")

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

    _attach_text_alignment(graph, recipe1, recipe2, req.recipe1, req.recipe2)

    return {
        "recipe1": req.recipe1,
        "recipe2": req.recipe2,
        "graph": graph
    }
