const fs = require('fs'), assert = require('assert');
const {spawnSync} = require('child_process');
const source = fs.readFileSync('frontend/app.js','utf8');
const ctx = {Math, console:{log(){},group(){},groupEnd(){}},
 isContainerNode:n => [n.state_r1,n.state_r2].some(s=>s?.[1]==='container'),
 isAddEdge:e=>e.action==='add', getHalfOffsetForNode:n=>n.domain==='aux'?12:25};
// Run in the same JS realm: the bundled Windows Node VM has intermittently
// aborted with invalid bytecode during repeated cross-context layout calls.
const layoutCode=source.slice(source.indexOf('function nb_buildNodeById('),source.indexOf('function renderGraph('));
const layout=new Function('isContainerNode','isAddEdge','getHalfOffsetForNode','console',layoutCode+`
return {newBranchLayout, nb_receiverBranchConnectors,
 get nb_angleBranchAdditions(){return nb_angleBranchAdditions;},
 set nb_angleBranchAdditions(value){nb_angleBranchAdditions=value;},
 get nb_avoidBranchObstructions(){return nb_avoidBranchObstructions;},
 set nb_avoidBranchObstructions(value){nb_avoidBranchObstructions=value;}};
`)(ctx.isContainerNode,ctx.isAddEdge,ctx.getHalfOffsetForNode,ctx.console);
Object.defineProperties(ctx,Object.getOwnPropertyDescriptors(layout));
const result = spawnSync(process.env.RECIPE_TEST_PYTHON || 'python',['-c',`
import json,contextlib,io
from pathlib import Path
from backend.graph_builder import build_full_graph_main_aux
from backend.matcher import compare_recipes
recipes=[(p.stem.lstrip('0123456789 ').strip(),json.loads(p.read_text(encoding='utf-8'))) for p in sorted(Path('data').glob('*.json')) if p.name.startswith(('1 ', '2 ', '4 '))]
results=[]
with contextlib.redirect_stdout(io.StringIO()):
 for an,a in recipes:
  for bn,b in recipes:
   results.append(dict(name=an+' / '+bn,graph=build_full_graph_main_aux(a,b,compare_main_fn=compare_recipes)))
print(json.dumps(results))
`],{encoding:'utf8',maxBuffer:64*1024*1024});
assert.equal(result.status,0,result.stderr);
const cases=JSON.parse(result.stdout);
let checked=0,recipeOneChecked=0;
for(const {name,graph} of cases){
 if(name.includes('carmel_brasied_pork')&&name.includes('bazi_pork')) {
  ctx.newBranchLayout(graph.nodes,graph.edges,graph);
  assert(graph.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
  const before=JSON.stringify(graph.nodes.map(n=>[n.x,n.y]));
  ctx.newBranchLayout(graph.nodes,graph.edges,graph);
  assert.equal(JSON.stringify(graph.nodes.map(n=>[n.x,n.y])),before);
  recipeOneChecked++;
 }
 if(!name.includes('braised_pork_with_potato')||!name.includes('bazi_pork'))continue;
 ctx.newBranchLayout(graph.nodes,graph.edges,graph);
 const side=name.startsWith('braised_pork_with_potato')?'r1':'r2',sign=side==='r1'?-1:1;
 const at=i=>graph.nodes.find(n=>n[side+'_node']===i);
 const port=n=>n.y+((n.kind==='merged_similar'||n.shape_dumbbell)?sign*25:0);
 assert.equal(port(at(24)),port(at(25)),name+': recipe 2 node 24→25 ADD stays horizontal');
 assert.equal(port(at(25)),port(at(26)),name+': sear must stay horizontal');
 assert.equal(at(1).y,at(2).y,name+': potato cut remains horizontal');
 const add=graph.edges.find(e=>e.source===at(2).id&&e.action==='add');
 const target=graph.nodes.find(n=>n.id===add.target);
 assert(target.x-at(2).x<=160,name+': potato branch stays near receiver');
 checked++;
}
assert.equal(checked,2);
assert.equal(recipeOneChecked,2);
console.log('PASS: both potato/bazirou directions retain horizontal sear and nearby potato preparation.');
