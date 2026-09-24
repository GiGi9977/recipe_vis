from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, Any, List, Tuple, Optional
from collections import defaultdict
from pathlib import Path
import re

from .matcher import (
    build_node_map,
    build_branch_metadata,
    branch_contexts_compatible,
    state_key,
    compare_non_main_nodes,
    is_main_like
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
    container_r1: Optional[str] = None
    container_r2: Optional[str] = None
    container_epoch_r1: Optional[int] = None   # R1 侧的 container 序号（0-based）
    container_epoch_r2: Optional[int] = None   # R2 侧的 container 序号
    shared_add_dumbbell: bool = False
    shape_dumbbell: bool = False 

@dataclass
class PropagatedMerge:
    domain: str              # "container" / "aux"
    r1_node: Optional[int]
    r2_node: Optional[int]
    source_main_mid: str
    kind: str = "merged_exact"   # 非 main 只允许 exact

# ===============================
# build merged nodes
# ===============================
# ─── 新增函数：为每条 recipe 的节点标注它属于第几个 container 段 ──

def build_container_epoch_map(recipe: Dict[str, Any]) -> Dict[int, int]:
    """
    返回 {node_index: epoch}
    epoch = 节点在 "进入第几个 container 之后" 的序号（0 = 还没进任何锅）
    按拓扑顺序 BFS，每遇到 type=="container" 的节点 epoch+1，
    后续节点继承该 epoch。
    """
    nodes = recipe["nodes"]
    edges = recipe["edges"]

    node_map = {int(n["index"]): n for n in nodes}
    out_map: Dict[int, List[int]] = {}
    in_deg: Dict[int, int] = {}

    for n in nodes:
        idx = int(n["index"])
        out_map[idx] = []
        in_deg[idx] = 0

    for e in edges:
        src, tgt = int(e["node1"]), int(e["node2"])
        out_map[src].append(tgt)
        in_deg[tgt] = in_deg.get(tgt, 0) + 1

    # BFS 拓扑
    from collections import deque
    epoch: Dict[int, int] = {}
    queue = deque(nid for nid in in_deg if in_deg[nid] == 0)
    for nid in list(queue):
        epoch[nid] = 0

    while queue:
        cur = queue.popleft()
        cur_epoch = epoch.get(cur, 0)
        cur_node = node_map.get(cur)
        # 如果当前节点本身是 container，则它的下游 epoch +1
        is_container = cur_node and str(cur_node.get("type", "")).lower().strip() == "container"
        next_epoch = cur_epoch + (1 if is_container else 0)

        for nxt in out_map.get(cur, []):
            # 取所有前驱中的最大 epoch（保证汇流时正确）
            epoch[nxt] = max(epoch.get(nxt, 0), next_epoch)
            in_deg[nxt] -= 1
            if in_deg[nxt] == 0:
                queue.append(nxt)

    return epoch

def find_main_start_nodes(recipe):
    main_like_ids = {
        int(n["index"])
        for n in recipe["nodes"]
        if is_main_like(n)
    }

    incoming_main_like = {idx: False for idx in main_like_ids}

    for e in recipe["edges"]:
        src = int(e["node1"])
        tgt = int(e["node2"])

        if src in main_like_ids and tgt in main_like_ids:
            incoming_main_like[tgt] = True

    starts = sorted([
        idx for idx, has_in in incoming_main_like.items()
        if not has_in
    ])
    return starts

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
        # Aux-created products can look like starts to the main-only scan,
        # but already have a sequence record. Never assign them a second pair.
        recorded1 = {r.r1_out_node for r in records if r.r1_out_node is not None}
        recorded2 = {r.r2_out_node for r in records if r.r2_out_node is not None}
        start_nodes1 = [n for n in find_main_start_nodes(recipe1) if n not in recorded1]
        start_nodes2 = [n for n in find_main_start_nodes(recipe2) if n not in recorded2]

        labels1, origins1, branches1 = build_branch_metadata(recipe1)
        labels2, origins2, branches2 = build_branch_metadata(recipe2)
        used_start2 = set()

        for s1 in start_nodes1:
            n1 = nmap1[s1]

            best_s2 = None
            for s2 in start_nodes2:
                if s2 in used_start2:
                    continue
                n2 = nmap2[s2]
                if (branch_contexts_compatible(
                        labels1.get(s1), origins1[s1], branches1,
                        labels2.get(s2), origins2[s2], branches2)
                        and state_key(n1) == state_key(n2)):
                    best_s2 = s2
                    break

            if best_s2 is not None:
                n2 = nmap2[best_s2]
                merged_nodes.append(
                MergedNode(
                    merged_id=f"M{c}",
                    domain=domain,
                    kind="merged_exact",
                    r1_node=s1,
                    r2_node=best_s2,
                    state_r1=state_key(n1),
                    state_r2=state_key(n2),
                    flavor_r1=n1.get("flavor"),
                    flavor_r2=n2.get("flavor"),
                    container_r1=n1.get("container"),
                    container_r2=n2.get("container"),
                )
            )
                used_start2.add(best_s2)
                c += 1
            else:
                merged_nodes.append(
                MergedNode(
                    merged_id=f"M{c}",
                    domain=domain,
                    kind="only_r1",
                    r1_node=s1,
                    r2_node=None,
                    state_r1=state_key(n1),
                    state_r2=None,
                    flavor_r1=n1.get("flavor"),
                    flavor_r2=None,
                    container_r1=n1.get("container"),
                    container_r2=None,
                )
            )
                c += 1

    for s2 in start_nodes2:
        if s2 in used_start2:
            continue
        n2 = nmap2[s2]
        merged_nodes.append(
            MergedNode(
                merged_id=f"M{c}",
                domain=domain,
                kind="only_r2",
                r1_node=None,
                r2_node=s2,
                state_r1=None,
                state_r2=state_key(n2),
                flavor_r1=None,
                flavor_r2=n2.get("flavor"),
                container_r1=None,
                container_r2=n2.get("container"),
            )
        )
        c += 1

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
                    container_r1=n1.get("container"),
                    container_r2=n2.get("container"),
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
                    container_r1=n1.get("container"),
                    container_r2=n2.get("container"),
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
                    container_r1=n1.get("container"),
                    container_r2=None,
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
                    container_r1=None,
                    container_r2=n2.get("container"),
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
                    container_r1=n1.get("container"),
                    container_r2=n2.get("container"),
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
                    container_r1=n1.get("container"),
                    container_r2=None,
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
                    container_r1=None,
                    container_r2=n2.get("container"),
                )
            )

        c += 1

    return merged_nodes

def should_exact_node_be_dumbbell(
    merged_node,
    recipe1,
    recipe2,
    recipe1_id,
    recipe2_id,
    final_node_to_merged,
    final_kind_of,
):
    """
    对所有 merged_exact 节点统一判断是否画成 dumbbell。

    条件：
    1. 任一流入 source 是 only_r1 / only_r2
    2. 或任一流入 source 不是 merged_exact
    3. 或任一流入 source 没有 merged_id
    """
    if merged_node.kind != "merged_exact":
        return False

    def collect_in_edges(recipe, node_idx):
        if node_idx is None:
            return []
        return [
            e for e in recipe["edges"]
            if int(e["node2"]) == int(node_idx)
        ]

    in_edges_r1 = collect_in_edges(recipe1, merged_node.r1_node)
    in_edges_r2 = collect_in_edges(recipe2, merged_node.r2_node)

    def side_has_asymmetric_source(in_edges, recipe_id):
        for e in in_edges:
            src = int(e["node1"])
            src_mid = final_node_to_merged.get((recipe_id, src))

            # 这个 source 连 merged node 都没找到
            if src_mid is None:
                return True

            src_kind = final_kind_of.get(src_mid)

            # only source 流入 -> dumbbell
            if src_kind in ("only_r1", "only_r2"):
                return True

            # 不是 exact source -> dumbbell
            if src_kind != "merged_exact":
                return True

        return False

    if side_has_asymmetric_source(in_edges_r1, recipe1_id):
        return True
    if side_has_asymmetric_source(in_edges_r2, recipe2_id):
        return True

    return False
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

def norm_str(x: Any) -> str:
    return str(x).lower().strip()

def can_propagate_merge(idx1, idx2, node_map1, node_map2):
    n1 = node_map1.get(int(idx1))
    n2 = node_map2.get(int(idx2))
    if not n1 or not n2:
        return False

    t1 = norm_str(n1.get("type"))
    t2 = norm_str(n2.get("type"))
    if t1 != t2:
        return False

    return state_key(n1) == state_key(n2)

def get_up_neighbors(node_idx, in_map):
    return list(in_map.get(int(node_idx), []))

def get_down_neighbors(node_idx, out_map):
    return list(out_map.get(int(node_idx), []))

def propagate_upstream_only(
    seed1,
    seed2,
    node_map1,
    node_map2,
    in_map1,
    in_map2,
    seen=None,
):
    """
    从一个已 merge 的非-main pair 开始，只向上游传播。
    最近上游 state 相同则 merge，直到不同停止。
    """
    out_pairs = []
    cur1 = int(seed1)
    cur2 = int(seed2)

    while True:
        ups1 = [u for u in in_map1.get(cur1, []) if norm_str(node_map1[u].get("type")) != "main"]
        ups2 = [u for u in in_map2.get(cur2, []) if norm_str(node_map2[u].get("type")) != "main"]

        if not ups1 or not ups2:
            break

        # 取最近的一个；如果你后面需要更复杂匹配，可以再扩
        u1 = ups1[0]
        u2 = ups2[0]

        if not can_propagate_merge(u1, u2, node_map1, node_map2):
            break
        
        dom = norm_str(node_map1[u1].get("type"))
        key = (dom, int(u1), int(u2))

        # 如果已经 merge 过，就不要重复加，也不要继续从它往上推
        if seen is not None and key in seen:
            break
        
        out_pairs.append((u1, u2))
        cur1 = u1
        cur2 = u2

    return out_pairs

def propagate_merge_from_main_pairs(
    recipe1,
    recipe2,
    recipe1_id,
    recipe2_id,
    main_merged_nodes,
):
    node_map1 = build_node_map(recipe1)
    node_map2 = build_node_map(recipe2)

    out_map1, in_map1, edge_map1 = build_graph_maps(recipe1)
    out_map2, in_map2, edge_map2 = build_graph_maps(recipe2)

    propagated = []
    seen = set()

    def add_pair(domain, r1_node, r2_node, source_main_mid):
        key = (domain, int(r1_node), int(r2_node))
        if key in seen:
            print("[SKIP DUP MERGE]", key, "source_main_mid=", source_main_mid)
            return False

        seen.add(key)
        propagated.append(
        PropagatedMerge(
            domain=domain,
            r1_node=int(r1_node),
            r2_node=int(r2_node),
            source_main_mid=source_main_mid,
            kind="merged_exact",
        )
    )
        print("[ADD MERGE]", key, "source_main_mid=", source_main_mid)
        return True

    for m in main_merged_nodes:
        if m.kind not in ("merged_exact", "merged_similar"):
            continue
        if m.r1_node is None or m.r2_node is None:
            continue

        main1 = int(m.r1_node)
        main2 = int(m.r2_node)

        # ---------- 查 main 的 down ----------
        downs1 = get_down_neighbors(main1, out_map1)
        downs2 = get_down_neighbors(main2, out_map2)

        for d1 in downs1:
            for d2 in downs2:
                if not can_propagate_merge(d1, d2, node_map1, node_map2):
                    continue

                dom = norm_str(node_map1[d1].get("type"))
                if dom == "main":
                    continue

                created = add_pair(dom, d1, d2, m.merged_id)
                if created:
                    ups = propagate_upstream_only(
                        d1, d2,
                        node_map1, node_map2,
                        in_map1, in_map2,
                        seen=seen,
                    )
                    for u1, u2 in ups:
                        dom2 = norm_str(node_map1[u1].get("type"))
                        if dom2 != "main":
                            add_pair(dom2, u1, u2, m.merged_id)

        # ---------- 查 main 的 up ----------
        ups1 = get_up_neighbors(main1, in_map1)
        ups2 = get_up_neighbors(main2, in_map2)

        for u1 in ups1:
            for u2 in ups2:
                if not can_propagate_merge(u1, u2, node_map1, node_map2):
                    continue

                dom = norm_str(node_map1[u1].get("type"))
                if dom == "main":
                    continue

                created = add_pair(dom, u1, u2, m.merged_id)
                if created:
                    more_ups = propagate_upstream_only(
                        u1, u2,
                        node_map1, node_map2,
                        in_map1, in_map2,
                        seen=seen,
                    )
                    for uu1, uu2 in more_ups:
                        dom2 = norm_str(node_map1[uu1].get("type"))
                        if dom2 != "main":
                            add_pair(dom2, uu1, uu2, m.merged_id)

    return propagated

def edge_signature_set(node_idx, recipe):
    sigs = set()

    for e in recipe.get("edges", []):
        u = int(e["node1"])
        v = int(e["node2"])

        if u == int(node_idx) or v == int(node_idx):
            sigs.add((
                "out" if u == int(node_idx) else "in",
                canon_action(e.get("action", "")),
                norm_str(e.get("type", "")),
            ))

    return sigs


def node_has_non_shared_edges(r1_node, r2_node, recipe1, recipe2):
    if r1_node is None or r2_node is None:
        return False

    s1 = edge_signature_set(r1_node, recipe1)
    s2 = edge_signature_set(r2_node, recipe2)

    return s1 != s2

def build_propagated_merged_nodes(
    propagated,
    recipe1,
    recipe2,
    start_idx=0,
):
    nmap1 = build_node_map(recipe1)
    nmap2 = build_node_map(recipe2)

    out = []
    c = start_idx

    seen = set()

    for p in propagated:
        key = (p.domain, p.r1_node, p.r2_node)
        if key in seen:
            continue
        seen.add(key)

        n1 = nmap1[p.r1_node] if p.r1_node is not None else None
        n2 = nmap2[p.r2_node] if p.r2_node is not None else None

        shape_dumbbell = node_has_non_shared_edges(
            p.r1_node, p.r2_node, recipe1, recipe2
        )

        out.append(
            MergedNode(
                merged_id=f"P{c}",
                domain=p.domain,
                kind="merged_exact",
                r1_node=p.r1_node,
                r2_node=p.r2_node,
                state_r1=state_key(n1) if n1 else None,
                state_r2=state_key(n2) if n2 else None,
                flavor_r1=n1.get("flavor") if n1 else None,
                flavor_r2=n2.get("flavor") if n2 else None,
                container_r1=n1.get("container") if n1 else None,
                container_r2=n2.get("container") if n2 else None,
                shared_add_dumbbell=shape_dumbbell,  # 保持兼容
                shape_dumbbell=shape_dumbbell,
            )
        )
        c += 1

    return out


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

def detect_container_lanes(nodes):

    container_lane = {}

    for n in nodes:

        c = n.container_r1 or n.container_r2

        if not c or c == "none":
            continue

        if c not in container_lane:
            container_lane[c] = len(container_lane) + 1

    return container_lane

def start_anchor(kind: str, merged_edge: bool, recipe_id: str, recipe1_id: str,
                 shared_add_dumbbell: bool = False, shape_dumbbell: bool = False) -> str:
    if kind == "merged_similar" or shared_add_dumbbell or shape_dumbbell:
        return "M" if merged_edge else ("T" if recipe_id == recipe1_id else "B")
    return "S"


def end_anchor(kind: str, merged_edge: bool, recipe_id: str, recipe1_id: str,
               shared_add_dumbbell: bool = False, shape_dumbbell: bool = False) -> str:
    if kind == "merged_similar" or shared_add_dumbbell or shape_dumbbell:
        return "M" if merged_edge else ("T" if recipe_id == recipe1_id else "B")
    return "S"

# ===============================
# build render edges
# ===============================

def build_render_edges(
    main_merged_nodes,
    recipe1,
    recipe2,
    recipe1_id,
    recipe2_id,
    final_node_to_merged,
    final_kind_of,
    final_shared_add_flag_of,
    final_shape_dumbbell_of,
):
    main_shared_add_flag_of = {
        m.merged_id: getattr(m, "shared_add_dumbbell", False)
        for m in main_merged_nodes
    }
    main_shape_dumbbell_of = {
        m.merged_id: getattr(m, "shape_dumbbell", False)
        for m in main_merged_nodes
    }
    main_kind_of = {m.merged_id: m.kind for m in main_merged_nodes}
    r1_of = {m.merged_id: m.r1_node for m in main_merged_nodes}
    r2_of = {m.merged_id: m.r2_node for m in main_merged_nodes}

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

    def resolve_target(recipe_id, node_idx):
        key = (recipe_id, int(node_idx))
        if key in final_node_to_merged:
            mid = final_node_to_merged[key]
            return mid, final_kind_of[mid]
        return None, None

    def source_anchor(kind, merged_edge, recipe_id, source_mid):
        return start_anchor(
            kind,
            merged_edge,
            recipe_id,
            recipe1_id,
            shared_add_dumbbell=main_shared_add_flag_of.get(source_mid, False),
            shape_dumbbell=main_shape_dumbbell_of.get(source_mid, False),
        )

    def target_anchor(target_mid, kind, merged_edge, recipe_id):
        return end_anchor(
            kind,
            merged_edge,
            recipe_id,
            recipe1_id,
            shared_add_dumbbell=final_shared_add_flag_of.get(target_mid, False),
            shape_dumbbell=final_shape_dumbbell_of.get(target_mid, False),
        )

    for m in main_merged_nodes:
        mid = m.merged_id
        kcur = m.kind
        n1 = r1_of[mid]
        n2 = r2_of[mid]

        e1_list = out1.get(int(n1), []) if n1 is not None else []
        e2_list = out2.get(int(n2), []) if n2 is not None else []

        # ---------- only_r1 ----------
        if kcur == "only_r1":
            for e1 in e1_list:
                nxt, k1 = resolve_target(recipe1_id, int(e1["node2"]))
                if nxt is None:
                    print(
                        "[MISS TARGET MAIN][R1]",
                        "from main merged=", mid,
                        "raw edge=", e1,
                        "target node=", int(e1["node2"]),
                    )
                    continue

                add_edge(
                    mid,
                    source_anchor(kcur, False, recipe1_id, mid),
                    nxt,
                    target_anchor(nxt, k1, False, recipe1_id),
                    e1["action"],
                    e1.get("type", ""),
                    "R1",
                )
            continue

        # ---------- only_r2 ----------
        if kcur == "only_r2":
            for e2 in e2_list:
                nxt, k2 = resolve_target(recipe2_id, int(e2["node2"]))
                if nxt is None:
                    print(
                        "[MISS TARGET MAIN][R2]",
                        "from main merged=", mid,
                        "raw edge=", e2,
                        "target node=", int(e2["node2"]),
                    )
                    continue

                add_edge(
                    mid,
                    source_anchor(kcur, False, recipe2_id, mid),
                    nxt,
                    target_anchor(nxt, k2, False, recipe2_id),
                    e2["action"],
                    e2.get("type", ""),
                    "R2",
                )
            continue

        # ---------- merged main ----------
        used2 = set()

        for e1 in e1_list:
            matched_j = None
            nxt1, k1 = resolve_target(recipe1_id, int(e1["node2"]))
            if nxt1 is None:
                print(
                    "[MISS TARGET MAIN][R1]",
                    "from main merged=", mid,
                    "raw edge=", e1,
                    "target node=", int(e1["node2"]),
                )
                continue

            for j, e2 in enumerate(e2_list):
                if j in used2:
                    continue

                nxt2, k2 = resolve_target(recipe2_id, int(e2["node2"]))
                if nxt2 is None:
                    continue

                can_merge_edge = (
                    same_action(e1, e2)
                    and nxt1 == nxt2
                    and k1 in ("merged_exact", "merged_similar")
                    and k2 in ("merged_exact", "merged_similar")
                )

                if can_merge_edge:
                    matched_j = j
                    used2.add(j)

                    add_edge(
                        mid,
                        source_anchor(kcur, True, recipe1_id, mid),
                        nxt1,
                        target_anchor(nxt1, k1, True, recipe1_id),
                        e1["action"],
                        e1.get("type", ""),
                        "shared",
                    )
                    break

            if matched_j is None:
                add_edge(
                    mid,
                    source_anchor(kcur, False, recipe1_id, mid),
                    nxt1,
                    target_anchor(nxt1, k1, False, recipe1_id),
                    e1["action"],
                    e1.get("type", ""),
                    "R1",
                )

        for j, e2 in enumerate(e2_list):
            if j in used2:
                continue

            nxt2, k2 = resolve_target(recipe2_id, int(e2["node2"]))
            if nxt2 is None:
                print(
                    "[MISS TARGET MAIN][R2]",
                    "from main merged=", mid,
                    "raw edge=", e2,
                    "target node=", int(e2["node2"]),
                )
                continue

            add_edge(
                mid,
                source_anchor(kcur, False, recipe2_id, mid),
                nxt2,
                target_anchor(nxt2, k2, False, recipe2_id),
                e2["action"],
                e2.get("type", ""),
                "R2",
            )

    print("\n====== MAIN RENDER EDGES ======")
    for e in render_edges:
        print(e)
    print("Total main render edges:", len(render_edges))
    print("================================\n")

    return render_edges

def build_aux_render_edges(
    aux_merged_nodes,
    recipe1,
    recipe2,
    recipe1_id,
    recipe2_id,
    final_node_to_merged,
    final_kind_of,
    final_shared_add_flag_of,
    final_shape_dumbbell_of,
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
    aux_shared_add_flag_of = {
        m.merged_id: getattr(m, "shared_add_dumbbell", False)
        for m in aux_merged_nodes
    }
    aux_shape_dumbbell_of = {
        m.merged_id: getattr(m, "shape_dumbbell", False)
        for m in aux_merged_nodes
    }

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
          ("aux", merged_id, kind)       if target is aux merged node
          ("other", merged_id, kind)     if target is main/container/propagated merged node
          (None, None, None)             if unresolved
        """
        key = (recipe_id, int(node_idx))

        if key in aux_node_to_merged:
            mid = aux_node_to_merged[key]
            return "aux", mid, aux_kind_of[mid]

        if key in final_node_to_merged:
            mid = final_node_to_merged[key]
            return "other", mid, final_kind_of[mid]

        return None, None, None

    def target_anchor(domain, target_mid, kind, merged_edge, recipe_id):
        if domain == "aux":
            shared_flag = aux_shared_add_flag_of.get(target_mid, False)
            shape_flag = aux_shape_dumbbell_of.get(target_mid, False)
        else:
            shared_flag = final_shared_add_flag_of.get(target_mid, False)
            shape_flag = final_shape_dumbbell_of.get(target_mid, False)

        return end_anchor(
            kind,
            merged_edge,
            recipe_id,
            recipe1_id,
            shared_add_dumbbell=shared_flag,
            shape_dumbbell=shape_flag,
        )

    def source_anchor(kind, merged_edge, recipe_id, source_mid):
        shared_flag = aux_shared_add_flag_of.get(source_mid, False)
        shape_flag = aux_shape_dumbbell_of.get(source_mid, False)

        return start_anchor(
            kind,
            merged_edge,
            recipe_id,
            recipe1_id,
            shared_add_dumbbell=shared_flag,
            shape_dumbbell=shape_flag,
        )

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
                    print(
                        "[MISS TARGET][R1]",
                        "from aux merged=", mid,
                        "raw edge=", e1,
                        "target node=", int(e1["node2"])
                    )
                    continue

                add_edge(
                    mid,
                    source_anchor(kcur, False, recipe1_id, mid),
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
                    print(
                        "[MISS TARGET][R2]",
                        "from aux merged=", mid,
                        "raw edge=", e2,
                        "target node=", int(e2["node2"])
                    )
                    continue

                add_edge(
                    mid,
                    source_anchor(kcur, False, recipe2_id, mid),
                    target2,
                    target_anchor(dom2, target2, kind2, False, recipe2_id),
                    e2["action"],
                    e2.get("type", ""),
                    "R2"
                )
            continue

        # ---------- merged aux ----------
        used2 = set()

        for e1 in e1_list:
            matched_j = None

            dom1, target1, kind1 = resolve_target(recipe1_id, int(e1["node2"]))
            if target1 is None:
                print(
                    "[MISS TARGET][R1]",
                    "from aux merged=", mid,
                    "raw edge=", e1,
                    "target node=", int(e1["node2"])
                )
                continue

            for j, e2 in enumerate(e2_list):
                if j in used2:
                    continue

                dom2, target2, kind2 = resolve_target(recipe2_id, int(e2["node2"]))
                if target2 is None:
                    continue

                can_merge_edge = (
                    same_action(e1, e2)
                    and dom1 == dom2
                    and target1 == target2
                    and (
                        (dom1 == "aux" and kind1 == "merged_exact" and kind2 == "merged_exact")
                        or
                        (dom1 == "other" and kind1 in ("merged_exact", "merged_similar") and kind2 in ("merged_exact", "merged_similar"))
                    )
                )

                if can_merge_edge:
                    matched_j = j
                    used2.add(j)

                    add_edge(
                        mid,
                        source_anchor(kcur, True, recipe1_id, mid),
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
                    source_anchor(kcur, False, recipe1_id, mid),
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
                print(
                    "[MISS TARGET][R2]",
                    "from aux merged=", mid,
                    "raw edge=", e2,
                    "target node=", int(e2["node2"])
                )
                continue

            add_edge(
                mid,
                source_anchor(kcur, False, recipe2_id, mid),
                target2,
                target_anchor(dom2, target2, kind2, False, recipe2_id),
                e2["action"],
                e2.get("type", ""),
                "R2"
            )

    print("\n====== AUX RENDER EDGES ======")
    for e in render_edges:
        print(e)
    print("Total aux render edges:", len(render_edges))
    print("================================\n")

    return render_edges

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
                "container_r1": getattr(m, "container_r1", None),
                "container_r2": getattr(m, "container_r2", None),
                "container_lane": 0,  # 保留兼容
                # ── 新增 ──
                "shape_dumbbell": getattr(m, "shape_dumbbell", False),
                "container_epoch_r1": getattr(m, "container_epoch_r1", 0) or 0,
                "container_epoch_r2": getattr(m, "container_epoch_r2", 0) or 0,
                "shared_add_dumbbell": m.shared_add_dumbbell,
                "icon_r1": getattr(m, "icon_r1", None),
                "icon_r2": getattr(m, "icon_r2", None),
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
        re.sub(r"[\s_]+", "_", str(name).lower().strip()).strip("_"),
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

from collections import defaultdict

def build_graph_maps(recipe):
    out_map = defaultdict(list)
    in_map = defaultdict(list)
    edge_map = defaultdict(list)   # (u, v) -> [edges]

    for e in recipe["edges"]:
        u = int(e["node1"])
        v = int(e["node2"])
        out_map[u].append(v)
        in_map[v].append(u)
        edge_map[(u, v)].append(e)

    for k in out_map:
        out_map[k] = sorted(set(out_map[k]))
    for k in in_map:
        in_map[k] = sorted(set(in_map[k]))

    return out_map, in_map, edge_map

# ─── 修改 build_full_graph_main_aux ──────────────────────────
def dedup_merged_nodes_with_priority(main_nodes, propagated_nodes, aux_nodes):
    """
    优先级:
      main > propagated > aux
    同一个 (domain, r1_node, r2_node) 只保留优先级更高的那个
    """
    out = []
    seen = set()

    for group in [main_nodes, propagated_nodes, aux_nodes]:
        for m in group:
            key = (m.domain, m.r1_node, m.r2_node)
            if key in seen:
                print("[SKIP DUP FINAL NODE]", key, "merged_id=", m.merged_id)
                continue
            seen.add(key)
            out.append(m)

    return out

def build_full_graph_main_aux(recipe1, recipe2, compare_main_fn):
    recipe1_id = get_recipe_id(recipe1, "recipe1")
    recipe2_id = get_recipe_id(recipe2, "recipe2")

    # ── epoch map ──
    epoch_map_r1 = build_container_epoch_map(recipe1)
    epoch_map_r2 = build_container_epoch_map(recipe2)

    # =========================================================
    # 1) main matching
    # =========================================================
    main_records = compare_main_fn(recipe1, recipe2)
    has_shared = any(r.kind not in ("only_r1", "only_r2") for r in main_records)
    
    main_merged_nodes = build_merged_nodes_from_records(
        main_records,
        recipe1,
        recipe2,
        include_start_node=True,
        domain="main",
    )
    main_merged_nodes, _ = reorder_and_renumber_merged_nodes_by_recipe_order(main_merged_nodes)
    main_merged_nodes = annotate_shared_add_dumbbell(main_merged_nodes, recipe1, recipe2)

    for m in main_merged_nodes:
        if m.r1_node is not None:
            m.container_epoch_r1 = epoch_map_r1.get(int(m.r1_node), 0)
        if m.r2_node is not None:
            m.container_epoch_r2 = epoch_map_r2.get(int(m.r2_node), 0)

    # =========================================================
    # 2) non-main matching
    #    现在 non-main merge 逻辑已经前移到 matcher 层
    # =========================================================
    non_main_records = compare_non_main_nodes(
        recipe1,
        recipe2,
        recipe1_id,
        recipe2_id,
        main_merged_nodes,
    )
    
    print("\n====== NON-MAIN RECORDS ======")
    for r in non_main_records:
        print(
        "kind=", r.kind,
        "r1_out_node=", r.r1_out_node,
        "r2_out_node=", r.r2_out_node,
    )
    print("==============================\n")
    # 这里先继续复用旧函数名，但实际处理的是 non-main records
    non_main_merged_nodes = build_aux_merged_nodes_from_records(
        non_main_records,
        recipe1,
        recipe2,
    )

    for m in non_main_merged_nodes:
        if m.r1_node is not None:
            m.container_epoch_r1 = epoch_map_r1.get(int(m.r1_node), 0)
        if m.r2_node is not None:
            m.container_epoch_r2 = epoch_map_r2.get(int(m.r2_node), 0)

    # =========================================================
    # 3) final all_nodes
    # =========================================================
    all_nodes = dedup_merged_nodes_with_priority(
        main_merged_nodes,
        [],  # propagated_nodes 这一层现在不再参与最终图
        non_main_merged_nodes,
    )

    # ── Remove only_r1/only_r2 nodes superseded by a merged node ──────────
    # When the start-node path creates an only_r1 for R1 node X, but the
    # main matcher also creates a merged_similar/merged_exact that claims the
    # same R1 node X, both survive dedup (different r2_node keys).  We must
    # drop the only_r1 because the merged node already represents that state.
    _claimed_r1 = {
        m.r1_node
        for m in all_nodes
        if m.kind in ("merged_exact", "merged_similar") and m.r1_node is not None
    }
    _claimed_r2 = {
        m.r2_node
        for m in all_nodes
        if m.kind in ("merged_exact", "merged_similar") and m.r2_node is not None
    }
    _before = len(all_nodes)
    all_nodes = [
        m for m in all_nodes
        if not (m.kind == "only_r1" and m.r1_node is not None and m.r1_node in _claimed_r1)
        and not (m.kind == "only_r2" and m.r2_node is not None and m.r2_node in _claimed_r2)
    ]
    if len(all_nodes) < _before:
        print(f"[SUPERSEDED NODES] removed {_before - len(all_nodes)} only_r1/only_r2 node(s) "
              f"already claimed by a merged node")

    all_nodes = attach_icons_to_nodes(all_nodes)

    # 不再使用 container_lane，保留兼容
    for n in all_nodes:
        n.container_lane = 0

    # =========================================================
    # 4) final mappings
    # =========================================================
    final_node_to_merged = {}
    for m in all_nodes:
        if m.r1_node is not None:
            final_node_to_merged[(recipe1_id, int(m.r1_node))] = m.merged_id
        if m.r2_node is not None:
            final_node_to_merged[(recipe2_id, int(m.r2_node))] = m.merged_id

        final_kind_of = {m.merged_id: m.kind for m in all_nodes}

    # 旧字段先保留，兼容 render edge 逻辑
    final_shared_add_flag_of = {
        m.merged_id: getattr(m, "shared_add_dumbbell", False)
        for m in all_nodes
    }

    # =========================================================
    # unified dumbbell shape logic
    # =========================================================
    for m in all_nodes:
        # 默认不是 dumbbell
        m.shape_dumbbell = False

        # similar 一定是 dumbbell
        if m.kind == "merged_similar":
            m.shape_dumbbell = True
            continue

        # exact:
        # 1) 保留 main 旧逻辑
        if m.kind == "merged_exact" and getattr(m, "shared_add_dumbbell", False):
            m.shape_dumbbell = True

        # 2) 再加新逻辑：
        #    只要流入 source 里有 only_r1 / only_r2
        #    或 source 不是 merged_exact
        if m.kind == "merged_exact":
            if should_exact_node_be_dumbbell(
                m,
                recipe1,
                recipe2,
                recipe1_id,
                recipe2_id,
                final_node_to_merged,
                final_kind_of,
            ):
                m.shape_dumbbell = True

    # 注意：一定要在上面判完之后再生成
    final_shape_dumbbell_of = {
        m.merged_id: getattr(m, "shape_dumbbell", False)
        for m in all_nodes
    }

    # =========================================================
    # 5) render edges
    # =========================================================
    # Deduplicate main_merged_nodes before building edges — the same
    # (domain, r1_node, r2_node) pair can appear twice when a node is
    # both a "start node" (include_start_node path) AND in the match
    # records (e.g. r1=14 and r1=16 share identical state_keys so the
    # matcher matches both to the same r2 node, generating a second
    # merged_exact entry for the same pair). Without this dedup the
    # ghost merged_id still generates render edges that reference a node
    # that was already removed from all_nodes, which breaks frontend
    # layout (inflated Kahn in-degrees, fallback positioning).
    main_merged_nodes_deduped = dedup_merged_nodes_with_priority(
        main_merged_nodes, [], []
    )
    # Filter out any node superseded by the removal step above so no
    # ghost edges are generated for nodes no longer in all_nodes.
    _surviving_ids = {m.merged_id for m in all_nodes}
    main_merged_nodes_deduped = [
        m for m in main_merged_nodes_deduped if m.merged_id in _surviving_ids
    ]
    main_render_edges = build_render_edges(
        main_merged_nodes_deduped,
        recipe1,
        recipe2,
        recipe1_id,
        recipe2_id,
        final_node_to_merged,
        final_kind_of,
        final_shared_add_flag_of,
        final_shape_dumbbell_of,
    )

    # 这里虽然函数名还是 aux_render_edges，
    # 实际上现在负责画所有 non-main source 的边
    non_main_render_edges = build_aux_render_edges(
        non_main_merged_nodes,
        recipe1,
        recipe2,
        recipe1_id,
        recipe2_id,
        final_node_to_merged,
        final_kind_of,
        final_shared_add_flag_of,
        final_shape_dumbbell_of,
    )

    all_edges = main_render_edges + non_main_render_edges

    return export_graph_data(
        all_nodes,
        all_edges,
        recipe1_id=recipe1_id,
        recipe2_id=recipe2_id,
        separate_layout=not has_shared,
    )