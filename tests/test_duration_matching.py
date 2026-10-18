import contextlib
import copy
import io
import unittest

from backend.graph_builder import build_full_graph_main_aux
from backend.matcher import compare_recipes
from test_branch_labels import recipe


def recipe_with_duration(duration_marker):
    value = recipe([("pork", "main"), ("pork", "main")], [(1, 2, "fry")])
    if duration_marker is not None:
        value["edges"][0]["duration"] = duration_marker
    return value


def compare(left, right):
    with contextlib.redirect_stdout(io.StringIO()):
        return compare_recipes(left, right)


class DurationMatchingTest(unittest.TestCase):
    def test_missing_duration_is_exact_and_inherited_by_shared_output(self):
        for left_duration, right_duration in (("5 minutes", None), (None, "5 minutes")):
            left = recipe_with_duration(left_duration)
            right = recipe_with_duration(right_duration)
            before = copy.deepcopy((left, right))

            records = compare(left, right)
            self.assertTrue(any(
                record.kind == "exact"
                and (record.r1_out_node, record.r2_out_node) == (2, 2)
                for record in records
            ))

            with contextlib.redirect_stdout(io.StringIO()):
                graph = build_full_graph_main_aux(
                    left, right, compare_main_fn=compare_recipes
                )
            shared = [
                edge for edge in graph["edges"]
                if edge["style"] == "shared" and edge["action"] == "fry"
            ]
            self.assertEqual(len(shared), 1)
            self.assertEqual(shared[0]["duration"], "5 minutes")
            self.assertEqual((left, right), before)

    def test_equal_explicit_durations_remain_exact(self):
        records = compare(
            recipe_with_duration(" 5 Minutes "),
            recipe_with_duration("5 minutes"),
        )
        self.assertTrue(any(record.kind == "exact" for record in records))

    def test_different_explicit_durations_split_edges_without_changing_node_match(self):
        left = recipe_with_duration("5 minutes")
        right = recipe_with_duration("10 minutes")
        records = compare(left, right)
        self.assertTrue(any(
            record.kind == "exact"
            and (record.r1_out_node, record.r2_out_node) == (2, 2)
            for record in records
        ))

        with contextlib.redirect_stdout(io.StringIO()):
            graph = build_full_graph_main_aux(
                left, right, compare_main_fn=compare_recipes
            )
        fry_edges = [edge for edge in graph["edges"] if edge["action"] == "fry"]
        self.assertEqual({edge["style"] for edge in fry_edges}, {"R1", "R2"})
        self.assertEqual(
            {edge["duration"] for edge in fry_edges},
            {"5 minutes", "10 minutes"},
        )


if __name__ == "__main__":
    unittest.main()
