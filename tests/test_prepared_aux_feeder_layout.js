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
paths=[Path('data/9 classic_moussaka.json'),Path('data/10 potato_eggplant_moussaka.json'),
 Path('data/1 carmel_brasied_pork.json'),Path('data/4 bazi_pork_with_braised_egg_and_green_pepper.json')]
recipes=[json.loads(path.read_text(encoding='utf-8')) for path in paths]
graphs=[]
with contextlib.redirect_stdout(io.StringIO()):
 for a,b in [(recipes[0],recipes[1]),(recipes[1],recipes[0]),
             (recipes[2],recipes[3]),(recipes[3],recipes[2])]:
  graphs.append(build_full_graph_main_aux(a,b,compare_main_fn=compare_recipes))
print(json.dumps(graphs))
`], {encoding:'utf8', maxBuffer:32*1024*1024});
assert.equal(result.status, 0, result.stderr);

for (const [index, graph] of JSON.parse(result.stdout).entries()) {
  const semantic = JSON.stringify(graph);
  newBranchLayout(graph.nodes, graph.edges, graph);
  const side = index === 0 || index === 3 ? 'r2' : 'r1';
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  if (index < 2) {
    for (const sourceIndex of [35, 39, 50]) {
      const sourceNode = graph.nodes.find(n => n[side + '_node'] === sourceIndex && n.domain === 'aux');
      assert(sourceNode, `Missing prepared aux node ${sourceIndex} on ${side}`);
      const add = graph.edges.find(e => e.source === sourceNode.id && e.action === 'add');
      assert(add, `Missing outgoing ADD for prepared aux node ${sourceIndex}`);
      const target = byId.get(add.target);
      assert(Math.hypot(target.x - sourceNode.x, target.y - sourceNode.y) <= 145,
        `Prepared aux ADD ${sourceIndex} remains too long`);
    }
  } else {
    const feeders = graph.edges.filter(e => e.action === 'add' && e.style.toLowerCase() === side &&
      byId.get(e.source)?.domain === 'aux' &&
      graph.edges.some(p => p.target === e.source && p.action !== 'add'));
    assert(feeders.length >= 4, 'Expected the four prepared pork seasoning branches');
    const positions = new Set();
    for (const add of feeders) {
      const sourceNode = byId.get(add.source), target = byId.get(add.target);
      const targetPort = target.y + ((target.kind === 'merged_similar' || target.shape_dumbbell)
        ? (side === 'r1' ? -25 : 25) : 0);
      assert(side === 'r1' ? sourceNode.y < targetPort : sourceNode.y > targetPort,
        `${side.toUpperCase()} prepared branch is on the wrong side`);
      positions.add(`${sourceNode.x.toFixed(3)}:${sourceNode.y.toFixed(3)}`);
    }
    assert.equal(positions.size, feeders.length, 'Prepared branches cannot occupy the same slot');
    for (let i=0;i<feeders.length;i++) for (let j=i+1;j<feeders.length;j++) {
      const a=byId.get(feeders[i].source),b=byId.get(feeders[j].source);
      assert(Math.hypot(a.x-b.x,a.y-b.y)>=26, 'Prepared branch endpoints overlap');
    }
  }
  assert.equal(JSON.stringify({...graph,nodes:graph.nodes.map(({x,y,...n})=>n)}), semantic,
    'Layout changed graph semantics');
  const positions = JSON.stringify(graph.nodes.map(n => [n.x,n.y]));
  newBranchLayout(graph.nodes, graph.edges, graph);
  assert.equal(JSON.stringify(graph.nodes.map(n => [n.x,n.y])), positions, 'Layout must be stable');
}

console.log('PASS: prepared aux feeders are compact, recipe-sided, and use distinct slots');
