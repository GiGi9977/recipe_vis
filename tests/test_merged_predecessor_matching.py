import contextlib
import io
import json
import unittest
from pathlib import Path

from backend.graph_builder import build_full_graph_main_aux
from backend.matcher import compare_recipes


DATA = Path(__file__).resolve().parents[1] / "data"


class MergedPredecessorMatchingTest(unittest.TestCase):
    def test_r7_node_24_matches_r8_node_9_after_merged_predecessor(self):
        recipe7 = json.loads(
            next(DATA.glob("7 *.json")).read_text(encoding="utf-8")
        )
        recipe8 = json.loads(
            next(DATA.glob("8 *.json")).read_text(encoding="utf-8")
        )

        for left, right, predecessor, downstream in (
            (recipe7, recipe8, (23, 7), (24, 9)),
            (recipe8, recipe7, (7, 23), (9, 24)),
        ):
            with self.subTest(downstream=downstream):
                with contextlib.redirect_stdout(io.StringIO()):
                    records = compare_recipes(left, right)
                    graph = build_full_graph_main_aux(
                        left, right, compare_main_fn=compare_recipes
                    )

                pairs = {
                    (record.r1_out_node, record.r2_out_node): record.kind
                    for record in records
                    if record.r1_out_node is not None
                    and record.r2_out_node is not None
                }
                self.assertIn(predecessor, pairs)
                self.assertEqual(pairs.get(downstream), "similar3")
                self.assertTrue(any(
                    node["kind"] == "merged_similar"
                    and (node["r1_node"], node["r2_node"]) == downstream
                    for node in graph["nodes"]
                ))


if __name__ == "__main__":
    unittest.main()
