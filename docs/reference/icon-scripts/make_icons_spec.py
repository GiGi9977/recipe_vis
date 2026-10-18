# -*- coding: utf-8 -*-
import argparse, json, re, time
from pathlib import Path
from openai import OpenAI

client = None  # Initialize only when an API request is actually needed.

# Five peer categories; pieces has four shape subcategories.
PHYSICAL_CATEGORIES = ("solid", "pieces", "paste", "powder", "liquid")
PIECES_SUBCATEGORIES = ("cube", "slice", "shred", "dice")
ICON_STATES = PHYSICAL_CATEGORIES + PIECES_SUBCATEGORIES
ICON_STATE_TEMPLATES = {state: state for state in ICON_STATES}


def physical_template(icon_name):
    parts = str(icon_name).strip().lower().split("_")
    if parts[-1] in {"raw", "cooked", "none", "baked", "fried", "boiled"}:
        parts = parts[:-1]
    state = parts[-1] if parts else ""
    if state not in ICON_STATE_TEMPLATES:
        raise ValueError(f"Unsupported physical state in {icon_name!r}. Use ingredient_physical_chemical with physical in {ICON_STATES}.")
    return ICON_STATE_TEMPLATES[state]

FAMILY_MARKS = {'meat': ['none', 'fat_patch', 'steam'], 'egg': ['none', 'highlight_dot'], 'paste': ['none', 'dot', 'specks', 'swirl'], 'oil': ['none', 'highlight_dot'], 'sugar': ['none'], 'flour': ['none', 'secondary_patch'], 'sauce': ['none', 'surface_band'], 'cake': ['none', 'holes'], 'fruit': ['seeds', 'citrus_segments', 'leaf', 'berry_dots']}
FAMILIES = {
    family: {"templates": list(ICON_STATES), "variants": list(ICON_STATES), "marks": marks}
    for family, marks in FAMILY_MARKS.items()
}

def enforce_physical_template(spec):
    template = physical_template(spec["icon_name"])
    if template:
        spec["template"] = template
        # Model text/variant can contradict the authoritative filename shape.
        spec["variant"] = template
        spec["short_desc"] = f"{spec['icon_name']}; physical silhouette: {template}."
    return spec

# palette keys (LLM chooses keys; renderer maps to hex)
PALETTE_KEYS = [
  "meat_red", "meat_brown", "meat_white", "fat_white",
  "egg_white", "yolk_yellow",
  "paste_cream", "paste_yellow",
  "oil_gold", "sugar_white", "flour_white",
  "sauce_brown", "neutral_beige",
  "cake_gold", "fruit_red", "fruit_blue", "fruit_yellow", "fruit_green"
]

SYSTEM = (
  "You generate icon specs for a cooking visualization system.\n"
  "Return STRICT JSON only.\n"
  "Goal: stable icon families + reasonable variants.\n"
  "You MUST choose values only from the provided lists.\n"
)

def read_list(p: Path):
  return [ln.strip() for ln in p.read_text(encoding="utf-8").splitlines()
          if ln.strip() and not ln.strip().startswith("#")]

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

def infer_specs(icon_names, max_retries=3):
  for icon_name in icon_names:
    physical_template(icon_name)
  global client
  if client is None:
    client = OpenAI()
  families_json = json.dumps(FAMILIES, ensure_ascii=False)
  palette_json = json.dumps(PALETTE_KEYS, ensure_ascii=False)

  user = f"""
ICON_NAMES:
{json.dumps(icon_names, ensure_ascii=False)}

ALLOWED_FAMILIES_AND_CHOICES (do not invent values):
{families_json}

ALLOWED_PALETTE_KEYS:
{palette_json}

Task:
For EACH icon_name, output an object with fields:
- icon_name: string
- family: one of keys in ALLOWED_FAMILIES_AND_CHOICES
- template: one of that family's templates
- variant: one of that family's variants
- marks: 0-2 marks from that family's marks (array)
- colors: 2-3 palette keys (array) chosen from ALLOWED_PALETTE_KEYS
- short_desc: one sentence, but MUST be consistent with family/template/variant/marks (no extra inventions)

Important semantic rules:
- Physical categories are ONLY solid, pieces, paste, powder, liquid.
- The ONLY pieces subcategories are cube, slice, shred, dice.
- Read physical state from ingredient_physical_chemical, not ingredient words.
- template and variant MUST equal that physical state; invent no state names.
- If only pieces is provided, keep pieces; do not guess a subcategory.
- Family identifies the ingredient and does not override its physical state.
- Chemical state raw/cooked is separate from the physical variant.
- Cooked meat uses meat_brown and optionally steam; retain its physical template.
- Never change icon_name. Preserve solid in names such as egg_solid_raw.

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
        input=[{"role":"system","content":SYSTEM},{"role":"user","content":user}],
      )
      txt = extract_output_text(resp)
      data = json.loads(txt)
      if not isinstance(data, dict) or "specs" not in data or not isinstance(data["specs"], list):
        raise ValueError("Bad JSON schema")
      specs = data["specs"]
      if sorted(s.get("icon_name", "") for s in specs) != sorted(icon_names):
        raise ValueError("Response must preserve every requested icon_name exactly")
      return [enforce_physical_template(spec) for spec in specs]
    except Exception as e:
      last_err = e
      time.sleep(0.8*(attempt+1))
  raise RuntimeError(f"Failed to infer specs. Last error: {last_err}")

def main():
  ap = argparse.ArgumentParser()
  ap.add_argument("--in_txt", default="iconlabels.txt")
  ap.add_argument("--out_json", default="icon_specs.json")
  ap.add_argument("--batch", type=int, default=40, help="How many icon names per LLM call")
  args = ap.parse_args()

  names = read_list(Path(args.in_txt))
  if not names:
    raise ValueError("icons.txt is empty")

  all_specs = []
  for i in range(0, len(names), args.batch):
    chunk = names[i:i+args.batch]
    specs = infer_specs(chunk)
    all_specs.extend(specs)
    print(f"specs: {i+len(chunk)}/{len(names)}")

  out = {"specs": all_specs}
  Path(args.out_json).write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
  print("[OK] wrote", Path(args.out_json).resolve())

if __name__ == "__main__":
  main()