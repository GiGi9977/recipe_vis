"""Audit (not a unit test): which branches merge into more than one branch of the
other recipe, over every ordered pair of recipes in data/.

A branch that merges into several branches that each share a main with it is one
thread segmented differently (cake yolk / yolk_paste): fine. A branch that merges
into a branch sharing none of its main ingredients (eggplant with the final dish)
is flagged for review, unless that branch is simply the next or previous segment of
the same thread (a process edge runs from one into the other): a wok that first
takes tomato paste and later beef is one cooking thread cut into two segments.

Run from the project root:  python tests/audit_branch_conflicts.py
"""
import contextlib
import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.graph_builder import build_full_graph_main_aux  # noqa: E402
from backend.matcher import build_branch_partition, compare_recipes  # noqa: E402
from backend.utils import list_recipes, load_recipe  # noqa: E402


def label(info, branch):
    return sorted(info[branch]["mains"])


def segment_links(recipe, branch_of):
    """Pairs of branches joined by a process (non-add) edge: consecutive segments of
    one thread."""
    links = set()
    for edge in recipe["edges"]:
        action = str(edge.get("action", "")).lower().strip()
        if action in ("add", "split") or str(edge.get("type", "")).lower().strip() == "add":
            continue
        a, b = branch_of.get(int(edge["node1"])), branch_of.get(int(edge["node2"]))
        if a is not None and b is not None and a != b:
            links.add((a, b))
            links.add((b, a))
    return links


def main():
    ids = [item["id"] for item in list_recipes()]
    recipes = {rid: load_recipe(rid) for rid in ids}
    partitions = {rid: build_branch_partition(recipes[rid]) for rid in ids}
    links = {rid: segment_links(recipes[rid], partitions[rid][0]) for rid in ids}
    flagged, segmented = [], 0
    for left in ids:
        for right in ids:
            with contextlib.redirect_stdout(io.StringIO()):
                graph = build_full_graph_main_aux(
                    recipes[left], recipes[right], compare_main_fn=compare_recipes)
            merged = [(n["r1_node"], n["r2_node"]) for n in graph["nodes"]
                      if n["domain"] == "main" and n["kind"].startswith("merged")]
            branch_of1, info1 = partitions[left]
            branch_of2, info2 = partitions[right]
            for side in (0, 1):
                partners = {}
                for x, y in merged:
                    mine, other = (branch_of1.get(x), branch_of2.get(y)) if side == 0 \
                        else (branch_of2.get(y), branch_of1.get(x))
                    if mine is None or other is None:
                        continue
                    partners.setdefault(mine, set()).add(other)
                info_mine, info_other = (info1, info2) if side == 0 else (info2, info1)
                other_links = links[right] if side == 0 else links[left]
                for mine, others in partners.items():
                    if len(others) < 2:
                        continue
                    # A partner with no main of its own (an aux-only vessel branch such
                    # as a sugar wok) cannot be judged by main ingredients: not flagged.
                    bad = [o for o in others
                           if info_mine[mine]["mains"] and info_other[o]["mains"]
                           and not (info_mine[mine]["mains"] & info_other[o]["mains"])]
                    good = [o for o in others if o not in bad]
                    # A partner that is just another segment of the same thread as a
                    # good partner is not a conflict.
                    bad = [o for o in bad if not any((o, g) in other_links for g in good)]
                    if bad and len(bad) < len(others):
                        flagged.append((left[:2].strip() + "/" + right[:2].strip(),
                                        "R" + (left if side == 0 else right)[:2].strip(),
                                        label(info_mine, mine),
                                        [label(info_other, o) for o in sorted(others)]))
                    else:
                        segmented += 1
    print("segmented differently but consistent:", segmented)
    print("flagged (a partner shares no main with the branch):", len(flagged))
    for item in flagged:
        print("  ", item)


if __name__ == "__main__":
    main()
