import copy
import json
import unittest
from pathlib import Path

from data.generate_previous import propagate_flavor_to_next_main


def node(index, kind="main", flavor="none"):
    return {"index": index, "type": kind, "flavor": flavor}


def graph(nodes, links):
    return {"nodes": nodes, "edges": [
        {"index": i, "node1": u, "node2": v, "action": action}
        for i, (u, v, action) in enumerate(links, 1)
    ]}


class FlavorPropagationTests(unittest.TestCase):
    def test_container_and_aux_process_branches(self):
        recipe = graph([
            node(1, "aux", "sweet"), node(2, "container"),
            node(3, "aux"), node(4), node(5, "container"),
            node(6, flavor="savory"), node(7, "aux", "sour"),
        ], [(1, 2, "add"), (2, 3, "heat"), (3, 4, "add"),
            (7, 4, "add"), (4, 5, "add"), (5, 6, "bake")])
        propagate_flavor_to_next_main(recipe)
        self.assertEqual(recipe["nodes"][2]["flavor"], "sweet")
        self.assertEqual(recipe["nodes"][5]["flavor"], ["savory", "sweet", "sour"])
        for i in (1, 3, 4):
            self.assertEqual(recipe["nodes"][i]["flavor"], "none")

    def test_branch_merge_does_not_depend_on_node_ids_or_list_order(self):
        recipe = graph([
            node(1), node(2), node(30), node(40, "aux", "aromatic"),
            node(50), node(60, "aux", "sweet"), node(70, flavor="spicy"),
        ], [(40, 50, "add"), (50, 30, "stir"), (60, 30, "add"),
            (30, 1, "add"), (1, 2, "stir")])
        shuffled = copy.deepcopy(recipe)
        shuffled["nodes"].reverse()
        shuffled["edges"].reverse()
        for candidate in (recipe, shuffled):
            propagate_flavor_to_next_main(candidate)
            flavors = {n["index"]: n["flavor"] for n in candidate["nodes"]}
            self.assertEqual(flavors[2], ["aromatic", "sweet"])
            self.assertEqual(flavors[30], "aromatic")
            self.assertEqual(flavors[70], "spicy")
            once = copy.deepcopy(candidate)
            propagate_flavor_to_next_main(candidate)
            self.assertEqual(candidate, once)

    def test_existing_cake_fixture_flavors_survive_oven(self):
        path = Path(__file__).parent / "fixtures" / "cake_branch_2.json"
        recipe = json.loads(path.read_text(encoding="utf-8"))
        propagate_flavor_to_next_main(recipe)
        nodes = {int(n["index"]): n for n in recipe["nodes"]}
        self.assertEqual(set(nodes[24]["flavor"]), {"savory", "sweet", "sour", "salty"})
        self.assertEqual(nodes[20]["flavor"], "none")

    def test_cycle_is_reported_without_mutating_flavors(self):
        recipe = graph([node(1, flavor="sweet"), node(2)],
                       [(1, 2, "stir"), (2, 1, "add")])
        before = copy.deepcopy(recipe)
        with self.assertRaisesRegex(ValueError, "Cycle"):
            propagate_flavor_to_next_main(recipe)
        self.assertEqual(recipe, before)


if __name__ == "__main__":
    unittest.main()
