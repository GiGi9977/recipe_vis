from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, Any, List, Tuple, Optional
import os
from collections import Counter, defaultdict, deque

# Experimental two-stage matching: split each recipe into branches (labelled by all
# of their main nodes), pair the branches one-to-one (identical main sets, then a
# shared main, then a shared aux) and let nodes merge only inside paired branches.
# Off by default: it conflicts with validated cases where the two recipes segment
# the same food differently (docs/tasks/01-matching.md). Set the environment
# variable RECIPE_BRANCH_PAIRING=1 before starting the backend to try it.
USE_BRANCH_PAIRING = os.environ.get("RECIPE_BRANCH_PAIRING", "0") == "1"

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

def state_key(node):
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

def is_main_like(node: Dict[str, Any]) -> bool:
    t = norm_str(node.get("type", ""))
    return t in ("main", "container")

def is_container(node: Dict[str, Any]) -> bool:
    return norm_str(node.get("type", "")) == "container"

def split_recipe_main_aux(recipe):
    nodes = recipe["nodes"]
    edges = recipe["edges"]

    main_nodes = [
        n for n in nodes
        if is_main_like(n)
    ]

    aux_nodes = [
        n for n in nodes
        if not is_main_like(n)
    ]

    main_ids = {int(n["index"]) for n in main_nodes}
    aux_ids = {int(n["index"]) for n in aux_nodes}

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
    target_add_inputs: Tuple = ()
    branch_label: Optional[str] = ""
    branch_origins: frozenset = frozenset()
    recipe_branches: frozenset = frozenset()
    product_branch: Optional[str] = None
    vessel_mains: frozenset = frozenset()
    vessel_aux: frozenset = frozenset()
    branch_id: Optional[int] = None


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

    aux_nodes = [n for n in recipe["nodes"] if str(n.get("type", "")).lower().strip() not in {"main", "container"}]
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


def compare_aux_nodes(
    recipe1_aux,
    recipe2_aux,
    recipe1_id,
    recipe2_id,
    main_node_to_merged,
    recipe1_full=None,
    recipe2_full=None
):
    nodes1_all = [n for n in recipe1_aux["nodes"] if norm_str(n.get("type")) not in {"main", "container"}]
    nodes2_all = [n for n in recipe2_aux["nodes"] if norm_str(n.get("type")) not in {"main", "container"}]
    
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
        visited = set()
        cur = int(nid)

        while True:
            if cur in visited:
                return None

            visited.add(cur)

            nxt_list = out_map.get(cur, [])
            if not nxt_list:
                return None

            nxt = int(nxt_list[0])

            merged = main_node_to_merged.get((recipe_id, nxt))
            if merged:
                return merged

            node = node_map.get(nxt)
            if not node:
                return None

            cur = nxt

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

from collections import defaultdict

def build_in_edge_map(recipe):
    in_map = defaultdict(list)
    for e in recipe["edges"]:
        in_map[int(e["node2"])].append(e)
    for nid in in_map:
        in_map[nid].sort(key=lambda e: int(e["index"]))
    return in_map


def find_prev_main_transition(target_idx: int, node_map, in_map):
    incoming = in_map.get(int(target_idx), [])
    if not incoming:
        return None, None, None

    # 1) direct main/container -> main/container
    for e in incoming:
        src_idx = int(e["node1"])
        src = node_map.get(src_idx)
        if not src:
            continue
        if is_main_like(src):
            return src_idx, e, "direct"

    # 2) main/container -> aux -> main/container
    for e2 in incoming:
        mid_idx = int(e2["node1"])
        mid = node_map.get(mid_idx)
        if not mid:
            continue

        if norm_str(mid.get("type")) != "aux":
            continue

        incoming_mid = in_map.get(mid_idx, [])
        for e1 in incoming_mid:
            src_idx = int(e1["node1"])
            src = node_map.get(src_idx)
            if not src:
                continue
            if not is_main_like(src):
                continue

            fake_edge = {
                "index": e2["index"],
                "action": e2["action"],
                "type": e2.get("type", ""),
                "node1": src_idx,
                "node2": int(target_idx),
            }
            return src_idx, fake_edge, "aux"

    # A real process can create a main product entirely from aux inputs.
    # Do not invent a process from an add-only ingredient list.
    for e in incoming:
        src_idx = int(e["node1"])
        src = node_map.get(src_idx)
        if (src and norm_str(src.get("type")) == "aux"
                and canon_action(e.get("action", "")) != "add"
                and norm_str(e.get("type", "")) != "add"):
            return src_idx, e, "aux_product"

    return None, None, None

def vessel_chain_ingredients(recipe, node_map, start):
    """Main and aux ingredients along the process chain that starts at a vessel.

    The chain follows process edges only (an add edge moves food into another
    vessel and ends the chain) and stops at the first main product. The main
    ingredients are the chain's products plus the single main added into it (if
    several mains are combined, only the products; with no product, the added
    mains); aux ingredients are the aux additions into it.
    """
    def is_add(edge):
        return canon_action(edge.get("action", "")) == "add" or norm_str(edge.get("type", "")) == "add"

    chain, products, pending = set(), set(), deque([start])
    while pending:
        current = pending.popleft()
        if current in chain:
            continue
        chain.add(current)
        if current != start and norm_str(node_map[current].get("type")) == "main":
            products.add(norm_str(node_map[current].get("name", "")))
            continue
        for edge in recipe["edges"]:
            if int(edge["node1"]) == current and not is_add(edge):
                pending.append(int(edge["node2"]))
    added_mains, auxes = set(), set()
    for edge in recipe["edges"]:
        if int(edge["node2"]) in chain and is_add(edge):
            source = node_map[int(edge["node1"])]
            kind = norm_str(source.get("type"))
            if kind == "main":
                added_mains.add(norm_str(source.get("name", "")))
            elif kind == "aux":
                auxes.add(norm_str(source.get("name", "")))
    # The branch is identified by what it produces plus the one main it transforms.
    # When a single main is added (cake paste baked into a cake, pork fried into
    # pork) that main is the branch's own entity. When several mains are combined
    # (eggplant, meat sauce and white sauce layered into an assembly dish) the
    # product is a new entity and the added mains belong to other branches, so
    # they do not make the vessels correspond. With no product, the added mains
    # stand in.
    mains = set(products)
    if len(added_mains) == 1 or not products:
        mains |= added_mains
    return frozenset(mains), frozenset(auxes)


def build_branch_metadata(recipe):
    """Track semantic labels and the initial main/container branches consumed.

    Aux additions do not start or merge main branches. A real join preserves
    its incoming spine label, then relabels its successor. Provenance is never
    erased: equal names alone must not confuse pre-join and post-join stages.
    """
    node_map = build_node_map(recipe)
    incoming = build_in_edge_map(recipe)
    outgoing, parents = build_graph_maps(recipe)
    remaining = {nid: len(parents[nid]) for nid in node_map}
    queue = deque(sorted(nid for nid, count in remaining.items() if count == 0))
    labels, origins, joins = {}, {}, {}
    root_names = {}

    while queue:
        nid = queue.popleft()
        edges = incoming.get(nid, [])
        inherited = frozenset().union(*(origins[p] for p in parents[nid]))
        if is_main_like(node_map[nid]) and not inherited:
            inherited = frozenset({nid})
            root_names[nid] = norm_str(node_map[nid].get("name", ""))
            labels[nid] = root_names[nid]
        elif not edges:
            labels[nid] = norm_str(node_map[nid].get("name", ""))
        else:
            # Prefer the process spine and ignore aux-only additions when
            # choosing the main branch that continues into this node.
            primary = min(edges, key=lambda e: (
                not bool(origins[int(e["node1"])]),
                canon_action(e.get("action", "")) == "add"
                or norm_str(e.get("type", "")) == "add",
                int(e["index"]),
            ))
            src = int(primary["node1"])
            labels[nid] = (norm_str(node_map[nid].get("name", ""))
                           if joins[src] else labels[src])
        # A split creates independently identifiable food branches. The
        # parent's ingredient name is not their branch identity thereafter.
        split_edges = [e for e in edges if canon_action(e.get("action", "")) == "split"]
        if split_edges and is_main_like(node_map[nid]):
            inherited = frozenset({nid}).union(*(origins[int(e["node1"])]
                for e in edges if e not in split_edges))
            root_names[nid] = norm_str(node_map[nid].get("name", ""))
            labels[nid] = root_names[nid]
        origins[nid] = inherited
        contributing = [origins[p] for p in parents[nid] if origins[p]]
        joins[nid] = (len(contributing) > 1
                      and all(group != inherited for group in contributing))

        for dst in outgoing.get(nid, []):
            remaining[dst] -= 1
            if remaining[dst] == 0:
                queue.append(dst)

    # Cycles and their downstream nodes remain visible but are ineligible
    # for matching. Never guess a label or equate two unresolved nodes.
    # A join node still describes the state before its incoming additions.
    # Its successors see the union. Keep matching provenance consistent with
    # the delayed-add features and label update boundary.
    # Give container roots a food-flow identity. Bare names such as wok_pot
    # otherwise alias every independent pan in a recipe. Stop at the first
    # main product, so later assembly cannot relabel all pans as the final dish.
    # These tokens remain in provenance after joining a food branch: shared
    # pan preparation still distinguishes pre-join from post-join stages.
    # Every root owns a set of identity keys; two branches correspond when their
    # key sets intersect. A container's keys come from what its own process chain
    # contains: each main ingredient along the chain is a key, so two branches
    # need at least one shared main ingredient. Only when the chain has no main
    # ingredient at all do its aux additions become the keys (shared aux).
    root_keys = {root: frozenset({name}) for root, name in root_names.items()}
    for root in root_names:
        if norm_str(node_map[root].get("type")) != "container":
            continue
        mains, auxes = vessel_chain_ingredients(recipe, node_map, root)
        if mains:
            role_keys = {("main", name) for name in mains}
        elif auxes:
            # No main ingredient along the branch: its aux ingredients identify it,
            # and two such branches correspond when they share at least one.
            role_keys = {("aux", name) for name in auxes}
        else:
            # With no observable food or ingredient, a pot has no reliable
            # counterpart. Keep the token recipe-local rather than matching on its
            # vessel name.
            role_keys = {("unresolved", id(recipe), root)}
        # A sugar preparation is identifiable before its first food addition.
        # Its recipe may explicitly emit caramel or keep it implicit in the wok.
        # Only inspect the independent container root: seasoning added to meat
        # later must never turn the meat branch into a sugar-preparation branch.
        initial_additions = {
            norm_str(node_map[int(e["node1"])].get("name", ""))
            for e in incoming.get(root, [])
            if canon_action(e.get("action", "")) == "add"
            and norm_str(node_map[int(e["node1"])].get("type")) == "aux"
        }
        if "sugar" in initial_additions and initial_additions <= {"sugar", "oil", "water"}:
            role_keys = {("preparation", "sugar")}
        else:
            # A container that directly processes an aux product is preparing
            # that product, even if the aux chain is later added to a main food
            # branch. Do not let the eventual main destination relabel this as
            # a food-processing container (e.g. ginger/spice preparation as a
            # pork wok).
            direct_aux_processes = {
                (
                    canon_action(e.get("action", "")),
                    norm_str(e.get("type", "")),
                    state_key(node_map[int(e["node2"])]),
                )
                for e in recipe["edges"]
                if int(e["node1"]) == root
                and canon_action(e.get("action", "")) != "add"
                and norm_str(node_map[int(e["node2"])].get("type")) == "aux"
            }
            if direct_aux_processes:
                role_keys = {("preparation", tuple(sorted(direct_aux_processes)))}
        root_keys[root] = frozenset(("container", root_names[root], key) for key in role_keys)

    contexts = {}
    for nid in node_map:
        if nid not in labels:
            labels[nid] = None
            contexts[nid] = frozenset()
            continue
        context = origins[nid]
        if joins[nid] and not any(canon_action(e.get("action", "")) == "split" for e in incoming[nid]):
            primary = min(incoming[nid], key=lambda e: (
                not bool(origins[int(e["node1"])]),
                canon_action(e.get("action", "")) == "add"
                or norm_str(e.get("type", "")) == "add",
                int(e["index"]),
            ))
            context = origins[int(primary["node1"])]
        contexts[nid] = frozenset(key for root in context for key in root_keys[root])
    return labels, contexts, frozenset(key for keys in root_keys.values() for key in keys)


def build_branch_labels(recipe: Dict[str, Any]) -> Dict[int, Optional[str]]:
    return build_branch_metadata(recipe)[0]


def unambiguous_product_branches(recipe, labels, origins):
    """Product names can bridge unrelated roots only within a unique lineage.

    Repeated stages are allowed on one causal chain with unchanged provenance.
    Parallel products or a name reused before/after a join are ambiguous.
    """
    outgoing, _ = build_graph_maps(recipe)
    named = defaultdict(list)
    for node in recipe["nodes"]:
        nid = int(node["index"])
        name = norm_str(node.get("name", ""))
        if name and norm_str(node.get("type")) == "main" and labels.get(nid) is not None:
            named[name].append(nid)
    descendants = {}
    def reachable(nid):
        if nid not in descendants:
            seen, pending = set(), list(outgoing.get(nid, []))
            while pending:
                cur = pending.pop()
                if cur in seen:
                    continue
                seen.add(cur)
                pending.extend(outgoing.get(cur, []))
            descendants[nid] = seen
        return descendants[nid]
    eligible = {}
    for name, ids in named.items():
        if len({origins[nid] for nid in ids}) != 1:
            continue
        if any(b not in reachable(a) and a not in reachable(b)
               for i, a in enumerate(ids) for b in ids[i + 1:]):
            continue
        eligible.update((nid, name) for nid in ids)
    return eligible


def build_main_seq_items(recipe: Dict[str, Any], recipe_id: str) -> List[SeqItem]:
    node_map = build_node_map(recipe)
    in_map = build_in_edge_map(recipe)
    branch_labels, branch_origins, recipe_branches = build_branch_metadata(recipe)
    products = unambiguous_product_branches(recipe, branch_labels, branch_origins)
    branch_of, _ = build_branch_partition(recipe)

    main_nodes = sorted(
        [n for n in recipe["nodes"] if is_main_like(n)],
        key=lambda n: int(n["index"])
    )

    items: List[SeqItem] = []
    vessel_ingredients = {
        int(n["index"]): (vessel_chain_ingredients(recipe, node_map, int(n["index"]))
                         if is_container(n) else (frozenset(), frozenset()))
        for n in main_nodes
    }

    for pos, v in enumerate(main_nodes):
        v_idx = int(v["index"])

        src_idx, eff_edge, bridge_type = find_prev_main_transition(v_idx, node_map, in_map)
        if eff_edge is None:
            continue

        items.append(
            SeqItem(
                recipe=recipe_id,
                edge=eff_edge,
                out_node=v_idx,
                orig_pos=pos,
                key1=tr1(eff_edge, node_map),
                key2=tr2(eff_edge, node_map),
                state_out=state_key(v),
                target_add_inputs=tuple(sorted(prev_sig_add_only(v))),
                branch_label=branch_labels[v_idx],
                branch_origins=branch_origins[v_idx],
                recipe_branches=recipe_branches,
                product_branch=products.get(v_idx),
                vessel_mains=vessel_ingredients[v_idx][0],
                vessel_aux=vessel_ingredients[v_idx][1],
                branch_id=branch_of.get(v_idx),
            )
        )

    items.sort(key=lambda x: x.orig_pos)

    print("\n====== BUILD_MAIN_SEQ_ITEMS DEBUG ======")
    print("Recipe:", recipe_id)
    for it in items:
        print(
            "edge", it.edge["index"],
            "node", it.edge["node1"], "->", it.edge["node2"],
            "type:", node_map[int(it.edge["node1"])]["type"], "->",
            node_map[int(it.edge["node2"])]["type"],
            "action:", it.edge["action"]
        )
    print("Total main seq items:", len(items))
    print("========================================\n")

    return items

def build_seq_items(recipe: Dict[str, Any], recipe_id: str) -> List[SeqItem]:
    node_map = build_node_map(recipe)
    edges = sort_edges(recipe)
    branch_labels, branch_origins, recipe_branches = build_branch_metadata(recipe)

    # 先按 out_node 分组
    by_out = {}
    for pos, e in enumerate(edges):
        out_node = int(e["node2"])
        by_out.setdefault(out_node, []).append((pos, e))

    items: List[SeqItem] = []

    def is_add_edge(e: Dict[str, Any]) -> bool:
        return canon_action(e.get("action", "")) == "add" or norm_str(e.get("type", "")) == "add"

    for out_node, candidates in by_out.items():
        node = node_map.get(out_node)
        if node is None:
            continue

        # 如果同一个 out_node 有多条入边，优先保留非-add 边
        candidates_sorted = sorted(
            candidates,
            key=lambda pe: (
                1 if is_add_edge(pe[1]) else 0,   # 非 add 优先
                int(pe[1]["index"])               # 再按原始 edge index
            )
        )

        pos, e = candidates_sorted[0]
        u = int(e["node1"])
        v = int(e["node2"])

# 如果 edge 的 source / target 不在 node_map
# 说明不是 main transition
        if u not in node_map or v not in node_map:
            continue
        items.append(
            SeqItem(
                recipe=recipe_id,
                edge=e,
                out_node=out_node,
                orig_pos=pos,
                key1=tr1(e, node_map),
                key2=tr2(e, node_map),
                state_out=state_key(node_map[out_node]),
                target_add_inputs=tuple(sorted(prev_sig_add_only(node_map[out_node]))),
                branch_label=branch_labels[out_node],
                branch_origins=branch_origins[out_node],
                recipe_branches=recipe_branches,
            )
        )

    # 最后仍按原 edge 顺序排
    items.sort(key=lambda x: x.orig_pos)
    print("\n====== BUILD_SEQ_ITEMS DEBUG ======")
    print("Recipe:", recipe_id)

    for it in items:
        print(
        "edge", it.edge["index"],
        "node", it.edge["node1"], "->", it.edge["node2"],
        "type:", node_map[int(it.edge["node1"])]["type"], "->",
        node_map[int(it.edge["node2"])]["type"],
        "action:", it.edge["action"]
    )

    print("Total seq items:", len(items))
    print("===================================\n")
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


def anchor_keys(keys):
    """Branch keys that anchor a whole recipe. Shared aux-only vessel keys do not:
    a seasoning such as oil appears in most pans and must not block the unique
    product bridge between otherwise unrelated branches."""
    return frozenset(
        key for key in keys
        if not (isinstance(key, tuple) and len(key) == 3
                and isinstance(key[2], tuple) and key[2][:1] == ("aux",))
    )


def build_branch_partition(recipe):
    """Split a recipe into branches and describe each by its main nodes.

    A branch is one continuous thread of the food flow. A new branch starts at a
    root (a main/container node with no inherited provenance), at a split output,
    and right after a join (a real merge of different threads); the join node
    itself still belongs to the thread that enters it. Containers and aux nodes
    never name a branch.

    Returns (branch_of, info). branch_of maps every main-like node to its branch
    id (None for aux nodes and for nodes that cannot be resolved). info maps a
    branch id to {"mains": names of every main node in the branch, "aux": names
    of the aux ingredients that feed the branch, directly or through other aux}.
    """
    node_map = build_node_map(recipe)
    incoming = build_in_edge_map(recipe)
    outgoing, parents = build_graph_maps(recipe)
    remaining = {nid: len(parents[nid]) for nid in node_map}
    queue = deque(sorted(nid for nid, count in remaining.items() if count == 0))
    origins, joins, branch_of = {}, {}, {}
    cuts_thread = {}   # a join that merges in a processed branch ends the thread

    def lone_ingredient(pid):
        """A raw ingredient: it has no incoming edge, so adding it is a step inside
        the receiving thread, not the merge of two branches."""
        return not incoming.get(pid)

    while queue:
        nid = queue.popleft()
        edges = incoming.get(nid, [])
        inherited = frozenset().union(*(origins[p] for p in parents[nid]))
        bid = None
        only_adds = bool(edges) and all(
            canon_action(e.get("action", "")) == "add" or norm_str(e.get("type", "")) == "add"
            for e in edges)
        if is_main_like(node_map[nid]) and not inherited:
            inherited = frozenset({nid})
            bid = nid
        elif norm_str(node_map[nid].get("type")) == "container" and only_adds:
            # A vessel that is only loaded by ADD edges starts its own vessel thread,
            # whichever raw main it happens to receive first.
            bid = nid
        elif edges:
            # Aux nodes processed in a vessel (oil heated in a wok) pass the thread on.
            primary = min(edges, key=lambda e: (
                not bool(origins[int(e["node1"])]),
                canon_action(e.get("action", "")) == "add"
                or norm_str(e.get("type", "")) == "add",
                int(e["index"]),
            ))
            src = int(primary["node1"])
            bid = nid if (joins[src] and cuts_thread.get(src, True)) else branch_of.get(src)
        split_edges = [e for e in edges if canon_action(e.get("action", "")) == "split"]
        if split_edges and is_main_like(node_map[nid]):
            inherited = frozenset({nid}).union(*(origins[int(e["node1"])]
                for e in edges if e not in split_edges))
            bid = nid
        origins[nid] = inherited
        contributing = [origins[p] for p in parents[nid] if origins[p]]
        joins[nid] = (len(contributing) > 1
                      and all(group != inherited for group in contributing))
        # Which parents are processed branches (not raw ingredients, not the spine)?
        spine = None
        if edges:
            spine = int(min(edges, key=lambda e: (
                not bool(origins[int(e["node1"])]),
                canon_action(e.get("action", "")) == "add"
                or norm_str(e.get("type", "")) == "add",
                int(e["index"])))["node1"])
        cuts_thread[nid] = any(
            p != spine and origins[p] and not lone_ingredient(p)
            and norm_str(node_map[p].get("type")) != "aux"
            for p in parents[nid])
        branch_of[nid] = bid
        for dst in outgoing.get(nid, []):
            remaining[dst] -= 1
            if remaining[dst] == 0:
                queue.append(dst)

    for nid in node_map:
        branch_of.setdefault(nid, None)

    # A vessel that only carries food (no main node of its own) belongs to the
    # branch its process chain delivers into: an empty oven that is heated, loaded
    # and then bakes the dish is part of the dish's branch. A vessel chain that
    # ends by being added into something else keeps its own (aux-only) branch.
    process_out = defaultdict(list)
    for e in recipe["edges"]:
        if canon_action(e.get("action", "")) != "add" and norm_str(e.get("type", "")) != "add":
            process_out[int(e["node1"])].append(int(e["node2"]))
    changed = True
    while changed:
        changed = False
        members = defaultdict(set)
        for nid, bid in branch_of.items():
            if bid is not None:
                members[bid].add(nid)
        for bid, group in members.items():
            if any(norm_str(node_map[n].get("type")) == "main" for n in group):
                continue
            successors = {
                branch_of[t] for n in group for t in process_out.get(n, [])
                if branch_of.get(t) is not None and branch_of[t] != bid
            }
            if len(successors) == 1:
                target = next(iter(successors))
                for n in group:
                    branch_of[n] = target
                changed = True
                break

    info = {}
    for nid, bid in branch_of.items():
        if bid is None:
            continue
        entry = info.setdefault(bid, {"mains": set(), "aux": set(), "members": set(), "sigs": []})
        entry["members"].add(nid)
        if norm_str(node_map[nid].get("type")) == "aux":
            entry["aux"].add(norm_str(node_map[nid].get("name", "")))
        if norm_str(node_map[nid].get("type")) == "main":
            entry["mains"].add(norm_str(node_map[nid].get("name", "")))
            process_in = [canon_action(e.get("action", "")) for e in incoming.get(nid, [])
                          if canon_action(e.get("action", "")) != "add"
                          and norm_str(e.get("type", "")) != "add"]
            entry["sigs"].append((state_key(node_map[nid]), norm_str(node_map[nid].get("name", "")),
                                  process_in[0] if process_in else None))

    def aux_names_feeding(start_nodes):
        """Names of every aux node that feeds the given nodes, directly or through
        other aux nodes (aux chains such as spices added into water)."""
        names, seen, stack = set(), set(), list(start_nodes)
        while stack:
            nid = stack.pop()
            for e in incoming.get(nid, []):
                src = int(e["node1"])
                if src in seen or norm_str(node_map[src].get("type")) != "aux":
                    continue
                seen.add(src)
                names.add(norm_str(node_map[src].get("name", "")))
                stack.append(src)
        return names

    for bid, entry in info.items():
        entry["aux"].update(aux_names_feeding(entry["members"]))
        entry["mains"] = frozenset(entry["mains"])
        entry["aux"] = frozenset(entry["aux"])
        entry["members"] = frozenset(entry["members"])
    return branch_of, info


def branch_similarity(e1, e2):
    """How well the main nodes of two branches line up, by a one-to-one greedy
    matching of their nodes: same state and incoming action 4, same state 3, same
    name and action 2, same name 1. Used only to choose among candidate pairs that
    the tiers rate equally (several branches often share the name pork)."""
    scored = []
    for i, (state1, name1, action1) in enumerate(e1["sigs"]):
        for j, (state2, name2, action2) in enumerate(e2["sigs"]):
            if state1 == state2:
                points = 4 if action1 == action2 else 3
            elif name1 == name2:
                points = 2 if action1 == action2 else 1
            else:
                continue
            scored.append((-points, i, j))
    used1, used2, total = set(), set(), 0
    for negative, i, j in sorted(scored):
        if i in used1 or j in used2:
            continue
        used1.add(i)
        used2.add(j)
        total -= negative
    return total


def pair_branches(info1, info2, tiers=(1, 2, 3), unique_only=False):
    """One-to-one pairing of the branches of two recipes.

    Tiers, strongest first: identical sets of main names; at least one shared
    main; no shared main but at least one shared aux. Within a tier the pair with
    the most shared names (then the best node-by-node similarity, then the larger
    overlap ratio) is taken first, and a
    branch that has been paired is never paired again. Returns a set of
    (branch id in recipe 1, branch id in recipe 2).
    """
    def branches_per_main(info):
        counts = Counter()
        for entry in info.values():
            counts.update(entry["mains"])
        return counts

    per_main1, per_main2 = branches_per_main(info1), branches_per_main(info2)

    def candidates(tier):
        for b1, e1 in info1.items():
            for b2, e2 in info2.items():
                shared_mains = e1["mains"] & e2["mains"]
                if unique_only:
                    # Only a main that belongs to exactly one branch in each recipe
                    # can pair branches (meat_sauce, beef); a name that occurs in
                    # many branches (pork) cannot tell which two correspond.
                    shared_mains = {m for m in shared_mains
                                    if per_main1[m] == 1 and per_main2[m] == 1}
                    if not shared_mains:
                        continue
                shared_aux = e1["aux"] & e2["aux"]
                if tier == 1:
                    if not e1["mains"] or e1["mains"] != e2["mains"] or not shared_mains:
                        continue
                    shared = shared_mains
                elif tier == 2:
                    if not shared_mains:
                        continue
                    shared = shared_mains
                else:
                    if shared_mains or not shared_aux:
                        continue
                    shared = shared_aux
                union = len(e1["mains"] | e2["mains"] | e1["aux"] | e2["aux"]) or 1
                # Among equally named candidates, prefer the branches whose main
                # nodes actually line up (several pork branches are common).
                yield (-len(shared), -branch_similarity(e1, e2), -len(shared) / union, b1, b2)

    used1, used2, pairs = set(), set(), set()
    for tier in tiers:
        for _, _, _, b1, b2 in sorted(candidates(tier)):
            if b1 in used1 or b2 in used2:
                continue
            used1.add(b1)
            used2.add(b2)
            pairs.add((b1, b2))
    return pairs


def branch_pairing(recipe1, recipe2, tiers=(1, 2, 3), unique_only=False):
    branch_of1, info1 = build_branch_partition(recipe1)
    branch_of2, info2 = build_branch_partition(recipe2)
    return pair_branches(info1, info2, tiers, unique_only), branch_of1, branch_of2


def branch_contexts_compatible(label1, origins1, branches1, label2, origins2, branches2):
    """Shared food/qualified-container identities constrain join stages."""
    if label1 is None or label2 is None:
        return False
    common = branches1 & branches2
    if common:
        left, right = origins1 & common, origins2 & common
        return bool(left) and left == right
    if branches1 or branches2:
        return False
    return label1 == label2


def _apply_rule(a, b, rule_name):
    if rule_name == "exact":
        return a.key1 == b.key1
    if rule_name == "similar2":
        return a.key2 == b.key2
    if rule_name == "similar3":
        return a.state_out == b.state_out
    if rule_name == "similar2_loose":
        a_action, a_type, _ = a.key2
        b_action, b_type, _ = b.key2
        return (a_action == b_action and a_type == b_type
                and state_match_loose(a.state_out, b.state_out))
    if rule_name == "similar3_loose":
        return state_match_loose(a.state_out, b.state_out)
    raise ValueError(f"Unknown rule: {rule_name}")


def match_by_rule(a, b, rule_name, predecessors_correspond=False, branch_pairs=None, branch_allow=None):
    # Two nodes may only merge when their branches have been paired (see
    # pair_branches). There is no other way around that requirement.
    if branch_pairs is not None:
        if (a.branch_id, b.branch_id) not in branch_pairs:
            return False
        return _apply_rule(a, b, rule_name)

    loaded_containers_correspond = (
        len(a.state_out) > 1 and len(b.state_out) > 1
        and norm_str(a.state_out[1]) == "container"
        and norm_str(b.state_out[1]) == "container"
        and a.state_out == b.state_out
        and bool(a.target_add_inputs)
        and a.target_add_inputs == b.target_add_inputs
    )
    # Two vessels in the same state correspond when their own process chains share
    # a main ingredient (or, if neither chain has any main ingredient, an aux
    # ingredient), however the food reached them: an empty pan that is heated and
    # then loaded is the same step as a pan that is loaded directly.
    vessels_correspond = (
        len(a.state_out) > 1 and len(b.state_out) > 1
        and norm_str(a.state_out[1]) == "container"
        and a.state_out == b.state_out
        and (bool(a.vessel_mains & b.vessel_mains)
             or (not a.vessel_mains and not b.vessel_mains
                 and bool(a.vessel_aux & b.vessel_aux)))
    )
    contexts_compatible = branch_contexts_compatible(
            a.branch_label, a.branch_origins, a.recipe_branches,
            b.branch_label, b.branch_origins, b.recipe_branches)
    # Two branches that share a main ingredient (and were paired one-to-one on
    # that basis) may correspond even when their root provenance differs (lamb
    # sauce and beef sauce, both ending in meat_sauce). Similar tiers only.
    branches_share_main = (branch_allow is not None and a.branch_id is not None
                           and (a.branch_id, b.branch_id) in branch_allow)
    if not contexts_compatible:
        # A unique product can identify the corresponding stage across certain
        # root differences. An already matched predecessor is stronger local
        # evidence that the two downstream states continue corresponding flows.
        # Either exception can produce only a similar match when the broader
        # branch contexts differ.
        common = anchor_keys(a.recipe_branches & b.recipe_branches)
        same_unique_product = (
            a.branch_label is not None and b.branch_label is not None
            and a.product_branch is not None
            and a.product_branch == b.product_branch
        )
        product_without_shared_anchor = (
            same_unique_product
            and not (a.branch_origins & common)
            and not (b.branch_origins & common)
        )
        product_with_variant_ingredients = (
            same_unique_product
            and a.branch_label == b.branch_label
            and bool(a.branch_origins & common)
            and bool(b.branch_origins & common)
        )
        if (not product_without_shared_anchor
                and not product_with_variant_ingredients
                and not predecessors_correspond
                and not loaded_containers_correspond
                and not vessels_correspond
                and not branches_share_main):
            return False
        # When corresponding product stages contain different shared ingredient
        # roots, they represent procedural variants. They may be similar, but
        # the provenance difference must keep them out of the exact tier.
        if ((product_with_variant_ingredients
                or predecessors_correspond
                or loaded_containers_correspond
                or vessels_correspond
                or branches_share_main)
                and rule_name == "exact"):
            return False

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

def build_graph_maps(recipe):
    out_map = defaultdict(list)
    in_map = defaultdict(list)

    for e in recipe["edges"]:
        u = int(e["node1"])
        v = int(e["node2"])
        out_map[u].append(v)
        in_map[v].append(u)

    for k in out_map:
        out_map[k] = sorted(set(out_map[k]))
    for k in in_map:
        in_map[k] = sorted(set(in_map[k]))

    return out_map, in_map

def can_non_main_exact_match(idx1, idx2, node_map1, node_map2):
    """
    non-main 的 merge 规则：
    - type 必须相同
    - container 对 container：允许 exact
    - aux 对 aux：state 相同才 exact
    """
    n1 = node_map1.get(int(idx1))
    n2 = node_map2.get(int(idx2))
    if not n1 or not n2:
        return False

    t1 = norm_str(n1.get("type"))
    t2 = norm_str(n2.get("type"))
    if t1 != t2:
        return False

    if is_main_like(n1) or is_main_like(n2):
        return False

    if t1 == "container":
        name1 = norm_str(n1.get("name", ""))
        name2 = norm_str(n2.get("name", ""))
        return name1 == name2

    return state_key(n1) == state_key(n2)

def can_aux_similar_match(idx1, idx2, node_map1, node_map2):
    """Aux nodes that are not exact matches may still correspond like main nodes do:
    same name and the same physical or chemical state (the loose tier), e.g. raw
    and cooked water that feed the same merged sauce. Containers never do."""
    n1 = node_map1.get(int(idx1))
    n2 = node_map2.get(int(idx2))
    if not n1 or not n2:
        return False
    if norm_str(n1.get("type")) != "aux" or norm_str(n2.get("type")) != "aux":
        return False
    if state_key(n1) == state_key(n2):
        return False
    return state_match_loose(state_key(n1), state_key(n2))


def compare_non_main_nodes(recipe1, recipe2, recipe1_id, recipe2_id, main_merged_nodes):
    node_map1 = build_node_map(recipe1)
    node_map2 = build_node_map(recipe2)
    out_map1, in_map1 = build_graph_maps(recipe1)
    out_map2, in_map2 = build_graph_maps(recipe2)

    matched = []
    seen = set()
    q = deque()

    def add_pair(n1, n2, kind="exact"):
        dom = norm_str(node_map1[int(n1)].get("type"))
        key = (dom, int(n1), int(n2))
        if key in seen:
            return False
        seen.add(key)
        matched.append((dom, int(n1), int(n2), kind))
        q.append((int(n1), int(n2)))
        return True

    def pair_ups(ups1, ups2):
        """Exact matches first for every upstream node, then similar aux matches
        among what is left, so a similar pair never takes a node that another
        upstream node matches exactly. One-to-one."""
        used1, used2 = set(), set()
        for u1 in ups1:
            for u2 in ups2:
                if u2 in used2:
                    continue
                if can_non_main_exact_match(u1, u2, node_map1, node_map2):
                    add_pair(u1, u2)
                    used1.add(u1)
                    used2.add(u2)
                    break
        for u1 in ups1:
            if u1 in used1:
                continue
            for u2 in ups2:
                if u2 in used2:
                    continue
                if can_aux_similar_match(u1, u2, node_map1, node_map2):
                    add_pair(u1, u2, "similar")
                    used1.add(u1)
                    used2.add(u2)
                    break

    # 只从已 merge 的 main/container node 往最近上游找
    for m in main_merged_nodes:
        if m.kind not in ("merged_exact", "merged_similar"):
            continue
        if m.r1_node is None or m.r2_node is None:
            continue

        ups1 = [
            u for u in in_map1.get(int(m.r1_node), [])
            if not is_main_like(node_map1[u])
        ]
        ups2 = [
            u for u in in_map2.get(int(m.r2_node), [])
            if not is_main_like(node_map2[u])
        ]

        pair_ups(ups1, ups2)

    # 从刚 merge 的 non-main pair 继续逐层向上
    while q:
        cur1, cur2 = q.popleft()

        ups1 = [
            u for u in in_map1.get(cur1, [])
            if not is_main_like(node_map1[u])
        ]
        ups2 = [
            u for u in in_map2.get(cur2, [])
            if not is_main_like(node_map2[u])
        ]

        pair_ups(ups1, ups2)
        # 这一层没配上，这条链就停；这里什么都不用做

    # ========= 把 matched 转成 records =========
    records = []
    used_r1 = set()
    used_r2 = set()

    matched_sorted = sorted(matched, key=lambda x: (x[1], x[2]))

    for dom, n1, n2, kind in matched_sorted:
        used_r1.add(int(n1))
        used_r2.add(int(n2))

        records.append(
            MatchRecord(
                kind=kind,
                r1_edge=None,
                r2_edge=None,
                r1_out_node=int(n1),
                r2_out_node=int(n2),
                orig_pos_r1=int(n1),
                orig_pos_r2=int(n2),
            )
        )

    # ========= 补 only_r1 / only_r2 =========
    non_main_nodes1 = sorted(
        [n for n in recipe1["nodes"] if not is_main_like(n)],
        key=lambda n: int(n["index"])
    )
    non_main_nodes2 = sorted(
        [n for n in recipe2["nodes"] if not is_main_like(n)],
        key=lambda n: int(n["index"])
    )

    for n in non_main_nodes1:
        idx = int(n["index"])
        if idx not in used_r1:
            records.append(
                MatchRecord(
                    kind="only_r1",
                    r1_edge=None,
                    r2_edge=None,
                    r1_out_node=idx,
                    r2_out_node=None,
                    orig_pos_r1=idx,
                    orig_pos_r2=None,
                )
            )

    for n in non_main_nodes2:
        idx = int(n["index"])
        if idx not in used_r2:
            records.append(
                MatchRecord(
                    kind="only_r2",
                    r1_edge=None,
                    r2_edge=None,
                    r1_out_node=None,
                    r2_out_node=idx,
                    orig_pos_r1=None,
                    orig_pos_r2=idx,
                )
            )

    print("\n====== NON-MAIN MATCH DEBUG ======")
    print("matched pairs:", matched_sorted)
    print("records:")
    for r in records:
        print(
            r.kind,
            "r1_out_node=", r.r1_out_node,
            "r2_out_node=", r.r2_out_node
        )
    print("Total non-main records:", len(records))
    print("==================================\n")

    return records
           
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
    seq1 = build_main_seq_items(recipe1, "R1")
    seq2 = build_main_seq_items(recipe2, "R2")

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

def _acyclic_alignment(recipe1, recipe2, pairs, valid1, valid2):
    """Reject alignments creating causal cycles; numeric index is not time."""
    aliases = {}
    for i, (a, b) in enumerate(pairs):
        aliases[(0, a.out_node)] = ("pair", i)
        aliases[(1, b.out_node)] = ("pair", i)
    adjacency = defaultdict(set)
    indegree = {}
    for side, recipe, valid in ((0, recipe1, valid1), (1, recipe2, valid2)):
        for nid in valid:
            indegree.setdefault(aliases.get((side, nid), (side, nid)), 0)
        for edge in recipe["edges"]:
            u, v = int(edge["node1"]), int(edge["node2"])
            if u not in valid or v not in valid:
                continue
            u = aliases.get((side, u), (side, u))
            v = aliases.get((side, v), (side, v))
            if u == v:
                return False
            if v not in adjacency[u]:
                adjacency[u].add(v)
                indegree[v] += 1
    queue = deque(n for n, count in indegree.items() if count == 0)
    visited = 0
    while queue:
        cur = queue.popleft()
        visited += 1
        for nxt in adjacency[cur]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                queue.append(nxt)
    return visited == len(indegree)


def hierarchical_main_match_two_stage(recipe1, recipe2):
    seq1 = build_main_seq_items(recipe1, recipe1.get("recipe_id", "recipe1"))
    seq2 = build_main_seq_items(recipe2, recipe2.get("recipe_id", "recipe2"))
    valid1 = {n for n, label in build_branch_labels(recipe1).items() if label is not None}
    valid2 = {n for n, label in build_branch_labels(recipe2).items() if label is not None}
    branch_pairs = branch_pairing(recipe1, recipe2)[0] if USE_BRANCH_PAIRING else None
    branch_allow = branch_pairing(recipe1, recipe2, tiers=(1, 2), unique_only=True)[0]
    _, branch_info1 = build_branch_partition(recipe1)
    _, branch_info2 = build_branch_partition(recipe2)
    partners1, partners2 = defaultdict(set), defaultdict(set)

    # Start nodes (main/container nodes with no incoming main-like edge) are merged
    # outside this loop, in graph_builder. Count those merges as the first merge
    # of their branches, so a later node of the same two branches is not mistaken
    # for a second, unrelated merge (R3 sugar wok 17 with R5 sugar wok 32, then
    # their next wok nodes).
    node_map1, node_map2 = build_node_map(recipe1), build_node_map(recipe2)
    labels1, origins1, branches1 = build_branch_metadata(recipe1)
    labels2, origins2, branches2 = build_branch_metadata(recipe2)
    branch_of1, _ = build_branch_partition(recipe1)
    branch_of2, _ = build_branch_partition(recipe2)

    def start_nodes(recipe, node_map, items):
        recorded = {item.out_node for item in items}
        main_like = {int(n["index"]) for n in recipe["nodes"] if is_main_like(n)}
        has_input = {int(e["node2"]) for e in recipe["edges"]
                     if int(e["node1"]) in main_like and int(e["node2"]) in main_like}
        return sorted(n for n in main_like if n not in has_input and n not in recorded)

    taken_starts = set()
    for s1 in start_nodes(recipe1, node_map1, seq1):
        for s2 in start_nodes(recipe2, node_map2, seq2):
            if s2 in taken_starts:
                continue
            if (state_key(node_map1[s1]) == state_key(node_map2[s2])
                    and branch_contexts_compatible(
                        labels1.get(s1), origins1[s1], branches1,
                        labels2.get(s2), origins2[s2], branches2)):
                taken_starts.add(s2)
                if branch_of1.get(s1) is not None and branch_of2.get(s2) is not None:
                    partners1[branch_of1[s1]].add(branch_of2[s2])
                    partners2[branch_of2[s2]].add(branch_of1[s1])
                break

    def branch_conflict(a, b):
        """A branch that has already merged with one branch of the other recipe may
        not merge with another branch that shares none of its main ingredients (the
        eggplant branch with the eggplant branch, then also with the final branch).
        Merging with several branches that each share a main is allowed: that is
        one thread segmented differently in the two recipes."""
        branch_a, branch_b = a.branch_id, b.branch_id
        if branch_a is None or branch_b is None or branch_b in partners1[branch_a]:
            return False
        mains_a = branch_info1[branch_a]["mains"]
        mains_b = branch_info2[branch_b]["mains"]
        if mains_a & mains_b:
            return False
        return bool((partners1[branch_a] and mains_a) or (partners2[branch_b] and mains_b))

    used1, used2, pairs, records = set(), set(), [], []
    # Keep the original exact/similar priority, but constrain by graph
    # dependencies rather than one global node-index sequence.
    for rule in ("exact", "similar2", "similar3", "similar2_loose", "similar3_loose"):
        for a in seq1:
            if a.out_node in used1:
                continue
            for b in seq2:
                predecessors_correspond = any(
                    left.out_node == int(a.edge["node1"])
                    and right.out_node == int(b.edge["node1"])
                    for left, right in pairs
                )
                if (b.out_node in used2
                        or not match_by_rule(
                            a, b, rule,
                            predecessors_correspond=predecessors_correspond,
                            branch_pairs=branch_pairs,
                            branch_allow=branch_allow,
                        )):
                    continue
                if not _acyclic_alignment(recipe1, recipe2, pairs + [(a, b)], valid1, valid2):
                    continue
                if branch_conflict(a, b):
                    continue
                if a.branch_id is not None and b.branch_id is not None:
                    partners1[a.branch_id].add(b.branch_id)
                    partners2[b.branch_id].add(a.branch_id)
                used1.add(a.out_node)
                used2.add(b.out_node)
                pairs.append((a, b))
                records.append(MatchRecord(rule, int(a.edge["index"]), int(b.edge["index"]),
                                           a.out_node, b.out_node, a.orig_pos, b.orig_pos))
                break
    for a in seq1:
        if a.out_node not in used1:
            records.append(MatchRecord("only_r1", int(a.edge["index"]), None,
                                       a.out_node, None, a.orig_pos, None))
    for b in seq2:
        if b.out_node not in used2:
            records.append(MatchRecord("only_r2", None, int(b.edge["index"]),
                                       None, b.out_node, None, b.orig_pos))
    return records


def record_sort_key(m: MatchRecord):
    p1 = m.orig_pos_r1 if m.orig_pos_r1 is not None else 10**9
    p2 = m.orig_pos_r2 if m.orig_pos_r2 is not None else 10**9
    return (min(p1, p2), p1, p2)


def sort_match_records_for_visualization(records: List[MatchRecord]) -> List[MatchRecord]:
    return sorted(records, key=record_sort_key)


def compare_recipes(recipe1, recipe2):
    records = hierarchical_main_match_two_stage(recipe1, recipe2)
    return sort_match_records_for_visualization(records)

