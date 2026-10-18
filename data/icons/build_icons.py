# -*- coding: utf-8 -*-
"""One command for the whole icon pipeline.

    python data/icons/build_icons.py            # dry run: what would be generated
    python data/icons/build_icons.py --run      # generate the missing icons

Steps (each only for icons that are still missing from data/icons):
  1. labels  : ingredient_physical_chemical names from data/*.json (make_iconlabels rules)
  2. specs   : one LLM call per batch (make_icons_spec); cached in _build/icon_specs.json
  3. images  : candidates per icon, the best one saved (generate_icons_svg)
  4. install : the best image is copied to data/icons/<name>.png, which is where the
               backend looks. Existing icons are kept unless --overwrite is given.

Candidates and the spec cache live in data/icons/_build, so an interrupted run can be
repeated and only pays for what is not finished yet. Calling the API needs the openai
package and OPENAI_API_KEY; the dry run needs neither.
"""
import argparse
import json
import math
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from make_iconlabels import extract_labels  # noqa: E402
from icon_vocab import physical_state_of  # noqa: E402
import generate_icons_svg  # noqa: E402  (imports PIL only; openai is loaded when called)
import make_icons_spec  # noqa: E402

ICON_DIR = HERE
DEFAULT_DATA = HERE.parent
WORK = HERE / "_build"


def collect_labels(data_dir):
    """Unique icon labels of every recipe JSON in data_dir; raises on unusable states."""
    labels, errors, recipes = set(), [], 0
    for path in sorted(Path(data_dir).glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8-sig"))
        if not isinstance(data, dict) or not isinstance(data.get("nodes"), list):
            continue
        recipes += 1
        found, invalid = extract_labels(data, path.name)
        labels.update(found)
        errors.extend(invalid)
    if errors:
        raise SystemExit("Fix these recipe states first (nothing generated):\n" + "\n".join(errors))
    return sorted(labels), recipes


def missing_labels(labels, icon_dir=ICON_DIR):
    """Labels without data/icons/<name>.png."""
    return [label for label in labels
            if not (Path(icon_dir) / f"{generate_icons_svg.icon_slug(label)}.png").exists()]


def plan(labels, batch, candidates):
    return {
        "icons": len(labels),
        "spec_calls": math.ceil(len(labels) / batch) if labels else 0,
        "image_calls": len(labels) * candidates,
        "by_state": {state: sum(1 for label in labels if physical_state_of(label) == state)
                     for state in sorted({physical_state_of(label) for label in labels} - {None})},
    }


def load_specs(path):
    if path.exists():
        return {spec["icon_name"]: spec for spec in json.loads(path.read_text(encoding="utf-8")).get("specs", [])}
    return {}


def save_specs(path, specs):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"specs": list(specs.values())}, ensure_ascii=False, indent=2), encoding="utf-8")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run", action="store_true", help="really call the API (default: dry run)")
    ap.add_argument("--all", action="store_true", help="regenerate every label, not only the missing ones")
    ap.add_argument("--only", nargs="+", metavar="LABEL", help="only these labels (must exist in the data)")
    ap.add_argument("--overwrite", action="store_true", help="replace existing data/icons/<name>.png")
    ap.add_argument("--data", default=str(DEFAULT_DATA), help="folder with the recipe JSON files")
    ap.add_argument("--candidates", type=int, default=3)
    ap.add_argument("--batch", type=int, default=40, help="icon names per spec call")
    ap.add_argument("--size", type=int, default=128)
    args = ap.parse_args(argv)

    labels, recipes = collect_labels(args.data)
    if args.only:
        unknown = sorted(set(args.only) - set(labels))
        if unknown:
            raise SystemExit(f"Not in the recipe data: {unknown}")
        todo = sorted(set(args.only))
    elif args.all:
        todo = labels
    else:
        todo = missing_labels(labels)
    if not args.overwrite and (args.all or args.only):
        todo = missing_labels(todo)

    summary = plan(todo, args.batch, args.candidates)
    print(f"{recipes} recipes -> {len(labels)} labels; to generate: {summary['icons']}")
    print(f"  by physical state: {summary['by_state']}")
    print(f"  API calls: {summary['spec_calls']} spec + {summary['image_calls']} image")
    if not todo:
        print("[OK] nothing to do")
        return 0
    if not args.run:
        print("Dry run. First labels:", ", ".join(todo[:12]) + (" ..." if len(todo) > 12 else ""))
        print("Add --run to generate them.")
        return 0

    # 2. specs (cached, so a repeated run only asks for names it has no spec for)
    specs_path = WORK / "icon_specs.json"
    cache = load_specs(specs_path)
    need = [label for label in todo if label not in cache]
    for start in range(0, len(need), args.batch):
        chunk = need[start:start + args.batch]
        for spec in make_icons_spec.infer_specs(chunk):
            cache[spec["icon_name"]] = spec
        save_specs(specs_path, cache)
        print(f"specs: {min(start + args.batch, len(need))}/{len(need)}")

    # 3. images, 4. install
    images = WORK / "icons_png"
    for number, label in enumerate(todo, start=1):
        slug = generate_icons_svg.icon_slug(label)
        best = images / f"{slug}.png"
        if not best.exists():
            print(f"[{number}/{len(todo)}] {label}")
            generate_icons_svg.generate_icon(cache[label], images, args.size, args.candidates)
        target = ICON_DIR / f"{slug}.png"
        if args.overwrite or not target.exists():
            shutil.copyfile(best, target)
    print(f"[OK] installed {len(todo)} icons into {ICON_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
