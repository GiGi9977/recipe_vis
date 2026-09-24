# -*- coding: utf-8 -*-
"""Extract ingredient_physical_chemical icon names from recipe JSON files."""
import argparse
import json
from pathlib import Path

STATES = {"solid", "chunk", "slice", "shred", "dice", "paste", "powder", "liquid"}

def extract_labels(recipe, source):
    labels, errors = set(), []
    for node in recipe["nodes"]:
        if str(node.get("type", "")).strip().lower() == "container":
            continue
        name = str(node.get("name") or "").strip().lower()
        physical = str(node.get("physical_state") or "").strip().lower()
        chemical = str(node.get("chemical_state") or "").strip().lower()
        if not name or physical not in STATES or not chemical:
            errors.append(f"{source}: node {node.get('index', '?')}: name={name!r}, physical_state={physical!r}, chemical_state={chemical!r}")
            continue
        # Same naming rule as backend.graph_builder.build_icon_name.
        labels.add("_".join((name, physical, chemical)))
    return labels, errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", nargs="+", default=["data"], help="Recipe JSON files or directories (directories scan *.json only)")
    parser.add_argument("--out_txt", default="iconlabels.txt")
    args = parser.parse_args()
    files = set()
    for value in args.input:
        path = Path(value)
        if path.is_dir():
            files.update(path.glob("*.json"))
        elif path.is_file():
            files.add(path)
        else:
            parser.error(f"Input does not exist: {path}")
    labels, errors, count = set(), [], 0
    for path in sorted(files):
        data = json.loads(path.read_text(encoding="utf-8-sig"))
        if not isinstance(data, dict) or not isinstance(data.get("nodes"), list):
            print(f"[SKIP] Not a recipe: {path}")
            continue
        count += 1
        found, invalid = extract_labels(data, path)
        labels.update(found)
        errors.extend(invalid)
    if errors:
        parser.error("Fix these recipe states before generating labels (no output written):\n" + "\n".join(errors))
    if not count or not labels:
        parser.error("No ingredient icon labels found")
    output = Path(args.out_txt)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(sorted(labels)) + "\n", encoding="utf-8")
    print(f"[OK] {count} recipes -> {len(labels)} unique labels: {output.resolve()}")


if __name__ == "__main__":
    main()