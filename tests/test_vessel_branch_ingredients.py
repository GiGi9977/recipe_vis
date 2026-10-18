import contextlib
import io
import json
import unittest
from pathlib import Path

from backend.graph_builder import build_full_graph_main_aux
from backend.matcher import compare_recipes, vessel_chain_ingredients


DATA = Path(__file__).resolve().parents[1] / "data"


def load(prefix):
    return json.loads(next(DATA.glob(f"{prefix} *.json")).read_text(encoding="utf-8"))


def compare(left, right):
    with contextlib.redirect_stdout(io.StringIO()):
        return build_full_graph_main_aux(left, right, compare_main_fn=compare_recipes)


def merged_pairs(graph):
    return {
        (node["r1_node"], node["r2_node"])
        for node in graph["nodes"]
        if node["domain"] == "main" and node["kind"].startswith("merged")
    }


class VesselBranchIngredientsTest(unittest.TestCase):
    """A branch must share a main ingredient with its counterpart (shared aux only
    when neither branch has a main ingredient along it)."""

    def test_chain_ingredients_use_the_vessels_own_process_chain(self):
        recipe3, recipe5 = load(3), load(5)
        node_map3 = {int(n["index"]): n for n in recipe3["nodes"]}
        node_map5 = {int(n["index"]): n for n in recipe5["nodes"]}
        # R3 wok 14 (oil and pork added, then fried into pork) and R5 wok 16
        # (pork added, then fried into pork) both carry the main ingredient pork.
        self.assertIn("pork", vessel_chain_ingredients(recipe3, node_map3, 14)[0])
        self.assertIn("pork", vessel_chain_ingredients(recipe5, node_map5, 16)[0])
        # R5 aromatic-oil wok 19 -> 21 -> 24 -> 28 contains only aux ingredients;
        # pouring it into the simmer pot does not make pork part of its chain.
        mains, auxes = vessel_chain_ingredients(recipe5, node_map5, 19)
        self.assertEqual(mains, frozenset())
        self.assertTrue({"oil", "ginger"} <= auxes)

    def test_r3_pork_wok_matches_r5_pork_wok_and_not_aromatic_oil_wok(self):
        recipe3, recipe5 = load(3), load(5)
        aromatic = {19, 21, 24, 28}
        for left, right, flip in ((recipe3, recipe5, False), (recipe5, recipe3, True)):
            with self.subTest(reverse=flip):
                pairs = merged_pairs(compare(left, right))
                if flip:
                    pairs = {(b, a) for a, b in pairs}
                self.assertIn((14, 16), pairs)
                self.assertIn((16, 17), pairs)
                self.assertFalse({b for _, b in pairs} & aromatic)
                # One-to-one in both recipes.
                self.assertEqual(len({a for a, _ in pairs}), len(pairs))
                self.assertEqual(len({b for _, b in pairs}), len(pairs))

    def test_recipe_still_matches_itself_including_the_aux_only_wok(self):
        recipe5 = load(5)
        pairs = merged_pairs(compare(recipe5, recipe5))
        for node in (19, 21, 24, 28):
            self.assertIn((node, node), pairs)


if __name__ == "__main__":
    unittest.main()
