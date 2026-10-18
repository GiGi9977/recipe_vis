import unittest

from data.heat_level import heat_level_errors


def edge(index, action="fry", type_="heat", **extra):
    return {"index": index, "action": action, "type": type_, "node1": 1, "node2": 2, **extra}


class HeatLevelFormatTest(unittest.TestCase):
    def test_valid_forms(self):
        edges = [
            edge(1, heat_level="low"),
            edge(2, action="simmer", heat_level="middle"),
            edge(3, action="bake", heat_level="high"),
            edge(4, action="simmer", heat_level={"low": 0.2, "high": 0.8}),
            edge(5, action="simmer", heat_level={"low": 0.33, "middle": 0.33, "high": 0.34}),
            edge(6),  # no level stated: key omitted
        ]
        self.assertEqual(heat_level_errors(edges), [])

    def test_only_on_heat_process_edges(self):
        edges = [
            edge(1, action="add", type_="prep", heat_level="low"),
            edge(2, action="split", type_="prep", heat_level="low"),
            edge(3, action="cut", type_="prep", heat_level="low"),
        ]
        self.assertEqual(len(heat_level_errors(edges)), 3)

    def test_rejects_bad_values(self):
        for value in ("medium", "", None, 0.5, ["low", "high"], {"low": 0.2, "high": 0.7},
                      {"low": 1.0}, {"low": 0.2, "boiling": 0.8}, {"low": "0.2", "high": 0.8},
                      {"low": -0.2, "high": 1.2}):
            with self.subTest(value=value):
                self.assertEqual(len(heat_level_errors([edge(1, heat_level=value)])), 1)


if __name__ == "__main__":
    unittest.main()
