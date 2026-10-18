import contextlib
import io
import json
import unittest
from pathlib import Path
from dataclasses import replace

from backend.matcher import build_main_seq_items, compare_recipes, match_by_rule
from backend.graph_builder import build_full_graph_main_aux
from test_branch_labels import recipe, RULES


def seq(r):
    with contextlib.redirect_stdout(io.StringIO()):
        return {n.out_node: n for n in build_main_seq_items(r, 'test')}


class AuxMainProductsTest(unittest.TestCase):
    def test_actual_sauces_match_once_both_directions(self):
        base = Path(__file__).parent / 'fixtures'
        a, b = [json.loads((base / f'{name}_aux_product.json').read_text())
                for name in ('oil_braised_shrimp', 'broccoli_with_shrimp')]
        before = json.dumps([a, b], sort_keys=True)
        for left, right, wanted in [(a, b, (17, 15)), (b, a, (15, 17))]:
            with contextlib.redirect_stdout(io.StringIO()):
                records = compare_recipes(left, right)
                graph = build_full_graph_main_aux(left, right, compare_main_fn=compare_recipes)
            self.assertTrue(any((r.r1_out_node, r.r2_out_node) == wanted and r.kind == 'similar2'
                                for r in records))
            main = [n for n in graph['nodes'] if n['domain'] == 'main']
            self.assertEqual(sum((n['r1_node'], n['r2_node']) == wanted for n in main), 1)
            for key in ('r1_node', 'r2_node'):
                ids = [n[key] for n in main if n[key] is not None]
                self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(json.dumps([a, b], sort_keys=True), before)

    def test_aux_process_creates_candidate_but_add_only_does_not_invent_process(self):
        r = recipe([('water', 'aux'), ('sauce', 'main')], [(1, 2, 'stir')])
        self.assertEqual(set(seq(r)), {2})
        self.assertEqual(seq(r)[2].edge['node1'], 1)
        r['edges'][0]['action'] = 'add'
        self.assertEqual(seq(r), {})

    def test_generic_product_fallback_still_checks_state(self):
        a = recipe([('flour', 'main'), ('batter', 'main')], [(1, 2, 'stir')])
        b = recipe([('water', 'aux'), ('batter', 'main')], [(1, 2, 'stir')])
        x, y = seq(a)[2], seq(b)[2]
        self.assertTrue(match_by_rule(x, y, 'similar2'))
        bad = replace(y, state_out=('batter', 'main', 'liquid', 'cooked'),
                      key2=('stir', 'prep', ('batter', 'main', 'liquid', 'cooked')))
        self.assertFalse(match_by_rule(x, bad, 'similar2_loose'))
        self.assertFalse(match_by_rule(x, bad, 'similar3_loose'))

    def test_parallel_same_name_products_are_not_inferred(self):
        a = recipe([('flour', 'main'), ('batter', 'main'),
                    ('flour', 'main'), ('batter', 'main')],
                   [(1, 2, 'stir'), (3, 4, 'stir')])
        b = recipe([('water', 'aux'), ('batter', 'main')], [(1, 2, 'stir')])
        x, y = seq(a), seq(b)[2]
        self.assertIsNone(x[2].product_branch)
        self.assertIsNone(x[4].product_branch)
        for rule in RULES:
            self.assertFalse(match_by_rule(x[2], y, rule))
            self.assertFalse(match_by_rule(x[4], y, rule))

    def test_same_name_before_and_after_join_is_not_fallback_identity(self):
        a = recipe([('flour', 'main'), ('batter', 'main'), ('egg', 'main'),
                    ('batter', 'main'), ('batter', 'main')],
                   [(1, 2, 'stir'), (2, 4, 'stir'), (3, 4, 'add'), (4, 5, 'stir')])
        b = recipe([('water', 'aux'), ('batter', 'main')], [(1, 2, 'stir')])
        x, y = seq(a), seq(b)[2]
        self.assertIsNone(x[5].product_branch)
        for rule in RULES:
            self.assertFalse(match_by_rule(x[5], y, rule))

    def test_product_alias_cannot_override_shared_branch_mismatch(self):
        a = recipe([('flour', 'main'), ('batter', 'main')], [(1, 2, 'stir')])
        b = recipe([('water', 'aux'), ('batter', 'main'), ('flour', 'main')], [(1, 2, 'stir')])
        x, y = seq(a)[2], seq(b)[2]
        self.assertEqual(x.product_branch, y.product_branch)
        for rule in RULES:
            self.assertFalse(match_by_rule(x, y, rule))
