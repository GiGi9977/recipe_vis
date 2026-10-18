# Comparison Graph Layout Architecture and Recovery Plan

## 1. Purpose

This document defines the architecture for rebuilding the recipe comparison graph in a clean folder. It captures the reusable design rules behind the current implementation without treating historical patches as packages that can be layered together.

The recovery target is a deterministic graph renderer that:

- compares two recipes without changing their semantic graph data;
- shows shared states, R1-only states, and R2-only states in a consistent visual grammar;
- preserves process continuity and recipe-side ownership;
- keeps additions close to the nodes they feed;
- separates branches and terminal merge fans without breaking process chains;
- renders stable coordinates for the same input;
- supports exact/similar matching, text-step linking, physical-state borders, duration waves, and icons.

This is an architecture plan. The current working tree remains the source reference, but it is not yet a clean release baseline; see Section 15.

## 2. System boundary

The project has four runtime layers:

1. **Recipe data** — `data/*.json`
2. **Comparison and graph construction** — `backend/matcher.py`, `backend/graph_builder.py`
3. **HTTP API** — `backend/app.py`, `backend/utils.py`
4. **Layout and rendering** — `frontend/app.js`, `frontend/index.html`

The backend owns semantic decisions. The frontend owns coordinates, paths, appearance, interaction, and collision handling.

The layout must never rewrite:

- node domain (`main`, `aux`, or container semantics);
- recipe membership;
- original `physical_state` or `chemical_state`;
- exact/similar match classification;
- graph topology;
- node or edge provenance;
- text-step references.

## 3. Canonical data contracts

The system has two graph contracts. A **source recipe graph** records one
recipe's extracted semantics. A **comparison graph** is derived from two
source graphs by the backend and is the only graph consumed by layout. Never
write comparison or layout decisions back into source recipe JSON.

### 3.1 Authoritative data flow

```text
Chinese recipe text
  → bilingual atomic text steps
  → LLM-generated nodes and edges
  → deterministic recipe_id / previous / accumulated-flavor post-processing
  → validated source recipe JSON
  → matcher and comparison graph builder
  → API text-alignment synchronization
  → immutable comparison semantics + mutable x/y layout
```

Authoritative files and responsibilities:

| Layer | Location | Responsibility |
|---|---|---|
| Original input | `data/llm_text/original_text/*.txt` | Chinese recipe source; never normalized in place |
| Active extraction prompt | `data/llm_text/recipe_graph_prompt.txt` | Atomic-step, node, edge, vocabulary, and validation rules |
| Generator | `data/llm_text/generate_recipe_json.py` | Model call, request `recipe_id`, validation, deterministic post-processing, JSON save |
| Provenance/flavor post-processing | `data/generate_previous.py` | Derive `previous` and accumulated downstream flavors from finalized topology |
| Generated candidates | `data/llm_text/output/*.json`, model-version folders such as `data/gpt-6_5/*.json` | Reviewable recipe graph outputs; model folders may contain historical schema variants |
| Runtime recipe data | recipe JSON selected through `backend/utils.py` | Inputs to matching and comparison; do not silently rewrite during comparison |
| Comparison graph | response built by `backend/graph_builder.py` and `backend/app.py` | Derived merged semantics and text alignment for the frontend |

Historical prompt copies and old deliverables are reference material, not
incremental upgrade packages. The active prompt and current code define new
output. Historical JSON is not assumed to satisfy every current invariant.

### 3.2 Source recipe top-level schema

Every newly generated recipe object contains:

```json
{
  "recipe_id": "exact input recipe identifier",
  "source_text": "exact complete Chinese source text",
  "text_steps": [],
  "nodes": [],
  "edges": []
}
```

- `recipe_id` is request metadata. The generator writes it from the input
  filename/request instead of relying on model reproduction.
- `source_text` is preserved verbatim. Translation, canonicalization, and
  whitespace cleanup must not alter it.
- `nodes` and `edges` contain the finalized source-recipe topology.
- The LLM does not output `previous`; post-processing derives it after the
  topology is complete.

### 3.3 Bilingual atomic-step alignment

The source is Chinese. Extraction must complete these stages before graph
construction:

1. split the Chinese procedure into ordered atomic actions;
2. retain the exact Chinese span as `text`;
3. translate the complete atomic instruction into English as `text_en`;
4. use the English instruction for entity/action normalization and semantic
   analysis;
5. retain Chinese as the authority for offsets and highlighting.

Each entry in `text_steps` has this contract:

```json
{
  "id": "S001",
  "text": "逐字中文片段",
  "text_en": "Faithful complete English instruction.",
  "start_char": 0,
  "end_char": 8,
  "node_indices": [1, 2],
  "edge_indices": [1],
  "node_action_pairs": [
    {"node_index": 1, "edge_index": 1, "role": "input"},
    {"node_index": 2, "edge_index": 1, "role": "output"}
  ]
}
```

Required invariants:

- IDs are stable, recipe-local, and ordered `S001`, `S002`, ...;
- offsets use zero-based Unicode code points, with inclusive `start_char` and
  exclusive `end_char`;
- `source_text[start_char:end_char] == text` exactly, including punctuation;
- `text_en` preserves ingredients, actions, quantities, temperatures,
  durations, conditions, and qualifiers without adding culinary inference;
- spans may overlap when one sentence expresses multiple atomic actions;
- every referenced node and edge carries the matching reverse
  `text_step_ids`, and forward/reverse references agree;
- implicit heating-environment nodes belong to the source step that triggers
  them; they do not create invented source actions.

The frontend displays `text_en` as the primary line and the Chinese `text`
below it. Old JSON without `text_en` remains readable using `text` alone, but
new generation must provide nonempty English text and valid source spans.

### 3.4 Source node contract

Ingredient and intermediate nodes contain:

| Field | Contract |
|---|---|
| `index` | Unique integer within one recipe |
| `container` | `deep_pot`, `oven`, `sim_pot`, `wok_pot`, or `none` |
| `name` | Canonical lowercase snake_case entity name, without cooked/cut/state suffixes |
| `type` | `main` or `aux`, based on actual role in this recipe |
| `physical_state` | One leaf value from the physical-state vocabulary |
| `chemical_state` | `raw` or `cooked` |
| `flavor` | Intrinsic flavor from the fixed/inferred vocabulary before post-processing; may become an accumulated list on PROCESS food outputs |
| `text_step_ids` | Reverse links to atomic source steps |
| `previous` | Deterministically generated cumulative upstream edge history; never generated by the LLM |

Container nodes use `type: "container"`, one allowed container name, and
`flavor: "none"`. A container represents one continuous active heating
lineage, not the permanent identity of a physical pan or pot.

A node is a procedural state occurrence, not a unique ingredient identity.
Different portions or repeated source occurrences may have the same `name`
and attributes but different indices. Do not merge nodes merely because their
serialized states match.

### 3.5 State and flavor vocabularies

`physical_state` has exactly ten JSON leaf values:

```text
whole, chunk, slice, shred, powder,
liquid, batter, paste, mash, dough
```

- `solid` and `solid-liquid mixture` are reasoning-only parent concepts and
  are never serialized.
- cube/dice/block pieces normalize to `chunk`; there is no
  `physical_subtype`.
- `batter` is flowable; `paste` is thick and spreadable; `mash` retains coarse
  particles; `dough` is a kneadable coherent mass.
- Physical and chemical state are independent. Heat does not automatically
  imply a physical-state change.

Intrinsic flavor uses one allowed string:

```text
aroma, aromatic, deodorizing, none, salty, savory,
sour, spicing, spicy, sweet, umami
```

The fixed ingredient mapping in the active prompt overrides inference. Key
examples include scallion/garlic=`aromatic`, ginger/cooking_wine/red_wine/
mint=`deodorizing`, sugar/honey/dark_soy=`sweet`, cinnamon/bay_leaf/
star_anise/thirteen_powder/nutmeg=`spicing`, light_soy/salt/cheese=`savory`,
oyster_sauce/chicken_powder/soup/black_pepper/beef_sauce=`umami`, red_tofu/
paprika=`spicy`, lemon_juice=`sour`, and water/oil/butter=`none`.

After extraction, `propagate_flavor_to_next_main` accumulates upstream
flavors at PROCESS food outputs. Containers transmit effective contents but
retain `flavor: "none"`; ADD does not immediately mutate the receiver's
flavor, and its contribution appears at the next PROCESS output. Therefore
runtime recipe data may contain `none`, a single string, or a deduplicated
list even though the model emits one intrinsic string.

### 3.6 Source edge and topology contract

Every edge contains `index`, `action`, `type`, `node1`, `node2`, and
`text_step_ids`. The optional `duration` belongs to the action edge.

**PROCESS** represents an explicit transformation:

- every PROCESS creates a new output node, even when serialized state fields
  remain unchanged;
- `node1 != node2` is mandatory;
- non-split PROCESS creates exactly one output; explicit `split` creates one
  fresh output per stated portion/component.

**ADD** represents a dependency into an already existing receiver:

- ADD creates zero nodes and does not update the receiver's current state;
- multiple ADD edges may share a receiver;
- each source node has at most one outgoing ADD edge;
- repeated use without explicit splitting creates a fresh source occurrence
  with the same canonical name; it does not justify an inferred split;
- do not create receiver-state copies whose only cause is ADD.

`duration` is serialized only when the source action has a numeric elapsed
time and unit. It uses English units and preserves numeric values, ranges,
and qualifiers, for example `30 seconds`, `about 50 minutes`, `10-15
minutes`, or `at least 4 hours`. Omit the key for nonnumeric timing such as
“briefly,” “overnight,” or “until golden”; never infer a number. Attach a
duration only to the action it grammatically modifies.

### 3.7 Branch and heating-lineage invariants

- Preserve causal dependency and independent branches. Text order alone does
  not create cross-branch edges.
- Ingredients processed independently before an explicit merge remain on
  separate branches, even when the prose reuses the same physical pot or oil.
- One container occurrence belongs to one continuous output lineage. If
  subsequent operations create different output entities, create separate
  occurrences of the same container type before those operations.
- A single container occurrence cannot feed separate PROCESS outputs for
  pork, egg, pepper, sugar, or other independent entities and later repair
  the topology with an invented split.
- Merge branches only at the source-described ADD step. Do not infer missing
  preparation, split, or merge actions.
- Heating actions require their heating environment: fry uses `wok_pot`, bake
  uses `oven`. Ignore non-heating vessels such as bowls, plates, and baking
  molds as container nodes; `mold` may remain an explicit shaping action.
- Names track entity identity, not state adjectives. Keep `pork`, `fish`, or
  `yolk` when identity is unchanged; use a new canonical product name only
  when a PROCESS forms a different entity such as `yolk_paste` or
  `cake_base`.

### 3.8 Deterministic enrichment and validation

After parsing the model JSON, the generator:

1. overwrites top-level `recipe_id` from the request;
2. derives `previous` from finalized nodes and edges using
   `fill_previous_for_recipe`;
3. accumulates flavors using `propagate_flavor_to_next_main`;
4. validates unique indices, existing edge endpoints, connected nodes,
   required bilingual steps, and exact source spans;
5. saves reviewable JSON.

`previous` entries contain `edge_index`, `action`, `type`, and
`source_ingredient`, ordered most recent to oldest and deduplicated by edge
index. They are derived provenance, not a second source of topology.

Validation diagnostics must distinguish warnings from hard failures. In the
current generator, some validation findings can still be printed as warnings
before `[DONE]`; a saved file with warnings is not considered fully validated.
For example, an invalid source span can make Chinese highlighting include or
omit punctuation even when its English translation is correct.

### 3.9 Derived comparison graph contract

The matcher and graph builder combine two source recipes without modifying
them. Matching remains one-to-one and acyclic, uses original
`physical_state`, and preserves branch-source and merge-stage constraints.
The API synchronizes text-step node/edge references from current topology and
attaches them to the comparison response.

#### Node fields used by layout

| Field | Meaning |
|---|---|
| `id` | Stable merged-graph identifier |
| `domain` | `main` or `aux`; containers remain semantically main-like where applicable |
| `kind` | `merged_exact`, `merged_similar`, `only_r1`, or `only_r2` |
| `shape_dumbbell` | Exact match that must render as two recipe halves |
| `r1_node`, `r2_node` | Original recipe node indices |
| `state_r1`, `state_r2` | `[name, type, physical_state, chemical_state]` |
| `flavor_r1`, `flavor_r2` | Intrinsic or post-processed flavor encodings |
| `icon_r1`, `icon_r2` | Resolved icon names |
| `text_step_keys_r1`, `text_step_keys_r2` | Recipe-qualified text-step links |
| `x`, `y` | Layout-only coordinates; these are the only mutable graph fields during layout |

#### Edge fields used by layout

| Field | Meaning |
|---|---|
| `source`, `target` | Merged node identifiers |
| `action` | `add`, `split`, `stir`, `fry`, `heat`, etc. |
| `type` | Preparation or heat category |
| `style` | `R1`, `R2`, or `shared` |
| `source_anchor`, `target_anchor` | Raw anchor hints from graph construction |
| `duration` | Optional English duration used for process-wave rendering and edge comparison |
| `text_step_keys_r1`, `text_step_keys_r2` | Recipe-qualified text-step links |

If a shared action exists on both sides and only one source edge has an
explicit duration, the shared comparison edge may use that value. If both
sides have explicit different durations, retain recipe-specific edges. This
does not change node matching or backfill either source recipe.

#### Required comparison normalization

- Deduplicate layout edges by `source → target` while retaining the canonical semantic edge list for interaction and tooltips.
- Ignore ghost endpoints during layout indexing.
- Normalize action and style strings for comparisons, but preserve original values in graph data.
- Use original physical states for matching and tooltips. Rendering categories are derived views only.

## 4. Visual grammar

### Recipe ownership

- **R1-only** branches occupy the upper recipe side.
- **R2-only** branches occupy the lower recipe side.
- **Shared** branches occupy the shared center lane or dumbbell waist.
- A recipe-specific edge connected to a dumbbell uses that recipe's half.

### Node anchors

Define anchors as semantic ports rather than arbitrary boundary intersections:

- `T`: center of the R1 half;
- `B`: center of the R2 half;
- `M`: shared waist or center;
- long outgoing R1/R2 ADD ribbons start at the horizontal right-center of the selected half;
- incoming recipe-specific edges terminate at the corresponding target half;
- shared edges use the waist unless a structure-specific rule explicitly requires otherwise.

### Edge classes

- **PROCESS**: thin line with arrow; horizontal when it represents one continuous processing lane.
- **PROCESS with duration**: sine wave following the process path; cycle count is duration-derived.
- **SPLIT**: process-style structural edge, allowed to angle.
- **ADD**: filled tapered ribbon, wide at source and pointed at receiver.

### Physical-state border

- `whole` / `solid`: continuous square-ended ring;
- `chunk` / `cube` / `cut`: four square-ended segments;
- `slice` / `dice`: six segments;
- `shred`: nine segments;
- `powder`: fourteen short square-ended segments;
- `liquid`: nine enlarged round dots;
- `batter`, `paste`, `mash`, `dough`: two-layer solid-segment and liquid-dot rings with decreasing liquid share.

### Aux labels

Aux nodes use the first two alphanumeric characters of the displayed ingredient name, lowercased. Matched halves derive their labels independently.

## 5. Layout model

The layout should use three related structures. They must not be conflated.

### 5.1 Semantic graph

The immutable nodes and edges returned by the backend.

### 5.2 Process components

Rigid or semi-rigid groups connected by PROCESS edges. A process component carries internal horizontal relationships and must move as a unit when collision handling or terminal compaction changes its position.

Do not use ownership groups alone for movement. The 9/11 regression demonstrated that ownership boundaries can cut across a valid process continuation.

### 5.3 Layout ownership groups

Groups used to assign branch bands, collision regions, attachments, and terminal fan order. Ownership is useful for packing, but it is weaker than process connectivity.

When ownership and process connectivity disagree:

1. semantic topology wins;
2. process-port continuity wins;
3. the connected groups form one movement bundle;
4. collision resolution moves the bundle, never one ownership group in isolation.

## 6. Constraint priorities

Use explicit priorities so later passes cannot silently undo earlier invariants.

| Priority | Constraint |
|---|---|
| P0 | Graph semantics, recipe membership, match result, finite coordinates, determinism |
| P1 | Process continuity, recipe-side ports, no cycles introduced, branch provenance |
| P2 | Node-body non-overlap, branch order, split-side preservation |
| P3 | Addition proximity, terminal fan compactness, prepared-feeder placement |
| P4 | Edge crossing reduction, label clearance, aesthetic whitespace |

A lower-priority rule must never repair its result by violating a higher-priority rule.

## 7. Proposed module boundaries

The current implementation is concentrated in `frontend/app.js`. In a recovered folder, split it into browser-native ES modules while retaining the no-build workflow.

```text
frontend/
  app.js                         # API calls, interaction, orchestration
  layout/
    constants.js                 # gaps, radii, tolerances
    graph-index.js               # node/edge maps, dedupe, adjacency
    geometry.js                  # ports, bounds, intersections
    branch-detection.js          # spines, ownership, attached mains
    process-components.js        # DSU/components and movement bundles
    initial-layout.js            # topological levels and base coordinates
    attachments.js               # raw, prepared, aux, main attachments
    split-layout.js              # split lanes, portions, fan separation
    terminal-merges.js           # terminal fan ordering and compaction
    collision.js                 # node-body and label collision solvers
    constraints.js               # invariant checks and prioritized solver
    pipeline.js                  # ordered layout stages
  render/
    nodes.js                     # dumbbells, icons, labels, flavor/physical rings
    edge-routing.js              # PROCESS, duration, SPLIT, ADD paths
    interaction.js               # tooltips and text-step linking
```

If ES modules are not introduced immediately, preserve these boundaries as sections with exported test hooks. Avoid adding new recipe-number conditions to `app.js`.

## 8. Layout pipeline

The recovered pipeline should be explicit and monotonic.

### Stage 0 — Snapshot semantics

- Deep-copy or hash all node and edge fields except `x` and `y`.
- Build node, incoming-edge, and outgoing-edge indexes.
- Deduplicate layout edges.
- Reject missing endpoints from the layout copy without modifying semantic data.

### Stage 1 — Classify nodes and connectivity

- Identify main-like, aux, and container nodes.
- Identify shared, R1-only, and R2-only nodes.
- Detect single unprocessed main nodes that may be laid out as attachments.
- Build PROCESS components with a disjoint-set structure.
- Mark explicit connector edges that are permitted to angle.
- Detect split roots, terminal split portions, prepared feeders, and terminal merge receivers.

### Stage 2 — Build backbone and branches

- Compute topological levels.
- Detect main-led and container-led spines.
- Preserve one-to-one main matching and original branch provenance.
- Assign initial x from process order and initial y from shared/R1/R2 branch bands.
- Position containers between their process neighbors when they represent bridges.

### Stage 3 — Establish process axes

- Horizontal PROCESS edges share the same semantic port y.
- For dumbbells, compare port y rather than node-center y.
- R1 uses the upper half; R2 uses the lower half; shared uses the waist.
- Explicit receiver connectors and SPLIT edges may angle.
- Record each process component's rigid internal offsets after this stage.

### Stage 4 — Place structural branch patterns

Apply topology-based rules only:

- comparison regions;
- shared and recipe-specific split lanes;
- terminal split portions;
- independent receiving branches;
- inline transfers;
- main-to-aux process entries;
- matched-to-exclusive process continuations.

Never select rules using recipe IDs or step indices.

### Stage 5 — Place attachments

Process in this order:

1. processed/prepared feeder components;
2. aux feeder components;
3. raw single-node additions;
4. attached unprocessed main nodes;
5. shared waist additions.

Rules:

- move complete preparation chains, not terminal nodes alone;
- preserve internal PROCESS geometry;
- R1 approaches from above, R2 from below, shared near the waist;
- keep single-target inputs close to the receiver;
- use rows of at most five aux items;
- protect receiver process lines from attachment clusters.

### Stage 6 — Terminal merge fan

For a receiver with multiple long incoming main ADD branches:

1. collect direct source ownership groups;
2. expand each source into its PROCESS-connected movement bundle;
3. exclude groups with another external target;
4. sort bundles by existing terminal y;
5. assign a base center gap;
6. test actual node-body rectangles;
7. enlarge only the necessary gaps until clearance is satisfied;
8. move every node in the bundle by the same delta;
9. place the final receiver/process bundle after the ordered stack;
10. carry exclusive aux decorations that feed only that final bundle.

Critical rule: **do not realign ownership groups independently after this stage**. If a process-axis check fails, rebuild or move its complete process bundle, then rerun collision checks.

### Stage 7 — Final constraint solve

Run a bounded fixed-point loop:

```text
repeat until no coordinate changes or MAX_PASSES reached:
  validate process-port continuity
  move complete process bundles to repair P1 violations
  resolve node-body collisions between bundles
  restore recipe-side split constraints
  repack raw decorations against final receiver positions
```

The solver must be deterministic: stable node ordering, stable edge ordering, and no random candidates.

If the loop reaches `MAX_PASSES`, return diagnostics rather than silently continuing.

### Stage 8 — Edge routing

- PROCESS: straight when port-y difference is below tolerance; otherwise symmetric cubic curve.
- Duration PROCESS: sine wave along the same geometric baseline.
- ADD: tapered closed ribbon.
- Long angled ADD: leave from the exact horizontal source port, stay on the source lane through most of the route, and bend near the receiver.
- Parallel R1/R2 ADD ribbons retain upper/lower order until final approach.
- Incident additions receive deterministic port offsets sorted by opposite endpoint y.

Routing is downstream of layout. Edge routing must not move nodes.

## 9. Geometry API

All collision and routing code should use one geometry module.

Required functions:

```text
nodeVisualSpec(node)
anchorCenter(node, anchor)
edgePortY(node, edge, sourceOrTarget)
horizontalBoundaryPort(node, anchor, direction)
nodeBodyBounds(node)
labelBounds(node)
rectanglesOverlap(a, b, clearance)
segmentsCross(a1, a2, b1, b2)
translateComponent(component, dx, dy)
```

Do not duplicate radius or dumbbell-offset calculations across layout passes and tests.

## 10. Collision policy

Use separate collision layers:

1. **Node-body collision** — mandatory; includes dumbbell half-offset.
2. **Node-label collision** — strong preference, but cannot break P1 process continuity.
3. **Edge/node collision** — candidate scoring.
4. **Edge/edge crossing** — candidate scoring.

For mandatory body collision:

- test actual horizontal overlap before increasing vertical gaps;
- use at least 14 px body clearance for terminal branch groups;
- move the later ordered process bundle downward;
- rerun process-port and collision checks together.

## 11. Invariant audit

Create a pure audit function that returns structured violations:

```json
{
  "semantic_mutations": [],
  "non_finite_nodes": [],
  "process_axis_errors": [],
  "recipe_side_errors": [],
  "node_overlaps": [],
  "backward_edges": [],
  "unstable_coordinates": []
}
```

Minimum invariants:

- all nodes have finite coordinates;
- layout changes only `x` and `y`;
- repeated layout produces identical coordinates;
- non-connector main PROCESS edges have equal semantic port y;
- R1-only split portions remain on the R1 side;
- R2-only split portions remain on the R2 side;
- terminal branch bundles do not overlap;
- attached branches remain within their configured receiver distance;
- shared ADD anchors use the waist;
- R1/R2 anchors use the correct halves.

## 12. Test architecture

### Tier A — Pure geometry tests

- anchor selection;
- dumbbell boundary ports;
- smooth PROCESS path;
- duration-wave cycles;
- tapered ADD path;
- delayed-bend ADD path;
- physical-ring classification;
- node-body bounds.

### Tier B — Synthetic topology tests

- one backbone plus one attached main;
- R1/R2 mirrored branches;
- shared prepared feeders;
- split portions feeding one or several receivers;
- process-connected ownership groups entering one terminal merge;
- terminal fan requiring adaptive gap enlargement;
- branches with other external targets that must stay fixed.

### Tier C — Real comparison regressions

Use current filenames, not historical aliases. Cover both recipe orders.

- pork family for containers and seasonings;
- shrimp family for shared-root forks;
- moussaka family for terminal merge fans and layered assembly;
- ice-cream family for split and duration behavior;
- cake family for matched-to-exclusive continuations and split additions.

### Tier D — Matrix audit

Run all ordered pairs in each recipe family, then the complete ordered-pair matrix when preparing a checkpoint. Report:

- pair count;
- node/edge count;
- audit violation count by type;
- runtime failures separately from assertion failures;
- browser screenshots for a curated visual set.

Coordinate tests are not browser visual verification.

## 13. Clean-folder recovery sequence

### Step 1 — Copy authoritative inputs

Copy these directories and files from the current workspace:

```text
AGENTS.md
RUN_LOCAL.md
backend/
frontend/
data/
tests/
docs/
```

Do not merge old deliverable folders over the copy. Preserve `data/icons` and text-alignment source files.

### Step 2 — Record the source snapshot

Before editing:

```powershell
git status --short
git diff --check
git diff > recovery-source.patch
git rev-parse HEAD > recovery-source-head.txt
```

Archive untracked tests and documentation too; `git diff` alone does not capture them.

### Step 3 — Create the Python environment

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install fastapi uvicorn
```

Install any additional packages reported by the backend tests. Do not run `backend/app.py` directly.

### Step 4 — Establish a semantic baseline

Run backend tests before moving frontend code:

```powershell
python -m unittest discover -s tests -p "test_*.py"
```

Generate representative comparison graphs and save semantic hashes that omit `x` and `y`.

### Step 5 — Establish a layout baseline

```powershell
node --check frontend/app.js
node tests/test_attached_main_layout.js
node tests/test_terminal_merge_fan.js
node tests/test_final_process_axes.js
node tests/test_smooth_add_flow.js
node tests/test_smooth_process_path.js
node tests/test_shared_edge_anchor.js
```

Fix stale fixture filenames before treating the suite as authoritative.

### Step 6 — Extract modules in dependency order

1. constants and graph indexes;
2. geometry and anchors;
3. branch detection;
4. process components;
5. initial placement;
6. attachments and split rules;
7. terminal merge and collision solver;
8. routing;
9. node rendering;
10. interaction.

After every extraction, compare semantic hashes and coordinates for the regression set.

### Step 7 — Add the invariant audit

Make the audit runnable from Node without a browser. Fail CI on P0/P1/P2 violations. Emit JSON diagnostics for visual debugging.

### Step 8 — Browser verification

Start the services:

```powershell
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
python -m http.server 5500 --bind 127.0.0.1 --directory frontend
```

Visually verify both recipe orders for the curated pairs. Capture full-graph and close-up screenshots at a fixed viewport and zoom.

### Step 9 — Create the recovery checkpoint

Only after all required checks pass:

- save the exact Git commit;
- save a manifest of tracked and required untracked assets;
- record Python and Node versions;
- record commands and results;
- record unresolved visual limitations;
- archive screenshots and semantic audit output.

## 14. Acceptance criteria

The recovered project is acceptable when:

- backend semantic tests pass;
- frontend syntax passes;
- required layout regressions pass using current recipe filenames;
- all family matrix audits have zero P0/P1/P2 violations;
- repeated layout is stable;
- no terminal branch node bodies overlap;
- continuous process chains retain their semantic horizontal ports;
- curated browser screenshots match the intended branch order and routing;
- documentation distinguishes implemented, proposed, withdrawn, and unresolved behavior;
- a clean machine can start the backend and frontend from `RUN_LOCAL.md`.

## 15. Current baseline warning — 2026-10-11

The current working tree contains an in-progress change that bundles process-connected ownership groups during terminal merge compaction.

Observed verification at the time this document was written:

- `node --check frontend/app.js`: **passes**;
- `node tests/test_terminal_merge_fan.js`: **passes**;
- `node tests/test_final_process_axes.js`: **fails** on recipe 9/10, edge `fry M24 → M12` not horizontal;
- the 9/11 eggplant-versus-meat-sauce visual overlap remains the motivating unresolved case;
- `tests/tmp_r9_r11_overlap.js` is a diagnostic artifact, not a release regression.

Do not label this working tree as the recovered baseline until terminal compaction is implemented using process-connected movement bundles and both the process-axis and body-overlap audits pass together.

## 16. Recommended implementation decision

The next implementation should replace sequential corrective passes with a small prioritized constraint solver:

1. construct PROCESS movement bundles once;
2. assign terminal fan order to bundles;
3. solve bundle y positions with process continuity as equality constraints;
4. add non-overlap inequalities between horizontally intersecting bundles;
5. minimize movement from initial y;
6. route edges after coordinates are final.

This directly resolves the recurring failure mode where one pass fixes overlap and a later pass breaks horizontal process geometry, or vice versa.
