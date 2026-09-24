# -*- coding: utf-8 -*-
import argparse, base64, json, time
from io import BytesIO
from pathlib import Path
from typing import Dict, Any, List, Tuple
import re

from openai import OpenAI
from PIL import Image

client = None  # Initialize only when an API request is actually needed.

# palette mapping (keys -> hex)
PALETTE = {
  "meat_red":     "#D85A5A",
  "meat_brown":   "#8B4B3B",
  "meat_white":   "#FFEAEB",
  "fat_white":    "#F3E9E6",
  "egg_white":    "#F7F7F7",
  "yolk_yellow":  "#F2D45C",
  "paste_cream":  "#F3E9E6",
  "paste_yellow": "#F2D45C",
  "oil_gold":     "#E6C14A",
  "sugar_white":  "#F4F4F4",
  "flour_white":  "#F2F2F2",
  "sauce_brown":  "#6B4E3D",
  "water_blue":   "#6BB0FF",
  "neutral_beige":"#E8DCCF",
  "cake_gold":    "#E3B85A",
  "fruit_red":    "#F05E54",
  "fruit_yellow": "#FADE42",
  "fruit_blue":   "#7271CF",
  "fruit_green":  "#A1DD99",
}

STYLE = """
STYLE (strict):
- flat 2D pictogram icon with SOLID color fills (NO outlines/strokes)
- NO perspective, NO 3D, NO shading, NO gradients, NO textures
- transparent background, centered, ~10% padding, readable at 32px
- no text, no numbers, no watermark
- simple shapes only (2–5 closed shapes max)
""".strip()

# Template descriptions (stable silhouettes)
TEMPLATES = {
  "meat_slab": "a single steak slab silhouette (rounded rectangle/kidney-like).",
  "meat_cubes_pile": "a pile of 3–6 small cubes stacked/clustered.",
  "meat_minced_mound": "a rounded minced mound with 6–10 tiny granule dots (as filled dots).",
  "meat_slices": "2–3 overlapping slices (rounded rectangles).",

  "egg_whole": "one oval egg shape.",
  "egg_cracked": "two cracked shell halves plus one white blob/droplet below.",
  "egg_yolk_circle": "one circle yolk with a tiny highlight dot.",

  "paste_blob": "one thick paste blob mound with a small highlight patch.",
  "droplet": "one droplet silhouette with tiny highlight dot.",
  "crystals_cluster": "a cluster of 4–7 small crystal diamonds/squares.",
  "mound": "a flour mound heap with an optional secondary patch for volume.",
  "bowl_liquid": "a small bowl silhouette with a liquid surface band.",
  "cake_block": "a round cake block with 2–4 small holes dots.",
  "cake_slice": "a simple cake slice (triangle) with 2–4 holes dots.",
  "fruit_whole": "fruit shape silhouette",
  "fruit_slice": "one fruit slice: a semicircle/round slice with 3–5 small seed dots inside.",
  "fruit_cubes_pile": "a pile of 3–6 small fruit cubes clustered (rounded squares).",
  "fruit_puree_blob": "one thick puree blob (jam-like mound) with a small highlight patch.",
  "fruit_juice_droplet": "one droplet silhouette (juice) with a tiny highlight dot.",
}


# Match uses the pieces category; icons retain the shape in the original name.
# Parse only the state suffix, not ingredient words (e.g. sliced_fish).
ICON_STATE_TEMPLATES = {
    "cube": "pieces_chunks", "cubes": "pieces_chunks", "cubed": "pieces_chunks",
    "chunk": "pieces_chunks", "chunks": "pieces_chunks", "block": "pieces_chunks", "blocks": "pieces_chunks", "块": "pieces_chunks",
    "slice": "pieces_slices", "slices": "pieces_slices", "sliced": "pieces_slices", "片": "pieces_slices",
    "shred": "pieces_shreds", "shreds": "pieces_shreds", "shredded": "pieces_shreds",
    "strip": "pieces_shreds", "strips": "pieces_shreds", "julienne": "pieces_shreds", "julienned": "pieces_shreds", "丝": "pieces_shreds",
    "dice": "pieces_dice", "diced": "pieces_dice", "丁": "pieces_dice",
    "pieces": "pieces_chunks", "piece": "pieces_chunks", "cut": "pieces_chunks",
    "solid": "solid_form", "paste": "paste_blob", "powder": "powder_mound", "liquid": "liquid_drop",
}


def physical_template(icon_name):
    parts = str(icon_name).strip().lower().split("_")
    # Standard runtime filename: ingredient_physical_chemical.
    # Also accept ingredient_physical when chemical state is omitted.
    if parts[-1] in {"raw", "cooked", "none", "baked", "fried", "boiled"}:
        parts = parts[:-1]
    return ICON_STATE_TEMPLATES.get(parts[-1]) if parts else None

TEMPLATES.update({
    "pieces_chunks": "3 large irregular chunky blocks of the ingredient, visibly thick and substantial.",
    "pieces_slices": "3 broad thin overlapping slices of the ingredient, wide flat silhouettes.",
    "pieces_shreds": "4 long narrow matchstick strips of the ingredient, clearly slender and elongated.",
    "pieces_dice": "5 small uniform square dice of the ingredient, separated in a neat group; not large irregular chunks.",
    "solid_form": "one intact solid form of the named ingredient, without cutting or fragmentation.",
    "powder_mound": "a fine powder heap silhouette with 2 tiny grain dots; no cubes or chunks.",
    "liquid_drop": "one smooth liquid droplet silhouette; no solid pieces.",
})

MARKS = {
  "fat_patch": "add 1–2 small off-white fat patches on the meat.",
  "steam": "add 2 small steam curves above the food as filled shapes.",
  "highlight_dot": "add a tiny highlight dot.",
  "dot": "add 1 small dot mark.",
  "specks": "add 3 tiny speck dots.",
  "swirl": "add a small swirl highlight mark.",
  "secondary_patch": "add a slightly darker flat patch to suggest volume.",
  "surface_band": "make the liquid surface a darker filled band.",
  "holes": "add 2–4 small round holes dots.",
  "leaf": "add one small leaf shape on top (filled).",
  "seeds": "add 3–5 tiny seed dots inside the slice (filled).",
  "citrus_segments": "add 3–5 simple segment wedges inside the slice (filled).",
  "berry_dots": "add 6–10 tiny dots to suggest berries (filled).",
  "none": "",
}

def trim_transparent(im: Image.Image, pad: int = 12) -> Image.Image:
  im = im.convert("RGBA")
  alpha = im.split()[-1]
  bbox = alpha.getbbox()
  if not bbox:
    return im
  x0, y0, x1, y1 = bbox
  x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
  x1 = min(im.width, x1 + pad); y1 = min(im.height, y1 + pad)
  return im.crop((x0, y0, x1, y1))

def alpha_coverage(im: Image.Image) -> float:
  a = im.split()[-1]
  nz = sum(1 for v in a.getdata() if v > 8)
  return nz / (im.width * im.height)

def choose_best(cands: List[Tuple[float, Image.Image]]) -> Image.Image:
  target = 0.22
  cands.sort(key=lambda x: abs(x[0]-target))
  return cands[0][1]

def spec_to_prompt(spec: Dict[str, Any]) -> str:
  desc = spec.get("short_desc", "")
  icon = spec["icon_name"]
  template = physical_template(icon) or spec["template"]
  if physical_template(icon):
    desc = f"{icon}; use the physical silhouette below exactly, preserving the ingredient identity."
  marks = spec.get("marks", [])
  colors = spec.get("colors", [])

  # map palette keys to hex (still keep keys in prompt for clarity)
  hex_list = [PALETTE.get(k, "#999999") for k in colors]
  color_line = " / ".join([f"{k}({PALETTE.get(k,'#999')})" for k in colors])

  tmpl_desc = TEMPLATES.get(template, "a simple pictogram silhouette.")
  mark_desc = " ".join([MARKS.get(m, "") for m in marks if m])

  return f"""{STYLE}

Design icon for: "{icon}"

DESC:
- {desc if desc else "none"}

SILHOUETTE TEMPLATE:
- {tmpl_desc}

MARKS:
- {mark_desc if mark_desc.strip() else "no extra marks"}

COLOR PALETTE (use ONLY these 2–3 solid fills; no stroke):
- {color_line}

IMPORTANT:
- Use filled shapes only. NO outlines/strokes.
- Keep centered with padding.
- 2–5 shapes max.
- Transparent background.
""".strip()

def call_image(prompt: str, retries: int = 3) -> Image.Image:
  global client
  if client is None:
    client = OpenAI()
  last = None
  for a in range(retries):
    try:
      r = client.images.generate(
        model="gpt-image-1-mini",
        prompt=prompt,
        size="1024x1024",
        background="transparent",
      )
      img = base64.b64decode(r.data[0].b64_json)
      return Image.open(BytesIO(img)).convert("RGBA")
    except Exception as e:
      last = e
      time.sleep(0.9*(a+1))
  raise RuntimeError(f"image gen failed: {last}")

def main():
  ap = argparse.ArgumentParser()
  ap.add_argument("--in_json", default="icon_specs.json")
  ap.add_argument("--out_dir", default="icons_png")
  ap.add_argument("--size", type=int, default=128)
  ap.add_argument("--candidates", type=int, default=3)
  args = ap.parse_args()

  data = json.loads(Path(args.in_json).read_text(encoding="utf-8"))
  specs = data.get("specs", [])
  out_dir = Path(args.out_dir)
  out_dir.mkdir(parents=True, exist_ok=True)

  for i, spec in enumerate(specs, start=1):
    name = spec["icon_name"]
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_") or "icon"
    print(f"[{i}/{len(specs)}] {name} -> {slug}.png")

    prompt = spec_to_prompt(spec)

    cands: List[Tuple[float, Image.Image]] = []
    for k in range(max(1, args.candidates)):
      im = call_image(prompt)
      im = trim_transparent(im, pad=14)
      cands.append((alpha_coverage(im), im))

    best = choose_best(cands)

    # save candidates
    for k, (cov, im) in enumerate(cands, start=1):
      im2 = im.resize((args.size, args.size), Image.Resampling.LANCZOS)
      im2.save(out_dir / f"{slug}_cand{k}_cov{cov:.2f}.png")

    best2 = best.resize((args.size, args.size), Image.Resampling.LANCZOS)
    best2.save(out_dir / f"{slug}.png")

  print("[OK] wrote icons to", out_dir.resolve())

if __name__ == "__main__":
  # pip install openai pillow
  main()