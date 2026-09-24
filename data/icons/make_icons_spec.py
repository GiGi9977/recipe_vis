# -*- coding: utf-8 -*-
import argparse
import json
import time
from pathlib import Path

from openai import OpenAI


client = None  # Initialize only when an API request is actually needed.


# ============================================================
# Physical-state vocabulary
# ============================================================

# All physical states are peer categories.
# There is NO generic "pieces" category.
# chunk / slice / shred / dice are independent physical states.
PHYSICAL_CATEGORIES = (
    "solid",
    "chunk",
    "slice",
    "shred",
    "dice",
    "paste",
    "powder",
    "liquid",
)

ICON_STATES = PHYSICAL_CATEGORIES

ICON_STATE_TEMPLATES = {
    state: state
    for state in ICON_STATES
}


def physical_template(icon_name):
    """
    Extract physical state from an icon name.

    Expected naming format:
        ingredient_physical_chemical

    Examples:
        pork_chunk_raw
        ginger_slice_raw
        pork_shred_raw
        onion_dice_raw
        sauce_paste_cooked
        salt_powder_raw
        oil_liquid_raw
        egg_solid_raw

    The chemical state is removed first, then the final remaining token
    must be one of PHYSICAL_CATEGORIES.
    """

    parts = str(icon_name).strip().lower().split("_")

    # Remove chemical / cooking-state suffix.
    if parts and parts[-1] in {
        "raw",
        "cooked",
        "none",
        "baked",
        "fried",
        "boiled",
    }:
        parts = parts[:-1]

    state = parts[-1] if parts else ""

    if state not in ICON_STATE_TEMPLATES:
        raise ValueError(
            f"Unsupported physical state in {icon_name!r}. "
            f"Expected icon naming format ingredient_physical_chemical, "
            f"with physical state in {PHYSICAL_CATEGORIES}."
        )

    return ICON_STATE_TEMPLATES[state]


# ============================================================
# Icon families
# ============================================================

FAMILY_MARKS = {
    "meat": [
        "none",
        "fat_patch",
        "steam",
    ],
    "egg": [
        "none",
        "highlight_dot",
    ],
    "paste": [
        "none",
        "dot",
        "specks",
        "swirl",
    ],
    "oil": [
        "none",
        "highlight_dot",
    ],
    "sugar": [
        "none",
    ],
    "flour": [
        "none",
        "secondary_patch",
    ],
    "sauce": [
        "none",
        "surface_band",
    ],
    "cake": [
        "none",
        "holes",
    ],
    "fruit": [
        "seeds",
        "citrus_segments",
        "leaf",
        "berry_dots",
    ],
}


FAMILIES = {
    family: {
        "templates": list(ICON_STATES),
        "variants": list(ICON_STATES),
        "marks": marks,
    }
    for family, marks in FAMILY_MARKS.items()
}


# ============================================================
# Enforce physical state from filename
# ============================================================

def enforce_physical_template(spec):
    """
    The physical state encoded in icon_name is authoritative.

    The LLM may choose family / marks / colors, but it cannot reinterpret
    the physical state.
    """

    template = physical_template(spec["icon_name"])

    spec["template"] = template
    spec["variant"] = template

    spec["short_desc"] = (
        f"{spec['icon_name']}; physical silhouette: {template}."
    )

    return spec


# ============================================================
# Palette
# ============================================================

# Palette keys:
# LLM chooses keys; renderer maps them to actual colors.
PALETTE_KEYS = [
    "meat_red",
    "meat_brown",
    "meat_white",
    "fat_white",

    "egg_white",
    "yolk_yellow",

    "paste_cream",
    "paste_yellow",

    "oil_gold",

    "sugar_white",
    "flour_white",

    "sauce_brown",
    "neutral_beige",

    "cake_gold",

    "fruit_red",
    "fruit_blue",
    "fruit_yellow",
    "fruit_green",
]


# ============================================================
# LLM system prompt
# ============================================================

SYSTEM = (
    "You generate icon specs for a cooking visualization system.\n"
    "Return STRICT JSON only.\n"
    "Goal: stable icon families + reasonable variants.\n"
    "You MUST choose values only from the provided lists.\n"
)


# ============================================================
# Utility
# ============================================================

def read_list(p: Path):
    return [
        ln.strip()
        for ln in p.read_text(encoding="utf-8").splitlines()
        if ln.strip()
        and not ln.strip().startswith("#")
    ]


def extract_output_text(resp) -> str:
    if getattr(resp, "output_text", None):
        return resp.output_text.strip()

    out = []

    for item in resp.output:
        if getattr(item, "type", None) == "message":
            for c in item.content:
                if getattr(c, "type", None) == "output_text":
                    out.append(c.text)

    return "".join(out).strip()


# ============================================================
# Infer icon specs
# ============================================================

def infer_specs(icon_names, max_retries=3):

    # Validate all physical states BEFORE spending an API call.
    for icon_name in icon_names:
        physical_template(icon_name)

    global client

    if client is None:
        client = OpenAI()

    families_json = json.dumps(
        FAMILIES,
        ensure_ascii=False,
    )

    palette_json = json.dumps(
        PALETTE_KEYS,
        ensure_ascii=False,
    )

    physical_json = json.dumps(
        list(PHYSICAL_CATEGORIES),
        ensure_ascii=False,
    )

    user = f"""
ICON_NAMES:
{json.dumps(icon_names, ensure_ascii=False)}

ALLOWED_PHYSICAL_STATES:
{physical_json}

ALLOWED_FAMILIES_AND_CHOICES (do not invent values):
{families_json}

ALLOWED_PALETTE_KEYS:
{palette_json}

Task:

For EACH icon_name, output an object with fields:

- icon_name: string

- family:
  one of the keys in ALLOWED_FAMILIES_AND_CHOICES

- template:
  MUST equal the physical state encoded in icon_name

- variant:
  MUST equal the physical state encoded in icon_name

- marks:
  0-2 marks from that family's allowed marks

- colors:
  2-3 palette keys chosen from ALLOWED_PALETTE_KEYS

- short_desc:
  one sentence consistent with the icon's
  family, physical state, marks, and colors


==================================================
PHYSICAL-STATE RULES
==================================================

Physical state MUST be exactly one of:

solid
chunk
slice
shred
dice
paste
powder
liquid


These are EIGHT peer physical-state categories.

There is NO generic "pieces" state.

Do NOT output:

pieces
small_pieces
cube
cut

as physical states.


Use:

chunk

for irregular or relatively large cut pieces.

Use:

slice

for thin or flat sliced forms.

Use:

shred

for thin elongated shredded forms.

Use:

dice

for small regularly diced forms.


Examples:

pork_chunk_raw
→ physical state = chunk

ginger_slice_raw
→ physical state = slice

pork_shred_raw
→ physical state = shred

onion_dice_raw
→ physical state = dice

egg_solid_raw
→ physical state = solid

sauce_paste_cooked
→ physical state = paste

salt_powder_raw
→ physical state = powder

oil_liquid_raw
→ physical state = liquid


==================================================
ICON-NAME INTERPRETATION
==================================================

Read physical state from:

ingredient_physical_chemical


The physical state encoded in icon_name is AUTHORITATIVE.

Do NOT infer physical state from the ingredient identity.

For example:

egg_solid_raw

MUST remain:

template = solid
variant = solid


Do NOT change it merely because the family is "egg".


Likewise:

pork_slice_cooked

MUST use:

template = slice
variant = slice


Family identifies the ingredient's visual family.

Family does NOT override physical state.


==================================================
TEMPLATE AND VARIANT
==================================================

template and variant MUST BOTH equal the physical state encoded in
icon_name.

Examples:

pork_chunk_raw

template = chunk
variant = chunk


ginger_shred_raw

template = shred
variant = shred


salt_powder_raw

template = powder
variant = powder


Do NOT invent template or variant names.


==================================================
CHEMICAL STATE
==================================================

Chemical state is separate from physical state.

For example:

pork_chunk_raw

and:

pork_chunk_cooked

both use:

template = chunk
variant = chunk


Chemical state may affect colors or marks,
but MUST NOT change the physical template.


Cooked meat may use:

meat_brown

and optionally:

steam

while retaining the physical state encoded in icon_name.


==================================================
GENERAL RULES
==================================================

- Never change icon_name.

- Preserve the exact requested icon_name.

- Use only allowed families.

- Use only allowed templates.

- Use only allowed variants.

- Use only allowed marks for the selected family.

- Use only allowed palette keys.

- Do not invent physical states.

- Do not convert chunk / slice / shred / dice into a generic pieces
  category.

- Do not treat chunk / slice / shred / dice as subcategories of pieces.

They are independent physical states.


Output JSON schema:

{{
  "specs": [
    {{
      "icon_name": "...",
      "family": "...",
      "template": "...",
      "variant": "...",
      "marks": ["..."],
      "colors": ["..."],
      "short_desc": "..."
    }}
  ]
}}
""".strip()

    last_err = None

    for attempt in range(max_retries):
        try:
            resp = client.responses.create(
                model="gpt-5-mini",
                input=[
                    {
                        "role": "system",
                        "content": SYSTEM,
                    },
                    {
                        "role": "user",
                        "content": user,
                    },
                ],
            )

            txt = extract_output_text(resp)

            data = json.loads(txt)

            if (
                not isinstance(data, dict)
                or "specs" not in data
                or not isinstance(data["specs"], list)
            ):
                raise ValueError("Bad JSON schema")

            specs = data["specs"]

            # Make sure every requested icon is returned exactly once.
            returned_names = sorted(
                s.get("icon_name", "")
                for s in specs
            )

            requested_names = sorted(icon_names)

            if returned_names != requested_names:
                raise ValueError(
                    "Response must preserve every requested "
                    "icon_name exactly"
                )

            # Filename physical state is authoritative.
            specs = [
                enforce_physical_template(spec)
                for spec in specs
            ]

            return specs

        except Exception as e:
            last_err = e
            time.sleep(0.8 * (attempt + 1))

    raise RuntimeError(
        f"Failed to infer specs. Last error: {last_err}"
    )


# ============================================================
# Main
# ============================================================

def main():

    ap = argparse.ArgumentParser()

    ap.add_argument(
        "--in_txt",
        default="iconlabels.txt",
    )

    ap.add_argument(
        "--out_json",
        default="icon_specs.json",
    )

    ap.add_argument(
        "--batch",
        type=int,
        default=40,
        help="How many icon names per LLM call",
    )

    args = ap.parse_args()

    names = read_list(
        Path(args.in_txt)
    )

    if not names:
        raise ValueError(
            f"{args.in_txt} is empty"
        )

    all_specs = []

    for i in range(
        0,
        len(names),
        args.batch,
    ):
        chunk = names[
            i:i + args.batch
        ]

        specs = infer_specs(chunk)

        all_specs.extend(specs)

        print(
            f"specs: "
            f"{i + len(chunk)}/{len(names)}"
        )

    out = {
        "specs": all_specs
    }

    Path(args.out_json).write_text(
        json.dumps(
            out,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(
        "[OK] wrote",
        Path(args.out_json).resolve(),
    )


if __name__ == "__main__":
    main()