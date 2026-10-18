import contextlib
import io
import json
import unittest
from pathlib import Path

from backend.graph_builder import build_full_graph_main_aux
from backend.matcher import build_branch_metadata, compare_recipes


DATA = Path(__file__).resolve().parents[1] / "data"


class ContainerPreparationIdentityTest(unittest.TestCase):
    def test_r4_pork_wok_does_not_merge_with_r5_ginger_preparation_wok(self):
        recipe4 = json.loads(
            next(DATA.glob("4 *.json")).read_text(encoding="utf-8")
        )
        recipe5 = json.loads(
            next(DATA.glob("5 *.json")).read_text(encoding="utf-8")
        )

        _, origins4, _ = build_branch_metadata(recipe4)
        _, origins5, _ = build_branch_metadata(recipe5)
        self.assertNotEqual(origins4[7], origins5[16])

        for left, right, forbidden in (
            (recipe4, recipe5, (7, 16)),
            (recipe5, recipe4, (16, 7)),
        ):
            with self.subTest(forbidden=forbidden):
                with contextlib.redirect_stdout(io.StringIO()):
                    graph = build_full_graph_main_aux(
                        left, right, compare_main_fn=compare_recipes
                    )
                self.assertFalse(any(
                    (node["r1_node"], node["r2_node"]) == forbidden
                    and node["kind"].startswith("merged")
                    for node in graph["nodes"]
                ))

    def test_loaded_pork_woks_merge_despite_different_representative_edges(self):
        recipe4 = json.loads(
            next(DATA.glob("4 *.json")).read_text(encoding="utf-8")
        )
        recipe5 = json.loads(
            next(DATA.glob("5 *.json")).read_text(encoding="utf-8")
        )

        for left, right, expected in (
            (recipe4, recipe5, (8, 2)),
            (recipe5, recipe4, (2, 8)),
        ):
            with self.subTest(expected=expected):
                with contextlib.redirect_stdout(io.StringIO()):
                    records = compare_recipes(left, right)
                    graph = build_full_graph_main_aux(
                        left, right, compare_main_fn=compare_recipes
                    )
                self.assertTrue(any(
                    record.kind == "similar3"
                    and (record.r1_out_node, record.r2_out_node) == expected
                    for record in records
                ))
                self.assertTrue(any(
                    node["kind"] == "merged_similar"
                    and (node["r1_node"], node["r2_node"]) == expected
                    for node in graph["nodes"]
                ))


if __name__ == "__main__":
    unittest.main()
