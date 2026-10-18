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
p=[Path('data/1 carmel_brasied_pork.json'),Path('data/5 dongpo_pork.json')]
r=[json.loads(x.read_text(encoding='utf-8')) for x in p]
graphs=[]
with contextlib.redirect_stdout(io.StringIO()):
 for a,b in [r,r[::-1]]:
  graphs.append(build_full_graph_main_aux(a,b,compare_main_fn=compare_recipes))
print(json.dumps(graphs))
`],{encoding:'utf8',maxBuffer:32*1024*1024});
assert.equal(py.status,0,py.stderr);
for(const [index,graph] of JSON.parse(py.stdout).entries()){
 const semantic=JSON.stringify(graph);layout(graph.nodes,graph.edges,graph);
 const side=index===0?'r2':'r1',sign=side==='r2'?1:-1,at=i=>graph.nodes.find(n=>n[side+'_node']===i);
 const ingredient=at(59),prepared=at(60),pot=at(61),soup=at(62),receiver=at(58);
 assert(ingredient&&prepared&&pot&&soup&&receiver,'Expected recipe 5 terminal soup feeder');
 assert.equal(ingredient.y,prepared.y,'Soup prepare step must stay horizontal');
 assert.equal(pot.y,soup.y,'Soup reduce step must stay horizontal');
 assert(sign*(soup.y-receiver.y)>=60,'Terminal feeder must approach from its recipe side');
 assert.equal(JSON.stringify({...graph,nodes:graph.nodes.map(({x,y,...n})=>n)}),semantic,'Layout changed graph semantics');
 const positions=JSON.stringify(graph.nodes.map(n=>[n.x,n.y]));layout(graph.nodes,graph.edges,graph);
 assert.equal(JSON.stringify(graph.nodes.map(n=>[n.x,n.y])),positions,'Layout must be stable');
}
console.log('PASS: recipe 5 terminal soup feeder stays below as R2 and above as R1');
