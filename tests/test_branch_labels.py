import contextlib
import io
import json
from pathlib import Path
import unittest
from dataclasses import replace

from backend.matcher import (
    build_branch_labels, build_main_seq_items, compare_recipes, match_by_rule,
)
from backend.graph_builder import build_full_graph_main_aux


DATA = Path(__file__).resolve().parents[1] / "data"
RULES = ("exact", "similar2", "similar3", "similar2_loose", "similar3_loose")


def recipe(names, edges):
    return {
        "nodes": [dict(index=i, name=name, type=typ,
                       physical_state="whole", chemical_state="raw")
                  for i, (name, typ) in enumerate(names, 1)],
        "edges": [dict(index=i, node1=src, node2=dst, action=action, type="prep")
                  for i, (src, dst, action) in enumerate(edges, 1)],
    }


class BranchLabelsTest(unittest.TestCase):
    def test_n_way_join_resets_only_downstream_and_can_reset_again(self):
        r = recipe(
            [("oil", "aux"), ("wok", "container"), ("pork", "main"),
             ("sugar", "main"), ("wok", "container"), ("pork", "main"),
             ("wok", "container"), ("egg", "main"), ("bowl", "container"),
             ("mixture", "main"), ("mixture", "main")],
            [(1, 2, "add"), (2, 5, "heat"), (3, 5, "add"), (4, 5, "add"),
             (5, 6, "fry"), (2, 7, "heat"), (6, 9, "add"), (8, 9, "add"),
             (9, 10, "mix"), (10, 11, "stir")],
        )
        labels = build_branch_labels(r)
        self.assertEqual(labels[1], "oil")
        self.assertEqual([labels[i] for i in (2, 5, 7)], ["wok"] * 3)
        self.assertEqual(labels[6], "pork")
        self.assertEqual(labels[10], "mixture")
        self.assertEqual(labels[11], "mixture")
        # Topological traversal must not assume node/index order.
        r["nodes"].reverse()
        r["edges"].reverse()
        self.assertEqual(build_branch_labels(r), labels)

    def test_identical_labels_are_not_required_for_join_inputs(self):
        r = recipe([(" Pork ", "main"), ("pork", "main"),
                    ("bowl", "container"), ("mixture", "main")],
                   [(1, 3, "add"), (2, 3, "add"), (3, 4, "mix")])
        self.assertEqual(build_branch_labels(r)[4], "mixture")

    def test_direct_join_and_single_input_container(self):
        r = recipe([("pork", "main"), ("pot", "container"),
                    ("pork", "main"), ("sauce", "main"),
                    ("stew", "main"), ("stew", "main")],
                   [(1, 2, "add"), (2, 3, "boil"), (3, 5, "stir"),
                    (4, 5, "add"), (5, 6, "simmer")])
        labels = build_branch_labels(r)
        self.assertEqual([labels[i] for i in (1, 2, 3, 5)], ["pork"] * 4)
        self.assertEqual(labels[6], "stew")

    def test_branch_identity_gate_applies_to_every_matching_pass(self):
        r = recipe([("pork", "main"), ("pork", "main")], [(1, 2, "cut")])
        with contextlib.redirect_stdout(io.StringIO()):
            item = build_main_seq_items(r, "R1")[0]
        for rule in RULES:
            with self.subTest(rule=rule):
                self.assertTrue(match_by_rule(item, replace(item), rule))
                self.assertTrue(match_by_rule(item, replace(item, branch_label="later_product"), rule))
                self.assertFalse(match_by_rule(item, replace(item, branch_origins=frozenset({"oil"})), rule))
                self.assertFalse(match_by_rule(item, replace(
                    item, key1=(), key2=("other", "other", ()),
                    state_out=("egg", "main", "liquid", "cooked")), rule))

    def test_redpork_join_matches_pork_branch(self):
        r4 = json.loads((DATA / "redpork4.json").read_text())
        r5 = json.loads((DATA / "redpork5.json").read_text())
        labels = build_branch_labels(r5)
        self.assertEqual(labels[5], "wok_pot")
        self.assertEqual(labels[7], "wok_pot")
        self.assertEqual(labels[16], "pork")
        self.assertEqual(labels[26], "pork")
        with contextlib.redirect_stdout(io.StringIO()):
            records = compare_recipes(r4, r5)
            graph = build_full_graph_main_aux(r4, r5, compare_main_fn=compare_recipes)
        pairs = {(r.r1_out_node, r.r2_out_node) for r in records}
        self.assertIn((7, 16), pairs)
        self.assertIn((18, 26), pairs)
        self.assertTrue(any(n["r1_node"] == 7 and n["r2_node"] == 16
                            and n["kind"] == "merged_similar" for n in graph["nodes"]))

    def test_cycle_is_unmatched(self):
        r = recipe([("pork", "main"), ("pork", "main")],
                   [(1, 2, "cut"), (2, 1, "mix")])
        self.assertEqual(build_branch_labels(r), {1: None, 2: None})
        with contextlib.redirect_stdout(io.StringIO()):
            records = compare_recipes(r, r)
        self.assertTrue(all(x.kind in ("only_r1", "only_r2") for x in records))

    def test_cycle_downstream_is_unmatched_but_other_branch_matches(self):
        r = recipe([("pork", "main")] * 6,
                   [(1, 2, "cut"), (2, 3, "stir"), (3, 2, "stir"),
                    (3, 4, "fry"), (5, 6, "cut")])
        labels = build_branch_labels(r)
        self.assertTrue(all(labels[i] is None for i in (2, 3, 4)))
        with contextlib.redirect_stdout(io.StringIO()):
            records = compare_recipes(r, r)
        self.assertTrue(any(x.r1_out_node == 6 and x.r2_out_node == 6
                            and x.kind == "exact" for x in records))
        for x in records:
            if x.r1_out_node in (2, 3, 4) or x.r2_out_node in (2, 3, 4):
                self.assertIn(x.kind, ("only_r1", "only_r2"))

    def test_aux_addition_does_not_reset_main_branch(self):
        r = recipe([("pork", "main"), ("pork", "main"),
                    ("sauce", "aux"), ("stew", "main")],
                   [(1, 2, "fry"), (3, 2, "add"), (2, 4, "simmer")])
        self.assertEqual(build_branch_labels(r)[4], "pork")

    def test_redpork_prejoin_cannot_match_postjoin(self):
        r1 = json.loads((DATA / "redpork1.json").read_text())
        r2 = json.loads((DATA / "redpork_1.json").read_text())
        with contextlib.redirect_stdout(io.StringIO()):
            seq1 = {x.out_node: x for x in build_main_seq_items(r1, "R1")}
            seq2 = {x.out_node: x for x in build_main_seq_items(r2, "R2")}
        self.assertEqual(seq2[9].branch_origins, frozenset({"pork"}))
        self.assertEqual(seq1[14].branch_origins, frozenset({"pork", ("container", "wok_pot", ("pork",))}))
        for rule in RULES:
            self.assertFalse(match_by_rule(seq1[14], seq2[9], rule))
            self.assertFalse(match_by_rule(seq2[9], seq1[14], rule))
        for a, b, expected in [(r1, r2, {(14, 22), (16, 26)}),
                               (r2, r1, {(22, 14), (26, 16)})]:
            with contextlib.redirect_stdout(io.StringIO()):
                records = compare_recipes(a, b)
                graph = build_full_graph_main_aux(a, b, compare_main_fn=compare_recipes)
            pairs = {(r.r1_out_node, r.r2_out_node) for r in records}
            self.assertTrue(expected <= pairs)
            self.assertNotIn((14, 9), pairs)
            self.assertNotIn((9, 14), pairs)
            rendered = {(n["r1_node"], n["r2_node"]) for n in graph["nodes"]}
            self.assertTrue(expected <= rendered)
            self.assertNotIn((14, 9), rendered)
            self.assertNotIn((9, 14), rendered)


if __name__ == "__main__":
    unittest.main()
