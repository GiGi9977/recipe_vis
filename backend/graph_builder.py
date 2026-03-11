from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, Any, List, Tuple, Optional
from collections import defaultdict
from pathlib import Path

from .matcher import (
    build_node_map,
    state_key,
    split_recipe_main_aux,
    compare_aux_nodes,
)

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
ICON_DIR = DATA_DIR / "icons"

# ===============================
# merged node structure
# ===============================

@dataclass
class MergedNode:
    merged_id: str
    domain: str 
    kind: str  # merged_exact | merged_similar | only_r1 | only_r2
    r1_node: Optional[int]
    r2_node: Optional[int]
    state_r1: Optional[Tuple[str, str, str, str]]
    state_r2: Optional[Tuple[str, str, str, str]]
    flavor_r1: Optional[str]
    flavor_r2: Optional[str]
    shared_add_dumbbell: bool = False

# ===============================
# build merged nodes
# ===============================

def build_merged_nodes_from_records(
    records,
    recipe1,
    recipe2,
    include_start_node=False,
    domain="main",
):
    nmap1 = build_node_map(recipe1)
    nmap2 = build_node_map(recipe2)

    merged_nodes: List[MergedNode] = []
    c = 0

    if include_start_node:
        has1 = 1 in nmap1
        has2 = 1 in nmap2

        if has1 and has2:
            if state_key(nmap1[1]) == state_key(nmap2[1]):
                merged_nodes.append(
                MergedNode(
                    merged_id="M0",
                    domain=domain,
                    kind="merged_exact",
                    r1_node=1,
                    r2_node=1,
                    state_r1=state_key(nmap1[1]),
                    state_r2=state_key(nmap2[1]),
                    flavor_r1=nmap1[1].get("flavor"),
                    flavor_r2=nmap2[1].get("flavor"),
                    )
                )
                c = 1
            else:
                merged_nodes.append(
                MergedNode(
                    merged_id="M0",
                    domain=domain,
                    kind="only_r1",
                    r1_node=1,
                    r2_node=None,
                    state_r1=state_key(nmap1[1]),
                    state_r2=None,
                    flavor_r1=nmap1[1].get("flavor"),
                    flavor_r2=None,
                    )
                )
                merged_nodes.append(
                MergedNode(
                    merged_id="M1",
                    domain=domain,
                    kind="only_r2",
                    r1_node=None,
                    r2_node=1,
                    state_r1=None,
                    state_r2=state_key(nmap2[1]),
                    flavor_r1=None,
                    flavor_r2=nmap2[1].get("flavor"),
                    )
                )
                c = 2

        elif has1:
            merged_nodes.append(
            MergedNode(
                merged_id="M0",
                domain=domain,
                kind="only_r1",
                r1_node=1,
                r2_node=None,
                state_r1=state_key(nmap1[1]),
                state_r2=None,
                flavor_r1=nmap1[1].get("flavor"),
                flavor_r2=None,
                )
            )
            c = 1

        elif has2:
            merged_nodes.append(
            MergedNode(
                merged_id="M0",
                domain=domain,
                kind="only_r2",
                r1_node=None,
                r2_node=1,
                state_r1=None,
                state_r2=state_key(nmap2[1]),
                flavor_r1=None,
                flavor_r2=nmap2[1].get("flavor"),
                )
            )
            c = 1

    for rec in records:
        mid = f"M{c}"

        if rec.kind == "exact":
            n1 = nmap1[rec.r1_out_node]
            n2 = nmap2[rec.r2_out_node]

            merged_nodes.append(
                MergedNode(
                    merged_id=mid,
                    domain=domain,
                    kind="merged_exact",
                    r1_node=rec.r1_out_node,
                    r2_node=rec.r2_out_node,
                    state_r1=state_key(n1),
                    state_r2=state_key(n2),
                    flavor_r1=n1.get("flavor"),
                    flavor_r2=n2.get("flavor"),
                )
            )

        elif rec.kind in ("similar2", "similar3", "similar2_loose", "similar3_loose"):
            n1 = nmap1[rec.r1_out_node]
            n2 = nmap2[rec.r2_out_node]

            merged_nodes.append(
                MergedNode(
                    merged_id=mid,
                    domain=domain,
                    kind="merged_similar",
                    r1_node=rec.r1_out_node,
                    r2_node=rec.r2_out_node,
                    state_r1=state_key(n1),
                    state_r2=state_key(n2),
                    flavor_r1=n1.get("flavor"),
                    flavor_r2=n2.get("flavor"),
                )
            )

        elif rec.kind == "only_r1":
            n1 = nmap1[rec.r1_out_node]

            merged_nodes.append(
                MergedNode(
                    merged_id=mid,
                    domain=domain,
                    kind="only_r1",
                    r1_node=rec.r1_out_node,
                    r2_node=None,
                    state_r1=state_key(n1),
                    state_r2=None,
                    flavor_r1=n1.get("flavor"),
                    flavor_r2=None,
                )
            )

        elif rec.kind == "only_r2":
            n2 = nmap2[rec.r2_out_node]

            merged_nodes.append(
                MergedNode(
                    merged_id=mid,
                    domain=domain,
                    kind="only_r2",
                    r1_node=None,
                    r2_node=rec.r2_out_node,
                    state_r1=None,
                    state_r2=state_key(n2),
                    flavor_r1=None,
                    flavor_r2=n2.get("flavor"),
                )
            )

        c += 1

    return merged_nodes

def build_aux_merged_nodes_from_records(aux_records, recipe1_aux, recipe2_aux):
    from .matcher import build_node_map, state_key

    nmap1 = build_node_map(recipe1_aux)
    nmap2 = build_node_map(recipe2_aux)

    merged_nodes = []
    c = 0

    for rec in aux_records:
        mid = f"A{c}"

        if rec.kind == "exact":
            n1 = nmap1[rec.r1_out_node]
            n2 = nmap2[rec.r2_out_node]

            merged_nodes.append(
                MergedNode(
                    merged_id=mid,
                    domain="aux",
                    kind="merged_exact",
                    r1_node=rec.r1_out_node,
                    r2_node=rec.r2_out_node,
                    state_r1=state_key(n1),
                    state_r2=state_key(n2),
                    flavor_r1=n1.get("flavor"),
                    flavor_r2=n2.get("flavor"),
                )
            )

        elif rec.kind == "only_r1":
            n1 = nmap1[rec.r1_out_node]

            merged_nodes.append(
                MergedNode(
                    merged_id=mid,
                    domain="aux",
                    kind="only_r1",
                    r1_node=rec.r1_out_node,
                    r2_node=None,
                    state_r1=state_key(n1),
                    state_r2=None,
                    flavor_r1=n1.get("flavor"),
                    flavor_r2=None,
                )
            )

        elif rec.kind == "only_r2":
            n2 = nmap2[rec.r2_out_node]

            merged_nodes.append(
                MergedNode(
                    merged_id=mid,
                    domain="aux",
                    kind="only_r2",
                    r1_node=None,
                    r2_node=rec.r2_out_node,
                    state_r1=None,
                    state_r2=state_key(n2),
                    flavor_r1=None,
                    flavor_r2=n2.get("flavor"),
                )
            )

        c += 1

    return merged_nodes

# ===============================
# reorder merged nodes
# ===============================

def reorder_and_renumber_merged_nodes_by_recipe_order(merged_nodes):

    node_to_merged = {}
    merged_dict = {}

    for m in merged_nodes:
        merged_dict[m.merged_id] = m

        if m.r1_node is not None:
            node_to_merged[("R1", int(m.r1_node))] = m.merged_id

        if m.r2_node is not None:
            node_to_merged[("R2", int(m.r2_node))] = m.merged_id

    edges = set()
    indeg = {m.merged_id: 0 for m in merged_nodes}

    def add_constraints(recipe_name):
        seq = []

        for m in merged_nodes:
            node_idx = m.r1_node if recipe_name == "R1" else m.r2_node
            if node_idx is not None:
                seq.append((int(node_idx), m.merged_id))

        seq.sort(key=lambda x: x[0])

        for i in range(len(seq) - 1):
            a = seq[i][1]
            b = seq[i + 1][1]
            if a != b and (a, b) not in edges:
                edges.add((a, b))

    add_constraints("R1")
    add_constraints("R2")

    for a, b in edges:
        indeg[b] += 1

    def tie_key(mid):
        m = merged_dict[mid]
        vals = []
        if m.r1_node is not None:
            vals.append(int(m.r1_node))
        if m.r2_node is not None:
            vals.append(int(m.r2_node))
        lo = min(vals) if vals else 10**9
        hi = max(vals) if vals else 10**9
        return (lo, hi)

    queue = sorted(
        [mid for mid, d in indeg.items() if d == 0],
        key=tie_key
    )

    result = []

    while queue:
        mid = queue.pop(0)
        result.append(mid)

        for a, b in list(edges):
            if a == mid:
                indeg[b] -= 1
                if indeg[b] == 0:
                    queue.append(b)

        queue.sort(key=tie_key)

    if len(result) != len(merged_nodes):
        result = sorted([m.merged_id for m in merged_nodes], key=tie_key)

    ordered_nodes = [merged_dict[mid] for mid in result]

    old_to_new = {}
    for i, m in enumerate(ordered_nodes):
        old_to_new[m.merged_id] = f"M{i}"

    for m in ordered_nodes:
        m.merged_id = old_to_new[m.merged_id]

    return ordered_nodes, old_to_new

def annotate_shared_add_dumbbell(
    merged_nodes: List[MergedNode],
    recipe1: Dict[str, Any],
    recipe2: Dict[str, Any],
) -> List[MergedNode]:
    """
    规则：
    - merged_exact 如果只有 shared add（两边 add 集合完全相同），保持 single
    - 只要存在任何非-shared add，就画 dumbbell

    这里比较 add 是否 shared 时，不用 edge["source_ingredient"]，
    而是直接看 add source node 的状态签名。
    """
    incoming1 = defaultdict(list)
    incoming2 = defaultdict(list)

    for e in recipe1.get("edges", []):
        incoming1[int(e["node2"])].append(e)

    for e in recipe2.get("edges", []):
        incoming2[int(e["node2"])].append(e)

    nmap1 = build_node_map(recipe1)
    nmap2 = build_node_map(recipe2)

    def is_add_edge(e: Dict[str, Any]) -> bool:
        action = str(e.get("action", "")).strip().lower()
        typ = str(e.get("type", "")).strip().lower()
        return action == "add" or typ == "add"

    def add_signature_set(edges: List[Dict[str, Any]], node_map: Dict[int, Dict[str, Any]]) -> set:
        """
        用 add source node 本身做签名。
        这样 only_r1 add / only_r2 add 即使 action/type 一样，
        但 source 不同，也不会被误判成 shared。
        """
        sigs = set()

        for e in edges:
            if not is_add_edge(e):
                continue

            src_idx = int(e["node1"])
            src_node = node_map[src_idx]

            sigs.add((
                canon_action(e.get("action", "")),
                str(e.get("type", "")).strip().lower(),
                state_key(src_node),                         # source node 状态
                str(src_node.get("flavor", "")).strip().lower(),  # 可选：把 flavor 也带上
            ))

        return sigs

    for m in merged_nodes:
        if m.kind != "merged_exact":
            continue

        add_r1 = set()
        add_r2 = set()

        if m.r1_node is not None:
            add_r1 = add_signature_set(incoming1.get(int(m.r1_node), []), nmap1)

        if m.r2_node is not None:
            add_r2 = add_signature_set(incoming2.get(int(m.r2_node), []), nmap2)

        # 没有 add
        if not add_r1 and not add_r2:
            m.shared_add_dumbbell = False
            continue

        # 只有 shared add：两边 add 集合完全一样
        if add_r1 == add_r2 and len(add_r1) > 0:
            m.shared_add_dumbbell = False
            continue

        # 其余情况：存在非-shared add
        m.shared_add_dumbbell = True

    return merged_nodes

# ===============================
# render edge helpers
# ===============================

def get_recipe_id(recipe: Dict[str, Any], fallback: str) -> str:
    return str(recipe.get("recipe_id", fallback))

def canon_action(a: str) -> str:
    return str(a).lower().strip()


def same_action(e1, e2):
    return (
        canon_action(e1["action"]) == canon_action(e2["action"])
        and str(e1.get("type", "")).lower().strip()
        == str(e2.get("type", "")).lower().strip()
    )


def is_shared_kind(kind):
    return kind in ("merged_exact", "merged_similar")


def build_out_edge_map(edges):

    out = defaultdict(list)

    for e in edges:
        out[int(e["node1"])].append(e)

    for node in out:
        out[node].sort(key=lambda e: int(e["index"]))

    return dict(out)

from collections import defaultdict
from typing import Dict, Any

def extract_branch_info_from_recipe(recipe: Dict[str, Any]) -> Dict[str, list]:
    """
    返回:
    {
      "12": [15, 16],
      "20": [21, 22, 23]
    }

    表示原始 recipe 中 node 12 连了多个 target。
    只保留 out-degree > 1 的节点。
    """
    out_map = defaultdict(list)

    for e in recipe.get("edges", []):
        src = int(e["node1"])
        tgt = int(e["node2"])
        out_map[src].append(tgt)

    result = {}
    for src, tgts in out_map.items():
        uniq = sorted(set(int(x) for x in tgts))
        if len(uniq) > 1:
            result[str(src)] = uniq

    return result

def start_anchor(kind: str, merged_edge: bool, recipe_id: str, recipe1_id: str, shared_add_dumbbell: bool = False) -> str:
    if kind == "merged_similar" or shared_add_dumbbell:
        return "M" if merged_edge else ("T" if recipe_id == recipe1_id else "B")
    return "S"


def end_anchor(kind: str, merged_edge: bool, recipe_id: str, recipe1_id: str, shared_add_dumbbell: bool = False) -> str:
    if kind == "merged_similar" or shared_add_dumbbell:
        return "M" if merged_edge else ("T" if recipe_id == recipe1_id else "B")
    return "S"

# ===============================
# build render edges
# ===============================

def build_render_edges(merged_nodes, recipe1, recipe2, recipe1_id, recipe2_id):

    shared_add_flag_of = {m.merged_id: m.shared_add_dumbbell for m in merged_nodes}
    kind_of = {m.merged_id: m.kind for m in merged_nodes}
    r1_of = {m.merged_id: m.r1_node for m in merged_nodes}
    r2_of = {m.merged_id: m.r2_node for m in merged_nodes}

    node_to_merged = {}

    for m in merged_nodes:
        if m.r1_node is not None:
            node_to_merged[(recipe1_id, int(m.r1_node))] = m.merged_id

        if m.r2_node is not None:
            node_to_merged[(recipe2_id, int(m.r2_node))] = m.merged_id

    out1 = build_out_edge_map(recipe1["edges"])
    out2 = build_out_edge_map(recipe2["edges"])

    render_edges = []

    def add_edge(frm_mid, frm_a, to_mid, to_a, action, typ, style):
        render_edges.append(
            {
                "from": (frm_mid, frm_a),
                "to": (to_mid, to_a),
                "action": canon_action(action),
                "type": str(typ).lower().strip(),
                "style": style,
            }
        )

    for m in merged_nodes:

        mid = m.merged_id
        kcur = m.kind
        n1 = r1_of[mid]
        n2 = r2_of[mid]

        e1_list = out1.get(int(n1), []) if n1 is not None else []
        e2_list = out2.get(int(n2), []) if n2 is not None else []

        if kcur == "only_r1":

            for e1 in e1_list:
                nxt = node_to_merged.get((recipe1_id, int(e1["node2"])))
                if nxt is None:
                    continue

                k1 = kind_of[nxt]

                add_edge(
                    mid,
                    "S",
                    nxt,
                    end_anchor(k1, False, recipe1_id, recipe1_id,
                               shared_add_flag_of.get(nxt, False)),
                    e1["action"],
                    e1.get("type", ""),
                    "R1",
                )

            continue

        if kcur == "only_r2":

            for e2 in e2_list:
                nxt = node_to_merged.get(( recipe2_id, int(e2["node2"])))
                if nxt is None:
                    continue

                k2 = kind_of[nxt]

                add_edge(
                    mid,
                    "S",
                    nxt,
                    end_anchor(k2, False, recipe2_id, recipe1_id,
                               shared_add_flag_of.get(nxt, False)),
                    e2["action"],
                    e2.get("type", ""),
                    "R2",
                )

            continue

        used2 = set()

        for e1 in e1_list:

            matched_j = None
            nxt1 = node_to_merged.get(( recipe1_id, int(e1["node2"])))

            if nxt1 is None:
                continue

            k1 = kind_of[nxt1]

            for j, e2 in enumerate(e2_list):

                if j in used2:
                    continue

                nxt2 = node_to_merged.get(( recipe2_id, int(e2["node2"])))

                if nxt2 is None:
                    continue

                k2 = kind_of[nxt2]

                can_merge_edge = (
                    same_action(e1, e2)
                    and is_shared_kind(k1)
                    and is_shared_kind(k2)
                    and (nxt1 == nxt2)
                )

                if can_merge_edge:

                    matched_j = j
                    used2.add(j)

                    add_edge(
                        mid,
                        start_anchor(
                            kcur, True, recipe1_id, recipe1_id,
                            shared_add_flag_of.get(mid, False)),
                        nxt1,
                        end_anchor(
                            k1, True, recipe1_id, recipe1_id,
                            shared_add_flag_of.get(nxt1, False)
                            ),
                        e1["action"],
                        e1.get("type", ""),
                        "shared",
                        )

                    break

            if matched_j is None:

                add_edge(
                    mid,
                    start_anchor(kcur, False,  recipe1_id, recipe1_id,
                                 shared_add_flag_of.get(mid, False)),
                    nxt1,
                    end_anchor(k1, False, recipe1_id, recipe1_id,
                               shared_add_flag_of.get(nxt1, False)),
                    e1["action"],
                    e1.get("type", ""),
                    "R1",
                )

        for j, e2 in enumerate(e2_list):

            if j in used2:
                continue

            nxt2 = node_to_merged.get(( recipe2_id, int(e2["node2"])))

            if nxt2 is None:
                continue

            k2 = kind_of[nxt2]

            add_edge(
                mid,
                start_anchor(kcur, False,  recipe2_id, recipe1_id,
                             shared_add_flag_of.get(mid, False)),
                nxt2,
                end_anchor(k2, False,  recipe2_id, recipe1_id,
                           shared_add_flag_of.get(nxt2, False)),
                e2["action"],
                e2.get("type", ""),
                "R2",
            )

    return render_edges, node_to_merged, kind_of

def build_aux_render_edges(
    aux_merged_nodes,
    recipe1,
    recipe2,
    recipe1_id,
    recipe2_id,
    main_node_to_merged,
    main_kind_of,
    main_shared_add_flag_of,
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

    def target_anchor(domain, target_mid, kind, merged_edge, recipe_id):
        if domain == "main":
            return end_anchor(
            kind,
            merged_edge,
            recipe_id,
            recipe1_id,
            main_shared_add_flag_of.get(target_mid, False),
        )
        else:
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
                    target_anchor(dom1, target1, kind1, False, recipe1_id),
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
                    target_anchor(dom2, target2, kind2, False, recipe2_id),
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
                        target_anchor(dom1, target1, kind1, True, recipe1_id),
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
                    target_anchor(dom1, target1, kind1, False, recipe1_id),
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
                target_anchor(dom2, target2, kind2, False, recipe2_id),
                e2["action"],
                e2.get("type", ""),
                "R2"
            )

    return render_edges


# ===============================
# export graph json
# ===============================

def export_graph_data(nodes, edges, recipe1_id=None, recipe2_id=None, separate_layout=False):
    return {
        "nodes": [
            {
                "id": m.merged_id,
                "domain": m.domain,
                "kind": m.kind,
                "r1_node": m.r1_node,
                "r2_node": m.r2_node,
                "state_r1": list(m.state_r1) if m.state_r1 else None,
                "state_r2": list(m.state_r2) if m.state_r2 else None,
                "flavor_r1": m.flavor_r1,
                "flavor_r2": m.flavor_r2,
                "shared_add_dumbbell": m.shared_add_dumbbell,
                "icon_r1": getattr(m, "icon_r1", None),
                "icon_r2": getattr(m, "icon_r2", None)
            }
            for m in nodes
        ],
        "edges": [
            {
                "source": e["from"][0],
                "source_anchor": e["from"][1],
                "target": e["to"][0],
                "target_anchor": e["to"][1],
                "action": e["action"],
                "type": e["type"],
                "style": e["style"],
            }
            for e in edges
        ],
        "recipe1_id": recipe1_id,
        "recipe2_id": recipe2_id,
        "separate_layout": separate_layout
    }

def build_icon_name(name, physical_state, chemical_state):
    if not name:
        return None

    parts = [
        str(name).lower().strip(),
        str(physical_state or "").lower().strip(),
        str(chemical_state or "").lower().strip(),
    ]

    return "_".join([p for p in parts if p])

def icon_exists(icon_name: str):
    if not icon_name:
        return False

    path = ICON_DIR / f"{icon_name}.png"
    return path.exists()

def attach_icons_to_nodes(nodes):

    for n in nodes:

        n.icon_r1 = None
        n.icon_r2 = None

        if n.state_r1:
            name, typ, physical, chemical = n.state_r1
            icon = build_icon_name(name, physical, chemical)
            if icon_exists(icon):
                n.icon_r1 = icon

        if n.state_r2:
            name, typ, physical, chemical = n.state_r2
            icon = build_icon_name(name, physical, chemical)
            if icon_exists(icon):
                n.icon_r2 = icon

    return nodes

# ===============================
# main graph pipeline
# ===============================

def build_full_graph_main_aux(recipe1, recipe2, compare_main_fn):
    recipe1_id = get_recipe_id(recipe1, "recipe1")
    recipe2_id = get_recipe_id(recipe2, "recipe2")

    recipe1_main, recipe1_aux = split_recipe_main_aux(recipe1)
    recipe2_main, recipe2_aux = split_recipe_main_aux(recipe2)
    
    main_records = compare_main_fn(recipe1_main, recipe2_main)

    has_shared = any(
    r.kind not in ("only_r1", "only_r2")
    for r in main_records)

    main_merged_nodes = build_merged_nodes_from_records(
        main_records,
        recipe1_main,
        recipe2_main,
        include_start_node=True,
        domain="main",
    )
    main_merged_nodes, _ = reorder_and_renumber_merged_nodes_by_recipe_order(main_merged_nodes)
    main_merged_nodes = annotate_shared_add_dumbbell(
    main_merged_nodes,
    recipe1,
    recipe2,
    )
    main_shared_add_flag_of = {m.merged_id: m.shared_add_dumbbell for m in main_merged_nodes}
    main_render_edges, main_node_to_merged, main_kind_of = build_render_edges(
        main_merged_nodes,
        recipe1_main,
        recipe2_main,
        recipe1_id,
        recipe2_id,
    )

    aux_records = compare_aux_nodes(
    recipe1_aux,
    recipe2_aux,
    recipe1_id,
    recipe2_id,
    main_node_to_merged
)
    aux_merged_nodes = build_aux_merged_nodes_from_records(
        aux_records,
        recipe1_aux,
        recipe2_aux,
    )
    aux_render_edges = build_aux_render_edges(
        aux_merged_nodes,
        recipe1,
        recipe2,
        recipe1_id,
        recipe2_id,
        main_node_to_merged,
        main_kind_of,
        main_shared_add_flag_of,
    )

    all_nodes = main_merged_nodes + aux_merged_nodes
    all_edges = main_render_edges + aux_render_edges
    all_nodes = attach_icons_to_nodes(all_nodes)
    
    return export_graph_data(
        all_nodes,
        all_edges,
        recipe1_id=recipe1_id,
        recipe2_id=recipe2_id,
        separate_layout = not has_shared
    )