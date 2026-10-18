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


def aux_graph(left, right):
    with contextlib.redirect_stdout(io.StringIO()):
        return build_full_graph_main_aux(left, right, compare_main_fn=compare_recipes)


def aux_merges(left, right):
    return {
        (node["r1_node"], node["r2_node"]): node["kind"]
        for node in aux_graph(left, right)["nodes"]
        if node["domain"] == "aux" and node["kind"].startswith("merged")
    }


class AuxSimilarMatchingTest(unittest.TestCase):
    """Aux nodes follow the main tiers: exact first, then same name with the same
    physical or chemical state. A similar aux that takes additions next is shown as
    a shared dumbbell; otherwise it stays merged_similar."""

    def test_raw_and_cooked_sauce_water_is_one_shared_dumbbell(self):
        recipe6, recipe7, recipe8 = load(6), load(7), load(8)
        # R6 and R7 water are liquid/raw, R8 water is liquid/cooked. The water takes
        # different additions in the next step, so it is a shared (blue) dumbbell
        # whose halves keep their own states.
        for left, right, pair, flip in (
            (recipe6, recipe8, (8, 19), False),
            (recipe8, recipe6, (8, 19), True),
            (recipe7, recipe8, (14, 19), False),
        ):
            with self.subTest(pair=pair, reverse=flip):
                key = pair[::-1] if flip else pair
                nodes = [
                    node for node in aux_graph(left, right)["nodes"]
                    if node["domain"] == "aux" and (node["r1_node"], node["r2_node"]) == key
                ]
                self.assertEqual(len(nodes), 1)
                self.assertEqual(nodes[0]["kind"], "merged_exact")
                self.assertTrue(nodes[0]["shape_dumbbell"])
                self.assertNotEqual(nodes[0]["state_r1"], nodes[0]["state_r2"])

    def test_similar_aux_without_additions_stays_merged_similar(self):
        # Garlic (chunk in R6, whole in R8) takes no additions, so like a main node
        # its state difference keeps it merged_similar.
        self.assertEqual(aux_merges(load(6), load(8)).get((9, 13)), "merged_similar")

    def test_identical_aux_states_stay_exact(self):
        merges = aux_merges(load(6), load(7))
        self.assertEqual(merges.get((8, 14)), "merged_exact")

    def test_aux_merges_are_one_to_one(self):
        for left, right in ((load(6), load(8)), (load(8), load(6)), (load(7), load(8))):
            merges = aux_merges(left, right)
            self.assertEqual(len({a for a, _ in merges}), len(merges))
            self.assertEqual(len({b for _, b in merges}), len(merges))

    def test_a_recipe_still_matches_itself_exactly(self):
        merges = aux_merges(load(8), load(8))
        self.assertTrue(merges)
        self.assertTrue(all(kind == "merged_exact" for kind in merges.values()))


if __name__ == "__main__":
    unittest.main()
