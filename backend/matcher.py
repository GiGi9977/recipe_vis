from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, Any, List, Tuple, Optional


ACTION_CANON = {
    "parboil": "blanch",
    "scald": "blanch",
    "sear": "fry",
}

def canon_action(action: str) -> str:
    a = str(action).lower().strip()
    return ACTION_CANON.get(a, a)


def norm_str(x: Any) -> str:
    return str(x).lower().strip()


def build_node_map(recipe: Dict[str, Any]) -> Dict[int, Dict[str, Any]]:
    return {int(n["index"]): n for n in recipe["nodes"]}


def sort_edges(recipe: Dict[str, Any]) -> List[Dict[str, Any]]:
    return sorted(recipe["edges"], key=lambda e: int(e["index"]))


def state_key(node: Dict[str, Any]) -> Tuple[str, str, str, str]:
    return (
        norm_str(node.get("name", "")),
        norm_str(node.get("type", "")),
        norm_str(node.get("physical_state", "")),
        norm_str(node.get("chemical_state", "")),
    )


def prev_sig_non_add(node: Dict[str, Any]) -> Tuple[Tuple[str, str, str], ...]:
    """
    当前 node 的 previous 中，排除 add。
    这些信息仍参与当前 node 的匹配。
    """
    prev = node.get("previous", []) or []
    items: List[Tuple[str, str, str]] = []

    for p in prev:
        action = canon_action(norm_str(p.get("action", "")))
        if action == "add":
            continue

        items.append((
            norm_str(p.get("type", "")),
            action,
            norm_str(p.get("source_ingredient", "")),
        ))

    return tuple(items)


def prev_sig_add_only(node: Dict[str, Any]) -> Tuple[Tuple[str, str, str], ...]:
    """
    当前 node 的 previous 中，只保留 add。
    这些 add 不在当前 node 生效，而是延迟到它作为 source 连向下一个 node 时再参与匹配。
    """
    prev = node.get("previous", []) or []
    items: List[Tuple[str, str, str]] = []

    for p in prev:
        action = canon_action(norm_str(p.get("action", "")))
        if action != "add":
            continue

        items.append((
            norm_str(p.get("type", "")),
            action,
            norm_str(p.get("source_ingredient", "")),
        ))

    return tuple(items)

def tr1(edge: Dict[str, Any], node_map: Dict[int, Dict[str, Any]]) -> Tuple:
    """
    exact matching feature

    规则：
    - 当前 target node(v) 的 add previous 不在当前步参与
    - 而是延迟到 v 作为 source 连到下一个 node 时参与
    - 所以这里：
      * target 用 prev_sig_non_add(v)
      * source 用 prev_sig_add_only(u)
    """
    u = node_map[int(edge["node1"])]
    v = node_map[int(edge["node2"])]

    return (
        state_key(u),
        canon_action(edge["action"]),
        norm_str(edge.get("type", "")),
        state_key(v),
        prev_sig_non_add(v),   # 当前 node 只看非 add previous
        prev_sig_add_only(u),  # 上一个 node 被 add 的信息延迟到这一步再看
    )

def tr2(edge: Dict[str, Any], node_map: Dict[int, Dict[str, Any]]) -> Tuple:
    v = node_map[int(edge["node2"])]
    return (
        canon_action(edge["action"]),
        norm_str(edge.get("type", "")),
        state_key(v),
    )

def split_recipe_main_aux(recipe: Dict[str, Any]):
    nodes = recipe["nodes"]
    edges = recipe["edges"]

    main_nodes = [n for n in nodes if str(n.get("type", "")).lower().strip() == "main"]
    aux_nodes  = [n for n in nodes if str(n.get("type", "")).lower().strip() != "main"]

    main_ids = {int(n["index"]) for n in main_nodes}
    aux_ids  = {int(n["index"]) for n in aux_nodes}

    main_edges = [
        e for e in edges
        if int(e["node1"]) in main_ids and int(e["node2"]) in main_ids
    ]

    aux_edges = [
        e for e in edges
        if int(e["node1"]) in aux_ids or int(e["node2"]) in aux_ids
    ]

    recipe_main = {
        **{k: v for k, v in recipe.items() if k not in ("nodes", "edges")},
        "nodes": main_nodes,
        "edges": main_edges,
    }

    recipe_aux = {
        **{k: v for k, v in recipe.items() if k not in ("nodes", "edges")},
        "nodes": aux_nodes,
        "edges": aux_edges,
    }

    return recipe_main, recipe_aux

@dataclass
class AuxNodeItem:
    recipe_id: str
    node: Dict[str, Any]
    node_idx: int
    orig_pos: int
    state: Tuple[str, str, str, str]


@dataclass
class AuxMatchRecord:
    kind: str  # exact / similar / only_r1 / only_r2
    r1_node: Optional[int]
    r2_node: Optional[int]
    orig_pos_r1: Optional[int]
    orig_pos_r2: Optional[int]


@dataclass
class SeqItem:
    recipe: str
    edge: Dict[str, Any]
    out_node: int
    orig_pos: int
    key1: Tuple
    key2: Tuple
    state_out: Tuple


@dataclass
class MatchRecord:
    kind: str
    r1_edge: Optional[int]
    r2_edge: Optional[int]
    r1_out_node: Optional[int]
    r2_out_node: Optional[int]
    orig_pos_r1: Optional[int]
    orig_pos_r2: Optional[int]

def build_aux_items(recipe: Dict[str, Any], recipe_id: str):
    from .matcher import state_key

    aux_nodes = [n for n in recipe["nodes"] if str(n.get("type", "")).lower().strip() != "main"]
    aux_nodes = sorted(aux_nodes, key=lambda n: int(n["index"]))

    items = []
    for pos, n in enumerate(aux_nodes):
        items.append(
            AuxNodeItem(
                recipe_id=recipe_id,
                node=n,
                node_idx=int(n["index"]),
                orig_pos=pos,
                state=state_key(n),
            )
        )
    return items

from collections import defaultdict
from .matcher import MatchRecord, state_key


def compare_aux_nodes(
    recipe1_aux,
    recipe2_aux,
    recipe1_id,
    recipe2_id,
    main_node_to_merged,
):
    nodes1_all = [n for n in recipe1_aux["nodes"] if norm_str(n.get("type")) != "main"]
    nodes2_all = [n for n in recipe2_aux["nodes"] if norm_str(n.get("type")) != "main"]

    node_map1 = {int(n["index"]): n for n in recipe1_aux["nodes"]}
    node_map2 = {int(n["index"]): n for n in recipe2_aux["nodes"]}

    # 建立 out_map（谁的下游是谁）
    out_map1 = defaultdict(list)
    out_map2 = defaultdict(list)
    for e in recipe1_aux["edges"]:
        out_map1[int(e["node1"])].append(int(e["node2"]))
    for e in recipe2_aux["edges"]:
        out_map2[int(e["node1"])].append(int(e["node2"]))

    # ---- 拓扑逆序：从最靠近 main 的 aux 开始处理 ----
    def topo_reverse_order(nodes, out_map, node_map):
        """
        返回节点列表，顺序为：最靠近 main/叶子 的 aux 在前。
        即：如果 A -> B，B 排在 A 前面（先处理 B，再处理 A）。
        用简单的后序 DFS 实现。
        """
        ids = {int(n["index"]) for n in nodes}
        # 找入边（谁指向我）
        in_map = defaultdict(list)
        for src, dsts in out_map.items():
            for dst in dsts:
                in_map[dst].append(src)

        visited = set()
        result = []

        def dfs(nid):
            if nid in visited:
                return
            visited.add(nid)
            # 先访问下游
            for dst in out_map.get(nid, []):
                if dst in ids:
                    dfs(dst)
            result.append(nid)  # 下游处理完再加自己 → 自己排在下游前面（后序 = 拓扑逆序）

        # 从所有"源头"（无 aux 入边的 aux 节点）开始
        sources = [nid for nid in ids if not any(p in ids for p in in_map.get(nid, []))]
        for s in sources:
            dfs(s)

        # result 是拓扑正序（源头在前），我们需要逆序（叶子在前）
        return [node_map[nid] for nid in result if nid in node_map]

    nodes1 = topo_reverse_order(nodes1_all, out_map1, node_map1)
    nodes2 = topo_reverse_order(nodes2_all, out_map2, node_map2)

    used2 = set()
    records = []
    aux_node_to_merged = {}
    merge_counter = 0

    # ---------- downstream merged id ----------
    def get_downstream_merge(nid, out_map, node_map, recipe_id):
        nxt_list = out_map.get(int(nid), [])
        if not nxt_list:
            return None
        nxt = int(nxt_list[0])

    # 先查 main，main 节点不在 node_map 里，直接查字典
        main_merged = main_node_to_merged.get((recipe_id, nxt))
        if main_merged is not None:
            return main_merged

    # 再查 aux（未 merge 的 aux 返回 None，阻断链式传播）
        node = node_map.get(nxt)
        if not node:
            return None

        return aux_node_to_merged.get((recipe_id, nxt))

    def aux_state(n):
        return state_key(n)

    # ---------- matching ----------
    for i, n1 in enumerate(nodes1):
        best = None
        down1 = get_downstream_merge(n1["index"], out_map1, node_map1, recipe1_id)

        # 下游没有 merged_id（未 merge 或不存在）→ 不能匹配
        if down1 is None:
            records.append(MatchRecord(
                kind="only_r1",
                r1_edge=None, r2_edge=None,
                r1_out_node=int(n1["index"]), r2_out_node=None,
                orig_pos_r1=i, orig_pos_r2=None,
            ))
            continue

        for j, n2 in enumerate(nodes2):
            if j in used2:
                continue
            down2 = get_downstream_merge(n2["index"], out_map2, node_map2, recipe2_id)
            if down2 is None:
                continue
            if down1 != down2:
                continue
            if aux_state(n1) == aux_state(n2):
                best = j
                break

        if best is not None:
            used2.add(best)
            records.append(MatchRecord(
                kind="exact",
                r1_edge=None, r2_edge=None,
                r1_out_node=int(n1["index"]),
                r2_out_node=int(nodes2[best]["index"]),
                orig_pos_r1=i, orig_pos_r2=best,
            ))
            merged_id = f"AUX_{merge_counter}"
            merge_counter += 1
            aux_node_to_merged[(recipe1_id, int(n1["index"]))] = merged_id
            aux_node_to_merged[(recipe2_id, int(nodes2[best]["index"]))] = merged_id
        else:
            records.append(MatchRecord(
                kind="only_r1",
                r1_edge=None, r2_edge=None,
                r1_out_node=int(n1["index"]), r2_out_node=None,
                orig_pos_r1=i, orig_pos_r2=None,
            ))

    # ---------- remaining r2 ----------
    for j, n2 in enumerate(nodes2):
        if j not in used2:
            records.append(MatchRecord(
                kind="only_r2",
                r1_edge=None, r2_edge=None,
                r1_out_node=None,
                r2_out_node=int(n2["index"]),
                orig_pos_r1=None, orig_pos_r2=j,
            ))

    return records

def build_seq_items(recipe: Dict[str, Any], recipe_id: str) -> List[SeqItem]:
    node_map = build_node_map(recipe)
    edges = sort_edges(recipe)

    # 先按 out_node 分组
    by_out = {}
    for pos, e in enumerate(edges):
        out_node = int(e["node2"])
        by_out.setdefault(out_node, []).append((pos, e))

    items: List[SeqItem] = []

    def is_add_edge(e: Dict[str, Any]) -> bool:
        return canon_action(e.get("action", "")) == "add" or norm_str(e.get("type", "")) == "add"

    for out_node, candidates in by_out.items():
        # 如果同一个 out_node 有多条入边，优先保留非-add 边
        candidates_sorted = sorted(
            candidates,
            key=lambda pe: (
                1 if is_add_edge(pe[1]) else 0,   # 非 add 优先
                int(pe[1]["index"])               # 再按原始 edge index
            )
        )

        pos, e = candidates_sorted[0]

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

    # 最后仍按原 edge 顺序排
    items.sort(key=lambda x: x.orig_pos)
    return items

def state_match_loose(a_state, b_state):
    """
    state = (name, type, physical_state, chemical_state)

    loose similar rule:
    - name must match
    - and (physical_state matches OR chemical_state matches)
    """
    a_name, _, a_physical, a_chemical = a_state
    b_name, _, b_physical, b_chemical = b_state

    def norm(x):
        return str(x).strip().lower()

    name_same = norm(a_name) == norm(b_name)
    physical_same = norm(a_physical) == norm(b_physical)
    chemical_same = norm(a_chemical) == norm(b_chemical)

    return name_same and (physical_same or chemical_same)


def match_by_rule(a, b, rule_name):
    if rule_name == "exact":
        return a.key1 == b.key1

    elif rule_name == "similar2":
        return a.key2 == b.key2

    elif rule_name == "similar3":
        return a.state_out == b.state_out

    elif rule_name == "similar2_loose":
        # 第二轮 rule2:
        # action/type 仍然要相同，只是 state 改成宽松 similar
        a_action, a_type, _ = a.key2
        b_action, b_type, _ = b.key2

        action_same = a_action == b_action
        type_same = a_type == b_type
        state_similar_loose = state_match_loose(a.state_out, b.state_out)

        return action_same and type_same and state_similar_loose

    elif rule_name == "similar3_loose":
        # 第二轮 rule3:
        # 只看宽松 state similar
        return state_match_loose(a.state_out, b.state_out)

    else:
        raise ValueError(f"Unknown rule: {rule_name}")


def monotonic_match_in_window(
    seq1: List[SeqItem],
    seq2: List[SeqItem],
    rule_name: str,
) -> List[Tuple[int, int]]:
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


def split_windows_by_pairs(
    seq1: List[SeqItem],
    seq2: List[SeqItem],
    pairs: List[Tuple[int, int]],
) -> List[Tuple[List[SeqItem], List[SeqItem]]]:
    windows: List[Tuple[List[SeqItem], List[SeqItem]]] = []

    prev_i = 0
    prev_j = 0

    for i, j in pairs:
        windows.append((seq1[prev_i:i], seq2[prev_j:j]))
        prev_i = i + 1
        prev_j = j + 1

    windows.append((seq1[prev_i:], seq2[prev_j:]))
    return windows


def hierarchical_match_windows(
    windows: List[Tuple[List[SeqItem], List[SeqItem]]],
    rule_name: str,
) -> Tuple[List[MatchRecord], List[Tuple[List[SeqItem], List[SeqItem]]]]:
    all_records: List[MatchRecord] = []
    next_windows: List[Tuple[List[SeqItem], List[SeqItem]]] = []

    for seq1, seq2 in windows:
        if not seq1 and not seq2:
            continue

        pairs = monotonic_match_in_window(seq1, seq2, rule_name)

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

        child_windows = split_windows_by_pairs(seq1, seq2, pairs)
        next_windows.extend(child_windows)

    return all_records, next_windows


def hierarchical_three_pass_match(
    recipe1: Dict[str, Any],
    recipe2: Dict[str, Any],
) -> List[MatchRecord]:
    seq1 = build_seq_items(recipe1, "R1")
    seq2 = build_seq_items(recipe2, "R2")

    windows = [(seq1, seq2)]
    all_records: List[MatchRecord] = []

    rec1, windows = hierarchical_match_windows(windows, "exact")
    all_records.extend(rec1)

    rec2, windows = hierarchical_match_windows(windows, "similar2")
    all_records.extend(rec2)

    rec3, windows = hierarchical_match_windows(windows, "similar3")
    all_records.extend(rec3)

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

def hierarchical_main_match_two_stage(recipe1, recipe2):
    recipe1_id = recipe1.get("recipe_id", "recipe1")
    recipe2_id = recipe2.get("recipe_id", "recipe2")

    seq1 = build_seq_items(recipe1, recipe1_id)
    seq2 = build_seq_items(recipe2, recipe2_id)

    windows = [(seq1, seq2)]
    all_records = []

    # stage 1
    rec1, windows = hierarchical_match_windows(windows, "exact")
    all_records.extend(rec1)

    rec2, windows = hierarchical_match_windows(windows, "similar2")
    all_records.extend(rec2)

    rec3, windows = hierarchical_match_windows(windows, "similar3")
    all_records.extend(rec3)

    # stage 2
    rec4, windows = hierarchical_match_windows(windows, "similar2_loose")
    for r in rec4:
        r.kind = "similar2_loose"
    all_records.extend(rec4)

    rec5, windows = hierarchical_match_windows(windows, "similar3_loose")
    for r in rec5:
        r.kind = "similar3_loose"
    all_records.extend(rec5)

    # leftovers
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

def record_sort_key(m: MatchRecord):
    p1 = m.orig_pos_r1 if m.orig_pos_r1 is not None else 10**9
    p2 = m.orig_pos_r2 if m.orig_pos_r2 is not None else 10**9
    return (min(p1, p2), p1, p2)


def sort_match_records_for_visualization(records: List[MatchRecord]) -> List[MatchRecord]:
    return sorted(records, key=record_sort_key)


def compare_recipes(recipe1, recipe2):
    records = hierarchical_main_match_two_stage(recipe1, recipe2)
    return sort_match_records_for_visualization(records)