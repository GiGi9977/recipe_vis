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
p=[Path('data/14  basic_cake_baking_2.json'),Path('data/15  basic_cake_baking_3.json')]
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
 const side=index===0?'r2':'r1',flour=graph.nodes.find(n=>n[side+'_node']===4);
 assert(flour,'Expected recipe 15 flour node 4');
 const add=graph.edges.find(e=>e.source===flour.id&&e.action==='add'),target=graph.nodes.find(n=>n.id===add?.target);
 assert(add&&target,'Expected recipe 15 flour ADD target');
 assert(Math.hypot(flour.x-target.x,flour.y-target.y)<=150,
   `Recipe 15 flour remains too far from its branch: ${JSON.stringify([[flour.id,flour.x,flour.y],[target.id,target.x,target.y]])}`);
 const sign=side==='r2'?1:-1,whiskSource=graph.nodes.find(n=>n[side+'_node']===12),whiskTarget=graph.nodes.find(n=>n[side+'_node']===19);
 const port=n=>n.y+((n.kind==='merged_similar'||n.shape_dumbbell)?sign*25:0);
 assert(whiskSource&&whiskTarget,'Expected recipe 15 whisk nodes 12 and 19');
 assert.equal(port(whiskSource),port(whiskTarget),
   `Recipe 15 whisk into node 19 must stay horizontal: ${JSON.stringify([[whiskSource.id,whiskSource.x,whiskSource.y,whiskSource.kind],[whiskTarget.id,whiskTarget.x,whiskTarget.y,whiskTarget.kind]])}`);
 assert.equal(JSON.stringify({...graph,nodes:graph.nodes.map(({x,y,...n})=>n)}),semantic,'Layout changed graph semantics');
 const positions=JSON.stringify(graph.nodes.map(n=>[n.x,n.y]));layout(graph.nodes,graph.edges,graph);
 assert.equal(JSON.stringify(graph.nodes.map(n=>[n.x,n.y])),positions,'Layout must be stable');
}
console.log('PASS: recipe 15 flour stays nearby and matched-to-exclusive whisk entry stays horizontal in 14/15 and 15/14');
