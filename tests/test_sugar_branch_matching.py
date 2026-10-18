import contextlib
import copy
import io
import json
from pathlib import Path
import unittest

from backend.graph_builder import build_full_graph_main_aux
from backend.matcher import build_branch_metadata, compare_recipes

DATA = Path(__file__).resolve().parents[1] / "data"


def load(number):
    return json.loads(next(DATA.glob(str(number) + " *.json")).read_text(encoding="utf-8"))


class SugarBranchMatchingTest(unittest.TestCase):
    def test_pork_comparisons_preserve_sugar_branch_in_both_directions(self):
        bazirou = load(4)
        for number, start, processed in [(1, 9, 10), (2, 27, 29), (3, 18, 21), (5, 30, 33)]:
            other = load(number)
            for reverse in [False, True]:
                with self.subTest(recipe=number, reverse=reverse):
                    a, b = (bazirou, other) if reverse else (other, bazirou)
                    before = copy.deepcopy((a, b))
                    with contextlib.redirect_stdout(io.StringIO()):
                        graph = build_full_graph_main_aux(a, b, compare_main_fn=compare_recipes)
                    pairs = {(n["r1_node"], n["r2_node"]) for n in graph["nodes"]
                             if n.get("r1_node") is not None and n.get("r2_node") is not None}
                    if reverse:
                        pairs = {(y, x) for x, y in pairs}
                    self.assertIn((start, 20), pairs)
                    self.assertIn((processed, 24), pairs)
                    self.assertNotIn((start, 8), pairs)
                    self.assertNotIn((processed, 9), pairs)
                    self.assertEqual(len(pairs), len({x for x, _ in pairs}))
                    self.assertEqual(len(pairs), len({y for _, y in pairs}))
                    self.assertEqual((a, b), before)

    def test_meat_pot_and_sugar_pot_have_distinct_provenance(self):
        _, origins, _ = build_branch_metadata(load(4))
        self.assertNotEqual(origins[8], origins[20])
        self.assertEqual(origins[20], origins[24])
        self.assertEqual(origins[8], origins[9])

    def test_sugar_added_to_meat_does_not_create_a_sugar_branch(self):
        recipe = load(5)
        _, origins, _ = build_branch_metadata(recipe)
        self.assertNotEqual(origins[18], origins[30])
        self.assertNotEqual(origins[24], origins[30])


if __name__ == "__main__":
    unittest.main()
