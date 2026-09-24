from __future__ import annotations

from pathlib import Path
from openai import OpenAI


client = OpenAI()


# ==================================================
# Folder configuration
# ==================================================

BASE_DIR = Path(__file__).resolve().parent

INPUT_DIR = BASE_DIR / "original_text"
OUTPUT_DIR = BASE_DIR / "atomic_text"


ATOMIC_TEXT_PROMPT = r"""
You are preprocessing recipe procedural text.

Your ONLY task is to rewrite the recipe procedure into a sequence of
atomic textual instructions.

Each output sentence must describe:

ONE ACTION applied to ONE INGREDIENT / ENTITY.

This is ONLY a text preprocessing stage.

DO NOT perform state reasoning.
DO NOT infer physical_state or chemical_state.
DO NOT classify MAIN / AUX.
DO NOT construct graph nodes or edges.
DO NOT infer PROCESS / ADD graph structure.
DO NOT convert cooking actions into container topology.


==================================================
1. ATOMIC SENTENCE RULE
==================================================

Each sentence must contain exactly ONE procedural action involving
ONE primary acted-on ingredient/entity.

If an original sentence contains multiple actions, split them into
separate atomic sentences.

Example:

Original:

"Wash the pork, cut it into cubes, and blanch it."

Output:

1. Wash the pork.
2. Cut the pork into cubes.
3. Blanch the pork.


==================================================
2. MULTIPLE INGREDIENTS
==================================================

If one action applies separately to multiple ingredients, split them into
separate atomic sentences.

Example:

Original:

"Cut the potatoes and eggplants into thick slices."

Output:

1. Cut the potatoes into thick slices.
2. Cut the eggplants into thick slices.


Example:

Original:

"Cut the potatoes and eggplants into thick slices and fry them until
nearly cooked."

Output:

1. Cut the potatoes into thick slices.
2. Cut the eggplants into thick slices.
3. Fry the potato slices until nearly cooked.
4. Fry the eggplant slices until nearly cooked.


==================================================
3. ADD / COMBINATION ACTIONS
==================================================

When the text explicitly introduces one ingredient into another
ingredient, mixture, sauce, or intermediate, preserve that relationship.

If multiple ingredients are added in one textual action, split them.

Example:

Original:

"Add cinnamon and mint to the tomato meat sauce."

Output:

1. Add cinnamon to the tomato meat sauce.
2. Add mint to the tomato meat sauce.


Example:

Original:

"Add ginger, scallion, and garlic to the pork."

Output:

1. Add ginger to the pork.
2. Add scallion to the pork.
3. Add garlic to the pork.


Do NOT convert these actions into graph topology.


==================================================
4. PRESERVE ENTITY CONTINUITY
==================================================

Resolve pronouns, omitted subjects, and references when necessary so that
every atomic sentence explicitly identifies the ingredient or intermediate
being acted upon.

Use previous procedural context to resolve references such as:

- it
- them
- mixture
- sauce
- batter
- dough
- paste
- the above mixture
- the cooked ingredients


Example:

Original:

"Wash the pork and cut it into cubes."

Output:

1. Wash the pork.
2. Cut the pork into cubes.


Do NOT output:

2. Cut it into cubes.


However, do NOT invent a new intermediate name unless the text clearly
supports that intermediate.


==================================================
5. PRESERVE PROCEDURAL CONTEXT
==================================================

Preserve information belonging to the action when explicitly stated or
directly required by the sentence, including:

- cooking environment;
- temperature;
- duration;
- heat level;
- end condition;
- resulting shape;
- explicitly stated location.


Example:

Original:

"Fry the potato slices in a pan until nearly cooked."

Output:

1. Fry the potato slices in a pan until nearly cooked.


Example:

Original:

"Bake in the preheated oven at 200°C for 30–40 minutes until the surface
is browned."

Output:

1. Bake the assembled dish in the preheated oven at 200°C for 30–40
   minutes until the surface is browned.


==================================================
6. DO NOT PERFORM GRAPH-ORIENTED REWRITING
==================================================

Atomic sentences must remain faithful to the recipe text.

A cooking environment is NOT the entity being acted upon merely because
the later graph may use the container as a process carrier.


Example:

Original:

"Fry the potato slices in a pan."

CORRECT:

1. Fry the potato slices in a pan.


INCORRECT:

1. Add the potato slices to the pan.
2. Fry the pan.


Example:

Original:

"Melt the butter in a hot pan."

CORRECT:

1. Melt the butter in a hot pan.


INCORRECT:

1. Add the butter to the pan.
2. Heat the pan.


Do NOT introduce artificial ADD actions merely because the later graph
representation may require an ingredient-to-container connection.


==================================================
7. DO NOT PERFORM STATE REASONING
==================================================

Do NOT add inferred state descriptions such as:

raw
cooked
solid
slice
paste
liquid
powder

unless those words are actually needed to preserve the textual
instruction itself.


Example:

Original:

"Blanch the pork."

Output:

1. Blanch the pork.


Do NOT output:

1. Blanch the raw solid pork and obtain cooked solid pork.


==================================================
8. NON-PROCEDURAL CONTENT
==================================================

Only executable recipe instructions may become atomic sentences.

Do NOT create atomic steps from:

- recipe titles;
- ingredient lists;
- section headings;
- introductory summaries;
- general descriptions;
- commentary;
- personal remarks;
- explanations;
- serving suggestions;
- warnings that describe undesired outcomes.


Ingredient lists may be used as context for resolving ingredient names,
but they are NOT procedural steps.


==================================================
9. HIGH-LEVEL SUMMARY VS DETAILED ACTIONS
==================================================

A high-level statement that is immediately explained by detailed actions
must NOT become an additional duplicate step.


Example:

Original:

"Make the white sauce. Melt the butter, add flour, and stir well."

Output:

1. Melt the butter.
2. Add flour to the butter.
3. Stir the butter and flour mixture.


Do NOT additionally output:

"Prepare the white sauce."


Section-introduction phrases such as:

"First make the meat sauce."

"Now prepare the topping."

"Next assemble the dish."

should not become separate atomic actions when detailed actions follow.


==================================================
10. EXPLANATIONS AND WARNINGS
==================================================

Separate executable instructions from explanations.


Example:

Original:

"Let the white sauce cool before adding the egg, otherwise the egg will
cook."

Output:

1. Let the white sauce cool.
2. Add the egg to the cooled white sauce.


Do NOT output:

3. Cook the egg.


==================================================
11. ALTERNATIVES AND OPTIONAL PROCEDURES
==================================================

Do NOT combine mutually exclusive alternatives into one execution path.

If the text clearly selects one method, preserve the selected method.

If an alternative is merely explanatory or optional and is not part of
the actual procedure being described, do not mix its actions into the
main procedure.


==================================================
12. PRESERVE EXECUTION ORDER
==================================================

Atomic sentences must remain in the same procedural order as the source.

Splitting a sentence into atomic instructions must NOT reorder actions.

When an action depends on a result produced earlier, preserve that
dependency through explicit entity wording.


==================================================
13. FINAL CHECK
==================================================

Before returning the result, verify every atomic sentence:

1. contains ONE action;

2. has ONE primary acted-on ingredient/entity;

3. corresponds to an executable action in the source;

4. preserves the original meaning;

5. preserves relevant action arguments;

6. does not introduce state reasoning;

7. does not introduce graph topology;

8. does not originate only from an ingredient list, heading, summary,
   commentary, explanation, or warning;

9. appears in the correct procedural order.


==================================================
14. OUTPUT FORMAT
==================================================

Return ONLY the atomic procedural text.

Do NOT return JSON.

Do NOT provide explanations.

Do NOT provide headings.

Do NOT reproduce the ingredient list.

Use exactly this format:

1. <atomic procedural sentence>
2. <atomic procedural sentence>
3. <atomic procedural sentence>
...

Each numbered item must contain exactly ONE atomic action.
"""


def get_recipe_files() -> list[Path]:
    """
    Read all .txt recipe files from recipes/.
    """

    if not INPUT_DIR.exists():
        raise FileNotFoundError(
            f"Input folder does not exist: {INPUT_DIR}"
        )

    files = sorted(INPUT_DIR.glob("*.txt"))

    if not files:
        raise FileNotFoundError(
            f"No .txt recipe files found in: {INPUT_DIR}"
        )

    return files


def read_recipe(path: Path) -> str:
    """
    Read one recipe file.
    """

    text = path.read_text(
        encoding="utf-8"
    ).strip()

    if not text:
        raise ValueError(
            f"Recipe file is empty: {path.name}"
        )

    return text


def extract_atomic_text(
    recipe_text: str,
    model: str = "gpt-5.6",
) -> str:
    """
    Convert raw recipe text to atomic procedural text.
    """

    response = client.responses.create(
        model=model,
        instructions=ATOMIC_TEXT_PROMPT,
        input=(
            "Convert the following recipe into atomic procedural text.\n\n"
            "=== ORIGINAL RECIPE ===\n\n"
            f"{recipe_text}"
        ),
    )

    return response.output_text.strip()


def get_output_path(
    input_path: Path,
) -> Path:
    """
    recipes/moussaka.txt
        ->
    atomic_text/moussaka_atomic.txt
    """

    return OUTPUT_DIR / (
        f"{input_path.stem}_atomic.txt"
    )


def save_atomic_text(
    atomic_text: str,
    output_path: Path,
) -> None:
    """
    Save generated atomic text.
    """

    output_path.write_text(
        atomic_text,
        encoding="utf-8",
    )


def process_recipe(
    input_path: Path,
) -> None:
    """
    Process one recipe.
    """

    print(
        f"\nProcessing: {input_path.name}"
    )

    recipe_text = read_recipe(
        input_path
    )

    atomic_text = extract_atomic_text(
        recipe_text
    )

    output_path = get_output_path(
        input_path
    )

    save_atomic_text(
        atomic_text,
        output_path,
    )

    print(
        f"Saved: {output_path.name}"
    )


def main() -> None:

    # Create output folder automatically
    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    recipe_files = get_recipe_files()

    print(
        f"Found {len(recipe_files)} recipe files."
    )

    success_count = 0
    failed_count = 0

    for input_path in recipe_files:

        try:
            process_recipe(
                input_path
            )

            success_count += 1

        except Exception as e:

            failed_count += 1

            print(
                f"FAILED: {input_path.name}"
            )

            print(
                f"Reason: {e}"
            )

    print("\n==============================")
    print("Finished")
    print("==============================")

    print(
        f"Success: {success_count}"
    )

    print(
        f"Failed: {failed_count}"
    )

    print(
        f"Output folder: {OUTPUT_DIR}"
    )


if __name__ == "__main__":
    main()