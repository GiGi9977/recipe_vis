const fs=require('fs'),assert=require('assert'),{spawnSync}=require('child_process');
const source=fs.readFileSync('frontend/app.js','utf8'),code=source.slice(source.indexOf('function nb_buildNodeById('),source.indexOf('function renderGraph('));
const api=new Function('isContainerNode','isAddEdge','getHalfOffsetForNode','console',code+';return {layout:newBranchLayout,connectors:nb_receiverBranchConnectors};')(
 n=>[n.state_r1,n.state_r2].some(s=>s?.[1]==='container'),e=>e.action==='add',n=>n.domain==='aux'?12:25,{log(){},group(){},groupEnd(){}});
const result=spawnSync(process.env.RECIPE_TEST_PYTHON||'python',['-c',String.raw`
import json,contextlib,io
from pathlib import Path
from backend.graph_builder import build_full_graph_main_aux
from backend.matcher import compare_recipes
ps=[Path('data/9 Classic Moussaka.json'),Path('data/10 Moussaka with Potato and Eggplant.json'),Path('data/11 Moussaka with Potato, Eggplant, Beef and Béchamel.json')]
rs=[json.loads(p.read_text(encoding='utf-8')) for p in ps]
graphs=[]
with contextlib.redirect_stdout(io.StringIO()):
 for i,a in enumerate(rs):
  for j,b in enumerate(rs):
   if i!=j:graphs.append(dict(name=f'{i+9}/{j+9}',graph=build_full_graph_main_aux(a,b,compare_main_fn=compare_recipes)))
print(json.dumps(graphs))
`],{encoding:'utf8',maxBuffer:96*1024*1024});
assert.equal(result.status,0,result.stderr);
const portY=(node,style)=>{
 if(node.kind!=='merged_similar'&&!node.shape_dumbbell)return node.y;
 const side=String(style||'').toUpperCase();
 return node.y+(side==='R1'?-25:side==='R2'?25:0);
};
for(const {name,graph} of JSON.parse(result.stdout)){
 const semantic=JSON.stringify(graph);api.layout(graph.nodes,graph.edges,graph);
 const by=new Map(graph.nodes.map(n=>[n.id,n])),connectors=api.connectors(graph.nodes,graph.edges);
 for(const edge of graph.edges){
  if(edge.action==='add'||edge.action==='split'||connectors.has(edge))continue;
  const a=by.get(edge.source),b=by.get(edge.target);
  if(a?.domain!=='main'||b?.domain!=='main')continue;
  assert(Math.abs(portY(a,edge.style)-portY(b,edge.style))<0.01,
   `${name}: process edge ${edge.action} ${edge.source}->${edge.target} is not horizontal`);
 }
 assert.equal(JSON.stringify({...graph,nodes:graph.nodes.map(({x,y,...n})=>n)}),semantic,`${name}: layout changed semantics`);
 const positions=JSON.stringify(graph.nodes.map(n=>[n.x,n.y]));api.layout(graph.nodes,graph.edges,graph);
 assert.equal(JSON.stringify(graph.nodes.map(n=>[n.x,n.y])),positions,`${name}: layout is unstable`);
}
console.log('PASS: final process lanes stay horizontal across recipes 9, 10, and 11 in both orders');
