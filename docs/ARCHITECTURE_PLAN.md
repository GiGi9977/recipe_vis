# Recipe Vis Architecture Plan

## Frontend architecture

### Responsibilities and boundaries

The recovered frontend should use React, Vite, JavaScript, D3, HTML, and CSS. React owns application state and rendered DOM; D3 is limited to graph calculations, scales, geometry, zoom transforms, and path generation. The frontend has four separate responsibilities:

1. Normalize the comparison API response into a stable semantic graph.
2. Calculate node positions, anchors, and edge routes without changing graph meaning.
3. Render the calculated geometry as declarative React SVG components.
4. Audit overlaps, broken process axes, invalid anchors, and edge-node intersections.

The backend remains responsible for recipe loading, matching, and graph construction. Frontend layout must not change matching results, recipe-side ownership, node domain, physical state, icon meaning, or connectivity. Rendering code must not reposition nodes to repair geometry.

### Target module structure

Preserve `frontend/app.js` initially as a behavioral reference, then migrate it incrementally into this Vite application:

```text
frontend/
  package.json
  vite.config.js
  index.html
  src/
    main.jsx                       # Vite entry point
    App.jsx                        # application shell
    api/comparisonApi.js           # API requests and responses
    graph/normalize.js             # canonical node and edge records
    graph/selectors.js             # adjacency indexes and queries
    graph/invariants.js            # semantic validation
    layout/constants.js            # spacing and geometry constants
    layout/elkGraph.js              # semantic graph to ELK layered graph
    layout/elkOptions.js            # deterministic ELK configuration
    layout/runElkLayout.js          # asynchronous base-layout adapter
    layout/components.js           # process components and ownership groups
    layout/baseLayout.js            # initial process lanes
    layout/attachedLayout.js        # aux and attached-main placement
    layout/splitLayout.js           # split fans
    layout/terminalMergeLayout.js   # terminal merge compaction
    layout/constraints.js           # axes, proximity, order, clearance
    layout/collision.js             # collision checks and gap expansion
    layout/solver.js                # bounded constraint iteration
    layout/anchors.js               # semantic source/target ports
    layout/routing.js               # PROCESS, ADD, and SPLIT paths
    layout/audit.js                 # final geometry diagnostics
    components/
      ComparisonPage.jsx            # data loading and page state
      RecipeSelector.jsx            # recipe controls
      ComparisonGraph.jsx           # SVG viewport and layer ordering
      GraphEdge.jsx                  # routed edge and action label
      GraphNode.jsx                  # node composition and interaction
      PhysicalStateRing.jsx          # state-border grammar
      AuxLabel.jsx                   # two-letter aux abbreviation
      LayoutDiagnostics.jsx          # development audit output
    hooks/
      useComparison.js               # API request lifecycle
      useComparisonLayout.js         # memoized pure layout calculation
      useGraphViewport.js            # zoom, pan, fit-to-content
    state/comparisonReducer.js       # selection and UI transitions
    styles/app.css
    styles/graph.css
```

Extract modules in behavior-preserving steps. Do not combine the React/Vite migration with matcher or recipe-data changes. Compare the React rendering against the current frontend with the same API response fixture.

### React and D3 ownership

React is the sole owner of rendered DOM and SVG elements. Components receive normalized semantic records plus calculated geometry and return SVG markup. D3 is used only through pure functions for scales, curve generation, bounds, and other geometry.

`ComparisonGraph` defines stable SVG layers for markers, branch backgrounds, edges, edge labels, nodes, node labels, and interaction overlays. `GraphNode` and `GraphEdge` use semantic IDs as React keys. `useComparisonLayout` memoizes layout from the normalized graph and layout options so hover and selection changes do not recalculate geometry.

`useComparison` owns API loading and exposes explicit `idle`, `loading`, `success`, and `error` states. It cancels obsolete requests when the selected recipe pair changes. Server data stays separate from temporary UI state such as hover, selection, zoom, and diagnostic visibility.

### ELK.js base layout

Use `elkjs` as the base layered layout engine. ELK establishes the initial left-to-right ordering, component spacing, and coarse edge corridors. It does not own final recipe-specific positions or rendered edge paths.

Use the layered algorithm with deterministic options similar to:

```js
const elkOptions = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "SPLINES",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.spacing.nodeNode": "70",
  "elk.layered.spacing.nodeNodeBetweenLayers": "120",
  "elk.spacing.edgeNode": "28",
};
```

`elkGraph.js` converts the normalized semantic graph into an ELK graph without changing IDs. PROCESS edges provide the primary layered ordering. ADD and SPLIT relationships contribute connectivity and ordering hints, while recipe lanes and ownership groups are represented as nested ELK hierarchy where practical. Nodes include their actual rendered width and height, including shared-node dumbbells and label clearance.

`runElkLayout.js` owns one configured ELK instance and returns a new geometry object. It treats ELK output as the base solution only. Custom post-layout phases then enforce domain rules that ELK cannot express precisely:

1. Assign and preserve R1, shared, and R2 lane bands.
2. Restore required horizontal PROCESS axes as complete process components.
3. Move attached nodes and their ownership groups close to their consuming node.
4. Compact branches that converge on the same terminal branch.
5. Select shared-node anchors from the correct recipe half.
6. Resolve remaining collisions with adaptive spacing.
7. Generate final D3 paths from the corrected anchors.

ELK execution is asynchronous. `useComparisonLayout` must cancel or ignore stale results when the graph changes and expose a layout status. Cache results by a stable graph signature plus layout-option version; hover, selection, and zoom must not rerun ELK.

Do not use `d3-force` as a second layout engine. Its nondeterministic relaxation conflicts with fixed recipe lanes and horizontal process-chain requirements.

### Source-text alignment and selection

Use a namespaced step key, `${side}:${stepId}`, so R1 `S001` and R2 `S001`
remain distinct. The comparison reducer stores a set of selected step keys.
Graph nodes and edges expose their corresponding namespaced keys; text rows use
the same key. Selection therefore has one source of truth:

```text
click text step
  -> select namespaced step key
  -> highlight every linked node and edge

click graph node or edge
  -> collect its namespaced step keys
  -> highlight and scroll all matching text rows
```

The text panel renders R1 and R2 as two narrow columns within one scrollable
aside. It shows `text_en` first when present and retains the exact original
`text` below it. If source text exists without step metadata, show the source
and an explicit alignment-status message.

Edge `text_step_ids` are the stable manual-edit anchors. The backend derives
step node lists and node/action pairs from current `node1`/`node2` endpoints on
each comparison request. Rewiring an existing edge therefore updates highlights
without manual index repair. A new semantic action must specify its step ID;
the system must report unmapped or unknown IDs instead of guessing from names.

### Semantic graph and geometry

Keep semantic data immutable and store layout separately:

```js
const graph = {
  nodes: [{ id, recipeSide, domain, name, icon, physicalState, matchClass, sourceIds, textStepKeys }],
  edges: [{ id, sourceId, targetId, kind, action, recipeSide, textStepKeys }],
  textAlignment: { R1: { sourceText, textSteps }, R2: { sourceText, textSteps } },
};

const geometry = {
  nodes: new Map(), // id -> { x, y, width, height, radius }
  edges: new Map(), // id -> { sourceAnchor, targetAnchor, path }
};
```

Stable IDs support deterministic layout and keyed D3 joins. Visual grouping must not create physical-state data or change node domains.

### Visual grammar

- Recipe colors identify ownership; shared nodes retain the shared-node treatment.
- Main nodes contain ingredient or product icons and physical-state rings.
- Aux nodes show the first two alphanumeric lowercase characters of their names. Greek substitutions are not used.
- PROCESS edges form recipe sequences and carry action labels.
- ADD edges connect additions to the node that consumes them.
- SPLIT edges preserve branch ancestry.
- Selected source steps use a shared highlight treatment on text rows, nodes,
  and edges without changing base recipe colors.

Physical-state borders use a continuous square-ended line for whole solids, progressively more square-ended segments for chunk, slice/dice, shred, and powder, and enlarged round dots for liquid. Batter, paste, mash, and dough mix square segments and round dots at approximately 75%, 55%, 35%, and 20% liquid representation.

### Layout pipeline

```mermaid
flowchart LR
    API[Comparison API] --> N[Normalize and validate]
    N --> E[Build hierarchical ELK graph]
    E --> L[ELK layered base layout]
    L --> R[Recipe lane projection]
    R --> H[Horizontal process constraints]
    H --> A[Attachment and terminal compaction]
    A --> C[Adaptive collision solver]
    C --> P[Recipe-aware anchors]
    P --> D[D3 path geometry]
    D --> V[React SVG rendering]
    V --> Q[Geometry audit and Playwright QA]
```

Run these stages in order:

1. Normalize records and build adjacency indexes.
2. Identify process-connected components.
3. Build the hierarchical ELK graph with measured node sizes and stable model order.
4. Run ELK layered layout to produce the base left-to-right geometry.
5. Project ELK positions into R1, shared, and R2 recipe-lane bands.
6. Restore horizontal process chains as complete ownership groups.
7. Place attached aux nodes and eligible single no-predecessor main nodes close to their consumers.
8. Place split fans while preserving ancestry.
9. Find branches converging on each terminal branch and compact their ownership groups.
10. Run adaptive collision detection and increase only affected gaps.
11. Select recipe-aware anchors and generate final paths with D3 geometry utilities.
12. Audit geometry, compute SVG bounds, and render.

Route edges only after final node placement; otherwise paths retain stale and offset anchors.

### Branch ownership and terminal merges

A branch moves as a structural ownership group containing the process-connected upstream nodes belonging to one merge input. Moving only its terminal node creates angled process edges and tangled branches.

- Keep converging terminal nodes close enough to show their relationship.
- Keep upstream ownership groups separated.
- Preserve left-to-right order in every process chain.
- Keep process-linked nodes horizontal unless the graph contains a real vertical attachment.
- Never compact an independent branch through another branch.
- Apply the same rules to main-to-aux, aux-to-main, and same-domain additions.

Assign one lane to each ownership group, move the complete group toward its target, and expand only vertical gaps whose node bodies or routed corridors collide.

### Constraint priorities

1. Preserve graph meaning, recipe ownership, ancestry, and edge direction.
2. Preserve process-chain order and required horizontal axes.
3. Keep additions close to consuming nodes.
4. Prevent node overlap and keep branch corridors clear.
5. Reduce crossings and parallel-edge overlap.
6. Compact related terminal branches and unused space.

Lower-priority compaction cannot break a higher-priority process axis. Use a deterministic bounded solver that repeats axis enforcement, attachment proximity, ownership-group separation, collision resolution, and lane-order preservation until stable or at a fixed pass limit.

### Anchors and routing

- Horizontal PROCESS edges use source right-center and target left-center.
- A shared recipe-1 exit uses the center of the correct right-side shared portion.
- A recipe-2-only exit uses the recipe-2 node-body center.
- ADD edges leave the side facing the consumer and enter its nearest valid sector.
- Assign distinct ports when shared ports would create overlapping corridors.

Long ADD edges preserve their source lane before bending. Short additions use compact curves. Routes avoid unrelated node bodies, and labels are positioned from final paths.

### Adaptive collision handling

1. Place nodes with the preferred gap.
2. Detect node-node, label-node, and important edge-node intersections.
3. Find the smallest ownership group that can move without breaking ancestry or process order.
4. Increase its lane gap by one spacing unit.
5. Re-run affected constraints and routing.
6. Stop when clear or at a documented maximum pass count.

This is structural and applies to every recipe pair. Do not add coordinate exceptions. Diagnostics for unresolved collisions identify node IDs, ownership groups, and the blocking constraint.

Collision resolution runs after ELK because the rendered graph includes recipe-specific shared-node bodies, physical-state rings, labels, and attachment rules that the base engine cannot fully model. If a moved ownership group invalidates a nearby corridor, rerun only the affected custom constraints and D3 routing; do not rerun the full ELK layout unless the semantic graph or measured node sizes changed.

### Rendering lifecycle

```text
selection
  -> fetch comparison
  -> normalize and validate
  -> normalize R1/R2 text alignment
  -> calculate layout
  -> audit geometry
  -> memoize layout geometry
  -> render keyed React edge components
  -> render keyed React node and state-ring components
  -> render React labels and interaction layers
  -> render side-by-side recipe text columns
  -> fit SVG viewBox
```

Layout modules should be pure and runnable without the DOM. React components handle controls and events, shared UI transitions belong in `comparisonReducer`, and server-loading behavior belongs in `useComparison`.

### Diagnostics and verification

The layout audit returns structured arrays for node overlaps, edge-node intersections, broken process axes, invalid anchors, reversed process edges, and unresolved constraints. Semantic invariant failures stop rendering; development diagnostics identify original recipe and node IDs.

The recovered React/Vite frontend should provide these checks:

```powershell
npm install
npm run dev
npm run test
npm run build
```

The initial package set should include `react`, `react-dom`, `d3`, and `elkjs`, with `vite`, `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/user-event`, and `jsdom` as development dependencies. Pin compatible versions in `package-lock.json` so a recovery build uses the same layout engine and test runtime.

Use Vitest for pure graph and layout tests and React Testing Library for
component behavior. Add focused tests for normalization, ownership groups,
horizontal axes, close ADD placement in every domain direction, recipe-aware
anchors, terminal compaction, adaptive collision expansion, edge-node
clearance, physical-state patterns, aux labels, loading/error
states, stable component rendering, two-column recipe text, namespaced step
keys, bidirectional selection, and manual-edge-rewire alignment.

Maintain a comparison matrix including difficult pairs such as r9/r10, r9/r11, and r14/r15. Coordinate tests verify geometric rules; browser screenshots are required for complete visual verification.

Use the `visualize` workflow during algorithm design to inspect the staged geometry: raw ELK result, lane projection, process-axis restoration, attachment compaction, collision expansion, and final routing. A development-only diagnostics mode should allow these stages to be compared without adding product-facing implementation details to the normal interface.

Use `playwright-interactive` for persistent browser QA when its required `js_repl` runtime is available. Keep one browser session alive across layout iterations, reload after renderer changes, and maintain a QA inventory covering recipe selection, Compare, loading and error states, graph/text selection, zoom, pan, fit-to-content, dense terminal merges, and narrow viewports. Functional interaction and visual inspection are separate passes. Capture representative screenshots for the densest comparison and each previously failing recipe family.

### Frontend recovery sequence

1. Start the backend and verify the comparison API contract.
2. Scaffold `frontend` with Vite's React template and configure the backend base URL through Vite environment variables.
3. Install React, D3, and ELK.js; add Vitest and React Testing Library; commit the lockfile; and create one API fixture shared by layout and component tests.
4. Restore graph normalization and semantic invariant checks as pure modules.
5. Restore base process lanes and horizontal PROCESS routing as pure layout functions.
6. Restore attached nodes, split fans, and ADD routing.
7. Restore ownership-group terminal compaction.
8. Restore adaptive collision expansion and geometry auditing.
9. Implement declarative SVG components for edges, nodes, rings, labels, and interactions.
10. Implement the compact two-column recipe-text panel and bidirectional graph/text selection.
11. Add loading, error, selection, zoom, pan, drag, and fit-to-content behavior through hooks and React state.
12. Run `npm run test` and `npm run build`.
13. Visually inspect the comparison matrix and text panel through the Vite development server at normal and zoomed scales.

Do not copy old generated deliverables over recovered source. Reconstruct behavior from the API and graph contract, then transfer only verified source changes.

### Frontend acceptance criteria

- Layout does not change matching or graph semantics.
- Logical process chains remain horizontal.
- Added nodes stay close to consuming nodes in every domain direction.
- Related terminal inputs converge compactly without overlap.
- Independent branches do not tangle or cross node bodies.
- Shared and recipe-only anchors align with the correct node regions.
- Adaptive spacing removes visible node-body overlaps.
- Aux labels use the first two letters of their names.
- State rings distinguish solid sizes, powder, liquid, and mixed pastes.
- R1/R2 source steps render side by side and keep translated/original text together.
- Clicking either text or graph highlights every node, action, and text step in the same atomic step.
- Manual rewiring of a mapped edge updates node/action pairs from its retained step ID.
- Repeated layout of the same graph is deterministic.
- Automated coordinate checks and browser visual checks pass.

This is the single architecture plan for rebuilding Recipe Vis in a new folder. The FastAPI backend is specified first. Later sections are reserved so frontend, data, and deployment decisions can be added to this same file.

## 1. Backend architecture — FastAPI

### Goals and invariants

The backend loads recipe JSON graphs, compares two recipes, and returns a graph for the frontend. It owns all matching semantics; JavaScript only renders the result.

The backend must guarantee:

- comparison never modifies recipe objects or source JSON;
- node matches are one-to-one;
- merged dependencies remain acyclic;
- branch origin and convergence stage are preserved;
- duration changes edge matching only;
- layout cannot change match status;
- reversing recipe order returns the same conceptual pairs with sides exchanged.

### Technology

- Python 3
- FastAPI and Pydantic
- Uvicorn
- JSON recipe repository
- Standard-library `unittest` for current regressions

Run as a package:

```powershell
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
```

### Folder structure

```text
recipe_vis/
  backend/
    __init__.py
    app.py                 # FastAPI composition and endpoints
    schemas.py             # Request and response models
    config.py              # Data directory and CORS settings
    utils.py               # Recipe discovery and loading
    matcher.py             # Features, branches, and alignment
    graph_builder.py       # Combined comparison graph
  data/
    *.json
  tests/
    test_*.py
  docs/
    ARCHITECTURE_PLAN.md
```

Keep `matcher.py` and `graph_builder.py` separate. Matching decides which recipe states correspond. Graph building converts those decisions into visualization data.

### Component responsibilities

`app.py` currently creates the FastAPI application, configures CORS, exposes
endpoints, attaches branch information, and synchronizes graph/text alignment.
In the recovered structure, move alignment work into a dedicated service so
route handlers remain composition-only. It must not contain matching rules.

`schemas.py` defines Pydantic request and response models, validates comparison requests, keeps the frontend contract stable, and documents optional edge duration.

`config.py` resolves the data directory and allowed origins without hard-coded absolute paths.

`utils.py` discovers recipe files, safely maps recipe IDs to files, reads UTF-8
JSON, loads fallback source text from `data/llm_text/original_text`, validates
top-level fields, and returns a fresh object per request. Recipe IDs must never
become arbitrary filesystem paths.

`matcher.py` normalizes features, constructs branch metadata, performs hierarchical one-to-one alignment, checks cycles, and compares auxiliary nodes. It returns domain match records without layout coordinates.

`graph_builder.py` creates merged and recipe-only nodes, maps endpoints, attaches auxiliary nodes, merges compatible actions, and applies duration rules.

### API contract

The current compatibility API is:

```text
GET  /recipes
POST /compare
GET  /icons/{icon_name}.png
```

The React/Vite migration must consume this contract first. Add versioned routes
only as an additive backend change after response schemas and compatibility
tests exist:

```text
GET  /api/v1/health
GET  /api/v1/recipes
GET  /api/v1/recipes/{recipe_id}
POST /api/v1/compare
```

Comparison request:

```json
{
  "recipe1": "10",
  "recipe2": "13"
}
```

Comparison response:

```json
{
  "recipe1": "10",
  "recipe2": "13",
  "graph": {
    "nodes": [],
    "edges": [],
    "branch_info": {"R1": {}, "R2": {}},
    "text_alignment": {
      "R1": {"id": "10", "source_text": "...", "text_steps": []},
      "R2": {"id": "13", "source_text": "...", "text_steps": []}
    }
  }
}
```

Node statuses are `merged_exact`, `merged_similar`, `only_r1`, or `only_r2`.
Edges identify shared, R1-only, or R2-only ownership and may include `duration`.
Nodes and edges also carry namespaced text-step keys for direct UI selection.
The versioned response may move `nodes`, `edges`, and metadata to top level, but
the normalized frontend model must remain independent of transport shape.

Return `400` for invalid requests, `404` for unknown recipes, `422` for invalid recipe graphs, and `500` for unexpected failures. Log internal details instead of returning tracebacks.

### Recipe graph contract

Build node maps from explicit JSON `index` values; array positions are not IDs.

Canonical node state:

```text
(normalized name, normalized type, normalized physical_state, normalized chemical_state)
```

Normalize by trimming and lowercasing. Flavor is display metadata and does not participate in matching.

Keep action aliases in one function. Current aliases include `parboil -> blanch`, `scald -> blanch`, and `sear -> fry`.

Validate when loading:

- unique node and edge indexes;
- every edge endpoint exists;
- required fields have valid types;
- `previous` is a list when present;
- optional `duration` uses the documented type.

Do not silently repair inconsistent data. Return a validation error with recipe and index context.

### Request pipeline

```text
load recipes
  -> validate graphs
  -> construct main transition items
  -> calculate branch metadata
  -> match main nodes
  -> match auxiliary nodes
  -> build comparison graph
  -> attach branch metadata
  -> synchronize source-step alignment from current edge endpoints
  -> validate output
  -> serialize response
```

Treat `main` and `container` nodes as main-like. A transition item retains its edge, output node, stable original position, exact key, action/type/output key, output state, direct add-input signature, branch label, origin set, recipe-wide branch identities, and optional unique-product identity.

The exact key contains:

```text
source state
+ canonical action
+ edge type
+ target state
+ target non-add previous signature
+ source add-only previous signature
```

Add history is delayed until the node becomes the source of the next transition. This prevents additions intended for the next step from redefining the step that produced the current node.

### Branch metadata

Branch metadata is a hard compatibility gate. Propagate source identity through graph connectivity and record ingredient origins, container roles, unambiguous downstream products, preparation roles, and convergence-stage origin sets.

An ordinary container root uses container name plus its first downstream main-product group. An independent container that directly creates an auxiliary result through a non-add action uses a preparation identity containing canonical action, edge type, and complete auxiliary output state. Preserve the independent sugar-preparation identity.

Reject candidates that compare a node before convergence with a node after an unmatched convergence. Name or state resemblance cannot erase incompatible causal history.

### Matching tiers

Apply in order:

| Tier | Required comparison |
|---|---|
| `exact` | Complete exact transition key |
| `similar2` | Action, edge type, and complete output state |
| `similar3` | Complete output state |
| `similar2_loose` | Action and edge type; same name; physical or chemical state agrees |
| `similar3_loose` | Same name; physical or chemical state agrees |

The last four tiers render as similar. Unmatched nodes become `only_r1` or `only_r2`.

For each candidate pair:

1. require two unused nodes;
2. apply branch compatibility;
3. apply the tier predicate;
4. alias all accepted pairs in a combined dependency graph;
5. reject self-loops and cycles;
6. reserve both nodes after acceptance.

Do not use numeric node ordering as causality.

### Narrow matching exceptions

Keep these as separate named predicates. They handle extraction differences without disabling branch protection globally.

**Matched predecessor:** if direct source nodes are already paired, successors may enter similarity tiers. Incompatible context still blocks exact.

**Unique product:** a same-named main product may supplement branch correspondence only when unique and part of one consistent causal chain in each recipe. It cannot override common-source conflicts or collapse parallel products.

**Loaded container:** equal container states with equal nonempty direct add-input signatures may match as similar even if one representative transition is `heat` and the other is `add`. Context disagreement still blocks exact.

### Auxiliary matching

Compare auxiliary nodes after main alignment and use merged main identities as anchors. Auxiliary processing that creates a main or container through a non-add action remains eligible. Pure additions must not fabricate a processing action.

Keep auxiliary matching separate from the five main tiers so seasoning detail cannot redefine a main branch.

### Edge duration

Duration never participates in node matching. After endpoints correspond and canonical action/type agree:

| R1 duration | R2 duration | Result |
|---|---|---|
| missing | missing | Shared without duration |
| explicit | missing | Shared using R1 value |
| missing | explicit | Shared using R2 value |
| equal explicit values | equal explicit values | Shared with that value |
| different explicit values | different explicit values | Separate R1 and R2 edges |

Normalize values before equality comparison. Inherited duration exists only in comparison output. Unequal durations split edges but preserve the node match.

### Output validation

Before returning a graph, verify:

- every edge endpoint exists;
- every source main node maps at most once;
- every merged node has one source from each recipe;
- merged dependencies are acyclic;
- statuses belong to the documented set;
- shared edges satisfy action/type/duration rules;
- every text-step key refers to an existing recipe step;
- step edge indexes exist and node/action pairs match current edge endpoints;
- tests confirm that inputs remain unchanged.

### Errors and observability

Define domain exceptions such as `RecipeNotFound`, `RecipeValidationError`, and `ComparisonInvariantError`. Convert them to stable HTTP responses in `app.py`.

Log correlation ID, recipe IDs, comparison direction, elapsed time, graph sizes, and failure class. Avoid logging complete recipes by default. Never expose tracebacks in API responses.

### Testing strategy

Use three layers:

1. Unit tests for normalization, state keys, branch predicates, duration compatibility, and cycle checks.
2. Matcher regressions in both A/B and B/A directions.
3. FastAPI endpoint tests for success, missing recipes, invalid graphs, response
   schemas, source-text fallback, namespaced step keys, and rewired-edge
   alignment.

Minimum matcher matrix:

| Scenario | Expected behavior |
|---|---|
| Same complete transition | exact |
| Same output state, different action | similar3 |
| Same name and one matching physical/chemical field | loose similar when branch-compatible |
| Before versus after unmatched convergence | no match |
| Successors of paired predecessors | similar allowed; exact context retained |
| Unique same-named product | constrained fallback allowed |
| Parallel same-named products | no indiscriminate fallback |
| Equal loaded containers and add signatures | similar allowed |
| Empty versus auxiliary-preparation container | no match |
| One duration missing | shared edge inherits explicit duration |
| Unequal explicit durations | nodes stay merged; edges split |
| Pair introduces a cycle | reject pair |

Preserve regressions for shrimp continuation, sugar preparation, loaded pork vessels, auxiliary preparation containers, moussaka convergence stages, and aux-to-main products.

Run:

```powershell
python -m unittest discover -s tests -p "test_*.py"
```

Report missing or stale fixtures separately from behavioral failures.

### Recovery phases

1. **Application skeleton:** create the package, FastAPI app, settings, health endpoint, and typed errors.
2. **Repository:** restore safe discovery, ID resolution, JSON loading, and graph validation.
3. **Canonical features:** restore normalization, aliases, states, previous signatures, and transition items.
4. **Branch metadata:** restore origins, container roles, sugar and auxiliary preparations, and convergence stages.
5. **Hierarchical matcher:** restore tiers, gates, one-to-one use, cycle checks, and each narrow exception with a focused test.
6. **Aux and graph builder:** restore auxiliary anchoring, node mapping, edge construction, and duration rules.
7. **Text alignment:** restore source fallback, edge-owned step IDs, endpoint-derived node/action pairs, and namespaced UI keys.
8. **API contract:** add Pydantic schemas, compatibility endpoints, versioned endpoints, and endpoint tests.

The backend is recovered when inputs remain unchanged, mappings are one-to-one and acyclic, branch stages are preserved, duration affects only edges, reversed comparisons produce symmetric conceptual pairs, graph output has no dangling references, and focused current regressions pass.

## 2. Useful Codex skills

The curated skill catalog was checked for tools that can support this rebuild.

| Skill | Project use |
|---|---|
| `playwright` | Browser regressions for recipe selection, Compare, and rendered graph behavior |
| `playwright-interactive` | Persistent React/Vite browser debugging, functional interaction, and visual regression inspection |
| `visualize` | Inspect and communicate the staged ELK, custom-constraint, collision, and routing pipeline |
| `security-best-practices` | Security review for FastAPI routes, validation, and deployment configuration |
| `security-threat-model` | Threat model before exposing recipe data or write APIs publicly |
| `sentry` | Production error monitoring after deployment |
| `render-deploy` | Deployment option when the hosting target is Render |
| `gh-fix-ci` | Diagnose GitHub Actions failures after CI is configured |

Use skills only when the corresponding workflow is in scope. They do not replace project-specific implementation or tests.

## 3. Frontend architecture

The authoritative frontend design is the top-level **Frontend architecture** section of this document. It specifies React and Vite, ELK.js layered base layout, recipe-specific constraint phases, adaptive collision handling, D3 geometry-only ownership, declarative SVG rendering, and persistent Playwright QA.

## 4. Data and extraction architecture — to be added

Add recipe JSON ownership, source-text alignment, extraction, and migration decisions here.

## 5. Deployment architecture — to be added

Add hosting, CORS, environment configuration, monitoring, and release decisions here.
