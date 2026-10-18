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
paths=[Path('data/3 brasied_pork_tofu_sauce.json'),Path('data/4 bazi_pork_with_braised_egg_and_green_pepper.json')]
recipes=[json.loads(path.read_text(encoding='utf-8')) for path in paths]
graphs=[]
with contextlib.redirect_stdout(io.StringIO()):
 for a,b in [recipes,recipes[::-1]]:
  graphs.append(build_full_graph_main_aux(a,b,compare_main_fn=compare_recipes))
print(json.dumps(graphs))
`], {encoding:'utf8', maxBuffer:32*1024*1024});
assert.equal(result.status, 0, result.stderr);

for (const [index, graph] of JSON.parse(result.stdout).entries()) {
  const semantic = JSON.stringify(graph);
  newBranchLayout(graph.nodes, graph.edges, graph);
  const by = new Map(graph.nodes.map(n => [n.id, n]));
  const direct = graph.edges.find(e => e.source === 'M28' && e.target === 'M31' && e.action === 'add');
  const detour = graph.edges.filter(e =>
    [['M28','M29'],['M29','M30'],['M30','M31']].some(([a,b]) => e.source === a && e.target === b));
  assert(direct && detour.length === 3, 'Expected direct and processed alternatives into M31');
  const length = e => Math.hypot(by.get(e.target).x-by.get(e.source).x, by.get(e.target).y-by.get(e.source).y);
  // The direct upper lane spans the other recipe's two real stir steps.
  // Do not shorten it by folding those steps into a crowded diagonal.
  assert.equal(by.get('M28').y,by.get('M31').y,'Direct lane must stay horizontal');
  for (const edge of detour) assert(length(edge) <= 155, `Detour edge ${edge.source}->${edge.target} remains too long`);
  const sign = index === 0 ? 1 : -1;
  assert.equal(by.get('M29').y,by.get('M28').y+sign*25,'First stir must align with its half-node');
  assert.equal(by.get('M30').y,by.get('M29').y,'Stir chain must remain horizontal');
  for(const [a,b] of [['M28','M29'],['M29','M30'],['M30','M31']])
    assert(by.get(b).x-by.get(a).x>=120,'Process chain needs full horizontal spacing');
  const input=by.get(index===0?'A11':'A22'),pan=by.get('M13');
  const inputSide=index===0?-1:1;
  assert(Math.hypot(input.x-pan.x,input.y-(pan.y+inputSide*25))<=85,
    'Single ADD input must stay close to the receiving pan half');
  assert(sign*(by.get('M29').y-by.get('M28').y) > 0, 'Exclusive detour is on the wrong recipe side');
  for (const [a,b] of [['M28','M29'],['M29','M30'],['M30','M31']])
    assert(Math.hypot(by.get(a).x-by.get(b).x,by.get(a).y-by.get(b).y) >= 58,
      `Detour nodes ${a}/${b} are crowded`);
  assert.equal(by.get('M31').y,by.get('M32').y,'Receiver continuation must stay horizontal');
  assert.equal(JSON.stringify({...graph,nodes:graph.nodes.map(({x,y,...n})=>n)}),semantic,'Layout changed semantics');
  const positions=JSON.stringify(graph.nodes.map(n=>[n.x,n.y]));
  newBranchLayout(graph.nodes,graph.edges,graph);
  assert.equal(JSON.stringify(graph.nodes.map(n=>[n.x,n.y])),positions,'Layout must be stable');
}

console.log('PASS: 3/4 single input stays local and stir chain stays horizontal and spaced in both directions');
