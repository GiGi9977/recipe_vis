import contextlib
import io
import json
import unittest
from pathlib import Path

from backend.graph_builder import build_full_graph_main_aux
from backend.matcher import compare_recipes


DATA = Path(__file__).resolve().parents[1] / "data"


def load(prefix):
    return json.loads(next(DATA.glob(f"{prefix} *.json")).read_text(encoding="utf-8"))


def merged_main_pairs(left, right):
    with contextlib.redirect_stdout(io.StringIO()):
        graph = build_full_graph_main_aux(left, right, compare_main_fn=compare_recipes)
    return {
        (node["r1_node"], node["r2_node"])
        for node in graph["nodes"]
        if node["domain"] == "main" and node["kind"].startswith("merged")
    }


class MeatSauceBranchTest(unittest.TestCase):
    """Branches that share a main ingredient may correspond even when their roots
    differ: R10's lamb-and-tomato sauce and R13's beef sauce both end in meat_sauce."""

    def test_meat_sauce_nodes_merge_in_both_directions(self):
        recipe10, recipe13 = load(10), load(13)
        pairs = merged_main_pairs(recipe10, recipe13)
        self.assertIn((15, 20), pairs)
        self.assertIn((17, 21), pairs)
        reverse = merged_main_pairs(recipe13, recipe10)
        self.assertIn((20, 15), reverse)
        self.assertIn((21, 17), reverse)

    def test_the_lamb_and_beef_woks_are_not_pulled_in(self):
        # Sharing meat_sauce downstream does not make the woks (lamb vs beef) the
        # same branch; only nodes in the paired meat_sauce branches merge.
        recipe10, recipe13 = load(10), load(13)
        pairs = merged_main_pairs(recipe10, recipe13)
        self.assertNotIn((4, 3), pairs)
        self.assertNotIn((5, 4), pairs)

    def test_matches_stay_one_to_one(self):
        pairs = merged_main_pairs(load(10), load(13))
        self.assertEqual(len({a for a, _ in pairs}), len(pairs))
        self.assertEqual(len({b for _, b in pairs}), len(pairs))


if __name__ == "__main__":
    unittest.main()
