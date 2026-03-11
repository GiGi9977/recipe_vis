import json
import argparse
from pathlib import Path


def fill_previous_for_recipe(recipe):
    """
    Auto-generate node['previous'] for one recipe.

    Rule:
    previous(node_v) = all edges that happened before reaching node_v,
    ordered from most recent -> oldest.

    Each previous item:
    {
        "edge_index": int,
        "action": str,
        "type": str,
        "source_ingredient": str
    }

    Assumption:
    - edges define a forward process graph
    - if a node has multiple incoming edges, histories are merged
    - duplicates are removed by edge_index
    """

    # Build node lookup
    node_map = {int(n["index"]): n for n in recipe["nodes"]}

    # Reset previous
    for n in recipe["nodes"]:
        n["previous"] = []

    # Sort edges by time
    edges = sorted(recipe["edges"], key=lambda e: int(e["index"]))

    # Build incoming edge map: node2 -> [edges]
    incoming = {}
    for e in edges:
        v = int(e["node2"])
        incoming.setdefault(v, []).append(e)

    # Cache histories
    history_cache = {}

    def make_edge_item(e):
        src_node = node_map[int(e["node1"])]
        return {
            "edge_index": int(e["index"]),
            "action": e["action"],
            "type": e.get("type", ""),
            "source_ingredient": src_node.get("name", "")
        }

    def compute_history(node_idx):
        """
        Return full previous history for node_idx
        in order: most recent -> oldest
        """
        if node_idx in history_cache:
            return history_cache[node_idx]

        # Start/source node: no previous
        if node_idx not in incoming:
            history_cache[node_idx] = []
            return []

        hist = []

        # Gather history from all incoming edges
        for e in incoming[node_idx]:
            parent_idx = int(e["node1"])

            parent_hist = compute_history(parent_idx)
            current_item = make_edge_item(e)

            # recent -> old
            branch_hist = [current_item] + parent_hist
            hist.extend(branch_hist)

        # Deduplicate by edge_index, keep newest-first order
        seen = set()
        dedup_hist = []
        hist_sorted = sorted(hist, key=lambda x: -int(x["edge_index"]))

        for item in hist_sorted:
            edge_idx = int(item["edge_index"])
            if edge_idx not in seen:
                seen.add(edge_idx)
                dedup_hist.append(item)

        history_cache[node_idx] = dedup_hist
        return dedup_hist

    # Fill all node previous
    for n in recipe["nodes"]:
        idx = int(n["index"])
        n["previous"] = compute_history(idx)

    return recipe

def propagate_flavor_to_next_main(recipe):
    """
    Update flavor for main-process next nodes.

    Rule:
    For a main node's next node (through non-add edge),
    next_node.flavor = union(
        parent_main.flavor,
        all flavors brought by add-chains flowing into parent_main
    )

    Notes:
    - add-chain means direct add or multi-layer add
    - flavor propagates forward along main chain
    - auxiliary flavor can be string / list / "none"
    """

    node_map = {int(n["index"]): n for n in recipe["nodes"]}
    edges = recipe["edges"]

    # ---------- helpers ----------
    def norm_flavor(v):
        if v is None:
            return []
        if isinstance(v, list):
            vals = []
            for x in v:
                s = str(x).strip()
                if s and s.lower() != "none" and s not in vals:
                    vals.append(s)
            return vals
        s = str(v).strip()
        if not s or s.lower() == "none":
            return []
        return [s]

    def merge_flavors(*parts):
        vals = []
        for part in parts:
            for x in norm_flavor(part):
                if x not in vals:
                    vals.append(x)
        if not vals:
            return "none"
        if len(vals) == 1:
            return vals[0]
        return vals

    # ---------- graph maps ----------
    incoming_add = {}      # node_idx -> [source node idx] from add edges
    outgoing_nonadd = {}   # node_idx -> [target node idx] from non-add edges

    for e in edges:
        u = int(e["node1"])
        v = int(e["node2"])
        action = str(e.get("action", "")).lower().strip()

        if action == "add":
            incoming_add.setdefault(v, []).append(u)
        else:
            outgoing_nonadd.setdefault(u, []).append(v)

    # ---------- recursively collect all upstream add flavors ----------
    memo = {}

    def collect_add_chain_flavors(node_idx, visiting=None):
        """
        Collect all flavors from nodes that reach node_idx through add chains.
        """
        if node_idx in memo:
            return memo[node_idx]

        if visiting is None:
            visiting = set()
        if node_idx in visiting:
            return []

        visiting.add(node_idx)
        result = []

        for src in incoming_add.get(node_idx, []):
            src_node = node_map[src]

            # source node's own flavor
            for f in norm_flavor(src_node.get("flavor", "none")):
                if f not in result:
                    result.append(f)

            # recursive upstream add flavors
            for f in collect_add_chain_flavors(src, visiting):
                if f not in result:
                    result.append(f)

        visiting.remove(node_idx)
        memo[node_idx] = result
        return result

    # ---------- propagate to next main nodes ----------
    # sort nodes by index so propagation is stable along main chain
    main_nodes = sorted(
        [n for n in recipe["nodes"] if str(n.get("type", "")).lower().strip() == "main"],
        key=lambda n: int(n["index"])
    )

    for node in main_nodes:
        u = int(node["index"])

        # current main node accumulated flavor
        current_main_flavor = norm_flavor(node.get("flavor", "none"))

        # flavors introduced by add into this main node
        added_flavor = collect_add_chain_flavors(u)

        total_flavor_for_next = []
        for f in current_main_flavor + added_flavor:
            if f not in total_flavor_for_next:
                total_flavor_for_next.append(f)

        if not total_flavor_for_next:
            continue

        # write into next node(s) through non-add edges
        for v in outgoing_nonadd.get(u, []):
            next_node = node_map[v]
            next_node["flavor"] = merge_flavors(
                next_node.get("flavor", "none"),
                total_flavor_for_next
            )

    return recipe

def dump_recipe_pretty(path, recipe):

    with open(path, "w", encoding="utf-8") as f:

        f.write("{\n")

        keys = list(recipe.keys())

        for ki, key in enumerate(keys):

            value = recipe[key]

            if key == "nodes":

                f.write('"nodes":[\n')

                for i, node in enumerate(value):
                    line = json.dumps(node, ensure_ascii=False)
                    if i < len(value) - 1:
                        f.write(line + ",\n")
                    else:
                        f.write(line + "\n")

                f.write("]")

            elif key == "edges":

                f.write('"edges":[\n')

                for i, edge in enumerate(value):
                    line = json.dumps(edge, ensure_ascii=False)
                    if i < len(value) - 1:
                        f.write(line + ",\n")
                    else:
                        f.write(line + "\n")

                f.write("]")

            else:
                line = json.dumps(value, ensure_ascii=False)
                f.write(f'"{key}":{line}')

            if ki < len(keys) - 1:
                f.write(",\n")
            else:
                f.write("\n")

        f.write("}\n")
        
def process_folder(folder_path: str, overwrite: bool = True):
    folder = Path(folder_path)

    if not folder.exists():
        raise FileNotFoundError(f"Folder not found: {folder}")

    json_files = sorted(folder.glob("*.json"))

    if not json_files:
        print(f"No JSON files found in: {folder}")
        return

    print(f"Found {len(json_files)} JSON files in {folder}")

    for path in json_files:
        try:
            with open(path, "r", encoding="utf-8") as f:
                recipe = json.load(f)

            # Basic validation
            if "nodes" not in recipe or "edges" not in recipe:
                print(f"[SKIP] {path.name}: missing 'nodes' or 'edges'")
                continue

            fill_previous_for_recipe(recipe)
            propagate_flavor_to_next_main(recipe)

            if overwrite:
                out_path = path
            else:
                out_path = path.with_name(path.stem + "_with_previous.json")

            dump_recipe_pretty(out_path, recipe)

            print(f"[OK] {path.name} -> {out_path.name}")

        except Exception as e:
            print(f"[ERROR] {path.name}: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate previous field for all recipe JSON files in a folder.")
    parser.add_argument("folder", help="Path to folder containing recipe JSON files")
    parser.add_argument(
        "--no-overwrite",
        action="store_true",
        help="Do not overwrite original files; save as *_with_previous.json instead"
    )

    args = parser.parse_args()

    process_folder(
        folder_path=args.folder,
        overwrite=not args.no_overwrite
    )