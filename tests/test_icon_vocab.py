import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

ICONS = Path(__file__).resolve().parents[1] / "data" / "icons"
sys.path.insert(0, str(ICONS))

import build_icons  # noqa: E402
import generate_icons_svg  # noqa: E402
import icon_vocab  # noqa: E402
import make_icons_spec  # noqa: E402


def spec(name, state):
    return {"icon_name": name, "family": "paste", "template": state, "variant": state,
            "marks": [], "colors": ["paste_cream"], "short_desc": ""}


class VocabularyTest(unittest.TestCase):
    def test_batter_and_mash_are_physical_states_and_whole_is_solid(self):
        for state in ("batter", "mash"):
            self.assertIn(state, icon_vocab.PHYSICAL_STATES)
        self.assertEqual(icon_vocab.physical_state_of("bay_leaf_whole_raw"), "solid")
        self.assertEqual(icon_vocab.physical_state_of("potato_mash_cooked"), "mash")
        self.assertEqual(icon_vocab.physical_state_of("cake_paste_batter_raw"), "batter")
        self.assertIsNone(icon_vocab.physical_state_of("pork_pieces_raw"))

    def test_size_scale_gets_smaller_from_intact_to_powder(self):
        levels = [icon_vocab.SIZE_LEVELS[state][0] for state in icon_vocab.SIZE_ORDER]
        self.assertEqual(levels, sorted(levels))
        self.assertEqual(levels[0], 1)
        self.assertGreater(levels[-1], levels[0])

    def test_water_scale_gets_wetter_from_mash_to_liquid(self):
        percent = [icon_vocab.WATER_LEVELS[state][0] for state in icon_vocab.WATER_ORDER]
        self.assertEqual(percent, sorted(set(percent)))
        self.assertEqual(percent[-1], 100)

    def test_level_text_names_the_scale_of_each_state(self):
        self.assertIn("SIZE LEVEL", icon_vocab.level_text("chunk"))
        self.assertIn("WATER LEVEL 35%", icon_vocab.level_text("mash"))
        self.assertIn("WATER LEVEL 75%", icon_vocab.level_text("batter"))
        self.assertEqual(icon_vocab.level_text("unknown"), "")


class PromptTest(unittest.TestCase):
    def test_image_prompts_differ_between_mash_paste_and_batter(self):
        prompts = {state: generate_icons_svg.spec_to_prompt(spec(f"cake_{state}_raw", state))
                   for state in ("mash", "paste", "batter", "liquid")}
        self.assertEqual(len(set(prompts.values())), 4)
        self.assertIn("lumps", prompts["mash"])
        self.assertIn("drip", prompts["batter"])
        for prompt in prompts.values():
            self.assertIn("WATER LEVEL", prompt)

    def test_image_prompts_say_how_big_each_solid_form_is(self):
        big = generate_icons_svg.spec_to_prompt(spec("beef_chunk_raw", "chunk"))
        small = generate_icons_svg.spec_to_prompt(spec("sugar_powder_raw", "powder"))
        self.assertIn("SIZE LEVEL 2 of 5", big)
        self.assertIn("SIZE LEVEL 5 of 5", small)
        self.assertIn("whole", generate_icons_svg.ICON_STATE_TEMPLATES)

    def test_spec_prompt_lists_every_state_and_both_scales(self):
        sent = {}

        class Client:
            class responses:
                @staticmethod
                def create(model, input):
                    sent["user"] = input[1]["content"]
                    names = json.loads(sent["user"].split("ICON_NAMES:")[1].split("ALLOWED_PHYSICAL_STATES")[0])
                    return SimpleNamespace(output_text=json.dumps({"specs": [
                        {"icon_name": n, "family": "paste", "template": "paste", "variant": "paste",
                         "marks": [], "colors": ["paste_cream"], "short_desc": "x"} for n in names]}))

        previous, make_icons_spec.client = make_icons_spec.client, Client
        try:
            result = make_icons_spec.infer_specs(["potato_mash_cooked", "cake_batter_raw", "bay_leaf_whole_raw"])
        finally:
            make_icons_spec.client = previous
        text = sent["user"]
        for state in icon_vocab.PHYSICAL_STATES:
            self.assertIn(state, text)
        self.assertIn("SIZE", text)
        self.assertIn("WATER", text)
        # The state in the name is authoritative, whatever the model answered.
        by_name = {s["icon_name"]: s for s in result}
        self.assertEqual(by_name["potato_mash_cooked"]["template"], "mash")
        self.assertEqual(by_name["cake_batter_raw"]["variant"], "batter")
        self.assertEqual(by_name["bay_leaf_whole_raw"]["template"], "solid")


class BuildPlanTest(unittest.TestCase):
    def write_recipe(self, folder, nodes):
        (Path(folder) / "1 test.json").write_text(json.dumps({"nodes": nodes, "edges": []}), encoding="utf-8")

    def node(self, name, physical, chemical="raw", kind="main"):
        return {"index": 1, "name": name, "type": kind, "physical_state": physical, "chemical_state": chemical}

    def test_labels_accept_whole_batter_and_mash_and_skip_containers(self):
        with tempfile.TemporaryDirectory() as folder:
            self.write_recipe(folder, [self.node("bay leaf", "whole"), self.node("cake paste", "batter"),
                                       self.node("potato", "mash", "cooked"), self.node("wok_pot", None, None, "container")])
            labels, recipes = build_icons.collect_labels(folder)
        self.assertEqual(labels, ["bay_leaf_whole_raw", "cake_paste_batter_raw", "potato_mash_cooked"])
        self.assertEqual(recipes, 1)

    def test_unusable_state_stops_before_anything_is_generated(self):
        with tempfile.TemporaryDirectory() as folder:
            self.write_recipe(folder, [self.node("cake", "foam")])
            with self.assertRaises(SystemExit):
                build_icons.collect_labels(folder)

    def test_only_icons_without_a_png_are_missing(self):
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder) / "potato_mash_cooked.png").write_bytes(b"png")
            missing = build_icons.missing_labels(["potato_mash_cooked", "cake_paste_batter_raw"], folder)
        self.assertEqual(missing, ["cake_paste_batter_raw"])

    def test_plan_counts_api_calls_and_states(self):
        summary = build_icons.plan(["a_mash_raw", "b_batter_raw", "c_batter_raw"], batch=2, candidates=3)
        self.assertEqual(summary["spec_calls"], 2)
        self.assertEqual(summary["image_calls"], 9)
        self.assertEqual(summary["by_state"], {"batter": 2, "mash": 1})

    def test_dry_run_calls_no_api_and_writes_nothing(self):
        with tempfile.TemporaryDirectory() as folder:
            self.write_recipe(folder, [self.node("potato", "mash", "cooked")])
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                code = build_icons.main(["--data", folder, "--only", "potato_mash_cooked"])
        self.assertEqual(code, 0)
        self.assertIn("Dry run", out.getvalue())
        self.assertNotIn("openai", sys.modules)


if __name__ == "__main__":
    unittest.main()
