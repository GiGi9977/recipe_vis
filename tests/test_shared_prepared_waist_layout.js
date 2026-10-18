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
p=[Path('data/2 braised_pork_with_potato.json'),Path('data/3 brasied_pork_tofu_sauce.json')]
r=[json.loads(x.read_text(encoding='utf-8')) for x in p]
graphs=[]
with contextlib.redirect_stdout(io.StringIO()):
 for a,b in [r,r[::-1]]:
  graphs.append(build_full_graph_main_aux(a,b,compare_main_fn=compare_recipes))
print(json.dumps(graphs))
`],{encoding:'utf8',maxBuffer:32*1024*1024});
assert.equal(py.status,0,py.stderr);
for(const graph of JSON.parse(py.stdout)){
 const semantic=JSON.stringify(graph);layout(graph.nodes,graph.edges,graph);
 const by=new Map(graph.nodes.map(n=>[n.id,n]));
 const prepared=e=>graph.edges.some(p=>p.target===e.source&&p.action!=='add');
 const candidates=graph.nodes.map(target=>({target,adds:graph.edges.filter(e=>e.target===target.id&&e.action==='add'&&prepared(e))}));
 const found=candidates.find(x=>x.adds.filter(e=>e.style==='shared').length===3&&x.adds.some(e=>e.style!=='shared'));
 assert(found,'Expected the pork dumbbell with three shared prepared inputs');
 const {target,adds}=found,shared=adds.filter(e=>e.style==='shared'),exclusive=adds.filter(e=>e.style!=='shared');
 for(const edge of shared)assert(Math.abs(by.get(edge.source).y-target.y)<=35,'Shared prepared input must use the waist band');
 for(const edge of exclusive){
   const dy=by.get(edge.source).y-target.y;
   assert(edge.style==='R1'?dy<=-70:dy>=70,'Recipe-only prepared input must remain on its recipe side');
 }
 for(const a of shared)for(const b of exclusive){
   const x=by.get(a.source),y=by.get(b.source);
   assert(Math.hypot(x.x-y.x,x.y-y.y)>=50,'Shared and recipe-only prepared inputs overlap');
 }
 for(let i=0;i<shared.length;i++)for(let j=i+1;j<shared.length;j++){
   const a=by.get(shared[i].source),b=by.get(shared[j].source);
   assert(Math.hypot(a.x-b.x,a.y-b.y)>=26,'Shared waist inputs overlap each other');
 }
 assert.equal(JSON.stringify({...graph,nodes:graph.nodes.map(({x,y,...n})=>n)}),semantic,'Layout changed graph semantics');
 const positions=JSON.stringify(graph.nodes.map(n=>[n.x,n.y]));layout(graph.nodes,graph.edges,graph);
 assert.equal(JSON.stringify(graph.nodes.map(n=>[n.x,n.y])),positions,'Layout must be stable');
}
console.log('PASS: recipe 2/3 shared prepared inputs use the waist band and clear recipe-only branches');
