const fs=require('fs'),assert=require('assert'),{spawnSync}=require('child_process');
const source=fs.readFileSync('frontend/app.js','utf8');
const code=source.slice(source.indexOf('function nb_buildNodeById('),source.indexOf('function renderGraph('));
const layout=new Function('isContainerNode','isAddEdge','getHalfOffsetForNode','console',code+';return newBranchLayout;')(
 n=>[n.state_r1,n.state_r2].some(s=>s?.[1]==='container'),e=>e.action==='add',n=>n.domain==='aux'?12:25,{log(){},group(){},groupEnd(){}});
const py=spawnSync(process.env.RECIPE_TEST_PYTHON||'python',['-c',String.raw`
import json,contextlib,io
from pathlib import Path
from backend.graph_builder import build_full_graph_main_aux
from backend.matcher import compare_recipes
p=[Path('data/2 braised_pork_with_potato.json'),Path('data/5 dongpo_pork.json')]
r=[json.loads(x.read_text(encoding='utf-8')) for x in p]
graphs=[]
with contextlib.redirect_stdout(io.StringIO()):
 for a,b in [r,r[::-1]]:
  graphs.append(build_full_graph_main_aux(a,b,compare_main_fn=compare_recipes))
print(json.dumps(graphs))
`],{encoding:'utf8',maxBuffer:32*1024*1024});
assert.equal(py.status,0,py.stderr);
const ingredientIndices=[16,31,42,43,44,45,46,47];
for(const [index,graph] of JSON.parse(py.stdout).entries()){
 const semantic=JSON.stringify(graph);layout(graph.nodes,graph.edges,graph);
 const side=index===0?'r2':'r1',sign=side==='r2'?1:-1,at=i=>graph.nodes.find(n=>n[side+'_node']===i);
 const target=at(17),ingredients=ingredientIndices.map(at);
 assert(target&&ingredients.every(Boolean),'Expected recipe 5 simmer-pot ingredient cluster');
 assert.equal(new Set(ingredients.map(n=>n.y)).size,2,'Eight pot ingredients must use two compact rows');
 for(const node of ingredients){
   assert(sign*(node.y-target.y)>0,'Pot ingredient is on the wrong recipe side');
   assert(Math.hypot(node.x-target.x,node.y-target.y)<=145,'Pot ingredient remains too far from its receiver');
 }
 assert.equal(JSON.stringify({...graph,nodes:graph.nodes.map(({x,y,...n})=>n)}),semantic,'Layout changed graph semantics');
 const positions=JSON.stringify(graph.nodes.map(n=>[n.x,n.y]));layout(graph.nodes,graph.edges,graph);
 assert.equal(JSON.stringify(graph.nodes.map(n=>[n.x,n.y])),positions,'Layout must be stable');
}
console.log('PASS: recipe 5 pot ingredients use two compact nearby rows in 2/5 and 5/2');
