const fs = require('fs');
const assert = require('assert');
const {spawnSync} = require('child_process');

const source = fs.readFileSync('frontend/app.js', 'utf8');
const layoutCode = source.slice(
  source.indexOf('function nb_buildNodeById('),
  source.indexOf('function renderGraph(')
);
const newBranchLayout = new Function(
  'isContainerNode', 'isAddEdge', 'getHalfOffsetForNode', 'console',
  layoutCode + '\nreturn newBranchLayout;'
)(
  n => [n.state_r1, n.state_r2].some(s => s?.[1] === 'container'),
  e => e.action === 'add',
  n => n.domain === 'aux' ? 12 : 25,
  {log(){}, group(){}, groupEnd(){}}
);

const python = process.env.RECIPE_TEST_PYTHON || 'python';
const result = spawnSync(python, ['-c', `
import json, contextlib, io
from pathlib import Path
from backend.graph_builder import build_full_graph_main_aux
from backend.matcher import compare_recipes
paths=[Path('data/1 carmel_brasied_pork.json'),Path('data/3 brasied_pork_tofu_sauce.json')]
recipes=[json.loads(path.read_text(encoding='utf-8')) for path in paths]
graphs=[]
with contextlib.redirect_stdout(io.StringIO()):
 for a,b in [recipes,recipes[::-1]]:
  graphs.append(build_full_graph_main_aux(a,b,compare_main_fn=compare_recipes))
print(json.dumps(graphs))
`], {encoding:'utf8', maxBuffer:32*1024*1024});
assert.equal(result.status, 0, result.stderr);

for (const [index, graph] of JSON.parse(result.stdout).entries()) {
  newBranchLayout(graph.nodes, graph.edges, graph);
  const firstIsCarmel = index === 0;
  const r1Source = graph.nodes.find(n => n.r1_node === (firstIsCarmel ? 2 : 5));
  const r2Source = graph.nodes.find(n => n.r2_node === (firstIsCarmel ? 5 : 2));
  const pot = graph.nodes.find(n =>
    n.r1_node === (firstIsCarmel ? 4 : 7) &&
    n.r2_node === (firstIsCarmel ? 7 : 4)
  );
  assert(r1Source && r2Source && pot, 'Expected both washed-pork sources and their matched pot');
  const lane = (node, side) => node.y + (
    node.kind === 'merged_similar' || node.shape_dumbbell
      ? (side === 'r1' ? -25 : 25)
      : 0
  );
  assert.equal(lane(r1Source, 'r1'), lane(pot, 'r1'), 'R1 ADD must remain horizontal');
  assert.equal(lane(r2Source, 'r2'), lane(pot, 'r2'), 'R2 ADD must remain horizontal');
}

console.log('PASS: recipe 1/3 alternative washed-pork ADD edges stay horizontal in both directions');
