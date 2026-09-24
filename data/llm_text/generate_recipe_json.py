# -*- coding: utf-8 -*-

import json
import time
from pathlib import Path

from openai import OpenAI


# ============================================================
# Configuration
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

INPUT_DIR = BASE_DIR / "original_text"
OUTPUT_DIR = BASE_DIR / "output"
PROMPT_FILE = BASE_DIR / "recipe_graph_prompt.txt"

MODEL = "gpt-5.4"

# True = 如果 JSON 已经存在，就跳过
SKIP_EXISTING = True

MAX_RETRIES = 3


# ============================================================
# OpenAI Client
# ============================================================

# 自动读取环境变量:
# OPENAI_API_KEY
client = OpenAI()


# ============================================================
# Load Prompt
# ============================================================

def load_system_prompt():
    if not PROMPT_FILE.exists():
        raise FileNotFoundError(
            f"Prompt file not found: {PROMPT_FILE}"
        )

    return PROMPT_FILE.read_text(
        encoding="utf-8"
    ).strip()


# ============================================================
# Load Recipe
# ============================================================

def load_recipe(txt_path):
    return txt_path.read_text(
        encoding="utf-8"
    ).strip()


# ============================================================
# Clean Model Output
# ============================================================

def clean_json_text(text):
    text = text.strip()

    # 防止模型返回 ```json ... ```
    if text.startswith("```"):
        lines = text.splitlines()

        if lines and lines[0].startswith("```"):
            lines = lines[1:]

        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]

        text = "\n".join(lines).strip()

    return text


# ============================================================
# Call OpenAI
# ============================================================

def generate_recipe_graph(
    system_prompt,
    recipe_id,
    recipe_text
):

    user_prompt = f"""
RECIPE_ID:
{recipe_id}

RECIPE_TEXT:
{recipe_text}
""".strip()

    response = client.responses.create(
        model=MODEL,
        instructions=system_prompt,
        input=user_prompt
    )

    raw_text = response.output_text

    raw_text = clean_json_text(raw_text)

    try:
        graph = json.loads(raw_text)

    except json.JSONDecodeError as e:
        raise ValueError(
            "\nModel returned invalid JSON:\n\n"
            + raw_text
        ) from e

    return graph


# ============================================================
# Validate Graph
# ============================================================

def validate_graph(graph):

    errors = []

    # --------------------------------------------------------
    # Top-level structure
    # --------------------------------------------------------

    if "nodes" not in graph:
        errors.append("Missing nodes")

    if "edges" not in graph:
        errors.append("Missing edges")

    if "recipe_id" not in graph:
        errors.append("Missing recipe_id")

    if errors:
        return errors

    nodes = graph["nodes"]
    edges = graph["edges"]

    node_ids = [
        node.get("index")
        for node in nodes
    ]

    edge_ids = [
        edge.get("index")
        for edge in edges
    ]

    node_set = set(node_ids)
    edge_set = set(edge_ids)

    # --------------------------------------------------------
    # Duplicate node IDs
    # --------------------------------------------------------

    if len(node_ids) != len(node_set):
        errors.append(
            "Duplicate node index"
        )

    # --------------------------------------------------------
    # Duplicate edge IDs
    # --------------------------------------------------------

    if len(edge_ids) != len(edge_set):
        errors.append(
            "Duplicate edge index"
        )

    # --------------------------------------------------------
    # Check edge node references
    # --------------------------------------------------------

    for edge in edges:

        edge_index = edge.get("index")

        node1 = edge.get("node1")
        node2 = edge.get("node2")

        if node1 not in node_set:
            errors.append(
                f"Edge {edge_index}: "
                f"node1={node1} does not exist"
            )

        if node2 not in node_set:
            errors.append(
                f"Edge {edge_index}: "
                f"node2={node2} does not exist"
            )

    # --------------------------------------------------------
    # Check previous.edge_index
    # --------------------------------------------------------

    for node in nodes:

        node_index = node.get("index")

        previous_list = node.get(
            "previous",
            []
        )

        for prev in previous_list:

            prev_edge = prev.get(
                "edge_index"
            )

            if prev_edge not in edge_set:
                errors.append(
                    f"Node {node_index}: "
                    f"previous edge "
                    f"{prev_edge} does not exist"
                )

    # --------------------------------------------------------
    # Check disconnected nodes
    # --------------------------------------------------------

    degree = {
        node_id: 0
        for node_id in node_set
    }

    for edge in edges:

        n1 = edge.get("node1")
        n2 = edge.get("node2")

        if n1 in degree:
            degree[n1] += 1

        if n2 in degree:
            degree[n2] += 1

    for node in nodes:

        node_index = node.get(
            "index"
        )

        if degree.get(node_index, 0) == 0:

            errors.append(
                f"Node {node_index} "
                f"({node.get('name')}) "
                f"is disconnected"
            )

    return errors


# ============================================================
# Process One Recipe
# ============================================================

def process_recipe(
    txt_path,
    system_prompt
):

    recipe_id = txt_path.stem

    output_path = (
        OUTPUT_DIR
        / f"{recipe_id}.json"
    )

    # --------------------------------------------------------
    # Skip existing
    # --------------------------------------------------------

    if (
        SKIP_EXISTING
        and output_path.exists()
    ):
        print(
            f"[SKIP] {txt_path.name}"
        )
        return

    # --------------------------------------------------------
    # Read TXT
    # --------------------------------------------------------

    recipe_text = load_recipe(
        txt_path
    )

    if not recipe_text:
        print(
            f"[EMPTY] {txt_path.name}"
        )
        return

    print(
        f"[PROCESSING] "
        f"{txt_path.name}"
    )

    # --------------------------------------------------------
    # Retry
    # --------------------------------------------------------

    for attempt in range(
        1,
        MAX_RETRIES + 1
    ):

        try:

            graph = generate_recipe_graph(
                system_prompt,
                recipe_id,
                recipe_text
            )

            # -----------------------------------------------
            # Validate
            # -----------------------------------------------

            errors = validate_graph(
                graph
            )

            if errors:

                print(
                    f"[WARNING] "
                    f"{len(errors)} issue(s)"
                )

                for error in errors:
                    print(
                        "   -",
                        error
                    )

            # -----------------------------------------------
            # Save JSON
            # -----------------------------------------------

            output_path.write_text(
                json.dumps(
                    graph,
                    ensure_ascii=False,
                    indent=2
                ),
                encoding="utf-8"
            )

            print(
                f"[DONE] "
                f"{output_path.name}"
            )

            return

        except Exception as e:

            print(
                f"[ERROR] "
                f"attempt "
                f"{attempt}/"
                f"{MAX_RETRIES}"
            )

            print(e)

            if attempt < MAX_RETRIES:
                time.sleep(
                    attempt * 2
                )

    print(
        f"[FAILED] "
        f"{txt_path.name}"
    )


# ============================================================
# Main
# ============================================================

def main():

    # --------------------------------------------------------
    # Create output folder
    # --------------------------------------------------------

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    # --------------------------------------------------------
    # Load system prompt
    # --------------------------------------------------------

    system_prompt = (
        load_system_prompt()
    )

    # --------------------------------------------------------
    # Find all TXT files
    # --------------------------------------------------------

    txt_files = sorted(
        INPUT_DIR.glob("*.txt")
    )

    if not txt_files:
        print(
            "No TXT files found:"
        )
        print(INPUT_DIR)
        return

    print(
        f"Found "
        f"{len(txt_files)} "
        f"recipe(s)."
    )

    print()

    # --------------------------------------------------------
    # Process
    # --------------------------------------------------------

    for txt_path in txt_files:

        process_recipe(
            txt_path,
            system_prompt
        )

    print()
    print("[FINISHED]")


# ============================================================
# Run
# ============================================================

if __name__ == "__main__":
    main()