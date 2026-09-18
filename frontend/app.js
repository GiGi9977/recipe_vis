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

function nodeHalfTooltip(state, flavor, idx, nodeId) {

  if (!state) return "";

  const [name, type, physical, chemical] = state;

  return `
    ${nodeId ? `<span style="font-size:10px;opacity:0.5;">${nodeId}</span><br/>` : ""}
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

function isProcessEdge(edge) {
  return !isAddEdge(edge);
}

function isMainToContainerEdge(d, sNode, tNode) {
  if (!sNode || !tNode) return false;
  return sNode.domain === "main" && isContainerNode(tNode);
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

function resolveAnchorForExactDumbbell(node, side, isSource = false) {
  if (!node || !node.shape_dumbbell) return "M";

  // only_r1 / only_r2 明确落上/下半
  if (side === "R1") return "T";
  if (side === "R2") return "B";

  // shared 默认走中间
  return "M";
}

function effectiveAnchor(node, rawAnchor, edgeStyle, isSource) {
  if (!node) return rawAnchor || "M";

  if (node.kind === "merged_similar" || node.shape_dumbbell) {
    if (edgeStyle === "R1") {
      return isSource ? "T" : "T";
    }
    if (edgeStyle === "R2") {
      return isSource ? "B" : "B";
    }
    return rawAnchor || "M";
  }

  return rawAnchor || "M";
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
  savory: "#7F7F7F",
  sweet: "#e39ac7",
  sour: "#e3ff65",
  umami: "#7A5C8E",
  aromatic: "#5FAF5F",
  spicing: "#9A6A3A",
  spicy: "#EC5823",
  deodorizing: "#4FA3A5",
  none: "#ffffff"
};

const GREEK_LETTERS = [
  "α","β","γ","δ","ε","ζ","η","θ","ι","κ","λ","μ",
  "ν","ξ","ο","π","ρ","σ","τ","υ","φ","χ","ψ","ω"
];

function getAuxCategoryName(node) {
  if (!node) return null;
  if (node.domain !== "aux") return null;

  const name1 = node.state_r1 ? node.state_r1[0] : null;
  const name2 = node.state_r2 ? node.state_r2[0] : null;

  return (name1 || name2 || "").trim().toLowerCase() || null;
}

function buildAuxGreekMap(nodes) {
  const categories = [];

  nodes.forEach(n => {
    const cat = getAuxCategoryName(n);
    if (cat && !categories.includes(cat)) {
      categories.push(cat);
    }
  });

  categories.sort();

  const map = new Map();
  categories.forEach((cat, i) => {
    const letter = i < GREEK_LETTERS.length ? GREEK_LETTERS[i] : `α${i}`;
    map.set(cat, letter);
  });

  return map;
}

function hexToRgb(hex) {
  const s = String(hex || "").replace("#", "").trim();
  if (s.length !== 6) return null;

  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16)
  };
}

function getReadableTextColor(bgColor) {
  const rgb = hexToRgb(bgColor);
  if (!rgb) return "#000000";

  // 感知亮度
  const luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;

  return luminance > 160 ? "#000000" : "#ffffff";
}

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
  const isContainer = isContainerNode(node);
  const isAux = node.domain === "aux";
  
  let singleSpec;

  if (isContainer) {
    singleSpec = {
      outerR: 16,
      centerR: 9,
      flavorInnerR: 7,
      flavorOuterR: 9,
      physicalR: 11,
      waistInset: 8
    };
  } else if (isAux) {
    singleSpec = {
      outerR: 11,
      centerR: 5,
      flavorInnerR: null,
      flavorOuterR: null,
      physicalR: 7,
      waistInset: 4
    };
  } else {
    singleSpec = {
      outerR: 24,
      centerR: 12,
      flavorInnerR: 9,
      flavorOuterR: 12,
      physicalR: 16,
      waistInset: 8
    };
  }

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
  return node.kind === "merged_similar" || !!node.shape_dumbbell;
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

function isContainerNode(d) {
  if (!d) return false;
  const type1 = d.state_r1 ? d.state_r1[1] : "";
  const type2 = d.state_r2 ? d.state_r2[1] : "";
  return type1 === "container" || type2 === "container";
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
  const AUX_JOIN_STEP = 15;
  const SHARED_START_OFFSET = 3;
  const ONLY_START_OFFSET = 1;

  const AUX_ROW_GAP = 20;
  const Y_SHARED_AUX_OFFSET = 20;
  const AUX_ONLY_EXTRA_Y = 35;

  const auxNodes = nodes.filter(n => n.domain === "aux");
  const mainNodes = nodes.filter(n => n.domain === "main" && !isContainerNode(n));
  const containerNodes = nodes.filter(n => n.domain === "main" && isContainerNode(n));

  // container 比 aux 再往外一档
  const CONTAINER_EXTRA_Y = AUX_ONLY_EXTRA_Y + 50;  // aux 是 35，container 是 85

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

  function assignJoinGroup(group, startOffset, main, isContainer = false) {
    const MAX_PER_ROW = 5;
    const rows = chunkArray(group, MAX_PER_ROW);

    rows.forEach((row, rowIdx) => {
      row.forEach((joinNode, idx) => {
        const baseOffset = startOffset + idx;
        const joinDx = -baseOffset * AUX_JOIN_STEP;
        // container 节点没有 chain，直接处理自身
        if (isContainer) {
          joinNode._branchAnchorNodeId = main.id;
          joinNode._branchDx = joinDx;

          if (joinNode.kind === "only_r1") {
            joinNode._branchDy = -getHalfOffsetForNode(main) - CONTAINER_EXTRA_Y - rowIdx * AUX_ROW_GAP;
          } else if (joinNode.kind === "only_r2") {
            joinNode._branchDy = +getHalfOffsetForNode(main) + CONTAINER_EXTRA_Y + rowIdx * AUX_ROW_GAP;
          } else {
            joinNode._branchDy = -Y_SHARED_AUX_OFFSET - rowIdx * AUX_ROW_GAP;
          }
          return;
        }

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

  // ── 处理 container（新增）──
  // container 节点的 anchor 是它指向的第一个 main 节点
  const outMap = buildOutMap(edges);

  containerNodes.forEach(containerNode => {
    // 找这个 container 节点指向的 main 节点作为 anchor
    const outEdges = outMap.get(containerNode.id) || [];
    const targetMain = outEdges
      .map(e => nodeById.get(e.target))
      .find(n => n && n.domain === "main" && !isContainerNode(n));

    if (!targetMain) return;

    assignJoinGroup([containerNode], ONLY_START_OFFSET, targetMain, true);
  });
}

function commitAuxFromBranch(nodes) {
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  // 原来只处理 aux，现在扩展到所有设置了 anchor 的节点（含 container）
  nodes
    .filter(n => n._branchAnchorNodeId != null)
    .forEach(n => {
      const anchor = nodeById.get(n._branchAnchorNodeId);
      if (!anchor) return;
      n.x = anchor.x + (n._branchDx ?? 0);
      n.y = anchor.y + (n._branchDy ?? 0);
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

function findBridgeBetweenOnSide(curMain, nextMain, side, edges, nodeById) {
  const curIdx = side === "R1" ? curMain.r1_node : curMain.r2_node;
  const nextIdx = side === "R1" ? nextMain.r1_node : nextMain.r2_node;

  if (curIdx == null || nextIdx == null) return null;

  function hasSide(node) {
    return side === "R1" ? node.r1_node != null : node.r2_node != null;
  }

  // 这一侧如果已经有 direct main -> main，就不应该升层
  const hasDirectMainToMain = edges.some(e => {
    if (e.source !== curMain.id || e.target !== nextMain.id) return false;

    const s = nodeById.get(e.source);
    const t = nodeById.get(e.target);
    if (!s || !t) return false;
    if (s.domain !== "main" || t.domain !== "main") return false;

    return hasSide(s) && hasSide(t);
  });

  if (hasDirectMainToMain) return null;

  // 找这一侧真正的 main -> non-main -> main
  const mids = edges
    .filter(e => e.source === curMain.id)
    .map(e => nodeById.get(e.target))
    .filter(Boolean)
    .filter(n => n.domain !== "main" && hasSide(n));

  for (const mid of mids) {
    const hit = edges.some(e => {
      if (e.source !== mid.id || e.target !== nextMain.id) return false;
      const t = nodeById.get(e.target);
      return t && t.domain === "main" && hasSide(t);
    });

    if (hit) return mid;
  }

  return null;
}

function getSideIndex(node, side) {
  if (!node) return Number.MAX_SAFE_INTEGER;
  return side === "R1"
    ? Number(node.r1_node ?? Number.MAX_SAFE_INTEGER)
    : Number(node.r2_node ?? Number.MAX_SAFE_INTEGER);
}

function nodeHasSide(node, side) {
  if (!node) return false;
  return side === "R1" ? node.r1_node != null : node.r2_node != null;
}

function buildNodeById(nodes) {
  return new Map(nodes.map(n => [n.id, n]));
}

function buildOutEdgeMap(edges) {
  const out = new Map();
  edges.forEach(e => {
    if (!out.has(e.source)) out.set(e.source, []);
    out.get(e.source).push(e);
  });
  return out;
}

function buildInEdgeMap(edges) {
  const inMap = new Map();
  edges.forEach(e => {
    if (!inMap.has(e.target)) inMap.set(e.target, []);
    inMap.get(e.target).push(e);
  });
  return inMap;
}

function extractMainChainForSide(side, nodes, edges) {
  const nodeById = buildNodeById(nodes);
  const outMap = buildOutEdgeMap(edges);
  const inMap = buildInEdgeMap(edges);

  const mainNodes = nodes
    .filter(n => n.domain === "main" && nodeHasSide(n, side))
    .sort((a, b) => getSideIndex(a, side) - getSideIndex(b, side));

  function getDirectMainNext(curMain) {
    const outs = (outMap.get(curMain.id) || [])
      .map(e => ({ edge: e, target: nodeById.get(e.target) }))
      .filter(x => x.target && x.target.domain === "main" && nodeHasSide(x.target, side))
      .sort((a, b) => getSideIndex(a.target, side) - getSideIndex(b.target, side));

    return outs.length ? outs[0].target : null;
  }

  function getBridgeMainNext(curMain) {
    const outs = (outMap.get(curMain.id) || [])
      .map(e => ({ edge: e, target: nodeById.get(e.target) }))
      .filter(x => x.target && x.target.domain !== "main" && nodeHasSide(x.target, side))
      .sort((a, b) => getSideIndex(a.target, side) - getSideIndex(b.target, side));

    for (const item of outs) {
      const bridge = item.target;

      const out2 = (outMap.get(bridge.id) || [])
        .map(e => ({ edge: e, target: nodeById.get(e.target) }))
        .filter(x => x.target && x.target.domain === "main" && nodeHasSide(x.target, side))
        .sort((a, b) => getSideIndex(a.target, side) - getSideIndex(b.target, side));

      if (out2.length > 0) {
        return {
          bridge,
          nextMain: out2[0].target
        };
      }
    }

    return null;
  }

  // branch 起点：没有同侧 main 前驱
  const starts = mainNodes.filter(n => {
    const preds = inMap.get(n.id) || [];
    return !preds.some(pid => {
      const p = nodeById.get(pid);
      return p && p.domain === "main" && nodeHasSide(p, side);
    });
  });

  const orderedStarts = starts.length > 0 ? starts : mainNodes;

  const chains = [];
  const usedMain = new Set();
  const usedBridge = new Set();

  for (const start of orderedStarts) {
    if (usedMain.has(start.id)) continue;

    const chain = [];
    let cur = start;

    while (cur && !usedMain.has(cur.id)) {
      chain.push({
        kind: "main",
        node: cur
      });
      usedMain.add(cur.id);

      const directNext = getDirectMainNext(cur);
      const bridgeSeg = getBridgeMainNext(cur);

      // 关键：
      // 如果 bridge 指向的 nextMain 在顺序上早于或等于 directNext，
      // 优先把它当主链 segment
      if (
        bridgeSeg &&
        (
          !directNext ||
          getSideIndex(bridgeSeg.nextMain, side) <= getSideIndex(directNext, side)
        )
      ) {
        if (!usedBridge.has(bridgeSeg.bridge.id)) {
          chain.push({
            kind: "bridge",
            bridgeKind: bridgeSeg.bridge.domain, // aux / container
            node: bridgeSeg.bridge
          });
          usedBridge.add(bridgeSeg.bridge.id);
        }

        cur = bridgeSeg.nextMain;
        continue;
      }

      if (directNext && !usedMain.has(directNext.id)) {
        cur = directNext;
        continue;
      }

      break;
    }

    if (chain.length > 0) {
      chains.push(chain);
    }
  }

  return chains;
}

function choosePrimarySideByStructure(nodes, edges) {
  function scoreSide(side) {
    const chains = extractMainChainForSide(side, nodes, edges);

    let mainChainNodeCount = 0;
    let bridgeCount = 0;

    chains.forEach(chain => {
      mainChainNodeCount += chain.length;
      bridgeCount += chain.filter(seg => seg.kind === "bridge").length;
    });

    const totalNodeCount = nodes.filter(n => nodeHasSide(n, side)).length;

    return {
      side,
      mainChainNodeCount,
      bridgeCount,
      totalNodeCount
    };
  }

  const s1 = scoreSide("R1");
  const s2 = scoreSide("R2");

  // 1. 先比主链节点数
  if (s1.mainChainNodeCount !== s2.mainChainNodeCount) {
    return s1.mainChainNodeCount > s2.mainChainNodeCount ? "R1" : "R2";
  }

  // 2. 再比 bridge 数
  if (s1.bridgeCount !== s2.bridgeCount) {
    return s1.bridgeCount > s2.bridgeCount ? "R1" : "R2";
  }

  // 3. 最后才比总节点数
  if (s1.totalNodeCount !== s2.totalNodeCount) {
    return s1.totalNodeCount > s2.totalNodeCount ? "R1" : "R2";
  }

  return "R1";
}

function layoutPrimarySideMainChain(primarySide, nodes, edges) {
  const chains = extractMainChainForSide(primarySide, nodes, edges);

  const BASE_Y = 240;
  const BRANCH_GAP = 220;
  const LAYER_STEP = 90;

  chains.forEach((chain, branchIdx) => {
    let currentY = BASE_Y + branchIdx * BRANCH_GAP;
    const branchBaseY = BASE_Y + branchIdx * BRANCH_GAP;

    for (let i = 0; i < chain.length; i++) {
      const seg = chain[i];

      if (seg.kind === "main") {
        seg.node.y = currentY;
        seg.node.branchBaseY = branchBaseY;
        continue;
      }

      if (seg.kind === "bridge") {
        const prevMain = chain[i - 1]?.kind === "main" ? chain[i - 1].node : null;
        const nextMain = chain[i + 1]?.kind === "main" ? chain[i + 1].node : null;

        const bridgeY = currentY - LAYER_STEP;

        // x 不再由这里主导；只做保护性修正
        if (prevMain && nextMain) {
          seg.node.x = placeBridgeBetweenMains(prevMain, nextMain, 0.4);
        }

        seg.node.y = bridgeY;
        seg.node.branchBaseY = branchBaseY;

        // 后续 main 与 bridge 保持同层
        currentY = bridgeY;
      }
    }
  });
}

function layoutSecondarySideMainChain(primarySide, nodes, edges) {
  const secondarySide = primarySide === "R1" ? "R2" : "R1";
  const chains = extractMainChainForSide(secondarySide, nodes, edges);

  const BASE_Y = 240;
  const BRANCH_GAP = 220;
  const LAYER_STEP = 90;

  chains.forEach((chain, branchIdx) => {
    const mainItems = chain.filter(seg => seg.kind === "main").map(seg => seg.node);
    const sharedMainItems = mainItems.filter(n => n.r1_node != null && n.r2_node != null);

    const allShared = mainItems.length > 0 && sharedMainItems.length === mainItems.length;
    const noShared = sharedMainItems.length === 0;

    // 情况 A：这条 secondary chain 全是 shared
    // 说明位置已经由 primary 决定，这里不再重排
    if (allShared) {
      return;
    }

    const branchBaseY = BASE_Y + branchIdx * BRANCH_GAP;

    // 情况 C：完全没有 shared，当独立副轴链处理
    if (noShared) {
      let currentY = branchBaseY;

      for (let i = 0; i < chain.length; i++) {
        const seg = chain[i];

        if (seg.kind === "main") {
          if (seg.node.y == null || Number.isNaN(seg.node.y)) {
            seg.node.y = currentY;
          }
          seg.node.branchBaseY = branchBaseY;
          continue;
        }

        if (seg.kind === "bridge") {
          const prevMain = chain[i - 1]?.kind === "main" ? chain[i - 1].node : null;
          const nextMain = chain[i + 1]?.kind === "main" ? chain[i + 1].node : null;

          const bridgeY = currentY - LAYER_STEP;

          if (prevMain && nextMain) {
            seg.node.x = placeBridgeBetweenMains(prevMain, nextMain, 0.4);
          }

          seg.node.y = bridgeY;
          seg.node.branchBaseY = branchBaseY;

          // 后续 main 与 bridge 同层
          currentY = bridgeY;
        }
      }

      return;
    }

    // 情况 B：部分 shared、部分 only
    // x 已经在 assignAllNodeXByPrimaryRecipe() 里处理好了
    // 这里只处理 y / 升层
    let currentY = branchBaseY;

    for (let i = 0; i < chain.length; i++) {
      const seg = chain[i];

      if (seg.kind === "main") {
        // shared main 如果已有 y，就保留；only main 没有则补
        if (seg.node.y == null || Number.isNaN(seg.node.y)) {
          seg.node.y = currentY;
        }
        seg.node.branchBaseY = branchBaseY;
        continue;
      }

      if (seg.kind === "bridge") {
        const prevMain = chain[i - 1]?.kind === "main" ? chain[i - 1].node : null;
        const nextMain = chain[i + 1]?.kind === "main" ? chain[i + 1].node : null;

        const bridgeY = currentY - LAYER_STEP;

        if (prevMain && nextMain) {
          seg.node.x = placeBridgeBetweenMains(prevMain, nextMain, 0.4);
        }

        seg.node.y = bridgeY;
        seg.node.branchBaseY = branchBaseY;

        // 后续 main 与 bridge 同层
        currentY = bridgeY;
      }
    }
  });
}

function nodeOrderIndex(node) {
  const vals = [];
  if (node.r1_node != null) vals.push(Number(node.r1_node));
  if (node.r2_node != null) vals.push(Number(node.r2_node));
  return vals.length ? Math.min(...vals) : Number.MAX_SAFE_INTEGER;
}

function isMainBridgeNode(node, edges, nodeById) {
  if (!node) return false;
  if (node.domain === "main") return false;

  const inEdges = edges.filter(e => e.target === node.id);
  const outEdges = edges.filter(e => e.source === node.id);

  const hasMainIn = inEdges.some(e => {
    const s = nodeById.get(e.source);
    return s && s.domain === "main";
  });

  const hasMainOut = outEdges.some(e => {
    const t = nodeById.get(e.target);
    return t && t.domain === "main";
  });

  return hasMainIn && hasMainOut;
}

function getNextMainSegment(mainNode, edges, nodeById) {
  const outEdges = edges.filter(e => e.source === mainNode.id);

  // 1) main -> main
  for (const e of outEdges) {
    const t = nodeById.get(e.target);
    if (t && t.domain === "main") {
      return {
        type: "main-main",
        nextMain: t,
        bridge: null,
        edge: e
      };
    }
  }

  // 2) main -> aux/container -> main
  for (const e1 of outEdges) {
    const mid = nodeById.get(e1.target);
    if (!mid || mid.domain === "main") continue;

    const out2 = edges.filter(e => e.source === mid.id);
    for (const e2 of out2) {
      const t = nodeById.get(e2.target);
      if (t && t.domain === "main") {
        return {
          type: "main-bridge-main",
          nextMain: t,
          bridge: mid,
          edge1: e1,
          edge2: e2
        };
      }
    }
  }

  return null;
}

function collectMainBackbone(nodes, edges) {
  const nodeById = buildNodeById(nodes);
  const mains = sortByOriginalIndex(
    nodes.filter(n => n.domain === "main")
  );

  const backbone = [];
  const used = new Set();

  for (const m of mains) {
    if (used.has(m.id)) continue;

    backbone.push(m);
    used.add(m.id);

    let cur = m;
    while (true) {
      const seg = getNextMainSegment(cur, edges, nodeById);
      if (!seg || !seg.nextMain || used.has(seg.nextMain.id)) break;

      if (seg.bridge && !used.has(seg.bridge.id)) {
        backbone.push(seg.bridge);
        used.add(seg.bridge.id);
      }

      if (!used.has(seg.nextMain.id)) {
        backbone.push(seg.nextMain);
        used.add(seg.nextMain.id);
      }

      cur = seg.nextMain;
    }
  }

  return backbone;
}

function layoutMainBackboneStepped(backbone) {
  const MAIN_GAP = 150;
  const BRIDGE_GAP = 70;
  const LAYER_STEP = 90;
  const BASE_X = 120;
  const BASE_Y = 240;

  let currentX = BASE_X;
  let currentY = BASE_Y;

  for (let i = 0; i < backbone.length; i++) {
    const node = backbone[i];

    if (node.domain === "main") {
      node.x = currentX;
      node.y = currentY;
      currentX += MAIN_GAP;
      continue;
    }

    // bridge aux / container
    node.x = currentX - (MAIN_GAP - BRIDGE_GAP);
    node.y = currentY + LAYER_STEP;

    // 后续主链 main 切换到新的 y
    currentY += LAYER_STEP;
  }
}

function applyBranchBaseOffsets(nodes, branchInfo) {
  const BRANCH_GAP = 220;

  // 先按最小原始 index 排
  const mains = nodes
    .filter(n => n.domain === "main")
    .sort((a, b) => nodeOrderIndex(a) - nodeOrderIndex(b));

  mains.forEach((n, i) => {
    const offset = i * 0; // 先不按 main 单独分，branchInfo 真正接入后再扩
    if (n.y != null) n.y += offset;
  });
}

function originalIndex(node) {
  const vals = [];
  if (node?.r1_node != null) vals.push(Number(node.r1_node));
  if (node?.r2_node != null) vals.push(Number(node.r2_node));
  if (vals.length === 0) return Number.MAX_SAFE_INTEGER;
  return Math.min(...vals);
}

function sortByOriginalIndex(arr) {
  return [...arr].sort((a, b) => originalIndex(a) - originalIndex(b));
}

function buildInEdgeMap(edges) {
  const inMap = new Map();
  edges.forEach(e => {
    if (!inMap.has(e.target)) inMap.set(e.target, []);
    inMap.get(e.target).push(e);
  });
  return inMap;
}

function buildNodeById(nodes) {
  return new Map(nodes.map(n => [n.id, n]));
}

function isBridgeNode(node, edges, nodeById) {
  if (!node || node.domain === "main") return false;

  const inEdges = edges.filter(e => e.target === node.id);
  const outEdges = edges.filter(e => e.source === node.id);

  const hasMainIn = inEdges.some(e => {
    const s = nodeById.get(e.source);
    return s && s.domain === "main";
  });

  const hasMainOut = outEdges.some(e => {
    const t = nodeById.get(e.target);
    return t && t.domain === "main";
  });

  return hasMainIn && hasMainOut;
}

function getNextMainSegment(mainNode, edges, nodeById) {
  const outEdges = edges
    .filter(e => e.source === mainNode.id)
    .sort((a, b) => {
      const ta = nodeById.get(a.target);
      const tb = nodeById.get(b.target);
      return originalIndex(ta) - originalIndex(tb);
    });

  // 1) main -> main
  for (const e of outEdges) {
    const t = nodeById.get(e.target);
    if (t && t.domain === "main") {
      return {
        type: "main-main",
        nextMain: t,
        bridge: null,
        edge: e
      };
    }
  }

  // 2) main -> aux/container -> main
  for (const e1 of outEdges) {
    const mid = nodeById.get(e1.target);
    if (!mid || mid.domain === "main") continue;

    const out2 = edges
      .filter(e => e.source === mid.id)
      .sort((a, b) => {
        const ta = nodeById.get(a.target);
        const tb = nodeById.get(b.target);
        return originalIndex(ta) - originalIndex(tb);
      });

    for (const e2 of out2) {
      const t = nodeById.get(e2.target);
      if (t && t.domain === "main") {
        return {
          type: "main-bridge-main",
          nextMain: t,
          bridge: mid,
          edge1: e1,
          edge2: e2
        };
      }
    }
  }

  return null;
}

function collectBackboneNonMainNodes(nodes) {
  return sortByOriginalIndex(
    nodes.filter(n => n.domain !== "main" && n.x != null && n.y != null)
  );
}

function layoutNonMainUpstreamRecursively(nodes, edges) {
  const nodeById = buildNodeById(nodes);
  const inMap = buildInEdgeMap(edges);

  const ADD_DX = 34;
  const PROCESS_DX = 80;

  // add 三条固定轨道
  const ADD_Y_R1 = -36;
  const ADD_Y_SHARED = -18;
  const ADD_Y_R2 = 36;

  function isPlaced(n) {
    return n && n.x != null && n.y != null && !Number.isNaN(n.x) && !Number.isNaN(n.y);
  }

  function placeParents(curNode, visited = new Set()) {
    if (!curNode) return;
    if (visited.has(curNode.id)) return;
    visited.add(curNode.id);

    const parentItems = (inMap.get(curNode.id) || [])
      .map(e => ({ edge: e, node: nodeById.get(e.source) }))
      .filter(x => x.node && x.node.domain !== "main") // 上游继续排除 main
      .sort((a, b) => originalIndex(a.node) - originalIndex(b.node));

    let addIdxR1 = 0;
    let addIdxShared = 0;
    let addIdxR2 = 0;
    let processIdx = 0;

    for (const item of parentItems) {
      const parent = item.node;
      const edge = item.edge;

      if (isAddEdge(edge)) {
        // add 节点总是按轨道重排
        if (parent.kind === "only_r1") {
          parent.x = curNode.x - ADD_DX - addIdxR1 * ADD_DX;
          parent.y = curNode.y + ADD_Y_R1;
          addIdxR1 += 1;

        } else if (parent.kind === "only_r2") {
          parent.x = curNode.x - ADD_DX - addIdxR2 * ADD_DX;
          parent.y = curNode.y + ADD_Y_R2;
          addIdxR2 += 1;

        } else {
          parent.x = curNode.x - ADD_DX - addIdxShared * ADD_DX;
          parent.y = curNode.y + ADD_Y_SHARED;
          addIdxShared += 1;
        }

      } else {
        // process 节点：只在还没摆过时补位置
        if (!isPlaced(parent)) {
          parent.x = curNode.x - PROCESS_DX - processIdx * PROCESS_DX;
          parent.y = curNode.y;
          processIdx += 1;
        }
      }

      // 继续递归它的上游
      placeParents(parent, visited);
    }
  }

  // 关键：
  // seed 用“已经有坐标的主链节点”
  // 包括 main 和主链上的 bridge aux/container
  const seeds = sortByOriginalIndex(
    nodes.filter(n => isPlaced(n))
  );

  seeds.forEach(seed => placeParents(seed, new Set()));
}

function alignProcessChainsHorizontally(nodes, edges) {
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const outMap = buildOutMap(edges);
  const inMap = buildInEdgeMap(edges);

  function isStartNode(node) {
    if (!node || node.domain !== "main") return false;

    const preds = inMap.get(node.id) || [];
    return !preds.some(e => {
      const p = nodeById.get(e.source);
      return p && p.domain === "main";
    });
  }

  function chooseProcessNext(node) {
    const outs = (outMap.get(node.id) || [])
      .filter(e => isProcessEdge(e))
      .map(e => ({ edge: e, target: nodeById.get(e.target) }))
      .filter(x => x.target)
      .sort((a, b) => {
        const ai = Math.min(
          Number(a.target.r1_node ?? 999999),
          Number(a.target.r2_node ?? 999999)
        );
        const bi = Math.min(
          Number(b.target.r1_node ?? 999999),
          Number(b.target.r2_node ?? 999999)
        );
        return ai - bi;
      });

    return outs.length ? outs[0].target : null;
  }

  const starts = nodes
    .filter(isStartNode)
    .sort((a, b) => {
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

  const visited = new Set();

  starts.forEach(start => {
    const baseY = start.y;
    let cur = start;

    while (cur && !visited.has(cur.id)) {
      visited.add(cur.id);

      // 只把当前 process 主链节点拉回同一水平线
      cur.y = baseY;

      const next = chooseProcessNext(cur);
      if (!next) break;

      // 如果 next 是 process 主链节点，也拉平
      next.y = baseY;
      cur = next;
    }
  });
}

function softenAddSlopes(nodes, edges) {
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  edges.forEach(e => {
    if (!isAddEdge(e)) return;

    const s = nodeById.get(e.source);
    const t = nodeById.get(e.target);
    if (!s || !t) return;

    // 如果已经很接近，就直接拉平
    if (Math.abs(s.y - t.y) <= 20) {
      s.y = t.y;
    }
  });
}

function placeBridgeBetweenMains(prevMain, nextMain, bias = 0.4) {
  const left = Math.min(prevMain.x, nextMain.x);
  const right = Math.max(prevMain.x, nextMain.x);
  const PAD = 8;
  const x = left + (right - left) * bias;
  return Math.max(left + PAD, Math.min(right - PAD, x));
}

function choosePrimarySideByAllNodes(nodes) {
  const countR1 = nodes.filter(n => n.r1_node != null).length;
  const countR2 = nodes.filter(n => n.r2_node != null).length;
  return countR1 >= countR2 ? "R1" : "R2";
}

function sideNodeIndex(node, side) {
  if (!node) return Number.MAX_SAFE_INTEGER;
  if (side === "R1") return Number(node.r1_node ?? Number.MAX_SAFE_INTEGER);
  if (side === "R2") return Number(node.r2_node ?? Number.MAX_SAFE_INTEGER);
  return Number.MAX_SAFE_INTEGER;
}

function assignPrimaryAllNodeX(primarySide, nodes, edges) {
  const backbone = getPrimaryBackboneNodes(primarySide, nodes, edges);
  const backboneIds = new Set(backbone.map(n => n.id));

  // 先按 branch 内 backbone 均匀排
  assignPrimaryBackboneX(primarySide, nodes, edges);

  const ordered = nodes
    .filter(n => nodeHasSide(n, primarySide))
    .sort((a, b) => getSideIndex(a, primarySide) - getSideIndex(b, primarySide));

  const X_GAP = 140;

  let i = 0;
  while (i < ordered.length) {
    if (backboneIds.has(ordered[i].id)) {
      i += 1;
      continue;
    }

    const start = i;
    while (i < ordered.length && !backboneIds.has(ordered[i].id)) i++;
    const block = ordered.slice(start, i);

    const leftAnchor = start - 1 >= 0 ? ordered[start - 1] : null;
    const rightAnchor = i < ordered.length ? ordered[i] : null;

    const leftX = leftAnchor && leftAnchor.x != null ? leftAnchor.x : null;
    const rightX = rightAnchor && rightAnchor.x != null ? rightAnchor.x : null;

    if (leftX != null && rightX != null) {
      const step = (rightX - leftX) / (block.length + 1);
      block.forEach((n, idx) => {
        n.x = leftX + step * (idx + 1);
      });
    } else if (leftX != null && rightX == null) {
      block.forEach((n, idx) => {
        n.x = leftX + X_GAP * (idx + 1);
      });
    } else if (leftX == null && rightX != null) {
      block.forEach((n, idx) => {
        n.x = rightX - X_GAP * (block.length - idx);
      });
    } else {
      block.forEach((n, idx) => {
        n.x = 120 + idx * X_GAP;
      });
    }
  }
}

function insertSecondaryOnlyNodesByAllNodeOrder(primarySide, nodes) {
  const secondarySide = primarySide === "R1" ? "R2" : "R1";
  const X_GAP = 140;
  const BASE_X = 120;

  const ordered = nodes
    .filter(n => nodeHasSide(n, secondarySide))
    .sort((a, b) => getSideIndex(a, secondarySide) - getSideIndex(b, secondarySide));

  let i = 0;
  while (i < ordered.length) {
    if (isShareNode(ordered[i])) {
      i += 1;
      continue;
    }

    const start = i;
    while (i < ordered.length && !isShareNode(ordered[i])) i++;
    const block = ordered.slice(start, i);

    const leftShared = start - 1 >= 0 ? ordered[start - 1] : null;
    const rightShared = i < ordered.length ? ordered[i] : null;

    const leftX = leftShared && leftShared.x != null ? leftShared.x : null;
    const rightX = rightShared && rightShared.x != null ? rightShared.x : null;

    if (leftX != null && rightX != null) {
      const step = (rightX - leftX) / (block.length + 1);
      block.forEach((n, idx) => {
        n.x = leftX + step * (idx + 1);
      });
    } else if (leftX != null && rightX == null) {
      block.forEach((n, idx) => {
        n.x = leftX + X_GAP * (idx + 1);
      });
    } else if (leftX == null && rightX != null) {
      block.forEach((n, idx) => {
        n.x = rightX - X_GAP * (block.length - idx);
      });
    } else {
      block.forEach((n, idx) => {
        n.x = BASE_X + X_GAP * idx;
      });
    }
  }
}

function enforceSideMonotonicXByChains(nodes, edges, side, gap = 140) {
  const chains = extractMainChainForSide(side, nodes, edges);

  chains.forEach(chain => {
    const chainNodes = chain
      .map(seg => seg.node)
      .filter(Boolean)
      .sort((a, b) => getSideIndex(a, side) - getSideIndex(b, side));

    for (let i = 1; i < chainNodes.length; i++) {
      if (chainNodes[i].x <= chainNodes[i - 1].x) {
        chainNodes[i].x = chainNodes[i - 1].x + gap;
      }
    }
  });
}

function enforceBridgeXBetweenSourceTarget(nodes, edges) {
  const nodeById = buildNodeById(nodes);
  const outMap = buildOutEdgeMap(edges);

  function findNextMainFromBridge(bridge) {
    const outs = outMap.get(bridge.id) || [];
    const nextMain = outs
      .map(e => nodeById.get(e.target))
      .find(n => n && n.domain === "main");
    return nextMain || null;
  }

  nodes.forEach(node => {
    if (!node || node.domain === "main") return;

    const incoming = edges
      .filter(e => e.target === node.id)
      .map(e => nodeById.get(e.source))
      .filter(n => n && n.domain === "main");

    if (incoming.length === 0) return;

    const prevMain = incoming.sort((a, b) => a.x - b.x)[0];
    const nextMain = findNextMainFromBridge(node);

    if (prevMain && nextMain && prevMain.x != null && nextMain.x != null) {
      node.x = placeBridgeBetweenMains(prevMain, nextMain, 0.4);
    }
  });
}


function applySeparateRecipeOffset(nodes, graph) {
  if (!graph.separate_layout) return;

  const GAP = 200;

  for (const n of nodes) {
    const hasR1 = n.r1_node != null;
    const hasR2 = n.r2_node != null;

    // 只属于 R2 的节点整体往下挪
    if (hasR2 && !hasR1) {
      n.y += GAP;
    }
  }
}

function getPrimaryBackboneNodes(primarySide, nodes, edges) {
  const chains = extractMainChainForSide(primarySide, nodes, edges);
  const backbone = [];

  chains.forEach(chain => {
    chain.forEach(seg => {
      if (seg?.node) backbone.push(seg.node);
    });
  });

  const seen = new Set();
  return backbone.filter(n => {
    if (!n || seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });
}

function assignPrimaryBackboneX(primarySide, nodes, edges) {
  const chains = extractMainChainForSide(primarySide, nodes, edges);

  const BASE_X = 120;
  const BACKBONE_GAP = 180;
  const BRANCH_START_OFFSET = 22; // 不同 branch 只轻微错开起点

  chains.forEach((chain, branchIdx) => {
    const branchNodes = chain
      .map(seg => seg.node)
      .filter(Boolean)
      .sort((a, b) => getSideIndex(a, primarySide) - getSideIndex(b, primarySide));

    const startX = BASE_X + branchIdx * BRANCH_START_OFFSET;

    branchNodes.forEach((n, i) => {
      n.x = startX + i * BACKBONE_GAP;
    });
  });
}

function assignAllNodeXByPrimaryRecipe(nodes, edges) {
  const primarySide = choosePrimarySideByStructure(nodes, edges);

  nodes.forEach(n => {
    n.x = null;
  });

  assignPrimaryAllNodeX(primarySide, nodes, edges);
  insertSecondaryOnlyNodesByAllNodeOrder(primarySide, nodes);

  enforceSideMonotonicXByChains(nodes, edges, "R1");
  enforceSideMonotonicXByChains(nodes, edges, "R2");
  enforceBridgeXBetweenSourceTarget(nodes, edges);

  return primarySide;
}

function applySeparateRecipeOffset(nodes, graph) {
  if (!graph.separate_layout) return;

  const GAP = 200;

  for (const n of nodes) {
    const hasR1 = n.r1_node != null;
    const hasR2 = n.r2_node != null;

    // 只属于 R2 的节点整体往下挪
    if (hasR2 && !hasR1) {
      n.y += GAP;
    }
  }
}

function hasRealContainerName(v) {
  return v != null && String(v).trim().toLowerCase() !== "none" && String(v).trim() !== "";
}

function isContainerLikeAuxNode(node) {
  if (!node) return false;
  return node.domain === "aux" && (
    hasRealContainerName(node.container_r1) ||
    hasRealContainerName(node.container_r2)
  );
}

// ============================================================
//  NEW BRANCH LAYOUT ENGINE
//  Replaces: assignAllNodeXByPrimaryRecipe, layoutPrimarySideMainChain,
//            layoutSecondarySideMainChain, applyRecipeBranchOffsets,
//            assignAuxRelativeToBranch, commitAuxFromBranch,
//            layoutNonMainUpstreamRecursively, alignProcessChainsHorizontally,
//            fallbackAuxPositions, enforceSideMonotonicXByChains,
//            enforceBridgeXBetweenSourceTarget, insertSecondaryOnlyNodesByAllNodeOrder,
//            assignPrimaryAllNodeX, assignPrimaryBackboneX, getPrimaryBackboneNodes,
//            relayoutSubtreeXBySide, commitCandidateX, applyRecipeBranchOffsets,
//            alignOnlyNodesToDumbbell, propagateOnlyChainY, findNearestDumbbellOnSide,
//            spreadNonShareTargetsInternally, computeBranchAxisTargets,
//            propagateAxisYBySide, initializeAxisY, applyNodeYFromAxis
// ============================================================
 
// ─────────────────────────────────────────────
// § 1  Graph traversal helpers (self-contained)
// ─────────────────────────────────────────────
 
function nb_buildNodeById(nodes) {
  return new Map(nodes.map(n => [n.id, n]));
}
 
function nb_buildOutMap(edges) {
  const m = new Map();
  edges.forEach(e => {
    if (!m.has(e.source)) m.set(e.source, []);
    m.get(e.source).push(e);
  });
  return m;
}
 
function nb_buildInMap(edges) {
  const m = new Map();
  edges.forEach(e => {
    if (!m.has(e.target)) m.set(e.target, []);
    m.get(e.target).push(e);
  });
  return m;
}
 
// Minimum recipe-order index of a node
function nb_nodeIdx(node) {
  const vals = [];
  if (node?.r1_node != null) vals.push(Number(node.r1_node));
  if (node?.r2_node != null) vals.push(Number(node.r2_node));
  return vals.length ? Math.min(...vals) : Number.MAX_SAFE_INTEGER;
}
 
function nb_isMain(node) {
  return node && node.domain === "main" && !isContainerNode(node);
}
 
function nb_isContainer(node) {
  return node && isContainerNode(node);
}
 
function nb_isAux(node) {
  return node && node.domain === "aux";
}
 
// Process-edge predecessor ids of a node (excludes add-edges)
function nb_processParents(nodeId, inMap, nodeById) {
  return (inMap.get(nodeId) || [])
    .filter(e => !isAddEdge(e))
    .map(e => nodeById.get(e.source))
    .filter(Boolean);
}
 
// Process-edge successor ids of a node
function nb_processChildren(nodeId, outMap, nodeById) {
  return (outMap.get(nodeId) || [])
    .filter(e => !isAddEdge(e))
    .map(e => nodeById.get(e.target))
    .filter(Boolean);
}
 
// Add-edge sources feeding into a node
function nb_addSources(nodeId, inMap, nodeById) {
  return (inMap.get(nodeId) || [])
    .filter(e => isAddEdge(e))
    .map(e => nodeById.get(e.source))
    .filter(Boolean);
}
 
// ─────────────────────────────────────────────
// § 2  Branch detection
// ─────────────────────────────────────────────
 
/*
  BRANCH TYPE 1 – "Main-led"
  ───────────────────────────
  Anchor: a single main node (or a merged_exact/merged_similar that
  functions as one unique main ingredient).
  Spine: that main node  +  any container nodes reachable by process
         edges whose process-predecessor is that main (or another
         container already in the spine), with node indices always
         increasing along the chain.
  Rule: a container node is only included if its direct process-parent
        is already in the spine (no orphaned containers).
 
  BRANCH TYPE 2 – "Container-led"
  ────────────────────────────────
  Spine: a chain of container nodes where the FIRST node in the chain
         has NO main-node process-predecessor (i.e. it starts "cold").
  The chain follows process edges between containers, indices increasing.
 
  De-duplication: if a container node appears in a Type-1 branch,
  remove it from any Type-2 branch.
*/

function sameIngredient(a, b) {
  const getName = n => {
    const s = n.state_r1 || n.state_r2;
    return s ? String(s[0]).toLowerCase().trim() : null;
  };

  return getName(a) && getName(a) === getName(b);
}

function nb_detectBranches(nodes, edges) {
  const nodeById = nb_buildNodeById(nodes);
  const outMap   = nb_buildOutMap(edges);
  const inMap    = nb_buildInMap(edges);

  const branches = [];
  const used = new Set();

  function isMainLike(n) {
    return nb_isMain(n) || nb_isContainer(n);
  }

  function getProcessChildren(node) {
    return (outMap.get(node.id) || [])
      .filter(e => !isAddEdge(e))
      .map(e => nodeById.get(e.target))
      .filter(Boolean);
  }

  function getProcessParents(node) {
    return (inMap.get(node.id) || [])
      .filter(e => !isAddEdge(e))
      .map(e => nodeById.get(e.source))
      .filter(Boolean);
  }

  // ⭐⭐⭐ 核心新增：flow continuity 判断
  function isSameFlow(prevNode, nextNode) {
    if (!prevNode || !nextNode) return false;

    // 1️⃣ 必须是唯一 child（不能分叉）
    const children = getProcessChildren(prevNode)
      .filter(isMainLike);

    if (children.length !== 1) return false;
    if (children[0].id !== nextNode.id) return false;

    // 2️⃣ next 不能有多个 main/container parent（避免 merge）
    const parents = getProcessParents(nextNode)
      .filter(isMainLike);

    if (parents.length > 1) return false;

    return true;
  }

  // ─────────────────────────────────────────────
  // STEP 1: 主链构建（允许 name 变化）
  // ─────────────────────────────────────────────
  const mainLikeNodes = nodes
    .filter(isMainLike)
    .sort((a, b) => nb_nodeIdx(a) - nb_nodeIdx(b));

  mainLikeNodes.forEach(start => {
    if (used.has(start.id)) return;

    const spine = [start];
    used.add(start.id);

    let cur = start;

    while (true) {
      const children = getProcessChildren(cur)
        .filter(isMainLike)
        .sort((a, b) => nb_nodeIdx(a) - nb_nodeIdx(b));

      if (children.length !== 1) break;

      const next = children[0];

      // ⭐⭐⭐ 关键：flow continuity 判断
      if (!sameIngredient(cur, next) && !isSameFlow(cur, next)) break;

      spine.push(next);
      used.add(next.id);

      cur = next;
    }

    branches.push({
      type: 1,
      spine,
      index: null
    });
  });

  // ─────────────────────────────────────────────
  // STEP 2: container-only branch（无 upstream main）
  // ─────────────────────────────────────────────
  nodes.forEach(n => {
    if (!nb_isContainer(n)) return;
    if (used.has(n.id)) return;

    const parents = getProcessParents(n);
    const hasMainUpstream = parents.some(nb_isMain);

    if (!hasMainUpstream) {
      used.add(n.id);
      branches.push({
        type: 2,
        spine: [n],
        index: null
      });
    }
  });

  // ─────────────────────────────────────────────
  // STEP 3: 排序 branch（top → bottom）
  // ─────────────────────────────────────────────
  branches.sort((a, b) =>
    nb_nodeIdx(a.spine[0]) - nb_nodeIdx(b.spine[0])
  );

  branches.forEach((b, i) => {
    b.index = i;

    // 保证 branch 内 left → right
    b.spine.sort((x, y) => nb_nodeIdx(x) - nb_nodeIdx(y));
  });

  return branches;
}
 
// ─────────────────────────────────────────────
// § 3  Aux attachment
// ─────────────────────────────────────────────
 
/*
  For each spine node (main or container), collect all aux nodes
  that reach it via add-edges (direct or chained through other aux).
  Also collect aux nodes that are process-parents of spine nodes
  but are NOT spine nodes themselves.
*/
 
function nb_collectAuxForSpineNode(spineNodeId, inMap, nodeById, spineSet) {
  const result = [];
  const visited = new Set();
 
  function dfs(id) {
    if (visited.has(id)) return;
    visited.add(id);
 
    const parents = (inMap.get(id) || [])
      .map(e => ({ edge: e, node: nodeById.get(e.source) }))
      .filter(x => x.node && !spineSet.has(x.node.id));
 
    for (const { edge, node } of parents) {
      if (nb_isAux(node)) {
        if (!result.find(n => n.id === node.id)) result.push(node);
        dfs(node.id); // recurse up aux chain
      }
    }
  }
 
  dfs(spineNodeId);
  return result;
}
 
// ─────────────────────────────────────────────
// § 4  Position assignment
// ─────────────────────────────────────────────
 
const NB_BRANCH_Y_GAP    = 400;   // vertical gap between branches
const NB_BASE_Y          = 180;   // Y of branch index 0
const NB_SPINE_X_GAP     = 130;   // horizontal gap between spine nodes
const NB_BRANCH_X_SHIFT  = 40;    // extra X shift per branch index (legacy)
const NB_BASE_X          = 120;   // base X for branch 0

// Aux layout constants
const NB_AUX_DX          = 38;    // horizontal step per aux node upstream
const NB_AUX_SLOPE_Y_R1  = -32;   // Y offset for only_r1 aux above spine (legacy)
const NB_AUX_SLOPE_Y_R2  =  32;   // Y offset for only_r2 aux below spine (legacy)
const NB_AUX_SLOPE_Y_SH  = -20;   // Y offset for shared aux (legacy)
const NB_AUX_ROW_GAP     = 22;    // extra Y per overflow row of aux
const NB_AUX_CROSS_EXTRA = 6;     // extra Y gap when cross-branch merging
const NB_AUX_HORIZ_JITTER = 8;    // Y jitter separating R1/R2 aux on horizontal branch

function nb_assignPositions(branches, nodes, edges) {
  const nodeById = nb_buildNodeById(nodes);
  const inMap    = nb_buildInMap(edges);

  // Mark all spine node ids across all branches for aux lookup
  const globalSpineSet = new Set();
  branches.forEach(br => br.spine.forEach(n => globalSpineSet.add(n.id)));

  branches.forEach(br => {
    const branchY = NB_BASE_Y + br.index * NB_BRANCH_Y_GAP;
    const baseX   = NB_BASE_X + br.index * NB_BRANCH_X_SHIFT;

    // ── Spine positions (same Y, increasing X) ──────────────
    br.spine.forEach((node, i) => {
      node.x = baseX + i * NB_SPINE_X_GAP;
      node.y = branchY;
    });

    // ── Aux positions ────────────────────────────────────────
    // For each spine node, place its aux cluster
    const spineSet = new Set(br.spine.map(n => n.id));

    br.spine.forEach(spineNode => {
      const auxNodes = nb_collectAuxForSpineNode(
        spineNode.id, inMap, nodeById, globalSpineSet
      );

      if (auxNodes.length === 0) return;

      // Split by recipe side
      const r1Aux = auxNodes.filter(n => n.kind === "only_r1");
      const r2Aux = auxNodes.filter(n => n.kind === "only_r2");
      const shAux = auxNodes.filter(n => n.kind !== "only_r1" && n.kind !== "only_r2");

      // Sort each group by their node index (ascending → place closest to spine first)
      [r1Aux, r2Aux, shAux].forEach(group =>
        group.sort((a, b) => nb_nodeIdx(a) - nb_nodeIdx(b))
      );

      function placeAuxGroup(group, baseSlope, rowDir) {
        // Overflow: if >5 per row, wrap
        const MAX_ROW = 5;
        group.forEach((aux, i) => {
          const row = Math.floor(i / MAX_ROW);
          const col = i % MAX_ROW;
          aux.x = spineNode.x - NB_AUX_DX * (col + 1);
          aux.y = spineNode.y + baseSlope + row * NB_AUX_ROW_GAP * rowDir;
        });
      }

      placeAuxGroup(r1Aux, NB_AUX_SLOPE_Y_R1, -1);
      placeAuxGroup(r2Aux, NB_AUX_SLOPE_Y_R2,  1);
      placeAuxGroup(shAux, NB_AUX_SLOPE_Y_SH, -1);
    });
  });
 
  // ── Fallback for any node still unpositioned ─────────────
  let fallbackX = NB_BASE_X;
  nodes.forEach(n => {
    if (n.x == null || n.y == null || Number.isNaN(n.x) || Number.isNaN(n.y)) {
      n.x = fallbackX;
      n.y = NB_BASE_Y + branches.length * NB_BRANCH_Y_GAP;
      fallbackX += 50;
    }
  });
}
 
// ─────────────────────────────────────────────
// § 5  Public entry point
// ─────────────────────────────────────────────
 
/*
  Call this instead of the old chain of layout functions inside renderGraph.
 
  Returns the detected branches array (useful for debugging).
 
  Usage inside renderGraph, replace everything from:
    const primarySide = assignAllNodeXByPrimaryRecipe(nodes, edges);
    layoutPrimarySideMainChain(...)
    ...
    fallbackAuxPositions(nodes);
 
  With:
    const branches = newBranchLayout(nodes, edges, graph);
*/
function newBranchLayout(nodes, edges, graph) {
  nodes.forEach(n => { n.x = null; n.y = null; });

  const nodeById = new Map(nodes.map(n => [n.id, n]));

  // halfOffset: distance from dumbbell center to each circle's center
  // For main nodes: outerR=24 → halfOffset=25; aux: outerR=11 → halfOffset=12
  const mainHalfOffset = getHalfOffsetForNode({ domain: "main", kind: "merged_similar" });
  const auxHalfOffset  = getHalfOffsetForNode({ domain: "aux",  kind: "merged_similar" });

  const mainNodes = nodes.filter(n => nb_isMain(n) || nb_isContainer(n));
  const mainIds   = new Set(mainNodes.map(n => n.id));

  // ── Step 1: Deduplicate edges by source→target ──────────────────────────────────
  const seenEdge  = new Set();
  const edgesDedup = [];
  for (const e of edges) {
    const key = e.source + "→" + e.target;
    if (!seenEdge.has(key)) { seenEdge.add(key); edgesDedup.push(e); }
  }

  // ── Step 2: Global topological levels (Kahn's BFS, ghost-node guarded) ──
  const nodeIds  = new Set(nodes.map(n => n.id));
  const outAll   = new Map(nodes.map(n => [n.id, []]));
  const inDegAll = new Map(nodes.map(n => [n.id, 0]));
  for (const e of edgesDedup) {
    if (!nodeIds.has(e.source)) continue;   // skip ghost nodes not in node list
    outAll.get(e.source).push(e.target);
    if (inDegAll.has(e.target)) inDegAll.set(e.target, (inDegAll.get(e.target) || 0) + 1);
  }
  const globalLevel = new Map(nodes.map(n => [n.id, 0]));
  const inWork = new Map(inDegAll);
  const topoQ  = nodes.filter(n => (inWork.get(n.id) || 0) === 0).map(n => n.id);
  while (topoQ.length) {
    const id = topoQ.shift();
    for (const next of (outAll.get(id) || [])) {
      const nl = (globalLevel.get(id) || 0) + 1;
      if (nl > (globalLevel.get(next) || 0)) globalLevel.set(next, nl);
      const d = (inWork.get(next) || 1) - 1;
      inWork.set(next, d);
      if (d <= 0) topoQ.push(next);
    }
  }

  // ── Step 3: Connected components via process-edge BFS over all node types ──
  // Rules:
  //  • Process edge same-kind (merged↔merged, only↔only) → same branch.
  //  • Process edge only_r1/only_r2 → merged_* where source has no merged process-predecessor
  //      → cross-branch (source is a parallel-only chain feeding into the merged spine).
  //  • Process edge only_r1/only_r2 → merged_* where source HAS a merged process-predecessor
  //      → same branch (source is inline on the merged spine, e.g. M7 after M6).
  //  • Process edge merged_* → only_r1/only_r2 → same branch always.
  //  • Add edge into a merged container (merged_exact / merged_similar) → always cross-branch.
  //  • Add edge into an only_r1/only_r2 container with exactly 1 incoming add → same branch.
  //  • Add edge into an only_r1/only_r2 container with 2+ incoming adds → cross-branch.
  //  • Add edges into non-container nodes → cross-branch.

  // Count incoming add edges per container.
  const containerAddInCount = new Map();
  for (const e of edgesDedup) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    if (!isAddEdge(e)) continue;
    const tgt = nodeById.get(e.target);
    if (tgt && nb_isContainer(tgt)) {
      containerAddInCount.set(e.target, (containerAddInCount.get(e.target) || 0) + 1);
    }
  }

  // Build process-only in-map for containers (to find chain origins).
  const containerProcessIn = new Map(nodes.map(n => [n.id, []]));
  for (const e of edgesDedup) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    if (isAddEdge(e)) continue;
    const tgt = nodeById.get(e.target);
    if (tgt && nb_isContainer(tgt)) {
      containerProcessIn.get(e.target).push(e.source);
    }
  }

  // Walk backward through container→container process edges to find chain origin.
  function containerChainOrigin(startId) {
    let cur = startId;
    const seen = new Set();
    while (!seen.has(cur)) {
      seen.add(cur);
      const containerParents = (containerProcessIn.get(cur) || [])
        .filter(id => { const n = nodeById.get(id); return n && nb_isContainer(n); });
      if (containerParents.length === 0) return cur;
      cur = containerParents[0];
    }
    return cur;
  }

  // Compute non-empty for each container — prior-ancestors-only rule:
  //
  //   A container is non-empty ⟺ at least one container BEFORE it in the chain
  //   (i.e., an ancestor via container→container process edges) has ≥1 add edge.
  //   The current container's own add edges are IGNORED for this determination.
  //
  //   • con1 (chain-first, no prior containers): always empty.
  //   • con4 (continuation): non-empty iff any of con1/con2/con3 has adds,
  //     regardless of whether con4 itself has any adds.
  //
  //   Computed with memoised recursion:
  //     non-empty(c) = parentHasAdds(c) OR non-empty(parent(c))
  const containerNonEmpty = new Map();
  function computeContainerNonEmpty(id, inProgress = new Set()) {
    if (containerNonEmpty.has(id)) return containerNonEmpty.get(id);
    if (inProgress.has(id)) return false; // cycle guard
    inProgress.add(id);

    const containerParents = (containerProcessIn.get(id) || [])
      .filter(pid => { const p = nodeById.get(pid); return p && nb_isContainer(p); });

    if (containerParents.length === 0) {
      // Chain-first: no prior container → always empty
      containerNonEmpty.set(id, false);
      return false;
    }

    // Non-empty if any direct container parent has adds OR is itself non-empty
    let result = false;
    for (const pid of containerParents) {
      const parentHasAdds = edgesDedup.some(
        e => e.target === pid && isAddEdge(e) && nodeIds.has(e.source)
      );
      if (parentHasAdds || computeContainerNonEmpty(pid, inProgress)) {
        result = true;
        break;
      }
    }
    containerNonEmpty.set(id, result);
    return result;
  }
  nodes.forEach(n => {
    if (!nb_isContainer(n)) return;
    computeContainerNonEmpty(n.id);
  });

  // ── Debug: print all container aux nodes with empty/non-empty status ────────
  {
    const containerNodes = nodes.filter(n => nb_isContainer(n));
    if (containerNodes.length > 0) {
      console.log(`[container-debug] total containers: ${containerNodes.length}`);
      containerNodes.forEach(n => {
        const isEmpty = !containerNonEmpty.get(n.id);
        const procParents = (containerProcessIn.get(n.id) || []);
        const addCount = containerAddInCount.get(n.id) || 0;
        const contParents = procParents.filter(pid => { const p = nodeById.get(pid); return p && nb_isContainer(p); });
        const nonContParents = procParents.filter(pid => { const p = nodeById.get(pid); return p && !nb_isContainer(p); });
        console.log(
          `[container] ${n.id}(${n.kind}) → ${isEmpty ? "EMPTY" : "NON-EMPTY"}` +
          ` | addIns=${addCount}` +
          ` | contParents=[${contParents.join(",")}]` +
          ` | nonContParents=[${nonContParents.join(",")}]`
        );
      });
    }
  }

  // Precompute: which only_r1/only_r2 nodes are "inline" on the merged spine.
  // An inline only-node's process edge to a merged node is same-branch (not cross).
  //
  // Three sources of inline status:
  //   1. Direct: node receives a process edge FROM a merged node
  //
  // Empty containers (of any kind) are treated as same-branch in adjAll directly.
  // Only non-empty containers represent a truly separate branch being merged in.
  const onlyHasMergedProcIn = new Set();

  // Pass 1: direct merged→only process connections
  for (const e of edgesDedup) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    if (isAddEdge(e)) continue;
    const src = nodeById.get(e.source);
    const tgt = nodeById.get(e.target);
    if (!src || !tgt) continue;
    const srcIsMerged = src.kind === "merged_exact" || src.kind === "merged_similar";
    const tgtIsOnly   = tgt.kind === "only_r1" || tgt.kind === "only_r2";
    if (srcIsMerged && tgtIsOnly) onlyHasMergedProcIn.add(tgt.id);
  }

  const adjAll = new Map(nodes.map(n => [n.id, new Set()]));
  for (const e of edgesDedup) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    if (isAddEdge(e)) {
      const tgt = nodeById.get(e.target);
      if (!tgt || !nb_isContainer(tgt)) continue;   // add → non-container → cross
      if (containerNonEmpty.get(tgt.id)) continue;  // add → non-empty container → cross
      // Falls through: add → empty container (any kind: merged or only) → same branch
    } else {
      // Process edge: only→merged is cross when src is not inline on the merged spine.
      const src = nodeById.get(e.source);
      const tgt = nodeById.get(e.target);
      if (src && tgt) {
        const srcIsOnly   = src.kind === "only_r1" || src.kind === "only_r2";
        const tgtIsMerged = tgt.kind === "merged_exact" || tgt.kind === "merged_similar";
        if (srcIsOnly && tgtIsMerged && !onlyHasMergedProcIn.has(e.source)) {
          // Cross — unless src is an empty container (same branch)
          const srcIsEmptyContainer = nb_isContainer(src) && !containerNonEmpty.get(src.id);
          if (!srcIsEmptyContainer) continue;
        }
      }
    }
    adjAll.get(e.source).add(e.target);
    adjAll.get(e.target).add(e.source);
  }
  const compOf = new Map();
  let nextComp = 0;
  function bfsComp(startId, comp) {
    const q = [startId];
    while (q.length) {
      const id = q.shift();
      if (compOf.has(id)) continue;
      compOf.set(id, comp);
      for (const nb of (adjAll.get(id) || [])) if (!compOf.has(nb)) q.push(nb);
    }
  }
  for (const n of nodes) if (!compOf.has(n.id)) bfsComp(n.id, nextComp++);

  const compGroups = new Map();
  for (const n of mainNodes) {
    const c = compOf.get(n.id) ?? 0;
    if (!compGroups.has(c)) compGroups.set(c, []);
    compGroups.get(c).push(n.id);
  }
  // Sort components by earliest topo level → top row first
  const compOrder = [...compGroups.keys()].sort((a, b) => {
    const minLvl = ids => Math.min(...ids.map(id => globalLevel.get(id) || 0));
    return minLvl(compGroups.get(a)) - minLvl(compGroups.get(b));
  });
  // ── Step 4: Assign X and Y ──────────────────────────────────────────────
  // Vertical layout rule:
  //   • Merged/shared branches  → center zone, stacked downward from NB_BASE_Y
  //   • only_r1 branches        → ABOVE NB_BASE_Y, stacked upward
  //   • only_r2 branches        → BELOW merged, stacked downward
  // A component is "r1" if it contains only_r1 nodes and no only_r2; "r2" vice-versa;
  // otherwise "merged" (has merged nodes or a cross-kind mix).

  function compKind(comp) {
    const ids = compGroups.get(comp) || [];
    let r1 = 0, r2 = 0;
    for (const id of ids) {
      const n = nodeById.get(id);
      if (!n) continue;
      // Any merged node in the comp → definitively a "merged" comp,
      // regardless of how many only_r1/only_r2 nodes are also present.
      if (n.kind === "merged_exact" || n.kind === "merged_similar") return "merged";
      if (n.kind === "only_r1") r1++;
      else if (n.kind === "only_r2") r2++;
    }
    if (r1 > 0 && r2 === 0) return "r1";
    if (r2 > 0 && r1 === 0) return "r2";
    return "merged";
  }

  // compOrder is already sorted by min topo level.
  const mergedComps = compOrder.filter(c => compKind(c) === "merged");
  const r1Comps     = compOrder.filter(c => compKind(c) === "r1");
  const r2Comps     = compOrder.filter(c => compKind(c) === "r2");

  const compCenterY = new Map();

  // ── Non-overlap spacing based on actual node visual sizes ──────────────────
  // Main node: outerR=24, dumbbell halfOffset=25 (outerR+1)
  // Merged comp visual half-height from its center: halfOff_m + outerR_m = 49
  // R1/R2-only comp visual half-height: outerR_m = 24
  const outerR_m     = 24;   // main node outer radius
  const halfOff_m    = 25;   // main dumbbell halfOffset
  const BRANCH_MARGIN = 80;  // minimum visual gap (px) between edges of adjacent branches

  // Step between two consecutive r1/r2-only comps (circle nodes only)
  const onlyBranchStep  = 2 * outerR_m + BRANCH_MARGIN;   // 128 px

  // Step from a merged comp's center to an adjacent r1/r2-only comp's center
  //   merged visual edge: (halfOff_m + outerR_m) = 49
  //   r1/r2 node radius: outerR_m = 24
  //   center-to-center: 49 + BRANCH_MARGIN + 24 = 153 px
  const mergedToOnlyStep = halfOff_m + outerR_m + BRANCH_MARGIN + outerR_m;  // 153

  // Step between two consecutive merged comps
  //   each has visual half-height (halfOff_m + outerR_m) = 49
  //   center-to-center: 49 + BRANCH_MARGIN + 49 = 178 px
  const mergedBranchStep = 2 * (halfOff_m + outerR_m) + BRANCH_MARGIN;       // 178

  if (mergedComps.length === 0) {
    // No merged branches: stack all pure r1/r2 comps downward from NB_BASE_Y
    [...r1Comps, ...r2Comps].forEach((comp, i) => {
      compCenterY.set(comp, NB_BASE_Y + i * onlyBranchStep);
    });
  } else {
    // ── Merged comps: downward from NB_BASE_Y ──────────────────────────────
    mergedComps.forEach((comp, i) => {
      compCenterY.set(comp, NB_BASE_Y + i * mergedBranchStep);
    });

    const firstMergedY = NB_BASE_Y;
    const lastMergedY  = NB_BASE_Y + (mergedComps.length - 1) * mergedBranchStep;

    // ── R1 comps: stack UPWARD from first merged comp ─────────────────────
    // r1Comps is in ascending topo order (index 0 = lowest topo = "branch1").
    // Rule: branch1 (lowest topo) is closest to merged = bottom of R1 stack.
    //   → r1Comps[0] gets the HIGHEST Y (closest to merged top)
    //   → r1Comps[N-1] gets the LOWEST Y (furthest above)
    // Add edge from r1Comps[i] → r1Comps[i+1] goes upward (↑) = diagonal ✓
    // Final add from r1Comps[N-1] → merged container goes downward (↓) = diagonal ✓
    const r1ClosestY = firstMergedY - mergedToOnlyStep;
    r1Comps.forEach((comp, i) => {
      compCenterY.set(comp, r1ClosestY - i * onlyBranchStep);
    });

    // ── R2 comps: stack DOWNWARD from last merged comp ────────────────────
    // r2Comps[0] (lowest topo = "branch1") is CLOSEST to merged = top of R2 stack.
    //   → r2Comps[0] gets the SMALLEST Y (closest to merged bottom)
    //   → r2Comps[N-1] gets the LARGEST Y (furthest below)
    // "From bottom to top: N, N-1, ..., 1" ↔ "从下到上是321" ✓
    const r2ClosestY = lastMergedY + mergedToOnlyStep;
    r2Comps.forEach((comp, i) => {
      compCenterY.set(comp, r2ClosestY + i * onlyBranchStep);
    });
  }

  compOrder.forEach(comp => {
    const centerY = compCenterY.get(comp) ?? NB_BASE_Y;
    const ck = compKind(comp);
    for (const id of (compGroups.get(comp) || [])) {
      const node = nodeById.get(id);
      if (!node) continue;
      node.x = NB_BASE_X + (globalLevel.get(id) || 0) * NB_SPINE_X_GAP;
      if (ck === "merged") {
        if (node.kind === "only_r1")      node.y = centerY - mainHalfOffset;
        else if (node.kind === "only_r2") node.y = centerY + mainHalfOffset;
        else                              node.y = centerY;
      } else {
        node.y = centerY;
      }
    }
  });

  // ── Step 4f: Intra-comp fork Y spreading ──────────────────────────────────────
  // Rules:
  //  • In a "merged" comp, only merged_* children that are NOT junction nodes
  //    (junction = has outgoing intra-comp add edges) count as real fork branches.
  //  • only_r1/only_r2 children and junction nodes inherit their parent's yOff;
  //    the ±mainHalfOffset already visually separates only_* nodes at render time.
  //  • After BFS, junction nodes get their yOff pulled halfway toward their
  //    add-target's yOff, so they visually "route" toward the destination branch.
  //  • X-alignment of fork siblings is skipped for any node whose move would
  //    push it past an add-edge target (which would reverse that edge direction).
  {
    const mergedKindSet = new Set(['merged_exact', 'merged_similar']);

    for (const comp of compOrder) {
      const ids = compGroups.get(comp) || [];
      if (ids.length <= 1) continue;

      const idSet  = new Set(ids);
      const ck     = compKind(comp);
      const centerY = compCenterY.get(comp) ?? NB_BASE_Y;

      // Build intra-comp outgoing process adjacency and in-degree
      const procOut    = new Map(ids.map(id => [id, []]));
      const inDegIntra = new Map(ids.map(id => [id, 0]));
      for (const e of edgesDedup) {
        if (isAddEdge(e)) continue;
        if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
        procOut.get(e.source).push(e.target);
        inDegIntra.set(e.target, inDegIntra.get(e.target) + 1);
      }

      // Skip comp if no intra-comp fork exists
      if (!ids.some(id => procOut.get(id).length >= 2)) continue;

      const yOff      = new Map(ids.map(id => [id, 0]));
      const forkGroups = [];
      const queue      = ids.filter(id => inDegIntra.get(id) === 0);
      const forkStep   = mergedBranchStep;

      while (queue.length > 0) {
        const id       = queue.shift();
        const children = procOut.get(id) || [];
        const parentOff = yOff.get(id) ?? 0;

        // Partition children into true fork branches vs. "side" nodes that inherit Y.
        let trueKids = children;
        let sideKids = [];

        if (ck === 'merged' && children.length >= 2) {
          // only_r1/r2 nodes are always "side" (mainHalfOffset handles visual offset)
          const mergedKids = children.filter(cid => {
            const cn = nodeById.get(cid);
            return cn && mergedKindSet.has(cn.kind);
          });
          // Junction merged nodes (those that add INTO another comp node) are "side"
          const junctionKids = mergedKids.filter(cid =>
            edgesDedup.some(e => isAddEdge(e) && e.source === cid && idSet.has(e.target))
          );
          const contKids = mergedKids.filter(cid =>
            !edgesDedup.some(e => isAddEdge(e) && e.source === cid && idSet.has(e.target))
          );
          sideKids = [
            ...children.filter(cid => { const cn = nodeById.get(cid); return cn && !mergedKindSet.has(cn.kind); }),
            ...junctionKids
          ];
          trueKids = contKids;
        }

        const n = trueKids.length;
        if (n >= 2) {
          trueKids.forEach((child, i) => {
            yOff.set(child, parentOff + (i - (n - 1) / 2) * forkStep);
          });
          forkGroups.push({ parentId: id, children: [...trueKids] });
        } else if (n === 1) {
          yOff.set(trueKids[0], parentOff); // straight-through: inherit
        }

        // Side kids (only_r1/r2 and junction nodes) always inherit parent's yOff
        for (const child of sideKids) {
          yOff.set(child, parentOff);
        }

        for (const child of children) {
          inDegIntra.set(child, inDegIntra.get(child) - 1);
          if (inDegIntra.get(child) === 0) queue.push(child);
        }
      }

      // Post-pass: pull junction nodes halfway toward their add-target's yOff.
      // This routes them visually between their source branch and destination branch.
      if (ck === 'merged') {
        for (const id of ids) {
          const cn = nodeById.get(id);
          if (!cn || !mergedKindSet.has(cn.kind)) continue;
          const addTargetIds = edgesDedup
            .filter(e => isAddEdge(e) && e.source === id && idSet.has(e.target))
            .map(e => e.target);
          if (addTargetIds.length === 0) continue;
          const targetOffAvg = addTargetIds.reduce((s, tid) => s + (yOff.get(tid) ?? 0), 0) / addTargetIds.length;
          const srcOff = yOff.get(id) ?? 0;
          yOff.set(id, (srcOff + targetOffAvg) / 2);
        }
      }

      // Apply Y offsets on top of compCenterY
      for (const id of ids) {
        const node = nodeById.get(id);
        if (!node) continue;
        const off = yOff.get(id) ?? 0;
        if (ck === 'merged') {
          if (node.kind === 'only_r1')      node.y = centerY + off - mainHalfOffset;
          else if (node.kind === 'only_r2') node.y = centerY + off + mainHalfOffset;
          else                              node.y = centerY + off;
        } else {
          node.y = centerY + off;
        }
      }

      // X-align fork siblings: move each entry node to maxX (the rightmost sibling),
      // then BFS-propagate the same delta through their downstream sub-tree.
      // A descendant is shifted only if:
      //   (a) ALL its intra-comp process parents are already in the shifted set, AND
      //   (b) shifting it would NOT push it past any of its outgoing add-edge targets
      //       (which would reverse those edges).
      for (const { parentId, children } of forkGroups) {
        const childNodes = children.map(id => nodeById.get(id)).filter(Boolean);
        if (childNodes.length < 2) continue;
        const maxX = Math.max(...childNodes.map(n => n.x));
        for (const cn of childNodes) {
          if (cn.x >= maxX) continue;
          // Would moving cn itself to maxX reverse any of its outgoing add edges?
          const wouldReverse = edgesDedup.some(e => {
            if (!isAddEdge(e) || e.source !== cn.id) return false;
            const tgt = nodeById.get(e.target);
            return tgt && tgt.x < maxX;
          });
          if (wouldReverse) continue;

          const delta = maxX - cn.x;
          cn.x = maxX;

          // BFS propagation: shift the entire downstream sub-tree by the same delta.
          const shifted = new Set([cn.id]);
          const shiftQ  = [cn.id];

          while (shiftQ.length > 0) {
            const sid = shiftQ.shift();
            for (const e of edgesDedup) {
              if (isAddEdge(e) || e.source !== sid || !idSet.has(e.target)) continue;
              const kid = nodeById.get(e.target);
              if (!kid || shifted.has(e.target)) continue;
              // Only shift if ALL intra-comp process parents of kid are already shifted
              const allParentsShifted = !edgesDedup.some(pe =>
                !isAddEdge(pe) && pe.target === e.target &&
                idSet.has(pe.source) && !shifted.has(pe.source)
              );
              if (!allParentsShifted) continue;
              // Only shift if it won't reverse any outgoing add edge
              const breaks = edgesDedup.some(ae => {
                if (!isAddEdge(ae) || ae.source !== e.target) return false;
                const t = nodeById.get(ae.target);
                return t && t.x < kid.x + delta;
              });
              if (!breaks) {
                kid.x += delta;
                shifted.add(e.target);
                shiftQ.push(e.target);
              }
            }
          }
        }
      }

      // DEBUG
      console.group(`[4f] comp=${comp} (${ids.length} nodes, centerY=${centerY.toFixed(0)}, ck=${ck})`);
      for (const id of ids) {
        const node = nodeById.get(id);
        if (!node) continue;
        console.log(`  ${id} kind=${node.kind} lvl=${globalLevel.get(id)} x=${node.x.toFixed(0)} y=${node.y.toFixed(0)} yOff=${(yOff.get(id)??0).toFixed(0)}`);
      }
      for (const { parentId, children } of forkGroups) {
        console.log(`  FORK parent=${parentId} → [${children.map(c => `${c}(yOff=${(yOff.get(c)??0).toFixed(0)},x=${(nodeById.get(c)?.x??0).toFixed(0)})`).join(', ')}]`);
      }
      console.groupEnd();
    }
  }

  // ── Step 4b: Junction alignment ────────────────────────────────────────────
  // When an only_r1/only_r2 parallel chain (no merged proc-predecessor) feeds into a
  // merged_similar node via a process edge, that is the "junction": shift the merged
  // node so its upper/lower circle aligns with the only branch's Y (horizontal edge),
  // then propagate that new centerY to all downstream nodes in the same merged comp.
  //
  // We process junctions in topological order (earliest target level first) and apply
  // each immediately. This ensures that when an only node has been junction-aligned
  // (e.g. only_r1 M12 in comp4 moves from y=511 to y=27), any downstream comp that
  // uses M12 as its junction source (e.g. comp5 via M12→M13) sees the updated Y,
  // giving the correct cy (52) instead of the stale pre-move cy (536).
  {
    // Collect all only→merged junction edges
    const junctionEdges = [];
    for (const e of edgesDedup) {
      if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
      if (isAddEdge(e)) continue;
      const src = nodeById.get(e.source);
      const tgt = nodeById.get(e.target);
      if (!src || !tgt) continue;
      const srcIsOnly   = src.kind === "only_r1" || src.kind === "only_r2";
      const tgtIsMerged = tgt.kind === "merged_exact" || tgt.kind === "merged_similar";
      // Empty containers are same-branch → skip junction realignment for them
      if (!srcIsOnly || !tgtIsMerged || onlyHasMergedProcIn.has(e.source)) continue;
      if (nb_isContainer(src) && !containerNonEmpty.get(src.id)) continue;
      junctionEdges.push({ src, tgt, tgtLevel: globalLevel.get(tgt.id) || 0 });
    }

    // Sort by topo level: process upstream junctions first so downstream ones
    // see already-updated src.y values.
    junctionEdges.sort((a, b) => a.tgtLevel - b.tgtLevel);

    const compJunctionApplied = new Set();
    const compJunctionLog = [];

    for (const { src, tgt, tgtLevel } of junctionEdges) {
      const tgtComp = compOf.get(tgt.id);
      // Only the first (lowest topo level) junction per comp wins
      if (compJunctionApplied.has(tgtComp)) continue;

      // Use current src.y — may already have been updated by a prior junction
      const cy = src.kind === "only_r1"
        ? src.y + mainHalfOffset   // upper circle aligns with r1 Y
        : src.y - mainHalfOffset;  // lower circle aligns with r2 Y

      const defaultY = compCenterY.get(tgtComp) ?? NB_BASE_Y;
      if (Math.abs(cy - defaultY) < 1) continue; // no-op junction, skip

      compJunctionLog.push(`comp${tgtComp}: ${src.id}(${src.kind} y=${src.y})→${tgt.id} jLvl=${tgtLevel} cy=${cy}`);

      // Apply immediately so downstream junctions use the updated Ys
      mainNodes.forEach(node => {
        if (compOf.get(node.id) !== tgtComp) return;
        const lvl = globalLevel.get(node.id) || 0;
        if (lvl < tgtLevel) return;
        const oldY = node.y;
        if (node.kind === "only_r1")      node.y = cy - mainHalfOffset;
        else if (node.kind === "only_r2") node.y = cy + mainHalfOffset;
        else                              node.y = cy;
        console.log(`[4b-MOVE] ${node.id}(${node.kind}) lvl=${lvl} comp=${tgtComp} y: ${oldY} → ${node.y} (jCY=${cy})`);
      });
      compJunctionApplied.add(tgtComp);
    }

    console.log(`[4b] junctions applied:`, compJunctionLog);
  }

  // ── Step 4c: Anchor-based r1/r2 comp repositioning ───────────────────────
  // Rule: if a merged comp M has a cross-branch add edge to an r1 comp O,
  // position O at M.topCircle - (BRANCH_MARGIN + outerR_m) = M.center - mergedToOnlyStep.
  // Symmetrically for r2: position at M.bottomCircle + gap = M.center + mergedToOnlyStep.
  //
  // We use the FINAL merged comp center Y (after any 4b junction alignment), so that
  // O stays symmetric around M regardless of where M ended up.
  //
  // Multiple r1 comps anchored to the same merged comp are stacked upward in order;
  // if an r1 comp has no cross-branch add-edge anchor, it falls back to the
  // firstMergedComp delta shift.
  if (mergedComps.length > 0) {
    // Helper: final center Y of a merged comp after 4b
    function getMergedCompFinalY(comp) {
      for (const id of (compGroups.get(comp) || [])) {
        const n = nodeById.get(id);
        if (!n) continue;
        if (n.kind === "merged_exact" || n.kind === "merged_similar") return n.y;
      }
      return compCenterY.get(comp) ?? NB_BASE_Y;
    }

    // Build per-r1-comp and per-r2-comp anchor: the merged comp connected via
    // a cross-branch add edge.  We take the FIRST such edge found (lowest-topo
    // source preferred since edgesDedup is already in graph order).
    const r1AnchorOf = new Map(); // r1 comp id → merged comp id
    const r2AnchorOf = new Map(); // r2 comp id → merged comp id

    for (const e of edgesDedup) {
      if (!isAddEdge(e)) continue;
      if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
      const sc = compOf.get(e.source);
      const tc = compOf.get(e.target);
      if (sc === undefined || tc === undefined || sc === tc) continue;
      const sk = compKind(sc);
      const tk = compKind(tc);
      // merged → r1 or r1 → merged
      if (sk === "merged" && tk === "r1" && !r1AnchorOf.has(tc)) r1AnchorOf.set(tc, sc);
      if (tk === "merged" && sk === "r1" && !r1AnchorOf.has(sc)) r1AnchorOf.set(sc, tc);
      // merged → r2 or r2 → merged
      if (sk === "merged" && tk === "r2" && !r2AnchorOf.has(tc)) r2AnchorOf.set(tc, sc);
      if (tk === "merged" && sk === "r2" && !r2AnchorOf.has(sc)) r2AnchorOf.set(sc, tc);
    }

    console.log(`[4c] r1 anchors:`, [...r1AnchorOf.entries()].map(([c,a])=>`comp${c}→comp${a}`));
    console.log(`[4c] r2 anchors:`, [...r2AnchorOf.entries()].map(([c,a])=>`comp${c}→comp${a}`));

    // Group r1 comps by their anchor merged comp (preserving r1Comps order within each group)
    const r1Groups = new Map(); // anchor merged comp id (or null) → [r1 comp, ...]
    r1Comps.forEach(comp => {
      const a = r1AnchorOf.get(comp) ?? null;
      if (!r1Groups.has(a)) r1Groups.set(a, []);
      r1Groups.get(a).push(comp);
    });

    const r2Groups = new Map();
    r2Comps.forEach(comp => {
      const a = r2AnchorOf.get(comp) ?? null;
      if (!r2Groups.has(a)) r2Groups.set(a, []);
      r2Groups.get(a).push(comp);
    });

    // Place r1 comps that have an explicit anchor
    for (const [anchorComp, comps] of r1Groups) {
      if (anchorComp === null) continue;
      const anchorY = getMergedCompFinalY(anchorComp);
      comps.forEach((comp, i) => {
        const newY = anchorY - mergedToOnlyStep - i * onlyBranchStep;
        compCenterY.set(comp, newY);
        for (const id of (compGroups.get(comp) || [])) {
          const node = nodeById.get(id);
          if (node) { console.log(`[4c-r1] ${node.id} y:${node.y}→${newY} anchor=comp${anchorComp}`); node.y = newY; }
        }
      });
    }

    // Place r2 comps that have an explicit anchor
    for (const [anchorComp, comps] of r2Groups) {
      if (anchorComp === null) continue;
      const anchorY = getMergedCompFinalY(anchorComp);
      comps.forEach((comp, i) => {
        const newY = anchorY + mergedToOnlyStep + i * onlyBranchStep;
        compCenterY.set(comp, newY);
        for (const id of (compGroups.get(comp) || [])) {
          const node = nodeById.get(id);
          if (node) { console.log(`[4c-r2] ${node.id} y:${node.y}→${newY} anchor=comp${anchorComp}`); node.y = newY; }
        }
      });
    }

    // Fallback: r1/r2 comps with no anchor → shift by same delta as first/last merged comp
    const origFirstMergedY = NB_BASE_Y;
    const origLastMergedY  = NB_BASE_Y + (mergedComps.length - 1) * mergedBranchStep;

    const noAnchorR1 = r1Groups.get(null) || [];
    if (noAnchorR1.length > 0) {
      const finalFirstY = getMergedCompFinalY(mergedComps[0]);
      const delta = finalFirstY - origFirstMergedY;
      if (Math.abs(delta) > 0.5) {
        const newR1ClosestY = finalFirstY - mergedToOnlyStep;
        noAnchorR1.forEach((comp, i) => {
          const newY = newR1ClosestY - i * onlyBranchStep;
          compCenterY.set(comp, newY);
          for (const id of (compGroups.get(comp) || [])) {
            const node = nodeById.get(id);
            if (node) node.y = newY;
          }
        });
      }
    }

    const noAnchorR2 = r2Groups.get(null) || [];
    if (noAnchorR2.length > 0) {
      const finalLastY = getMergedCompFinalY(mergedComps[mergedComps.length - 1]);
      const delta = finalLastY - origLastMergedY;
      if (Math.abs(delta) > 0.5) {
        const newR2ClosestY = finalLastY + mergedToOnlyStep;
        noAnchorR2.forEach((comp, i) => {
          const newY = newR2ClosestY + i * onlyBranchStep;
          compCenterY.set(comp, newY);
          for (const id of (compGroups.get(comp) || [])) {
            const node = nodeById.get(id);
            if (node) node.y = newY;
          }
        });
      }
    }

    // ── Step 4d: Center merged comps that receive from both r1 and r2 ──────────
    // When a merged comp M12 receives process edges from BOTH an only_r1 comp AND
    // an only_r2 comp that share the same anchor merged comp (e.g. M6), place M12
    // at M6's center Y.  This means "the branch closes back onto M6's horizontal
    // center line", so M12 and all downstream nodes in M12's spine stay at M6.y.
    //
    // Also handles the case where two independent only_r1 / only_r2 comps (no
    // shared merged-comp anchor) converge into a merged comp: center at the
    // midpoint of their Y positions.
    {
      // Build: merged comp → Set of only-comp sources (via process edges)
      const mergedProcSources = new Map(); // merged comp id → Set of only comp ids
      for (const e of edgesDedup) {
        if (isAddEdge(e)) continue;
        if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
        const src = nodeById.get(e.source);
        const tgt = nodeById.get(e.target);
        if (!src || !tgt) continue;
        const srcIsOnly   = src.kind === "only_r1" || src.kind === "only_r2";
        const tgtIsMerged = tgt.kind === "merged_exact" || tgt.kind === "merged_similar";
        if (!srcIsOnly || !tgtIsMerged) continue;
        const sc = compOf.get(src.id);
        const tc = compOf.get(tgt.id);
        if (sc === undefined || tc === undefined) continue;
        if (!mergedProcSources.has(tc)) mergedProcSources.set(tc, new Set());
        mergedProcSources.get(tc).add(sc);
      }

      for (const [mergedComp, srcCompSet] of mergedProcSources) {
        const srcList = [...srcCompSet];
        const r1Srcs = srcList.filter(c => compKind(c) === "r1");
        const r2Srcs = srcList.filter(c => compKind(c) === "r2");
        if (r1Srcs.length === 0 || r2Srcs.length === 0) continue;

        let newCY = null;

        // Case A: r1 and r2 sources share a common anchor merged comp → use that anchor's Y
        outer4d:
        for (const r1c of r1Srcs) {
          const anch1 = r1AnchorOf.get(r1c);
          if (anch1 === undefined) continue;
          for (const r2c of r2Srcs) {
            if (r2AnchorOf.get(r2c) === anch1) {
              newCY = getMergedCompFinalY(anch1);
              console.log(`[4d] comp${mergedComp}: r1=comp${r1c} r2=comp${r2c} share anchor=comp${anch1} → cy=${newCY}`);
              break outer4d;
            }
          }
        }

        // Case B: no shared anchor → center at midpoint of the r1 and r2 comp Ys
        if (newCY === null) {
          const r1Y = compCenterY.get(r1Srcs[0]);
          const r2Y = compCenterY.get(r2Srcs[0]);
          if (r1Y !== undefined && r2Y !== undefined) {
            newCY = (r1Y + r2Y) / 2;
            console.log(`[4d] comp${mergedComp}: no shared anchor, midpoint r1Y=${r1Y} r2Y=${r2Y} → cy=${newCY}`);
          }
        }

        if (newCY === null) continue;

        // Apply newCY to all nodes in this merged comp at or after the junction level
        const minJunctionLevel = Math.min(
          ...srcList.map(sc => {
            let minLvl = Infinity;
            for (const id of (compGroups.get(sc) || [])) minLvl = Math.min(minLvl, globalLevel.get(id) || 0);
            return minLvl;
          })
        );

        mainNodes.forEach(node => {
          if (compOf.get(node.id) !== mergedComp) return;
          const lvl = globalLevel.get(node.id) || 0;
          if (lvl < minJunctionLevel) return; // don't move pre-junction nodes
          const oldY = node.y;
          if (node.kind === "only_r1")      node.y = newCY - mainHalfOffset;
          else if (node.kind === "only_r2") node.y = newCY + mainHalfOffset;
          else                              node.y = newCY;
          console.log(`[4d-MOVE] ${node.id}(${node.kind}) lvl=${lvl} y:${oldY}→${node.y}`);
        });
        compCenterY.set(mergedComp, newCY);
      }
    }
  }

  // ── Step 4e: X-align parallel branch comps from same split source ────────────
  // When a source node fans out via process edges to 2+ different comps, the entry
  // node of each target comp should be at the SAME X (the rightmost one), so that
  // "split → two dumbbells" always looks symmetric left-right.
  // We shift the ENTIRE comp by delta so relative node spacing within it is preserved.
  {
    // Build: source node id → Map<target comp id, entry node (min X)>
    const srcFanOut = new Map();
    for (const e of edgesDedup) {
      if (isAddEdge(e)) continue;
      // Only fan-out via actual recipe split actions
      if (e.action !== 'split') continue;
      if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
      const sc = compOf.get(e.source);
      const tc = compOf.get(e.target);
      if (sc === undefined || tc === undefined || sc === tc) continue;
      const tgtNode = nodeById.get(e.target);
      if (!tgtNode) continue;
      if (!srcFanOut.has(e.source)) srcFanOut.set(e.source, new Map());
      const tgtMap = srcFanOut.get(e.source);
      // Keep the entry node with smallest X for each target comp
      if (!tgtMap.has(tc) || tgtNode.x < tgtMap.get(tc).x) tgtMap.set(tc, tgtNode);
    }

    for (const [, tgtMap] of srcFanOut) {
      // Only align merged (dumbbell) comps — r1/r2 single-branch comps are not aligned
      const mergedTargets = new Map(
        [...tgtMap].filter(([compId]) => compKind(compId) === "merged")
      );
      if (mergedTargets.size < 2) continue;
      // Find the max entry X among all merged target comps
      let maxEntryX = 0;
      for (const [, n] of mergedTargets) maxEntryX = Math.max(maxEntryX, n.x);
      // Shift each merged comp that is behind maxEntryX
      for (const [compId, entryNode] of mergedTargets) {
        const delta = maxEntryX - entryNode.x;
        if (delta < 0.5) continue;
        for (const id of (compGroups.get(compId) || [])) {
          const node = nodeById.get(id);
          if (node) node.x += delta;
        }
      }
    }
  }

  // ── Step 5: Aux node placement ─────────────────────────────────────────────
  // Build per-node incoming edge list (deduplicated, ghost-guarded)
  const inMapDedup = new Map(nodes.map(n => [n.id, []]));
  for (const e of edgesDedup) {
    if (!nodeIds.has(e.source)) continue;
    inMapDedup.get(e.target).push(e);
  }

  const globalSpineSet = new Set(mainNodes.map(n => n.id));
  const inMapFull      = nb_buildInMap(edges);   // for nb_collectAuxForSpineNode

  const MAX_ROW = 5;

  mainNodes.forEach(spineNode => {
    const comp    = compOf.get(spineNode.id) ?? 0;
    // Use the node's already-adjusted Y as the local centerY reference for aux placement.
    // For merged comps this may differ from compCenterY after junction alignment.
    const ck = compKind(comp);
    const centerY = ck === "merged"
      ? (spineNode.kind === "only_r1" ? spineNode.y + mainHalfOffset
       : spineNode.kind === "only_r2" ? spineNode.y - mainHalfOffset
       : spineNode.y)
      : (compCenterY.get(comp) ?? NB_BASE_Y);

    const auxNodes = nb_collectAuxForSpineNode(spineNode.id, inMapFull, nodeById, globalSpineSet);
    if (auxNodes.length === 0) return;

    const r1Aux = auxNodes.filter(n => n.kind === "only_r1");
    const r2Aux = auxNodes.filter(n => n.kind === "only_r2");
    const shAux = auxNodes.filter(n => n.kind !== "only_r1" && n.kind !== "only_r2");
    // Descending: highest-indexed aux (last in chain, directly before spine) at col=0
    // (closest to spine / rightmost), so edges within the aux chain flow left→right.
    [r1Aux, r2Aux, shAux].forEach(g => g.sort((a, b) => nb_nodeIdx(b) - nb_nodeIdx(a)));

    // Cross-branch detection: does spineNode receive any non-add edge from a main node?
    // Yes → cross-branch merge → aux clusters above/below with full slope.
    // No  → empty container → keep aux horizontal.
    const incomingEdges = inMapDedup.get(spineNode.id) || [];
    const hasCrossBranch = incomingEdges.some(
      e => !isAddEdge(e) && mainIds.has(e.source) && nodeIds.has(e.source)
    );

    if (hasCrossBranch) {
      // Sloped: aux clusters above (R1) / below (R2) the center axis
      const r1Base = -(mainHalfOffset + NB_AUX_CROSS_EXTRA);
      const r2Base =  (mainHalfOffset + NB_AUX_CROSS_EXTRA);
      const shBase = -(auxHalfOffset  + 4);
      function placeSloped(group, yBase, rowDir) {
        group.forEach((aux, i) => {
          const row = Math.floor(i / MAX_ROW);
          const col = i % MAX_ROW;
          aux.x = spineNode.x - NB_AUX_DX * (col + 1);
          aux.y = centerY + yBase + row * NB_AUX_ROW_GAP * rowDir;
        });
      }
      placeSloped(r1Aux, r1Base, -1);
      placeSloped(r2Aux, r2Base, +1);
      placeSloped(shAux, shBase, -1);
    } else {
      // Horizontal: aux at same Y as spineNode (empty container)
      // Tiny +/- jitter separates R1/R2 to prevent overlap.
      function placeHoriz(group, yJitter, rowDir) {
        group.forEach((aux, i) => {
          const row = Math.floor(i / MAX_ROW);
          const col = i % MAX_ROW;
          aux.x = spineNode.x - NB_AUX_DX * (col + 1);
          aux.y = spineNode.y + yJitter + row * NB_AUX_ROW_GAP * rowDir;
        });
      }
      placeHoriz(r1Aux, -NB_AUX_HORIZ_JITTER, -1);
      placeHoriz(r2Aux,  NB_AUX_HORIZ_JITTER, +1);
      placeHoriz(shAux, 0, -1);
    }
  });

  // ── Fallback for any still-unpositioned node ───────────────────────────────
  const allCompCenterYs = [...compCenterY.values()];
  const maxCompY = allCompCenterYs.length ? Math.max(...allCompCenterYs) : NB_BASE_Y;
  let fallbackX = NB_BASE_X;
  nodes.forEach(n => {
    if (n.x == null || n.y == null || Number.isNaN(n.x) || Number.isNaN(n.y)) {
      n.x = fallbackX;
      n.y = maxCompY + mergedToOnlyStep;
      fallbackX += 60;
    }
  });

  return compOrder.map((comp, i) => ({
    index: i, type: 1,
    spine: (compGroups.get(comp) || []).map(id => nodeById.get(id)).filter(Boolean)
  }));
}

function renderGraph(graph) {
  root.selectAll("*").remove();

  const nodes = graph.nodes;
  const edges = graph.edges;
  const nodeById = new Map(nodes.map(d => [d.id, d]));
  newBranchLayout(nodes, edges, graph);
  const auxGreekMap = buildAuxGreekMap(nodes);
  const branchInfo = graph.branch_info || { R1: {}, R2: {} };

  //const primarySide = assignAllNodeXByPrimaryRecipe(nodes, edges);
  //layoutPrimarySideMainChain(primarySide, nodes, edges);
  //layoutSecondarySideMainChain(primarySide, nodes, edges);
  //applySeparateRecipeOffset(nodes, graph);
  //layoutNonMainUpstreamRecursively(nodes, edges);
  //alignProcessChainsHorizontally(nodes, edges);
  //softenAddSlopes(nodes, edges);
  //fallbackAuxPositions(nodes);

  const outgoingOffsetMap = assignOutgoingOffsets(edges);

  function getContainerIconName(node, side = null) {
  if (!node) return null;

  function getNameFromState(state) {
    if (!state) return null;
    const name = state[0];
    return hasRealContainerName(name) ? name : null;
  }

  if (side === "R1") {
    return (
      getNameFromState(node.state_r1) ||
      (hasRealContainerName(node.container_r1) ? node.container_r1 : null)
    );
  }

  if (side === "R2") {
    return (
      getNameFromState(node.state_r2) ||
      (hasRealContainerName(node.container_r2) ? node.container_r2 : null)
    );
  }

  return (
    getNameFromState(node.state_r1) ||
    getNameFromState(node.state_r2) ||
    (hasRealContainerName(node.container_r1) ? node.container_r1 : null) ||
    (hasRealContainerName(node.container_r2) ? node.container_r2 : null) ||
    null
  );
}

  function mergedFlavorList(node) {
    return [
      ...normalizeFlavorList(node.flavor_r1),
      ...normalizeFlavorList(node.flavor_r2)
    ];
  }

  function flavorRingRadii(spec) {
    return {
      inner: spec.flavorInnerR ?? (spec.centerR + 1),
      outer: spec.flavorOuterR ?? (spec.centerR + 4)
    };
  }

  function edgePath(d) {
    const sNode = nodeById.get(d.source);
  const tNode = nodeById.get(d.target);

  if (!sNode || !tNode) {
    console.log("[BAD EDGE]", d);
    console.log("[MISSING SOURCE?]", d.source, nodeById.get(d.source));
    console.log("[MISSING TARGET?]", d.target, nodeById.get(d.target));
    return "";
  }

    let sAnchor = effectiveAnchor(sNode, d.source_anchor, d.style, true);
    let tAnchor = effectiveAnchor(tNode, d.target_anchor, d.style, false);

    // For add edges: pin the dumbbell anchor to the side matching the other node's kind.
    // This ensures all add edges from/to a dumbbell (merged_similar) land on the
    // correct circle (T=r1, B=r2) regardless of edge style.
    if (isAddEdge(d)) {
      if (isDumbbellLike(sNode)) {
        if (tNode.kind === "only_r1") sAnchor = "T";
        else if (tNode.kind === "only_r2") sAnchor = "B";
      }
      if (isDumbbellLike(tNode)) {
        if (sNode.kind === "only_r1") tAnchor = "T";
        else if (sNode.kind === "only_r2") tAnchor = "B";
      }
    }

    const s0 = getAnchorPosition(sNode, sAnchor);
    const t0 = getAnchorPosition(tNode, tAnchor);

    const extraOff = outgoingOffsetMap.get(d) || 0;
    const styleOff = edgeBaseOffset(d.style);

    const tx = t0.x;
    const ty = t0.y + extraOff + styleOff;

    let sAdj;
    if (isDumbbellLike(sNode)) {
      sAdj = dumbbellBoundaryPoint(sNode, sAnchor, tx, ty, true);
    } else {
      sAdj = singleNodeStartBoundaryPoint(sNode, sAnchor, tx, ty);
    }

    let tAdj;
    if (isDumbbellLike(tNode)) {
      tAdj = dumbbellBoundaryPoint(tNode, tAnchor, s0.x, s0.y, false);
    } else {
      tAdj = singleNodeBoundaryPoint(tNode, tAnchor, s0.x, s0.y);
    }

    const dx = tAdj.x - sAdj.x;
const dy = tAdj.y - sAdj.y;

if (isAddEdge(d)) {
  return addTrianglePath(sAdj.x, sAdj.y, tAdj.x, tAdj.y, 10, 4);
}

// 只单独定义 main -> container
if (isMainToContainerEdge(d, sNode, tNode)) {
  // 足够接近水平：直接画直线
  if (Math.abs(dy) < 6) {
    return `M ${sAdj.x},${sAdj.y} L ${tAdj.x},${tAdj.y}`;
  }

  // 否则优先向斜上方拐入 container
  const mx = sAdj.x + dx * 0.45;
  const my = sAdj.y - 26;

  return `M ${sAdj.x},${sAdj.y} Q ${mx},${my} ${tAdj.x},${tAdj.y}`;
}

// process：尽量保持水平
  const mx = (sAdj.x + tAdj.x) / 2;
  // 关键：控制点 y 不再额外上下拱，而是尽量放在 source/target 的中间水平层
  const my = (sAdj.y + tAdj.y) / 2;

    return `M ${sAdj.x},${sAdj.y} Q ${mx},${my} ${tAdj.x},${tAdj.y}`;
  }

  function edgeLabelPosition(d) {
    const sNode = nodeById.get(d.source);
    const tNode = nodeById.get(d.target);
    
    if (!sNode || !tNode) {
    console.log("[BAD EDGE LABEL]", d);
    return { x: -9999, y: -9999 };
  }

    let sAnchor = effectiveAnchor(sNode, d.source_anchor, d.style, true);
    let tAnchor = effectiveAnchor(tNode, d.target_anchor, d.style, false);

    if (isAddEdge(d)) {
      if (isDumbbellLike(sNode)) {
        if (tNode.kind === "only_r1") sAnchor = "T";
        else if (tNode.kind === "only_r2") sAnchor = "B";
      }
      if (isDumbbellLike(tNode)) {
        if (sNode.kind === "only_r1") tAnchor = "T";
        else if (sNode.kind === "only_r2") tAnchor = "B";
      }
    }

    const s0 = getAnchorPosition(sNode, sAnchor);
    const t0 = getAnchorPosition(tNode, tAnchor);

    const extraOff = outgoingOffsetMap.get(d) || 0;
    const styleOff = edgeBaseOffset(d.style);

    return {
      x: (s0.x + t0.x) / 2,
      y: (s0.y + t0.y) / 2 + extraOff * 0.5 + styleOff * 0.5 - 10
    };
  }

  function drawIcon(g, iconName, spec) {
    if (!iconName) return;
    const url = `${API_BASE}/icons/${iconName}.png`;
    const size = spec.centerR * 1.6;
    const img = new Image();
    img.onload = () => {
      g.append("image")
        .attr("href", url)
        .attr("xlink:href", url)
        .attr("x", -size / 2)
        .attr("y", -size / 2)
        .attr("width", size)
        .attr("height", size)
        .attr("pointer-events", "none");
    };
    img.src = url;
  }

  svg.select("defs").remove();
  const defs = svg.append("defs");

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
      tooltip.style("opacity", 1).html(edgeTooltipHTML(d));
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
    .attr("class", "edge-label")
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

    function drawContainerHalf(group, node, side, spec) {
  group.append("circle")
    .attr("r", spec.centerR)
    .attr("fill", "white")
    .attr("stroke", "none");

  drawIcon(group, getContainerIconName(node, side), spec);

  const flavors = side === "R1"
    ? normalizeFlavorList(node.flavor_r1)
    : normalizeFlavorList(node.flavor_r2);

  if (flavors.length > 0) {
    drawFlavorRing(group, spec.flavorInnerR, spec.flavorOuterR, flavors);
  }

  const physicalRing = group.append("circle")
    .attr("r", spec.physicalR);

  applyPhysicalRingStyle(
    physicalRing,
    side === "R1"
      ? (node.state_r1 ? node.state_r1[2] : null)
      : (node.state_r2 ? node.state_r2[2] : null),
    side === "R1"
      ? { ...node, flavor_r2: null, state_r2: null }
      : { ...node, flavor_r1: null, state_r1: null }
  );
}

    function drawContainerLikeAuxHalf(group, node, side, spec) {
      group.append("circle")
        .attr("r", spec.centerR)
        .attr("fill", "white")
        .attr("stroke", "none");

      drawIcon(group, getContainerIconName(node, side), spec);

      const flavors = side === "R1"
        ? normalizeFlavorList(node.flavor_r1)
        : normalizeFlavorList(node.flavor_r2);

      if (flavors.length > 0) {
        const rr = flavorRingRadii(spec);
        drawFlavorRing(group, rr.inner, rr.outer, flavors);
      }

      const physicalRing = group.append("circle")
        .attr("r", spec.physicalR);

      applyPhysicalRingStyle(
        physicalRing,
        side === "R1" ? (node.state_r1 ? node.state_r1[2] : null) : (node.state_r2 ? node.state_r2[2] : null),
        side === "R1"
          ? { ...node, flavor_r2: null, state_r2: null }
          : { ...node, flavor_r1: null, state_r1: null }
      );
    }

    function drawContainerIcon(group, container) {
      if (!container || container === "none") return;
      const url = `${API_BASE}/icons/${container}.png`;
      const img = new Image();
      img.onload = () => {
        group.append("image")
          .attr("href", url)
          .attr("xlink:href", url)
          .attr("x", -8)
          .attr("y", -18)
          .attr("width", 16)
          .attr("height", 16)
          .attr("pointer-events", "none");
      };
      img.src = url;
    }

    function drawSingleNode(cx, cy, node, recipeColor) {
  const local = g.append("g")
    .attr("transform", `translate(${cx},${cy})`);

  local.append("circle")
    .attr("r", spec.outerR)
    .attr("fill", recipeColor)
    .attr("stroke", "none");

  // container main
  if (isContainerNode(node)) {
  const flavors = normalizeFlavorList(node.flavor_r1 || node.flavor_r2);

  local.append("circle")
    .attr("r", spec.centerR)
    .attr("fill", "white")
    .attr("stroke", "none");

  drawIcon(local, getContainerIconName(node), spec);

  if (flavors.length > 0) {
    drawFlavorRing(local, spec.flavorInnerR, spec.flavorOuterR, flavors);
  }

  const physicalRing = local.append("circle")
    .attr("r", spec.physicalR);

  applyPhysicalRingStyle(physicalRing, getPhysicalState(node), node);
  return;
}

  // 普通 main
  if (node.domain === "main") {
    const flavors = normalizeFlavorList(node.flavor_r1 || node.flavor_r2);

    local.append("circle")
      .attr("r", spec.centerR)
      .attr("fill", "white")
      .attr("stroke", "none");

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

    const physicalRing = local.append("circle")
      .attr("r", spec.physicalR);

    applyPhysicalRingStyle(physicalRing, getPhysicalState(node), node);
    return;
  }

  // aux
  local.append("circle")
    .attr("r", spec.centerR)
    .attr("fill", getFlavorColor(getPrimaryFlavor(node)))
    .attr("stroke", "none");
  
  const auxCat = getAuxCategoryName(node);
const greek = auxCat ? auxGreekMap.get(auxCat) : null;

if (greek) {
  local.append("text")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central")
    .attr("font-size", spec.centerR * 1.4)
    .attr("font-weight", 400)
    .attr("fill", getReadableTextColor(getFlavorColor(getPrimaryFlavor(node))))
    .text(greek);
}

  const physicalRing = local.append("circle")
    .attr("r", spec.physicalR);

  applyPhysicalRingStyle(physicalRing, getPhysicalState(node), node);
}

    if (d.kind === "merged_exact" && d.shape_dumbbell) {
      g.append("path")
        .attr("d", dumbbellBodyPath(spec.outerR, spec.halfOffset, spec.waistInset, 4))
        .attr("fill", COLORS.merged_exact)
        .attr("stroke", "none");

      const top = g.append("g")
        .attr("transform", `translate(0, ${-spec.halfOffset})`);

      top
        .on("mouseenter", function(event) {
          tooltip.style("opacity", 1).html(nodeHalfTooltip(d.state_r1, d.flavor_r1, d.r1_node, d.id));
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
          tooltip.style("opacity", 1).html(nodeHalfTooltip(d.state_r2, d.flavor_r2, d.r2_node, d.id));
        })
        .on("mousemove", function(event) {
          tooltip
            .style("left", `${event.pageX + 12}px`)
            .style("top", `${event.pageY + 12}px`);
        })
        .on("mouseleave", function() {
          tooltip.style("opacity", 0);
        });

      if (isContainerNode(d)) {
  drawContainerHalf(top, d, "R1", spec);
  drawContainerHalf(bottom, d, "R2", spec);
}  else if (d.domain === "main") {
        top.append("circle")
          .attr("r", spec.centerR)
          .attr("fill", "white")
          .attr("stroke", "none");

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

        bottom.append("circle")
          .attr("r", spec.centerR)
          .attr("fill", "white")
          .attr("stroke", "none");

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
        top.append("circle")
          .attr("r", spec.centerR)
          .attr("fill", getFlavorColor((normalizeFlavorList(d.flavor_r1)[0]) || "none"))
          .attr("stroke", "none");
        
        const topCat = d.state_r1 ? d.state_r1[0].trim().toLowerCase() : null;
const topGreek = topCat ? auxGreekMap.get(topCat) : null;
if (topGreek) {
  top.append("text")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central")
    .attr("font-size", spec.centerR * 1.6)
    .attr("font-weight", 700)
    .attr("fill", "white")
    .text(topGreek);
}

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
        
        const bottomCat = d.state_r2 ? d.state_r2[0].trim().toLowerCase() : null;
const bottomGreek = bottomCat ? auxGreekMap.get(bottomCat) : null;
if (bottomGreek) {
  bottom.append("text")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central")
    .attr("font-size", spec.centerR * 1.6)
    .attr("font-weight", 700)
    .attr("fill", "white")
    .text(bottomGreek);
}
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
      g.append("path")
        .attr("d", dumbbellBodyPath(spec.outerR, spec.halfOffset, spec.waistInset, 4))
        .attr("fill", "url(#dumbbell-grad)")
        .attr("stroke", "none");

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
          tooltip.style("opacity", 1).html(nodeHalfTooltip(d.state_r1, d.flavor_r1, d.r1_node, d.id));
        })
        .on("mousemove", function(event) {
          tooltip
            .style("left", `${event.pageX + 12}px`)
            .style("top", `${event.pageY + 12}px`);
        })
        .on("mouseleave", function() {
          tooltip.style("opacity", 0);
        });

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
          tooltip.style("opacity", 1).html(nodeHalfTooltip(d.state_r2, d.flavor_r2, d.r2_node, d.id));
        })
        .on("mousemove", function(event) {
          tooltip
            .style("left", `${event.pageX + 12}px`)
            .style("top", `${event.pageY + 12}px`);
        })
        .on("mouseleave", function() {
          tooltip.style("opacity", 0);
        });

      if (isContainerNode(d)) {
  drawContainerHalf(top, d, "R1", spec);
  drawContainerHalf(bottom, d, "R2", spec);}
   else if (d.domain === "main") {
        top.append("circle")
          .attr("r", spec.centerR)
          .attr("fill", "white")
          .attr("stroke", "none");

        drawIcon(top, d.icon_r1, spec);

        const topFlavors = normalizeFlavorList(d.flavor_r1);
        if (topFlavors.length > 0) {
          drawFlavorRing(top, spec.flavorInnerR, spec.flavorOuterR, topFlavors);
        }

        const physicalRingTop = top.append("circle")
          .attr("r", spec.physicalR);

        applyPhysicalRingStyle(physicalRingTop, d.state_r1 ? d.state_r1[2] : null, topNode);

        bottom.append("circle")
          .attr("r", spec.centerR)
          .attr("fill", "white")
          .attr("stroke", "none");

        drawIcon(bottom, d.icon_r2, spec);

        const bottomFlavors = normalizeFlavorList(d.flavor_r2);
        if (bottomFlavors.length > 0) {
          drawFlavorRing(bottom, spec.flavorInnerR, spec.flavorOuterR, bottomFlavors);
        }

        const physicalRingBottom = bottom.append("circle")
          .attr("r", spec.physicalR);

        applyPhysicalRingStyle(physicalRingBottom, d.state_r2 ? d.state_r2[2] : null, bottomNode);

      } else {
        top.append("circle")
          .attr("r", spec.centerR)
          .attr("fill", getFlavorColor(getPrimaryFlavor(topNode)))
          .attr("stroke", "none");

        const physicalRingTop = top.append("circle")
          .attr("r", spec.physicalR);

        applyPhysicalRingStyle(physicalRingTop, d.state_r1 ? d.state_r1[2] : null, topNode);

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
      if (d.kind === "merged_similar" || (d.kind === "merged_exact" && d.shape_dumbbell)) {
        return;
      }

      const state = d.state_r1 || d.state_r2;
      const flavor = d.flavor_r1 || d.flavor_r2;

      tooltip
        .style("opacity", 1)
        .html(nodeHalfTooltip(state, flavor, d.r1_node ?? d.r2_node, d.id));
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