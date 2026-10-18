# -*- coding: utf-8 -*-
"""Physical-state vocabulary shared by the icon scripts.

Icon names are ingredient_physical_chemical, for example pork_chunk_raw or
potato_mash_cooked. The physical state in the name picks the silhouette. Two scales say HOW the
silhouette differs between states, so the generated icons can be told apart:

- SIZE scale (solid forms): intact -> chunk -> slice/dice -> shred -> powder.
  Higher level = smaller units and more of them.
- WATER scale (solid-liquid mixtures): mash -> paste -> batter -> liquid.
  Higher level = more water: flatter, runnier, more spread, with drips.
  The percentages match the liquid share of the frontend's physical ring.
"""

# Names in recipe data that map onto a template of another state.
ALIASES = {"whole": "solid"}

SIZE_ORDER = ("solid", "chunk", "slice", "dice", "shred", "powder")
WATER_ORDER = ("mash", "paste", "batter", "liquid")

PHYSICAL_STATES = ("solid", "chunk", "slice", "shred", "dice", "powder",
                   "mash", "paste", "batter", "liquid")

# state -> (level, text). Levels: slice and dice are the same granularity.
SIZE_LEVELS = {
    "solid":  (1, "one intact piece, the BIGGEST form: a single shape filling about 65% of the icon."),
    "chunk":  (2, "3 BIG irregular chunks, each about 25% of the icon: fewer and larger than slices or dice."),
    "slice":  (3, "3 broad flat slices, wide and thin, each about 22% of the icon wide: medium size."),
    "dice":   (3, "5 small square cubes, each about 12% of the icon: medium size, smaller and more numerous than chunks."),
    "shred":  (4, "6 thin elongated strips, each under 8% of the icon wide: smaller than dice, long and slender."),
    "powder": (5, "the SMALLEST form: a low heap made of 10-14 tiny grains, each under 4% of the icon; no pieces."),
}
SIZE_TOP = max(level for level, _ in SIZE_LEVELS.values())

WATER_LEVELS = {
    "mash":   (35, "about 35% water, the DRIEST mixture: a tall lumpy heap with a flat top and 3-4 coarse lumps on its surface; stiff, holds its shape, no gloss, no drip."),
    "paste":  (55, "about 55% water, wetter than mash: a smooth rounded thick mound with one soft highlight patch; no lumps, no drip."),
    "batter": (75, "about 75% water, wetter than paste: a low flat spreading pool with a wavy glossy surface and one thick drip hanging from its edge; clearly runnier than paste, thicker than a liquid."),
    "liquid": (100, "100% water, the WETTEST: one smooth droplet or liquid surface with no solid parts."),
}


def canonical_state(state):
    """Template state for a physical state in the data (whole -> solid)."""
    state = str(state or "").strip().lower()
    state = ALIASES.get(state, state)
    return state if state in PHYSICAL_STATES else None


# Chemical suffixes that follow the physical state in an icon name.
CHEMICAL_SUFFIXES = {"raw", "cooked", "none", "baked", "fried", "boiled"}


def physical_state_of(icon_name):
    """Canonical physical state encoded at the end of an icon name, or None."""
    parts = str(icon_name).strip().lower().split("_")
    if parts and parts[-1] in CHEMICAL_SUFFIXES:
        parts = parts[:-1]
    return canonical_state(parts[-1]) if parts else None


def level_text(state):
    """One prompt line telling the generator where the state sits on its scale."""
    state = canonical_state(state)
    if state in SIZE_LEVELS:
        level, text = SIZE_LEVELS[state]
        return (f"SIZE LEVEL {level} of {SIZE_TOP} (1 = one big intact piece, {SIZE_TOP} = finest powder; "
                f"higher = smaller and more numerous units): {text}")
    if state in WATER_LEVELS:
        percent, text = WATER_LEVELS[state]
        return (f"WATER LEVEL {percent}% (mash 35 < paste 55 < batter 75 < liquid 100; "
                f"more water = flatter, runnier, more spread with drips; less water = taller, lumpier): {text}")
    return ""


def vocabulary_prompt():
    """Rules block for the spec-writing LLM."""
    sizes = "\n".join(f"- {state}: {SIZE_LEVELS[state][1]}" for state in SIZE_ORDER)
    waters = "\n".join(f"- {state}: {WATER_LEVELS[state][1]}" for state in WATER_ORDER)
    return (
        "Solid forms differ by SIZE (bigger -> smaller units):\n" + sizes +
        "\n\nSolid-liquid mixtures differ by WATER (less -> more water):\n" + waters)
