import contextlib
import io
import json
import unittest
from pathlib import Path

from backend.graph_builder import build_full_graph_main_aux
from backend.matcher import build_node_map, compare_recipes, vessel_chain_ingredients


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


def ovens(recipe):
    return {
        int(node["index"]) for node in recipe["nodes"]
        if node.get("type") == "container" and node.get("name") == "oven"
    }


class OvenBranchIdentityTest(unittest.TestCase):
    """A vessel branch is identified by what it produces plus the single main it
    transforms. Mains merely layered into an assembly dish do not count."""

    def test_roasting_oven_and_assembly_oven_have_different_main_ingredients(self):
        recipe13, recipe9 = load(13), load(9)
        map13, map9 = build_node_map(recipe13), build_node_map(recipe9)
        # R13 node 9: only eggplant is added, and eggplant comes out.
        self.assertEqual(vessel_chain_ingredients(recipe13, map13, 9)[0], frozenset({"eggplant"}))
        # R9 node 38: eggplant, meat sauce and white sauce are combined into moussaka.
        self.assertEqual(vessel_chain_ingredients(recipe9, map9, 38)[0], frozenset({"moussaka"}))

    def test_eggplant_roasting_oven_never_merges_with_a_final_oven(self):
        recipe13 = load(13)
        roasting = 9
        for prefix in (9, 10, 11, 12):
            other = load(prefix)
            final_ovens = ovens(other)
            for left, right, flip in ((recipe13, other, True), (other, recipe13, False)):
                with self.subTest(recipe=prefix, reverse=flip):
                    pairs = merged_main_pairs(left, right)
                    for a, b in pairs:
                        r13_node, other_node = (a, b) if flip else (b, a)
                        if r13_node == roasting:
                            self.assertNotIn(other_node, final_ovens)

    def test_single_main_baked_into_a_product_still_merges(self):
        # Cake paste baked into cake_base (R16) or cake (R18): one main is added.
        pairs = merged_main_pairs(load(16), load(18))
        recipe16, recipe18 = load(16), load(18)
        self.assertTrue(any(a in ovens(recipe16) and b in ovens(recipe18) for a, b in pairs))


if __name__ == "__main__":
    unittest.main()
