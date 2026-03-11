from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, List, Tuple, Any, Optional, Set
import json

def load_recipe_json(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

# -------------------------
# 1) Pseudo JSON templates
# -------------------------

def make_demo_recipe_pair() -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Generate two pseudo recipes that exercise:
      - Rule 1 exact: (STATE(u), action, STATE(v), PREV(v)) identical
      - Rule 2 similar: (action, STATE(v)) identical but other parts differ
      - Rule 3 similar: STATE(v) identical only
      - Unmatched nodes
    Note: add edges not included (we ignore them for now).
    """
    r1 = load_recipe_json("recipepair/recipe3.json")
    r2 = load_recipe_json("recipepair/recipe4.json")

    return r1, r2


# -------------------------
# 2) Normalization helpers
# -------------------------

# Optional: action canonicalization for synonyms
ACTION_CANON = {
    "parboil": "blanch",
    "scald": "blanch",
    "sear": "fry",
    # add more synonyms here
}

def find_start_nodes(recipe):
    nodes = {int(n["index"]): n for n in recipe["nodes"]}
    indeg = {i: 0 for i in nodes}
    for e in recipe["edges"]:
        indeg[int(e["node2"])] += 1
    starts = [i for i, d in indeg.items() if d == 0]
    # 如果有多个 start（DAG），先取最小 index（或你定义的 main）
    return min(starts) if starts else None
    
def norm_str(x: Any) -> str:
    return str(x).lower().strip()

def build_node_map(recipe: Dict[str, Any]) -> Dict[int, Dict[str, Any]]:
    return {int(n["index"]): n for n in recipe["nodes"]}

def sort_edges(recipe: Dict[str, Any]) -> List[Dict[str, Any]]:
    return sorted(recipe["edges"], key=lambda e: int(e["index"]))

def state_key(node: Dict[str, Any]) -> Tuple[str, str, str, str]:
    # flavor excluded
    return (
        norm_str(node.get("name", "")),
        norm_str(node.get("type", "")),
        norm_str(node.get("physical_state", "")),
        norm_str(node.get("chemical_state", "")),
    )

def prev_sig(node: Dict[str, Any]) -> Tuple[Tuple[str, str, str], ...]:
    """
    Read node["previous"] directly.
    Your convention: most recent -> oldest (e.g. 3,2,1)
    Keep exact order.
    """
    prev = node.get("previous", []) or []
    items: List[Tuple[str, str, str]] = []
    for p in prev:
        items.append((
            norm_str(p.get("type", "")),
            canon_action(norm_str(p.get("action", ""))),
            norm_str(p.get("source_ingredient", "")),
        ))
    return tuple(items)

def tr1(edge: Dict[str, Any], node_map: Dict[int, Dict[str, Any]]) -> Tuple:
    u = node_map[int(edge["node1"])]
    v = node_map[int(edge["node2"])]
    return (
        state_key(u),
        canon_action(edge["action"]),
        norm_str(edge.get("type", "")),
        state_key(v),
        prev_sig(v),
    )

def tr2(edge: Dict[str, Any], node_map: Dict[int, Dict[str, Any]]) -> Tuple:
    v = node_map[int(edge["node2"])]
    return (
        canon_action(edge["action"]),
        norm_str(edge.get("type", "")),
        state_key(v),
    )


# =========================
# 1) Sequence item / match record
# =========================

@dataclass
class SeqItem:
    recipe: str              # "R1" / "R2"
    edge: Dict[str, Any]
    out_node: int
    orig_pos: int            # position in original edge sequence
    key1: Tuple              # rule1 key
    key2: Tuple              # rule2 key
    state_out: Tuple         # rule3 key

@dataclass
class MatchRecord:
    kind: str                # "exact" | "similar2" | "similar3" | "only_r1" | "only_r2"
    r1_edge: Optional[int]
    r2_edge: Optional[int]
    r1_out_node: Optional[int]
    r2_out_node: Optional[int]
    orig_pos_r1: Optional[int]
    orig_pos_r2: Optional[int]


# =========================
# 2) Build sequence items
# =========================

def build_seq_items(recipe: Dict[str, Any], recipe_id: str) -> List[SeqItem]:
    node_map = build_node_map(recipe)
    edges = sort_edges(recipe)
    items: List[SeqItem] = []

    for pos, e in enumerate(edges):
        out_node = int(e["node2"])
        items.append(
            SeqItem(
                recipe=recipe_id,
                edge=e,
                out_node=out_node,
                orig_pos=pos,
                key1=tr1(e, node_map),
                key2=tr2(e, node_map),
                state_out=state_key(node_map[out_node]),
            )
        )
    return items


# =========================
# 3) One monotonic pass inside one window
# =========================

def match_by_rule(a: SeqItem, b: SeqItem, rule_name: str) -> bool:
    if rule_name == "exact":
        return a.key1 == b.key1
    elif rule_name == "similar2":
        return a.key2 == b.key2
    elif rule_name == "similar3":
        return a.state_out == b.state_out
    else:
        raise ValueError(f"Unknown rule: {rule_name}")

def monotonic_match_in_window(
    seq1: List[SeqItem],
    seq2: List[SeqItem],
    rule_name: str,
) -> List[Tuple[int, int]]:
    """
    Return matched index pairs (i, j) within this window.
    Monotonic: seq2 pointer only moves forward.
    """
    pairs: List[Tuple[int, int]] = []
    j_ptr = 0

    for i, a in enumerate(seq1):
        found = None
        for j in range(j_ptr, len(seq2)):
            if match_by_rule(a, seq2[j], rule_name):
                found = j
                break
        if found is not None:
            pairs.append((i, found))
            j_ptr = found + 1

    return pairs


# =========================
# 4) Window splitting by anchors
# =========================

def split_windows_by_pairs(
    seq1: List[SeqItem],
    seq2: List[SeqItem],
    pairs: List[Tuple[int, int]],
) -> List[Tuple[List[SeqItem], List[SeqItem]]]:
    """
    Suppose matched pairs are [(i1,j1), (i2,j2), ...] in monotonic order.
    Split into windows between anchors:
      [0:i1) x [0:j1)
      (i1:i2) x (j1:j2)
      ...
      (ik:end) x (jk:end)
    Matched anchor items themselves are removed from child windows.
    """
    windows: List[Tuple[List[SeqItem], List[SeqItem]]] = []

    prev_i = 0
    prev_j = 0

    for i, j in pairs:
        windows.append((seq1[prev_i:i], seq2[prev_j:j]))
        prev_i = i + 1
        prev_j = j + 1

    windows.append((seq1[prev_i:], seq2[prev_j:]))

    return windows


# =========================
# 5) Hierarchical pass
# =========================

def hierarchical_match_windows(
    windows: List[Tuple[List[SeqItem], List[SeqItem]]],
    rule_name: str,
) -> Tuple[List[MatchRecord], List[Tuple[List[SeqItem], List[SeqItem]]]]:
    """
    Run one rule on every window independently.
    Return:
      - records matched by this rule
      - new child windows for the next lower-priority rule
    """
    all_records: List[MatchRecord] = []
    next_windows: List[Tuple[List[SeqItem], List[SeqItem]]] = []

    for seq1, seq2 in windows:
        if not seq1 and not seq2:
            continue

        pairs = monotonic_match_in_window(seq1, seq2, rule_name)

        # Save matched records
        for i, j in pairs:
            a = seq1[i]
            b = seq2[j]
            all_records.append(
                MatchRecord(
                    kind=rule_name,
                    r1_edge=int(a.edge["index"]),
                    r2_edge=int(b.edge["index"]),
                    r1_out_node=a.out_node,
                    r2_out_node=b.out_node,
                    orig_pos_r1=a.orig_pos,
                    orig_pos_r2=b.orig_pos,
                )
            )

        # Split this window into smaller windows for next pass
        child_windows = split_windows_by_pairs(seq1, seq2, pairs)
        next_windows.extend(child_windows)

    return all_records, next_windows


# =========================
# 6) Final hierarchical three-pass match
# =========================

def hierarchical_three_pass_match(
    recipe1: Dict[str, Any],
    recipe2: Dict[str, Any],
) -> List[MatchRecord]:
    """
    Rule 1 on full sequence -> anchors
    Rule 2 only within windows between rule1 anchors
    Rule 3 only within windows between rule1/rule2 anchors
    Leftovers in final windows -> only_r1 / only_r2
    """
    seq1 = build_seq_items(recipe1, "R1")
    seq2 = build_seq_items(recipe2, "R2")

    # initial one big window
    windows = [(seq1, seq2)]

    all_records: List[MatchRecord] = []

    # Pass 1
    rec1, windows = hierarchical_match_windows(windows, "exact")
    all_records.extend(rec1)

    # Pass 2
    rec2, windows = hierarchical_match_windows(windows, "similar2")
    all_records.extend(rec2)

    # Pass 3
    rec3, windows = hierarchical_match_windows(windows, "similar3")
    all_records.extend(rec3)

    # Whatever remains in final windows becomes only
    for seq1_rem, seq2_rem in windows:
        for a in seq1_rem:
            all_records.append(
                MatchRecord(
                    kind="only_r1",
                    r1_edge=int(a.edge["index"]),
                    r2_edge=None,
                    r1_out_node=a.out_node,
                    r2_out_node=None,
                    orig_pos_r1=a.orig_pos,
                    orig_pos_r2=None,
                )
            )
        for b in seq2_rem:
            all_records.append(
                MatchRecord(
                    kind="only_r2",
                    r1_edge=None,
                    r2_edge=int(b.edge["index"]),
                    r1_out_node=None,
                    r2_out_node=b.out_node,
                    orig_pos_r1=None,
                    orig_pos_r2=b.orig_pos,
                )
            )

    return all_records


# =========================
# 7) Sort records back into visual order
# =========================

def record_sort_key(m: MatchRecord):
    p1 = m.orig_pos_r1 if m.orig_pos_r1 is not None else 10**9
    p2 = m.orig_pos_r2 if m.orig_pos_r2 is not None else 10**9
    return (min(p1, p2), p1, p2)

def sort_match_records_for_visualization(records: List[MatchRecord]) -> List[MatchRecord]:
    return sorted(records, key=record_sort_key)


# =========================
# 8) Build merged nodes
# =========================

def build_aux_render_edges(
    aux_merged_nodes,
    recipe1,
    recipe2,
    recipe1_id,
    recipe2_id,
    main_node_to_merged,
    main_kind_of,
):
    out1 = build_out_edge_map(recipe1["edges"])
    out2 = build_out_edge_map(recipe2["edges"])

    # aux node -> aux merged id
    aux_node_to_merged = {}
    for m in aux_merged_nodes:
        if m.r1_node is not None:
            aux_node_to_merged[(recipe1_id, int(m.r1_node))] = m.merged_id
        if m.r2_node is not None:
            aux_node_to_merged[(recipe2_id, int(m.r2_node))] = m.merged_id

    aux_kind_of = {m.merged_id: m.kind for m in aux_merged_nodes}

    render_edges = []

    def add_edge(frm_mid, frm_a, to_mid, to_a, action, typ, style):
        render_edges.append({
            "from": (frm_mid, frm_a),
            "to": (to_mid, to_a),
            "action": canon_action(action),
            "type": str(typ).lower().strip(),
            "style": style
        })

    def resolve_target(recipe_id, node_idx):
        """
        Return:
          ("aux", merged_id, kind)  if target is aux merged node
          ("main", merged_id, kind) if target is main merged node
          (None, None, None)        if unresolved
        """
        key = (recipe_id, int(node_idx))

        if key in aux_node_to_merged:
            mid = aux_node_to_merged[key]
            return "aux", mid, aux_kind_of[mid]

        if key in main_node_to_merged:
            mid = main_node_to_merged[key]
            return "main", mid, main_kind_of[mid]

        return None, None, None

    def target_anchor(domain, kind, merged_edge, recipe_id):
        """
        Aux target:
          merged_exact -> S
          only         -> S
          (aux has no merged_similar now, since aux only exact/different)
        Main target:
          use main anchor logic
        """
        if domain == "main":
            return end_anchor(kind, merged_edge, recipe_id, recipe1_id)
        else:
            # aux node only exact / only
            return "S"

    for m in aux_merged_nodes:
        mid = m.merged_id
        kcur = m.kind

        e1_list = out1.get(int(m.r1_node), []) if m.r1_node is not None else []
        e2_list = out2.get(int(m.r2_node), []) if m.r2_node is not None else []

        # ---------- only_r1 ----------
        if kcur == "only_r1":
            for e1 in e1_list:
                dom1, target1, kind1 = resolve_target(recipe1_id, int(e1["node2"]))
                if target1 is None:
                    continue

                add_edge(
                    mid,
                    "S",
                    target1,
                    target_anchor(dom1, kind1, False, recipe1_id),
                    e1["action"],
                    e1.get("type", ""),
                    "R1"
                )
            continue

        # ---------- only_r2 ----------
        if kcur == "only_r2":
            for e2 in e2_list:
                dom2, target2, kind2 = resolve_target(recipe2_id, int(e2["node2"]))
                if target2 is None:
                    continue

                add_edge(
                    mid,
                    "S",
                    target2,
                    target_anchor(dom2, kind2, False, recipe2_id),
                    e2["action"],
                    e2.get("type", ""),
                    "R2"
                )
            continue

        # ---------- merged_exact aux ----------
        used2 = set()

        for e1 in e1_list:
            matched_j = None

            dom1, target1, kind1 = resolve_target(recipe1_id, int(e1["node2"]))
            if target1 is None:
                continue

            for j, e2 in enumerate(e2_list):
                if j in used2:
                    continue

                dom2, target2, kind2 = resolve_target(recipe2_id, int(e2["node2"]))
                if target2 is None:
                    continue

                # merge condition:
                # 1) action same
                # 2) same target domain
                # 3) target is shared-compatible
                # 4) target merged node same
                can_merge_edge = (
                    same_action(e1, e2)
                    and dom1 == dom2
                    and target1 == target2
                    and (
                        (dom1 == "main" and is_shared_kind(kind1) and is_shared_kind(kind2))
                        or
                        (dom1 == "aux" and kind1 == "merged_exact" and kind2 == "merged_exact")
                    )
                )

                if can_merge_edge:
                    matched_j = j
                    used2.add(j)

                    add_edge(
                        mid,
                        "S",
                        target1,
                        target_anchor(dom1, kind1, True, recipe1_id),
                        e1["action"],
                        e1.get("type", ""),
                        "shared"
                    )
                    break

            if matched_j is None:
                add_edge(
                    mid,
                    "S",
                    target1,
                    target_anchor(dom1, kind1, False, recipe1_id),
                    e1["action"],
                    e1.get("type", ""),
                    "R1"
                )

        for j, e2 in enumerate(e2_list):
            if j in used2:
                continue

            dom2, target2, kind2 = resolve_target(recipe2_id, int(e2["node2"]))
            if target2 is None:
                continue

            add_edge(
                mid,
                "S",
                target2,
                target_anchor(dom2, kind2, False, recipe2_id),
                e2["action"],
                e2.get("type", ""),
                "R2"
            )

    return render_edges

import matplotlib.pyplot as plt
from matplotlib.patches import Circle, FancyArrowPatch
# -----------------------
# 2) Simple layout + draw
# -----------------------
COL_LIGHTBLUE = "#9ecae1"  # merged_exact
COL_PURPLE    = "#7b3294"  # R1
COL_GREEN     = "#1a9850"  # R2
COL_EDGE      = "#333333"

def edge_rad(style: str) -> float:
    if style == "R1":
        return 0.25
    if style == "R2":
        return -0.25
    return 0.0  # shared edge

def compute_layout(merged_nodes):
    """
    Three-lane layout:
      top lane    : only_r1
      middle lane : merged_exact / merged_similar
      bottom lane : only_r2
    """
    coords = {}

    y_top = 0.9
    y_mid = 0.0
    y_bot = -0.9
    dumbbell_half = 0.22

    for i, m in enumerate(merged_nodes):
        x = float(i)

        if m.kind == "only_r1":
            y = y_top
        elif m.kind == "only_r2":
            y = y_bot
        else:
            y = y_mid

        # single / center anchor
        coords[(m.merged_id, "S")] = (x, y)
        coords[(m.merged_id, "M")] = (x, y)

        # dumbbell anchors
        if m.kind == "merged_similar":
            coords[(m.merged_id, "T")] = (x, y + dumbbell_half)
            coords[(m.merged_id, "B")] = (x, y - dumbbell_half)
        else:
            # for non-dumbbell nodes, fallback anchors
            coords[(m.merged_id, "T")] = (x, y)
            coords[(m.merged_id, "B")] = (x, y)

    return coords

def edge_y_offset(style: str) -> float:
        if style == "R1":
            return 0.08
        elif style == "R2":
            return -0.08
        return 0.0

def assign_outgoing_offsets(render_edges):
        groups = defaultdict(list)
        for i, e in enumerate(render_edges):
            groups[e["from"]].append(i)
        offsets = [0.0] * len(render_edges)
        for _, idxs in groups.items():
            k = len(idxs)
            if k == 1:
                offsets[idxs[0]] = 0.0
            else:
                spread = 0.12
                for rank, idx in enumerate(idxs):
                    offsets[idx] = -spread + (2 * spread) * rank / (k - 1)
        return offsets

def edge_rad(style: str, branch_off: float) -> float:
        base = 0.0
        if style == "R1":
            base = 0.05
        elif style == "R2":
            base = -0.05
        return base + 0.35 * branch_off

def draw_graph(merged_nodes: List[MergedNode], render_edges: List[Dict[str, Any]]):
    coords = compute_layout(merged_nodes)
    kind_of = {m.merged_id: m.kind for m in merged_nodes}

    fig, ax = plt.subplots(figsize=(13,4))
    
    # edges first
    branch_offsets = assign_outgoing_offsets(render_edges)

    for i, e in enumerate(render_edges):
        (u, ua) = e["from"]
        (v, va) = e["to"]
        (x1, y1) = coords[(u, ua)]
        (x2, y2) = coords[(v, va)]

        style_off = edge_y_offset(e["style"])
        branch_off = branch_offsets[i]
        off = style_off + branch_off

        y1 = y1 + off
        y2 = y2 + off

        lw = 2.2 if e["style"] == "shared" else 1.4
        rad = edge_rad(e["style"], branch_off)

        arrow = FancyArrowPatch(
        (x1, y1), (x2, y2),
        arrowstyle="-|>",
        mutation_scale=12,
        linewidth=lw,
        color=COL_EDGE,
        connectionstyle=f"arc3,rad={rad}"
    )
        ax.add_patch(arrow)

        xm, ym = (x1 + x2) / 2, (y1 + y2) / 2
        ax.text(xm, ym + 0.05, e["action"], fontsize=8, ha="center", va="center")

    # nodes on top
    for m in merged_nodes:
        mid, kind = m.merged_id, m.kind
        x, y = coords[(mid,"S")]
        if kind == "merged_exact":
            ax.add_patch(Circle((x,y), 0.22, facecolor=COL_LIGHTBLUE, edgecolor="black", linewidth=1.2))
            ax.text(x,y,mid,ha="center",va="center",fontsize=10,fontweight="bold")
        elif kind == "merged_similar":
            # dumbbell: top purple / bottom green + connector
            ax.add_patch(Circle(coords[(mid,"T")], 0.18, facecolor=COL_PURPLE, edgecolor="black", linewidth=1.2))
            ax.add_patch(Circle(coords[(mid,"B")], 0.18, facecolor=COL_GREEN,  edgecolor="black", linewidth=1.2))
            ax.plot([x,x],[coords[(mid,"B")][1], coords[(mid,"T")][1]], color="black", linewidth=2)
            ax.text(x,y,mid,ha="center",va="center",fontsize=10,fontweight="bold",
                    bbox=dict(boxstyle="round,pad=0.15", facecolor="white", edgecolor="none", alpha=0.85))
        elif kind == "only_r1":
            ax.add_patch(Circle((x,y), 0.22, facecolor=COL_PURPLE, edgecolor="black", linewidth=1.2))
            ax.text(x,y,mid,ha="center",va="center",fontsize=10,fontweight="bold")
        elif kind == "only_r2":
            ax.add_patch(Circle((x,y), 0.22, facecolor=COL_GREEN, edgecolor="black", linewidth=1.2))
            ax.text(x,y,mid,ha="center",va="center",fontsize=10,fontweight="bold")
        else:
            ax.add_patch(Circle((x,y), 0.22, facecolor="#dddddd", edgecolor="black", linewidth=1.2))
            ax.text(x,y,mid,ha="center",va="center",fontsize=10,fontweight="bold")

    ax.set_xlim(-0.7, len(merged_nodes) - 0.3)
    ax.set_ylim(-1.4, 1.4)
    ax.axis("off")
    plt.tight_layout()
    plt.show()

# -------------------------
# 5) Demo run
# -------------------------

if __name__ == "__main__":
    r1, r2 = make_demo_recipe_pair()
    records = hierarchical_three_pass_match(r1, r2)
    records_sorted = sort_match_records_for_visualization(records)
    merged_nodes = build_merged_nodes_from_records(
    records_sorted,
    r1,
    r2,
    include_start_node=True
)
    merged_nodes, old_to_new = reorder_and_renumber_merged_nodes_by_recipe_order(merged_nodes)
    render_edges = build_render_edges(merged_nodes, r1, r2)
    draw_graph(merged_nodes, render_edges)

    print("\n=== MERGED NODES (for rendering) ===")
    for mn in merged_nodes:
        print(mn)
    for e in render_edges:
        print(e)