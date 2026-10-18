import contextlib
import io
import json
import unittest
from pathlib import Path
from backend.matcher import build_branch_metadata, compare_recipes
from backend.graph_builder import build_full_graph_main_aux
from test_branch_labels import recipe


class BranchAlignmentTest(unittest.TestCase):
    def test_cake_products_and_downstream_match_both_directions(self):
        base = Path(__file__).parent / 'fixtures'
        a, b = [json.loads((base / f'cake_branch_{i}.json').read_text()) for i in (1, 2)]
        for left, right, expected in [(a, b, {(10, 9), (20, 19), (21, 22)}),
                                      (b, a, {(9, 10), (19, 20), (22, 21)})]:
            with contextlib.redirect_stdout(io.StringIO()):
                graph = build_full_graph_main_aux(left, right, compare_main_fn=compare_recipes)
            pairs = {(n['r1_node'], n['r2_node']) for n in graph['nodes']
                     if n['kind'] == 'merged_similar'}
            self.assertTrue(expected <= pairs)

    def test_split_branches_remain_distinct(self):
        r = recipe([('egg', 'main'), ('yolk', 'main'), ('egg_white', 'main'),
                    ('yolk_paste', 'main'), ('egg_white_paste', 'main')],
                   [(1, 2, 'split'), (1, 3, 'split'), (2, 4, 'stir'), (3, 5, 'whisk')])
        _, origins, _ = build_branch_metadata(r)
        self.assertEqual(origins[4], frozenset({'yolk'}))
        self.assertEqual(origins[5], frozenset({'egg_white'}))

    def test_parallel_numbering_does_not_block_matching(self):
        a = recipe([('pork', 'main'), ('pork', 'main'), ('egg', 'main'), ('egg', 'main')],
                   [(1, 2, 'cut'), (3, 4, 'stir')])
        b = recipe([('egg', 'main'), ('egg', 'main'), ('pork', 'main'), ('pork', 'main')],
                   [(1, 2, 'stir'), (3, 4, 'cut')])
        with contextlib.redirect_stdout(io.StringIO()):
            records = compare_recipes(a, b)
        pairs = {(r.r1_out_node, r.r2_out_node) for r in records if r.kind == 'exact'}
        self.assertEqual(pairs, {(2, 4), (4, 2)})

    def test_opposite_causal_order_cannot_be_fully_merged(self):
        a = recipe([('pork', 'main')] * 3, [(1, 2, 'cut'), (2, 3, 'stir')])
        b = recipe([('pork', 'main')] * 3, [(1, 2, 'stir'), (2, 3, 'cut')])
        with contextlib.redirect_stdout(io.StringIO()):
            records = compare_recipes(a, b)
        pairs = {(r.r1_out_node, r.r2_out_node) for r in records
                 if r.r1_out_node is not None and r.r2_out_node is not None}
        self.assertFalse({(2, 3), (3, 2)} <= pairs)

    def test_moussaka_food_and_pan_branches_match_both_directions(self):
        base = Path(__file__).parent / 'fixtures'
        a, b = [json.loads((base / f'moussaka_{i}_branches.json').read_text()) for i in (1, 2)]
        expected = {(5, 11), (6, 12), (29, 9), (31, 30), (32, 31), (37, 37), (45, 42)}
        forbidden = {(5, 6), (31, 11), (32, 12), (29, 3)}
        for left, right, reverse in [(a, b, False), (b, a, True)]:
            with contextlib.redirect_stdout(io.StringIO()):
                graph = build_full_graph_main_aux(left, right, compare_main_fn=compare_recipes)
            pairs = {(n['r1_node'], n['r2_node']) for n in graph['nodes']
                     if n['kind'].startswith('merged') and n['domain'] == 'main'}
            if reverse:
                pairs = {(y, x) for x, y in pairs}
            self.assertTrue(expected <= pairs, expected - pairs)
            self.assertFalse(forbidden & pairs)
            self.assertEqual(len(pairs), len({x for x, y in pairs}))
            self.assertEqual(len(pairs), len({y for x, y in pairs}))

    def test_container_role_stops_at_first_food_before_assembly(self):
        r = recipe([('pot', 'container'), ('pot', 'container'),
                    ('meat_sauce', 'main'), ('white_sauce', 'main'),
                    ('mold', 'container'), ('dish', 'main')],
                   [(1, 3, 'stir'), (2, 4, 'stir'), (3, 5, 'add'),
                    (4, 5, 'add'), (5, 6, 'bake')])
        _, origins, _ = build_branch_metadata(r)
        self.assertNotEqual(origins[1], origins[2])
        self.assertEqual(origins[1], origins[3])
        self.assertEqual(origins[2], origins[4])
        self.assertEqual(origins[6], origins[1] | origins[2])
