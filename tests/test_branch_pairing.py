import json
import unittest
from pathlib import Path

from backend.matcher import build_branch_partition, pair_branches


DATA = Path(__file__).resolve().parents[1] / "data"


def load(prefix):
    return json.loads(next(DATA.glob(f"{prefix} *.json")).read_text(encoding="utf-8"))


def branch(mains=(), aux=(), sigs=()):
    return {"mains": frozenset(mains), "aux": frozenset(aux), "members": frozenset(),
            "sigs": list(sigs)}


class BranchPartitionTest(unittest.TestCase):
    """Branches are labelled by all of their main nodes; vessels never name one."""

    def test_eggplant_roasting_oven_is_in_the_eggplant_branch_not_the_final_branch(self):
        recipe13 = load(13)
        branch_of, info = build_branch_partition(recipe13)
        # R13: eggplant 7 -> cut 8 -> added into oven 9; the final oven is 1/2.
        self.assertEqual(branch_of[9], branch_of[7])
        self.assertEqual(info[branch_of[9]]["mains"], frozenset({"eggplant"}))
        self.assertEqual(branch_of[1], branch_of[2])
        self.assertNotEqual(branch_of[9], branch_of[2])
        self.assertEqual(info[branch_of[2]]["mains"], frozenset({"moussaka"}))

    def test_no_branch_is_named_after_a_container(self):
        for prefix in (3, 5, 12, 13):
            _, info = build_branch_partition(load(prefix))
            for entry in info.values():
                self.assertFalse(entry["mains"] & {"wok_pot", "oven", "sim_pot", "deep_pot"})


class BranchPairingTest(unittest.TestCase):
    def test_eggplant_branches_pair_and_final_branches_pair(self):
        recipe12, recipe13 = load(12), load(13)
        of12, info12 = build_branch_partition(recipe12)
        of13, info13 = build_branch_partition(recipe13)
        pairs = pair_branches(info12, info13)
        self.assertIn((of12[6], of13[7]), pairs)      # eggplant with eggplant
        self.assertIn((of12[58], of13[2]), pairs)     # final oven with final oven
        self.assertNotIn((of12[58], of13[9]), pairs)  # never final with eggplant

    def test_a_branch_is_paired_at_most_once(self):
        for left, right in ((12, 13), (2, 4), (3, 5)):
            _, info1 = build_branch_partition(load(left))
            _, info2 = build_branch_partition(load(right))
            pairs = pair_branches(info1, info2)
            self.assertEqual(len({a for a, _ in pairs}), len(pairs))
            self.assertEqual(len({b for _, b in pairs}), len(pairs))

    def test_tiers_identical_mains_then_shared_main_then_shared_aux(self):
        info1 = {1: branch(mains={"pork"}), 2: branch(mains={"pork", "egg"}),
                 3: branch(mains={"lamb"}, aux={"oil", "garlic"}), 4: branch(aux={"salt"})}
        info2 = {10: branch(mains={"pork"}), 20: branch(mains={"egg", "beef"}),
                 30: branch(mains={"beef"}, aux={"oil"}), 40: branch(aux={"salt", "pepper"})}
        pairs = pair_branches(info1, info2)
        self.assertIn((1, 10), pairs)   # identical main sets first
        self.assertIn((2, 20), pairs)   # then a shared main (egg)
        self.assertIn((3, 30), pairs)   # then no shared main but a shared aux (oil)
        self.assertIn((4, 40), pairs)   # aux-only branches pair on a shared aux
        self.assertEqual(len(pairs), 4)

    def test_branches_with_nothing_in_common_do_not_pair(self):
        pairs = pair_branches({1: branch(mains={"lamb"}, aux={"oil"})},
                              {1: branch(mains={"beef"}, aux={"salt"})})
        self.assertEqual(pairs, set())


if __name__ == "__main__":
    unittest.main()
