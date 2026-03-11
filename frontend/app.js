const API_BASE = "http://127.0.0.1:8000";

const svg = d3.select("#viz");
const width = window.innerWidth;
const height = window.innerHeight - 60;
svg.attr("width", width).attr("height", height);

const root = svg.append("g");
svg.call(
  d3.zoom()
    .scaleExtent([0.3, 3])
    .on("zoom", (event) => {
      root.attr("transform", event.transform);
    })
);

const tooltip = d3.select("#tooltip");

function nodeHalfTooltip(state, flavor, idx) {

  if (!state) return "";

  const [name, type, physical, chemical] = state;

  return `
    <b>${name}</b><br/><br/>
    ${physical}<br/>
    ${chemical}<br/>
    ${flavor ?? "-"}
  `;
}

function edgeTooltipHTML(d) {

  return `
    action: ${d.action}<br/>
    type: ${d.type}
  `;
}

const COLORS = {
  merged_exact: "#AEEDFF",
  only_r1: "#C4D1FF",
  only_r2: "#CAF95F",
  stroke: "#ffffff",
  sharedEdge: "#AEEDFF",
  r1Edge: "#C4D1FF",
  r2Edge: "#CAF95F"
};

function dumbbellBodyPath(r, offset, waistInset = 10, waistCurve = 14) {
  // r: 上下两个圆的外半径
  // offset: 上下圆心到中线的距离
  // waistInset: 中间腰部往里收的程度

  const topY = -offset;
  const botY = offset;

  const xOuter = r;
  const xInner = Math.max(6, r - waistInset);

  const yTopJoin = -r * 0.35;
  const yBotJoin = r * 0.35;

  return [
    `M 0 ${topY - r}`,

    // top outer right
    `A ${r} ${r} 0 0 1 ${xOuter} ${topY}`,
    `A ${r} ${r} 0 0 1 ${xInner} ${yTopJoin}`,

    // right waist inward curve
    `C ${xInner - waistCurve} ${yTopJoin * 0.35},
       ${xInner - waistCurve} ${yBotJoin * 0.35},
       ${xInner} ${yBotJoin}`,

    // bottom outer right
    `A ${r} ${r} 0 0 1 ${xOuter} ${botY}`,
    `A ${r} ${r} 0 0 1 0 ${botY + r}`,

    // bottom outer left
    `A ${r} ${r} 0 0 1 ${-xOuter} ${botY}`,
    `A ${r} ${r} 0 0 1 ${-xInner} ${yBotJoin}`,

    // left waist inward curve
    `C ${-xInner + waistCurve} ${yBotJoin * 0.35},
       ${-xInner + waistCurve} ${yTopJoin * 0.35},
       ${-xInner} ${yTopJoin}`,

    // top outer left
    `A ${r} ${r} 0 0 1 ${-xOuter} ${topY}`,
    `A ${r} ${r} 0 0 1 0 ${topY - r}`,

    `Z`
  ].join(" ");
}

async function loadRecipes() {
  const res = await fetch(`${API_BASE}/recipes`);
  const data = await res.json();

  const sel1 = document.getElementById("recipe1");
  const sel2 = document.getElementById("recipe2");
  sel1.innerHTML = "";
  sel2.innerHTML = "";

  data.recipes.forEach(r => {
    const o1 = document.createElement("option");
    o1.value = r.id;
    o1.textContent = r.label;
    sel1.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = r.id;
    o2.textContent = r.label;
    sel2.appendChild(o2);
  });

  if (data.recipes.length > 1) {
    sel1.selectedIndex = 0;
    sel2.selectedIndex = 1;
  }
}

function findNearestDumbbellOnSide(startId, side, nodeById, outMap, visited = new Set()) {
  const key = `${side}:${startId}`;
  if (visited.has(key)) return null;
  visited.add(key);

  const node = nodeById.get(startId);
  if (!node) return null;

  if (isDumbbellLike(node)) return node;

  const outEdges = outMap.get(startId) || [];
  const children = outEdges
    .map(e => nodeById.get(e.target))
    .filter(Boolean)
    .filter(child => hasSide(child, side));

  for (const child of children) {
    const found = findNearestDumbbellOnSide(child.id, side, nodeById, outMap, visited);
    if (found) return found;
  }

  return null;
}

function propagateOnlyChainY(startId, side, targetY, nodeById, outMap, visited = new Set()) {
  const key = `${side}:${startId}`;
  if (visited.has(key)) return;
  visited.add(key);

  const node = nodeById.get(startId);
  if (!node) return;

  if ((side === "R1" && node.kind === "only_r1") || (side === "R2" && node.kind === "only_r2")) {
    node.y = targetY;
  }

  const outEdges = outMap.get(startId) || [];
  const children = outEdges
    .map(e => nodeById.get(e.target))
    .filter(Boolean)
    .filter(child => hasSide(child, side));

  children.forEach(child => {
    if (isDumbbellLike(child)) return; // 到 dumbbell 就停
    propagateOnlyChainY(child.id, side, targetY, nodeById, outMap, visited);
  });
}

function alignOnlyNodesToDumbbell(nodes, edges) {
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const outMap = buildOutMap(edges);

  nodes.forEach(node => {
    if (node.kind !== "only_r1" && node.kind !== "only_r2") return;

    const side = node.kind === "only_r1" ? "R1" : "R2";
    const dumbbell = findNearestDumbbellOnSide(node.id, side, nodeById, outMap);

    if (!dumbbell) return;

    const half = getHalfOffsetForNode(dumbbell);
    const targetY = node.kind === "only_r1"
      ? dumbbell.y - half
      : dumbbell.y + half;

    propagateOnlyChainY(node.id, side, targetY, nodeById, outMap);
  });
}

function edgeColor(style) {
  if (style === "R1") return COLORS.r1Edge;
  if (style === "R2") return COLORS.r2Edge;
  return COLORS.sharedEdge;
}

const TYPE_COLORS = {
  heat: "#e78c75",
  cold: "#66a2e2",
  prep: "#e0e0e0",
};

function resolvedEdgeColor(d) {
  if (isAddEdge(d)) return edgeColor(d.style);
  const type = (d.type || "").toLowerCase().trim();
  return TYPE_COLORS[type] ?? "#999999";
}

function edgeStrokeWidth(style) {
  return style === "shared" ? 2.5 : 1.8;
}

function edgeBaseOffset(style) {
  if (style === "R1") return -8;
  if (style === "R2") return 8;
  return 0;
}

function isAddEdge(edge) {
  const a = String(edge.action ?? "").trim().toLowerCase();
  const t = String(edge.type ?? "").trim().toLowerCase();
  return a === "add" || t === "add";
}

function addTrianglePath(x1, y1, x2, y2, baseWidth = 10, baseInset = 4) {
  // x1,y1: source side
  // x2,y2: target side (triangle tip)

  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;

  const ux = dx / dist;
  const uy = dy / dist;

  // 垂直方向单位向量
  const px = -uy;
  const py = ux;

  // 底边中心往前一点，避免完全贴在 source 上
  const bx = x1;
  const by = y1;

  const leftX = bx + px * (baseWidth / 2);
  const leftY = by + py * (baseWidth / 2);

  const rightX = bx - px * (baseWidth / 2);
  const rightY = by - py * (baseWidth / 2);

  return `M ${leftX},${leftY} L ${rightX},${rightY} L ${x2},${y2} Z`;
}

function getAnchorPosition(node, anchor) {
  const spec = nodeVisualSpec(node);

  if (isDumbbellLike(node)) {
    if (anchor === "T") return { x: node.x, y: node.y - spec.halfOffset };
    if (anchor === "B") return { x: node.x, y: node.y + spec.halfOffset };
    if (anchor === "M") return { x: node.x, y: node.y };
    return { x: node.x, y: node.y };
  }

  return { x: node.x, y: node.y };
}

function boundaryPointFromCenter(centerX, centerY, radius, fromX, fromY) {
  const dx = centerX - fromX;
  const dy = centerY - fromY;
  const dist = Math.hypot(dx, dy) || 1;

  return {
    x: centerX - (dx / dist) * radius,
    y: centerY - (dy / dist) * radius
  };
}

function startBoundaryPointFromCenter(centerX, centerY, radius, toX, toY) {
  const dx = toX - centerX;
  const dy = toY - centerY;
  const dist = Math.hypot(dx, dy) || 1;

  return {
    x: centerX + (dx / dist) * radius,
    y: centerY + (dy / dist) * radius
  };
}

function singleNodeBoundaryPoint(node, anchor, fromX, fromY) {
  const p = getAnchorPosition(node, anchor);
  const r = nodeVisualSpec(node).outerR;
  return boundaryPointFromCenter(p.x, p.y, r, fromX, fromY);
}

function singleNodeStartBoundaryPoint(node, anchor, toX, toY) {
  const p = getAnchorPosition(node, anchor);
  const r = nodeVisualSpec(node).outerR;
  return startBoundaryPointFromCenter(p.x, p.y, r, toX, toY);
}

function dumbbellBoundaryPoint(node, anchor, fromX, fromY, isStart = false) {
  const spec = nodeVisualSpec(node);
  const p = getAnchorPosition(node, anchor);
  const r = spec.outerR;

  // 上半 / 下半：按对应半圆边界
  if (anchor === "T" || anchor === "B") {
    if (isStart) {
      return startBoundaryPointFromCenter(p.x, p.y, r, fromX, fromY);
    }
    return boundaryPointFromCenter(p.x, p.y, r, fromX, fromY);
  }

  // 中间 M：按 waist 外边界
  // waist 半宽 ~= outerR - waistInset
  const waistHalfWidth = Math.max(4, spec.outerR - spec.waistInset);

  const dx = p.x - fromX;
  const dy = p.y - fromY;

  // 取来线主要是从左来还是从右来
  // M 点落在 waist 左/右边界
  const onLeftSide = dx >= 0;

  if (isStart) {
    // source 从 M 出发时，看目标在左还是右
    const toLeft = fromX < p.x;
    return {
      x: p.x + (toLeft ? -waistHalfWidth : waistHalfWidth),
      y: p.y
    };
  }

  return {
    x: p.x + (onLeftSide ? -waistHalfWidth : waistHalfWidth),
    y: p.y
  };
}

function assignOutgoingOffsets(edges) {
  const groups = d3.group(edges, d => `${d.source}|${d.source_anchor}`);
  const offsetMap = new Map();

  groups.forEach((group) => {
    const k = group.length;
    if (k === 1) {
      offsetMap.set(group[0], 0);
    } else {
      const spread = 18;
      group.forEach((e, idx) => {
        const off = -spread + (2 * spread * idx) / (k - 1);
        offsetMap.set(e, off);
      });
    }
  });

  return offsetMap;
}

function normValue(x) {
  return String(x ?? "").trim().toLowerCase();
}

function normalizeFlavorList(flavorValue) {
  if (flavorValue == null) return [];
  if (Array.isArray(flavorValue)) {
    return flavorValue
      .map(x => String(x).trim())
      .filter(x => x && x.toLowerCase() !== "none");
  }

  const s = String(flavorValue).trim();
  if (!s || s.toLowerCase() === "none") return [];

  // 支持 "sweet, salty" 这种
  if (s.includes(",")) {
    return s.split(",")
      .map(x => x.trim())
      .filter(x => x && x.toLowerCase() !== "none");
  }

  return [s];
}

const FLAVOR_COLORS = {
  salty: "#8bc7bd",
  sweet: "#e39ac7",
  spicy: "#e4572e",
  sour: "#e3ff65",
  bitter: "#8c6d3a",
  umami: "#f38c38",
  savory: "#6f6f6f",
  aroma: "#b938c5",
  garlic: "#ad773c",
  ginger: "#6fc35a",
  scallion: "#72c85a",
  none: "#ffffff"
};

function getFlavorColor(name) {
  const k = normValue(name);
  return FLAVOR_COLORS[k] || "#bdbdbd";
}

function getPrimaryFlavor(node) {
  const f1 = normalizeFlavorList(node.flavor_r1);
  const f2 = normalizeFlavorList(node.flavor_r2);
  const all = [...f1, ...f2];
  if (all.length === 0) return "none";
  return all[0];
}

function getPhysicalState(node) {
  const s1 = node.state_r1 ? node.state_r1[2] : null; // state = [name,type,physical,chemical]
  const s2 = node.state_r2 ? node.state_r2[2] : null;
  return normValue(s1 || s2 || "solid");
}

function getCenterFillColor(node) {
  // 辅料：中间圆颜色来自 flavor
  if (node.domain === "aux") {
    return getFlavorColor(getPrimaryFlavor(node));
  }

  // 主料：中间圆是白色
  return "white";
}

function applyPhysicalRingStyle(selection, physicalState, node) {
  const s = normValue(physicalState);

  // 默认
  selection
    .attr("fill", "none")
    .attr("stroke", getCenterFillColor(node))
    .attr("stroke-width", node.domain === "aux" ? 1 : 2)
    .attr("stroke-linecap", "butt");

  if (s === "solid" || s === "whole") {
    selection.attr("stroke-dasharray", null);
  } else if (s === "paste") {
    selection.attr("stroke-dasharray", "26 10");
  } else if (s === "cut" || s === "cube" || s === "slice" || s === "chunk") {
    selection.attr("stroke-dasharray", "18 10");
  } else if (s === "liquid") {
    selection.attr("stroke-dasharray", "10 8");
  } else if (s === "powder") {
    selection.attr("stroke-dasharray", "2 4");
  }
}

function drawFlavorRing(g, radiusInner, radiusOuter, flavors) {
  const vals = normalizeFlavorList(flavors);
  if (vals.length === 0) {
    return;
  }

  const pie = d3.pie()
    .sort(null)
    .value(() => 1);

  const arc = d3.arc()
    .innerRadius(radiusInner)
    .outerRadius(radiusOuter);

  const data = pie(vals);

  g.selectAll(null)
    .data(data)
    .enter()
    .append("path")
    .attr("d", arc)
    .attr("fill", d => getFlavorColor(d.data))
    .attr("stroke", "none");
}

function nodeVisualSpec(node) {
  const isAux = node.domain === "aux";

  const singleSpec = isAux
    ? {
        outerR: 11,
        centerR: 5,
        flavorInnerR: null,
        flavorOuterR: null,
        physicalR: 7,
        waistInset: 4
      }
    : {
        outerR: 24,
        centerR: 12,
        flavorInnerR: 9,
        flavorOuterR: 12,
        physicalR: 16,
        waistInset: 8
      };

  if (isDumbbellLike(node)) {
    return {
      ...singleSpec,
      halfOffset: singleSpec.outerR + 1
    };
  }

  return {
    ...singleSpec,
    halfOffset: null
  };
}

function buildMaps(nodes, edges) {
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const outMap = new Map();
  const inMap = new Map();

  nodes.forEach(n => {
    outMap.set(n.id, []);
    inMap.set(n.id, []);
  });

  edges.forEach(e => {
    if (outMap.has(e.source)) outMap.get(e.source).push(e.target);
    if (inMap.has(e.target)) inMap.get(e.target).push(e.source);
  });

  return { nodeById, outMap, inMap };
}

function computeNodeRanks(nodes, edges) {
  const { nodeById, outMap } = buildMaps(nodes, edges);
  const indeg = new Map();

  nodes.forEach(n => indeg.set(n.id, 0));

  edges.forEach(e => {
    if (nodeById.has(e.source) && nodeById.has(e.target)) {
      indeg.set(e.target, (indeg.get(e.target) || 0) + 1);
    }
  });

  const rank = new Map();
  nodes.forEach(n => rank.set(n.id, 0));

  const queue = [];
  nodes.forEach(n => {
    if ((indeg.get(n.id) || 0) === 0) queue.push(n.id);
  });

  while (queue.length > 0) {
    const cur = queue.shift();
    const curRank = rank.get(cur) || 0;

    for (const nxt of outMap.get(cur) || []) {
      rank.set(nxt, Math.max(rank.get(nxt) || 0, curRank + 1));
      indeg.set(nxt, indeg.get(nxt) - 1);
      if (indeg.get(nxt) === 0) queue.push(nxt);
    }
  }

  return rank;
}

function collectAuxChain(mainId, nodeById, inMap) {
  const chain = [];

  function dfs(cur) {
    const preds = inMap.get(cur) || [];

    for (const p of preds) {
      const node = nodeById.get(p);
      if (!node) continue;

      if (node.domain === "aux") {
        dfs(p);
        if (!chain.includes(p)) chain.push(p);
      }
    }
  }

  dfs(mainId);
  return chain;
}

function isShareNode(node) {
  return node && (node.kind === "merged_exact" || node.kind === "merged_similar");
}

function isDumbbellLike(node) {
  return node.kind === "merged_similar" || node.shared_add_dumbbell;
}

function hasSide(node, side) {
  if (!node) return false;
  if (side === "R1") return node.r1_node != null;
  if (side === "R2") return node.r2_node != null;
  return false;
}

function sideIndex(node, side) {
  if (!node) return Number.MAX_SAFE_INTEGER;
  if (side === "R1") return Number(node.r1_node ?? 999999);
  if (side === "R2") return Number(node.r2_node ?? 999999);
  return Number.MAX_SAFE_INTEGER;
}

function uniqueById(arr) {
  const seen = new Set();
  return arr.filter(n => {
    if (!n || seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });
}

function buildOutMap(edges) {
  const out = new Map();
  edges.forEach(e => {
    if (!out.has(e.source)) out.set(e.source, []);
    out.get(e.source).push(e);
  });
  return out;
}

function getHalfOffsetForNode(node) {
  const spec = nodeVisualSpec({
    domain: node.domain,
    kind: "merged_similar"
  });
  return spec.halfOffset || 0;
}

function applyNodeYFromAxis(node) {
  const axisY = node.axisY ?? node.y ?? 240;
  const halfOffset = getHalfOffsetForNode(node);

  if (node.kind === "only_r1") {
    node.y = axisY - halfOffset;
  } else if (node.kind === "only_r2") {
    node.y = axisY + halfOffset;
  } else {
    // merged_exact / merged_similar / shared
    node.y = axisY;
  }
}

function initializeAxisY(nodes) {
  nodes.forEach(node => {
    const halfOffset = getHalfOffsetForNode(node);

    if (node.kind === "only_r1") {
      node.axisY = node.y + halfOffset;
    } else if (node.kind === "only_r2") {
      node.axisY = node.y - halfOffset;
    } else {
      node.axisY = node.y;
    }
  });
}

function originalNodeIdForSide(node, side) {
  if (!node) return null;
  if (side === "R1") return node.r1_node != null ? String(node.r1_node) : null;
  if (side === "R2") return node.r2_node != null ? String(node.r2_node) : null;
  return null;
}

function parentHasOriginalBranch(node, side, branchInfo) {
  const origId = originalNodeIdForSide(node, side);
  if (!origId) return false;

  const sideInfo = branchInfo?.[side] || {};
  const targets = sideInfo[origId] || [];
  return targets.length > 1;
}

function spreadNonShareTargetsInternally(targets, extraGap = 14) {
  if (!targets || targets.length <= 1) return;

  const sorted = [...targets].sort((a, b) => {
    const ax = a.x ?? 0;
    const bx = b.x ?? 0;
    if (ax !== bx) return ax - bx;

    const ai = Math.min(
      Number(a.r1_node ?? 999999),
      Number(a.r2_node ?? 999999)
    );
    const bi = Math.min(
      Number(b.r1_node ?? 999999),
      Number(b.r2_node ?? 999999)
    );
    return ai - bi;
  });

  const k = sorted.length;
  sorted.forEach((node, i) => {
    const offset = (i - (k - 1) / 2) * extraGap;
    node.axisY = (node.axisY ?? node.y) + offset;
    applyNodeYFromAxis(node);
  });
}

function relayoutSubtreeXBySide(startId, side, startX, nodeById, outMap, visited = new Set()) {
  const key = `${side}:${startId}:${startX}`;
  if (visited.has(key)) return;
  visited.add(key);

  const node = nodeById.get(startId);
  if (!node) return;

  // 关键：x 只改成 candidate 收集，不碰 y 逻辑
  if (isShareNode(node)) {
    node._candidateX = Math.max(node._candidateX ?? -Infinity, startX);
  } else {
    node.x = Math.max(node.x ?? -Infinity, startX);
  }

  const currentX = isShareNode(node)
    ? Math.max(node._candidateX ?? -Infinity, startX)
    : node.x;

  const outEdges = outMap.get(startId) || [];

  let children = outEdges
    .map(e => nodeById.get(e.target))
    .filter(Boolean)
    .filter(child => hasSide(child, side));

  children = uniqueById(children);
  if (children.length === 0) return;

  children.sort((a, b) => sideIndex(a, side) - sideIndex(b, side));

  children.forEach(child => {
    let step;
    if (child.domain === "main") {
      step = 140;
    } else {
      step = 45;
    }

    relayoutSubtreeXBySide(
      child.id,
      side,
      currentX + step,
      nodeById,
      outMap,
      visited
    );
  });
}

function assignAuxRelativeToBranch(nodes, edges) {
  const { nodeById, inMap } = buildMaps(nodes, edges);

  const AUX_PROCESS_STEP = 45;
  const AUX_JOIN_STEP = 20;
  const SHARED_START_OFFSET = 3;
  const ONLY_START_OFFSET = 1;

  const AUX_ROW_GAP = 20;
  const Y_SHARED_AUX_OFFSET = 20;
  const AUX_ONLY_EXTRA_Y = 35;

  const auxNodes = nodes.filter(n => n.domain === "aux");
  const mainNodes = nodes.filter(n => n.domain === "main");

  function originalIndex(n) {
    const vals = [];
    if (n?.r1_node != null) vals.push(Number(n.r1_node));
    if (n?.r2_node != null) vals.push(Number(n.r2_node));
    if (vals.length === 0) return Number.MAX_SAFE_INTEGER;
    return Math.min(...vals);
  }

  function chunkArray(arr, chunkSize) {
    const result = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
      result.push(arr.slice(i, i + chunkSize));
    }
    return result;
  }

  // 先清空旧绑定
  auxNodes.forEach(aux => {
    aux._branchAnchorNodeId = null;
    aux._branchDx = 0;
    aux._branchDy = 0;
  });

  function assignJoinGroup(group, startOffset, main) {
    const MAX_PER_ROW = 5;
    const rows = chunkArray(group, MAX_PER_ROW);

    rows.forEach((row, rowIdx) => {
      row.forEach((joinNode, idx) => {
        const baseOffset = startOffset + idx;
        const joinDx = -baseOffset * AUX_JOIN_STEP;

        const chainIds = collectAuxChain(joinNode.id, nodeById, inMap);

// 新增：找到所有 add → joinNode 的 aux
        const addParents = (inMap.get(joinNode.id) || [])
        .filter(e => isAddEdge(e))
        .map(e => nodeById.get(e.source))
        .filter(n => n && n.domain === "aux")
        .map(n => n.id);

        const chain = [...new Set([...chainIds, ...addParents])]
        .map(id => nodeById.get(id))
        .filter(n => n && n.domain === "aux");

        const fullChain = [...chain, joinNode];

        const seen = new Set();
        const uniqueChain = fullChain.filter(n => {
          if (!n || seen.has(n.id)) return false;
          seen.add(n.id);
          return true;
        });

        uniqueChain.sort((a, b) => originalIndex(a) - originalIndex(b));

        uniqueChain.forEach((aux, i) => {
          const distToJoin = uniqueChain.length - 1 - i;

        // 如果是 joinNode 本身 → anchor main
        if (aux.id === joinNode.id) {aux._branchAnchorNodeId = main.id;} 
        // 如果是 add 到 aux 的辅料 → anchor joinNode
        else {aux._branchAnchorNodeId = joinNode.id;}

          aux._branchDx = joinDx - distToJoin * AUX_PROCESS_STEP;

          if (aux.kind === "only_r1") {
            aux._branchDy = -getHalfOffsetForNode(main) - AUX_ONLY_EXTRA_Y - rowIdx * AUX_ROW_GAP;
          } else if (aux.kind === "only_r2") {
            aux._branchDy = +getHalfOffsetForNode(main) + AUX_ONLY_EXTRA_Y + rowIdx * AUX_ROW_GAP;
          } else {
            aux._branchDy = -Y_SHARED_AUX_OFFSET - rowIdx * AUX_ROW_GAP;
          }
        });
      });
    });
  }

  mainNodes.forEach(main => {
    const preds = inMap.get(main.id) || [];

    const joinAux = preds
      .map(pid => nodeById.get(pid))
      .filter(n => n && n.domain === "aux");

    const sharedJoin = joinAux
      .filter(n => n.kind === "merged_exact")
      .sort((a, b) => originalIndex(a) - originalIndex(b));

    const r1Join = joinAux
      .filter(n => n.kind === "only_r1")
      .sort((a, b) => Number(a.r1_node ?? 999999) - Number(b.r1_node ?? 999999));

    const r2Join = joinAux
      .filter(n => n.kind === "only_r2")
      .sort((a, b) => Number(a.r2_node ?? 999999) - Number(b.r2_node ?? 999999));

    assignJoinGroup(sharedJoin, SHARED_START_OFFSET, main);
    assignJoinGroup(r1Join, ONLY_START_OFFSET, main);
    assignJoinGroup(r2Join, ONLY_START_OFFSET, main);
  });
}

function commitAuxFromBranch(nodes) {
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const auxNodes = nodes.filter(n => n.domain === "aux");

  auxNodes.forEach(aux => {
    const anchorId = aux._branchAnchorNodeId;
    if (!anchorId) return;

    const anchor = nodeById.get(anchorId);
    if (!anchor) return;

    aux.x = anchor.x + (aux._branchDx ?? 0);
    aux.y = anchor.y + (aux._branchDy ?? 0);
  });
}

function fallbackAuxPositions(nodes) {
  const auxNodes = nodes.filter(n => n.domain === "aux");

  auxNodes.forEach((aux, i) => {
    if (aux.x == null || aux.y == null || Number.isNaN(aux.x) || Number.isNaN(aux.y)) {
      aux.x = 80 + i * 20;
      if (aux.kind === "only_r1") aux.y = 140;
      else if (aux.kind === "only_r2") aux.y = 340;
      else aux.y = 220;
    }
  });
}

function commitCandidateX(nodes) {
  nodes.forEach(node => {
    if (node._candidateX != null && Number.isFinite(node._candidateX)) {
      node.x = node._candidateX;
    }
    delete node._candidateX;
  });
}

function computeBranchAxisTargets(nodes, edges, branchInfo) {
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const outMap = buildOutMap(edges);

  const BRANCH_GAP = 300;

  ["R1", "R2"].forEach(side => {
    nodes.forEach(parent => {
      if (!hasSide(parent, side)) return;
      if (!parentHasOriginalBranch(parent, side, branchInfo)) return;

      const outEdges = outMap.get(parent.id) || [];
      if (outEdges.length <= 1) return;

      let children = outEdges
        .map(e => nodeById.get(e.target))
        .filter(Boolean)
        .filter(child => hasSide(child, side));

      children = uniqueById(children);
      if (children.length <= 1) return;

      children.sort((a, b) => sideIndex(a, side) - sideIndex(b, side));

      const baseAxisY =
        children.reduce((s, n) => s + (n.axisY ?? n.y), 0) / children.length;

      const k = children.length;

      children.forEach((child, i) => {
        const offset = (i - (k - 1) / 2) * BRANCH_GAP;
        const axis = baseAxisY + offset;

        if (side === "R1") child._branchAxisY_R1 = axis;
        if (side === "R2") child._branchAxisY_R2 = axis;
      });
    });
  });
}

function propagateAxisYBySide(startId, side, targetAxisY, nodeById, outMap, visited = new Set()) {
  const key = `${side}:${startId}`;
  if (visited.has(key)) return;
  visited.add(key);

  const node = nodeById.get(startId);
  if (!node) return;

  // y 逻辑保留：这一侧 branch 的局部轴继续往后传播
  if (isShareNode(node)) {
    // shared/dumbbell：如果已经有 axisY，就取平均更稳
    if (node.axisY == null) {
      node.axisY = targetAxisY;
    } else {
      node.axisY = (node.axisY + targetAxisY) / 2;
    }
  } else {
    node.axisY = targetAxisY;
  }

  applyNodeYFromAxis(node);

  const outEdges = outMap.get(startId) || [];

  let children = outEdges
    .map(e => nodeById.get(e.target))
    .filter(Boolean)
    .filter(child => hasSide(child, side));

  children = uniqueById(children);

  children.forEach(child => {
    propagateAxisYBySide(child.id, side, targetAxisY, nodeById, outMap, visited);
  });
}

function applyRecipeBranchOffsets(nodes, edges, branchInfo) {
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const outMap = buildOutMap(edges);

  // 先初始化局部中心轴
  initializeAxisY(nodes);

  // 先算每个 side 的 branch axis（这就是分叉 y 位移逻辑）
  computeBranchAxisTargets(nodes, edges, branchInfo);

  const EXTRA_NONSHARE_AXIS_Y = 18;
  const EXTRA_SOURCE_X = 18;

  nodes.forEach(parent => {
    const outEdges = outMap.get(parent.id) || [];
    if (outEdges.length <= 1) return;

    const children = uniqueById(
      outEdges.map(e => nodeById.get(e.target)).filter(Boolean)
    );

    ["R1", "R2"].forEach(side => {
      if (!hasSide(parent, side)) return;
      if (!parentHasOriginalBranch(parent, side, branchInfo)) return;

      let sideChildren = children.filter(c => hasSide(c, side));
      sideChildren = uniqueById(sideChildren);
      if (sideChildren.length <= 1) return;

      sideChildren.sort((a, b) => sideIndex(a, side) - sideIndex(b, side));

      // 1) 先按 branch 的局部 axis 做 y 位移，并传播到后续整条链
      sideChildren.forEach(child => {
        const axis = side === "R1" ? child._branchAxisY_R1 : child._branchAxisY_R2;
        if (axis != null) {
          propagateAxisYBySide(
            child.id,
            side,
            axis,
            nodeById,
            outMap
          );

          // 2) 再让后续链从这里继续向右展开
          relayoutSubtreeXBySide(
            child.id,
            side,
            child.x,
            nodeById,
            outMap
          );
        }
      });

      // 3) source / target share 情况下的额外修正
      const sourceIsShare = isShareNode(parent);
      const targetShare = sideChildren.filter(isShareNode);
      const targetNonShare = sideChildren.filter(c => !isShareNode(c));

      // source share, target 全 share
      if (sourceIsShare && targetNonShare.length === 0) {
        return;
      }

      // source share, target 部分 share 或全不 share
      if (sourceIsShare && targetNonShare.length > 0) {
        spreadNonShareTargetsInternally(targetNonShare, EXTRA_NONSHARE_AXIS_Y);
        return;
      }

      // source 不 share, target 部分 share
      if (!sourceIsShare && targetShare.length > 0) {
        if (!parent._shiftedX) {
          parent.x -= EXTRA_SOURCE_X;
          parent._shiftedX = true;
        }
        spreadNonShareTargetsInternally(targetNonShare, EXTRA_NONSHARE_AXIS_Y);
        return;
      }

      // 完全不重合：只保留 branch 本身的 axis 展开
    });
  });

  // 最后统一提交 shared/dumbbell 的 x
  commitCandidateX(nodes);
  alignOnlyNodesToDumbbell(nodes, edges);

  nodes.forEach(n => {
    delete n._branchAxisY_R1;
    delete n._branchAxisY_R2;
    delete n._shiftedX;
    delete n.axisY;
  });
}

function layoutMainNodes(nodes, edges) {
  const mainNodes = nodes.filter(n => n.domain === "main");
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  const mainEdges = edges.filter(e => {
    const s = nodeById.get(e.source);
    const t = nodeById.get(e.target);
    return s && t && s.domain === "main" && t.domain === "main";
  });

  const rank = computeNodeRanks(mainNodes, mainEdges);

  const noOverlap = !hasAnyOverlap(nodes);

  const Y_MAIN_NORMAL = 240;
  const refMainSpec = nodeVisualSpec({ domain: "main", kind: "merged_similar" });

  const Y_R1_MAIN_NORMAL = Y_MAIN_NORMAL - refMainSpec.halfOffset;
  const Y_R2_MAIN_NORMAL = Y_MAIN_NORMAL + refMainSpec.halfOffset;

  const Y_R1_MAIN_SEPARATED = 150;
  const Y_R2_MAIN_SEPARATED = 330;

  mainNodes.forEach(n => {
    const r = rank.get(n.id) || 0;
    n.x = 120 + r * 140;

    if (noOverlap) {
      if (n.kind === "only_r1") {
        n.y = Y_R1_MAIN_SEPARATED;
      } else if (n.kind === "only_r2") {
        n.y = Y_R2_MAIN_SEPARATED;
      } else {
        n.y = 240;
      }
    } else {
      if (n.kind === "only_r1") {
        n.y = Y_R1_MAIN_NORMAL;
      } else if (n.kind === "only_r2") {
        n.y = Y_R2_MAIN_NORMAL;
      } else {
        n.y = Y_MAIN_NORMAL;
      }
    }
  });
}

function layoutAuxNodes(nodes, edges) {
  const { nodeById, outMap, inMap } = buildMaps(nodes, edges);
  
  const noOverlap = !hasAnyOverlap(nodes);
  const AUX_PROCESS_STEP = 45;

  const Y_MAIN = 240;
  // 正常情况
  const Y_R1_AUX_NORMAL = 140;
  const Y_R2_AUX_NORMAL = 340;
  
  // 完全不重合时，辅料轨道也一起拉开
  const Y_R1_AUX_SEPARATED = 95;
  const Y_R2_AUX_SEPARATED = 385;

  const Y_R1_AUX = noOverlap ? Y_R1_AUX_SEPARATED : Y_R1_AUX_NORMAL;
  const Y_R2_AUX = noOverlap ? Y_R2_AUX_SEPARATED : Y_R2_AUX_NORMAL;
  const AUX_JOIN_STEP = 20;
  const SHARED_START_OFFSET = 3;
  const ONLY_START_OFFSET = 1;

  const Y_SHARED_AUX_OFFSET = 20;
  const AUX_ROW_GAP = 25;

  const auxNodes = nodes.filter(n => n.domain === "aux");
  const mainNodes = nodes.filter(n => n.domain === "main");

  function originalIndex(n) {
    const vals = [];
    if (n?.r1_node != null) vals.push(Number(n.r1_node));
    if (n?.r2_node != null) vals.push(Number(n.r2_node));
    if (vals.length === 0) return Number.MAX_SAFE_INTEGER;
    return Math.min(...vals);
  }

  function chunkArray(arr, chunkSize) {
  const result = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    result.push(arr.slice(i, i + chunkSize));
  }
  return result;
}

  function assignJoinGroup(group, startOffset, main) {
  const MAX_PER_ROW = 5;
  const rows = chunkArray(group, MAX_PER_ROW);

  rows.forEach((row, rowIdx) => {
    row.forEach((joinNode, idx) => {
      const baseOffset = startOffset + idx;
      const baseX = main.x - baseOffset * AUX_JOIN_STEP;

      const chain = collectAuxChain(joinNode.id, nodeById, inMap)
        .map(id => nodeById.get(id))
        .filter(n => n && n.domain === "aux");

      const fullChain = [...chain, joinNode];

      const seen = new Set();
      const uniqueChain = fullChain.filter(n => {
        if (!n || seen.has(n.id)) return false;
        seen.add(n.id);
        return true;
      });

      uniqueChain.sort((a, b) => originalIndex(a) - originalIndex(b));

      uniqueChain.forEach((aux, i) => {
        const distToJoin = uniqueChain.length - 1 - i;
        aux.x = baseX - distToJoin * AUX_PROCESS_STEP;

        if (aux.kind === "only_r1") {
          aux.y = Y_R1_AUX - rowIdx * AUX_ROW_GAP;
        } else if (aux.kind === "only_r2") {
          aux.y = Y_R2_AUX + rowIdx * AUX_ROW_GAP;
        } else {
          aux.y = Y_MAIN - Y_SHARED_AUX_OFFSET - rowIdx * AUX_ROW_GAP;
        }
      });
    });
  });
}

  mainNodes.forEach(main => {
    const preds = inMap.get(main.id) || [];

    const joinAux = preds
      .map(pid => nodeById.get(pid))
      .filter(n => n && n.domain === "aux");

    const sharedJoin = joinAux
      .filter(n => n.kind === "merged_exact")
      .sort((a, b) => originalIndex(a) - originalIndex(b));

    const r1Join = joinAux
      .filter(n => n.kind === "only_r1")
      .sort((a, b) => Number(a.r1_node ?? 999999) - Number(b.r1_node ?? 999999));

    const r2Join = joinAux
      .filter(n => n.kind === "only_r2")
      .sort((a, b) => Number(a.r2_node ?? 999999) - Number(b.r2_node ?? 999999));

    assignJoinGroup(sharedJoin, SHARED_START_OFFSET, main);
    assignJoinGroup(r1Join, ONLY_START_OFFSET, main);
    assignJoinGroup(r2Join, ONLY_START_OFFSET, main);
  });

  auxNodes.forEach((aux, i) => {
    if (aux.x == null || Number.isNaN(aux.x)) {
      aux.x = 80 + i * AUX_JOIN_STEP;

      if (aux.kind === "only_r1") aux.y = Y_R1_AUX;
      else if (aux.kind === "only_r2") aux.y = Y_R2_AUX;
      else aux.y = Y_MAIN;
    }
  });
}

function layoutNodes(nodes, edges) {
  layoutMainNodes(nodes, edges);
  layoutAuxNodes(nodes, edges);
}

function hasAnyOverlap(nodes) {
  return nodes.some(n =>
    n.kind === "merged_exact" || n.kind === "merged_similar"
  );
}

function applySeparateRecipeOffset(nodes, graph) {

  if (!graph.separate_layout) return;

  const GAP = 200;   // 两个 recipe 的竖直间距

  for (const n of nodes) {

    const r1 = n.r1_node != null;
    const r2 = n.r2_node != null;

    if (r2 && !r1) {
      n.y += GAP;
    }

  }

}

function renderGraph(graph) {
  root.selectAll("*").remove();
  
  const nodes = graph.nodes;
  const edges = graph.edges;
  const nodeById = new Map(nodes.map(d => [d.id, d]));
  const branchInfo = graph.branch_info || { R1: {}, R2: {} };
  layoutNodes(nodes, edges);
  applyRecipeBranchOffsets(nodes, edges, branchInfo);
  applySeparateRecipeOffset(nodes, graph);
  assignAuxRelativeToBranch(nodes, edges);
  commitAuxFromBranch(nodes);
  fallbackAuxPositions(nodes);
  const outgoingOffsetMap = assignOutgoingOffsets(edges);

  function edgePath(d) {
    const sNode = nodeById.get(d.source);
    const tNode = nodeById.get(d.target);

    const s0 = getAnchorPosition(sNode, d.source_anchor);
    const t0 = getAnchorPosition(tNode, d.target_anchor);

    const extraOff = outgoingOffsetMap.get(d) || 0;
    const styleOff = edgeBaseOffset(d.style);

    const tx = t0.x;
    const ty = t0.y + extraOff + styleOff;

    let sAdj;
    if (isDumbbellLike(sNode)) {
    sAdj = dumbbellBoundaryPoint(sNode, d.source_anchor, tx, ty, true);
  } else {
    sAdj = singleNodeStartBoundaryPoint(sNode, d.source_anchor, tx, ty);
  }

    let tAdj;
    if (isDumbbellLike(tNode)) {
    tAdj = dumbbellBoundaryPoint(tNode, d.target_anchor, s0.x, s0.y, false);
  } else {
    tAdj = singleNodeBoundaryPoint(tNode, d.target_anchor, s0.x, s0.y);
  }

  const mx = (sAdj.x + tAdj.x) / 2;
  const my = (sAdj.y + tAdj.y) / 2 + (extraOff * 0.35);

  if (isAddEdge(d)) {
    return addTrianglePath(sAdj.x, sAdj.y, tAdj.x, tAdj.y, 10, 4);
  }
  
  return `M ${sAdj.x},${sAdj.y} Q ${mx},${my} ${tAdj.x},${tAdj.y}`;

  }

  function edgeLabelPosition(d) {
    const sNode = nodeById.get(d.source);
    const tNode = nodeById.get(d.target);

    const s0 = getAnchorPosition(sNode, d.source_anchor);
    const t0 = getAnchorPosition(tNode, d.target_anchor);

    const extraOff = outgoingOffsetMap.get(d) || 0;
    const styleOff = edgeBaseOffset(d.style);

    return {
      x: (s0.x + t0.x) / 2,
      y: (s0.y + t0.y) / 2 + extraOff * 0.5 + styleOff * 0.5 - 10
    };
  }

function drawIcon(g, iconName, spec) {

  if (!iconName) return;

  const size = spec.centerR * 1.6;

  g.append("image")
    .attr("href", `http://127.0.0.1:5500/data/icons/${iconName}.png`)
    .attr("x", -size / 2)
    .attr("y", -size / 2)
    .attr("width", size)
    .attr("height", size)
    .attr("pointer-events", "none");
}
  svg.select("defs").remove();
const defs = svg.append("defs");

// arrow markers
defs.selectAll("marker")
  .data(["shared", "R1", "R2", "heat", "cold", "prep"])
  .enter()
  .append("marker")
  .attr("id", d => `arrow-${d}`)
  .attr("viewBox", "0 -5 10 10")
  .attr("refX", 10)
  .attr("refY", 0)
  .attr("markerWidth", 7)
  .attr("markerHeight", 7)
  .attr("orient", "auto")
  .append("path")
  .attr("d", "M0,-5L10,0L0,5")
  .attr("fill", d => TYPE_COLORS[d] ?? edgeColor(d));

// dumbbell gradient
const grad = defs.append("linearGradient")
  .attr("id", "dumbbell-grad")
  .attr("x1", "0%")
  .attr("y1", "0%")
  .attr("x2", "0%")
  .attr("y2", "100%");

grad.append("stop")
  .attr("offset", "0%")
  .attr("stop-color", COLORS.only_r1);

grad.append("stop")
  .attr("offset", "45%")
  .attr("stop-color", COLORS.only_r1);

grad.append("stop")
  .attr("offset", "55%")
  .attr("stop-color", COLORS.only_r2);

grad.append("stop")
  .attr("offset", "100%")
  .attr("stop-color", COLORS.only_r2);

  const edgeLayer = root.append("g");
  const nodeLayer = root.append("g");

  const edgeGroup = edgeLayer.selectAll(".edge-g")
    .data(edges)
    .enter()
    .append("g")
    .attr("class", "edge-g");

  const edgePathSel = edgeGroup.append("path")
  .attr("fill", d => isAddEdge(d) ? resolvedEdgeColor(d) : "none")
  .attr("stroke", d => isAddEdge(d) ? "none" : resolvedEdgeColor(d))
  .attr("stroke-width", d => isAddEdge(d) ? 0 : edgeStrokeWidth(d.style))
  .attr("marker-end", d => {
  if (isAddEdge(d)) return null;
  const type = (d.type || "prep").toLowerCase().trim();
  return `url(#arrow-${type})`;
})

  .on("mouseenter", function(event, d) {

    tooltip
      .style("opacity", 1)
      .html(edgeTooltipHTML(d));

  })

  .on("mousemove", function(event) {

    tooltip
      .style("left", `${event.pageX + 12}px`)
      .style("top", `${event.pageY + 12}px`);

  })

  .on("mouseleave", function() {

    tooltip.style("opacity", 0);

  });

  const edgeLabelSel = edgeGroup.append("text")
  .attr("class","edge-label")
  .text(d => isAddEdge(d) ? "" : d.action);

  const nodeGroup = nodeLayer.selectAll(".node-g")
    .data(nodes)
    .enter()
    .append("g")
    .attr("class", "node-g")
    .call(
      d3.drag()
        .on("start", function() {
          d3.select(this).raise();
        })
        .on("drag", function(event, d) {
          d.x = event.x;
          d.y = event.y;
          d3.select(this).attr("transform", `translate(${d.x},${d.y})`);
          updateEdges();
        })
    );

  nodeGroup.each(function(d) {
  const g = d3.select(this);
  const spec = nodeVisualSpec(d);

  function drawSingleNode(cx, cy, node, recipeColor) {
    const local = g.append("g")
      .attr("transform", `translate(${cx},${cy})`);

    // 最外层 recipe 外轮廓
    local.append("circle")
      .attr("r", spec.outerR)
      .attr("fill", recipeColor)
      .attr("stroke", "none");

    // 主料：flavor ring + 白中心 + 白 physical ring
    if (node.domain === "main") {
      const flavors = normalizeFlavorList(node.flavor_r1 || node.flavor_r2);

      // 中间白圆
      
      local.append("circle")
        .attr("r", spec.centerR)
        .attr("fill", "white")
        .attr("stroke", "none")
      let iconName = null;

if (node.kind === "only_r1") {
  iconName = node.icon_r1;
} else if (node.kind === "only_r2") {
  iconName = node.icon_r2;
} else {
  iconName = node.icon_r1 || node.icon_r2;
}

drawIcon(local, iconName, spec);

      if (flavors.length > 0) {
        drawFlavorRing(local, spec.flavorInnerR, spec.flavorOuterR, flavors);
      }
      
      // physical ring
      const physicalRing = local.append("circle")
        .attr("r", spec.physicalR);

      applyPhysicalRingStyle(physicalRing, getPhysicalState(node), node);
    }

    // 辅料：中间颜色圆 + 白 physical ring
    else {
      local.append("circle")
        .attr("r", spec.centerR)
        .attr("fill", getFlavorColor(getPrimaryFlavor(node)))
        .attr("stroke", "none");

      const physicalRing = local.append("circle")
        .attr("r", spec.physicalR);

      applyPhysicalRingStyle(physicalRing, getPhysicalState(node), node);
    }
  }

  if (d.kind === "merged_exact" && d.shared_add_dumbbell) {
  // share-blue dumbbell body
  g.append("path")
    .attr("d", dumbbellBodyPath(spec.outerR, spec.halfOffset, spec.waistInset, 4))
    .attr("fill", COLORS.merged_exact)
    .attr("stroke", "none");

  const top = g.append("g")
    .attr("transform", `translate(0, ${-spec.halfOffset})`);
    top
  .on("mouseenter", function(event) {

    tooltip
      .style("opacity", 1)
      .html(
        nodeHalfTooltip(
          d.state_r1,
          d.flavor_r1,
          d.r1_node
        )
      );

  })
  .on("mousemove", function(event) {

    tooltip
      .style("left", `${event.pageX + 12}px`)
      .style("top", `${event.pageY + 12}px`);

  })
  .on("mouseleave", function() {

    tooltip.style("opacity", 0);

  });

  const bottom = g.append("g")
    .attr("transform", `translate(0, ${spec.halfOffset})`);
    bottom
  .on("mouseenter", function(event) {

    tooltip
      .style("opacity", 1)
      .html(
        nodeHalfTooltip(
          d.state_r2,
          d.flavor_r2,
          d.r2_node
        )
      );

  })
  .on("mousemove", function(event) {

    tooltip
      .style("left", `${event.pageX + 12}px`)
      .style("top", `${event.pageY + 12}px`);

  })
  .on("mouseleave", function() {

    tooltip.style("opacity", 0);

  });

  if (d.domain === "main") {
    // 上半
    top.append("circle")
      .attr("r", spec.centerR)
      .attr("fill", "white")
      .attr("stroke", "none")
      drawIcon(top, d.icon_r1, spec);

    const topFlavors = normalizeFlavorList(d.flavor_r1);
    if (topFlavors.length > 0) {
      drawFlavorRing(top, spec.flavorInnerR, spec.flavorOuterR, topFlavors);
    }

    const topPhysical = top.append("circle")
      .attr("r", spec.physicalR);

    applyPhysicalRingStyle(topPhysical, d.state_r1 ? d.state_r1[2] : null, {
      ...d,
      flavor_r2: null,
      state_r2: null
    });

    // 下半
    bottom.append("circle")
      .attr("r", spec.centerR)
      .attr("fill", "white")
      .attr("stroke", "none")
      drawIcon(bottom, d.icon_r2, spec);

    const bottomFlavors = normalizeFlavorList(d.flavor_r2);
    if (bottomFlavors.length > 0) {
      drawFlavorRing(bottom, spec.flavorInnerR, spec.flavorOuterR, bottomFlavors);
    }

    const bottomPhysical = bottom.append("circle")
      .attr("r", spec.physicalR);

    applyPhysicalRingStyle(bottomPhysical, d.state_r2 ? d.state_r2[2] : null, {
      ...d,
      flavor_r1: null,
      state_r1: null
    });

  } else {
    // aux 版本
    top.append("circle")
      .attr("r", spec.centerR)
      .attr("fill", getFlavorColor((normalizeFlavorList(d.flavor_r1)[0]) || "none"))
      .attr("stroke", "none");

    const topPhysical = top.append("circle")
      .attr("r", spec.physicalR);

    applyPhysicalRingStyle(topPhysical, d.state_r1 ? d.state_r1[2] : null, {
      ...d,
      flavor_r2: null,
      state_r2: null
    });

    bottom.append("circle")
      .attr("r", spec.centerR)
      .attr("fill", getFlavorColor((normalizeFlavorList(d.flavor_r2)[0]) || "none"))
      .attr("stroke", "none");

    const bottomPhysical = bottom.append("circle")
      .attr("r", spec.physicalR);

    applyPhysicalRingStyle(bottomPhysical, d.state_r2 ? d.state_r2[2] : null, {
      ...d,
      flavor_r1: null,
      state_r1: null
    });
  }

} else if (d.kind === "merged_exact") {
  drawSingleNode(0, 0, d, COLORS.merged_exact);

} else if (d.kind === "only_r1") {
  drawSingleNode(0, 0, d, COLORS.only_r1);

} else if (d.kind === "only_r2") {
  drawSingleNode(0, 0, d, COLORS.only_r2);

} else if (d.kind === "merged_similar") {
  // 1. 先画整体 dumbbell body
  g.append("path")
    .attr("d", dumbbellBodyPath(spec.outerR, spec.halfOffset, spec.waistInset, 4))
    .attr("fill", "url(#dumbbell-grad)")
    .attr("stroke", "none");

  // 2. 上半（R1）
  const topNode = {
    ...d,
    flavor_r1: d.flavor_r1,
    flavor_r2: null,
    state_r1: d.state_r1,
    state_r2: null
  };

  const top = g.append("g")
    .attr("transform", `translate(0, ${-spec.halfOffset})`);
    top
  .on("mouseenter", function(event) {

    tooltip
      .style("opacity", 1)
      .html(
        nodeHalfTooltip(
          d.state_r1,
          d.flavor_r1,
          d.r1_node
        )
      );

  })
  .on("mousemove", function(event) {

    tooltip
      .style("left", `${event.pageX + 12}px`)
      .style("top", `${event.pageY + 12}px`);

  })
  .on("mouseleave", function() {

    tooltip.style("opacity", 0);

  });

  if (d.domain === "main") {
    top.append("circle")
      .attr("r", spec.centerR)
      .attr("fill", "white")
      .attr("stroke", "none")
      drawIcon(top, d.icon_r1, spec);

    const topFlavors = normalizeFlavorList(d.flavor_r1);
    if (topFlavors.length > 0) {
      drawFlavorRing(top, spec.flavorInnerR, spec.flavorOuterR, topFlavors);
    }

    const physicalRingTop = top.append("circle")
      .attr("r", spec.physicalR);

    applyPhysicalRingStyle(physicalRingTop, d.state_r1 ? d.state_r1[2] : null, topNode);
  } else {
    top.append("circle")
      .attr("r", spec.centerR)
      .attr("fill", getFlavorColor(getPrimaryFlavor(topNode)))
      .attr("stroke", "none");

    const physicalRingTop = top.append("circle")
      .attr("r", spec.physicalR);

    applyPhysicalRingStyle(physicalRingTop, d.state_r1 ? d.state_r1[2] : null, topNode);
  }

  // 3. 下半（R2）
  const bottomNode = {
    ...d,
    flavor_r1: d.flavor_r2,
    flavor_r2: null,
    state_r1: d.state_r2,
    state_r2: null
  };

  const bottom = g.append("g")
    .attr("transform", `translate(0, ${spec.halfOffset})`);
    bottom
  .on("mouseenter", function(event) {

    tooltip
      .style("opacity", 1)
      .html(
        nodeHalfTooltip(
          d.state_r2,
          d.flavor_r2,
          d.r2_node
        )
      );

  })
  .on("mousemove", function(event) {

    tooltip
      .style("left", `${event.pageX + 12}px`)
      .style("top", `${event.pageY + 12}px`);

  })
  .on("mouseleave", function() {

    tooltip.style("opacity", 0);

  });

  if (d.domain === "main") {
    bottom.append("circle")
      .attr("r", spec.centerR)
      .attr("fill", "white")
      .attr("stroke", "none")
      drawIcon(bottom, d.icon_r2, spec);

    const bottomFlavors = normalizeFlavorList(d.flavor_r2);
    if (bottomFlavors.length > 0) {
      drawFlavorRing(bottom, spec.flavorInnerR, spec.flavorOuterR, bottomFlavors);
    }

    const physicalRingBottom = bottom.append("circle")
      .attr("r", spec.physicalR);

    applyPhysicalRingStyle(physicalRingBottom, d.state_r2 ? d.state_r2[2] : null, bottomNode);
  } else {
    bottom.append("circle")
      .attr("r", spec.centerR)
      .attr("fill", getFlavorColor(getPrimaryFlavor(bottomNode)))
      .attr("stroke", "none");

    const physicalRingBottom = bottom.append("circle")
      .attr("r", spec.physicalR);

    applyPhysicalRingStyle(physicalRingBottom, d.state_r2 ? d.state_r2[2] : null, bottomNode);
  }
}

});

nodeGroup
  .attr("transform", d => `translate(${d.x},${d.y})`)
  .on("mouseenter", function(event, d) {

    // dumbbell 不在 nodeGroup 显示 tooltip
    if (d.kind === "merged_similar" || (d.kind === "merged_exact" && d.shared_add_dumbbell)) {
      return;
    }

    const state = d.state_r1 || d.state_r2;
    const flavor = d.flavor_r1 || d.flavor_r2;
    const idx = d.r1_node ?? d.r2_node;

    tooltip
      .style("opacity", 1)
      .html(nodeHalfTooltip(state, flavor, idx));

  })
  .on("mousemove", function(event) {

    tooltip
      .style("left", `${event.pageX + 12}px`)
      .style("top", `${event.pageY + 12}px`);

  })
  .on("mouseleave", function() {

    tooltip.style("opacity", 0);

  });

  function updateEdges() {
    edgePathSel.attr("d", edgePath);
    edgeLabelSel
      .attr("x", d => edgeLabelPosition(d).x)
      .attr("y", d => edgeLabelPosition(d).y);
  }

  updateEdges();
}

async function compareSelected() {
  const recipe1 = document.getElementById("recipe1").value;
  const recipe2 = document.getElementById("recipe2").value;

  const res = await fetch(`${API_BASE}/compare`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ recipe1, recipe2 })
  });

  const data = await res.json();
  renderGraph(data.graph);
}

document.getElementById("compareBtn").addEventListener("click", compareSelected);

loadRecipes();