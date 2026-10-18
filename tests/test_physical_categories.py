import contextlib
import io
import unittest
from backend.matcher import state_key, build_main_seq_items, match_by_rule
from backend.graph_builder import build_icon_name


def recipe(shape):
    return {"nodes": [dict(index=i, name="pork", type="main", physical_state=shape,
                           chemical_state="raw", previous=[]) for i in (1, 2)],
            "edges": [dict(index=1, node1=1, node2=2, action="wash", type="prep")]}


class PhysicalCategoriesTest(unittest.TestCase):
    def test_raw_states_remain_distinct(self):
        self.assertNotEqual(state_key(recipe("cube")["nodes"][0]),
                            state_key(recipe("slice")["nodes"][0]))
        with contextlib.redirect_stdout(io.StringIO()):
            a = build_main_seq_items(recipe("cube"), "A")[0]
            b = build_main_seq_items(recipe("slice"), "B")[0]
        for rule in ("exact", "similar2", "similar3"):
            self.assertFalse(match_by_rule(a, b, rule))
        # Original loose rule still permits matching equal chemical states.
        self.assertTrue(match_by_rule(a, b, "similar2_loose"))
        self.assertTrue(match_by_rule(a, a, "exact"))

    def test_icons_keep_shape_and_normalized_name(self):
        self.assertEqual(build_icon_name("bay leaf", "solid", "raw"), "bay_leaf_solid_raw")
        self.assertEqual(build_icon_name("pork", "cube", "raw"), "pork_cube_raw")
