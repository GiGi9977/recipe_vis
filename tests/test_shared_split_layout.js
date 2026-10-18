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
recipes=[(p.stem.lstrip('0123456789 ').strip(),json.loads(p.read_text(encoding='utf-8'))) for p in sorted(Path('data').glob('*.json'))]
results=[]
with contextlib.redirect_stdout(io.StringIO()):
 for an,a in recipes:
  for bn,b in recipes:
   results.append(dict(name=an+' / '+bn,graph=build_full_graph_main_aux(a,b,compare_main_fn=compare_recipes)))
print(json.dumps(results))
`],{encoding:'utf8',maxBuffer:64*1024*1024});
assert.equal(result.status,0,result.stderr);
const cases=JSON.parse(result.stdout);
let groups=0;
for(const {name,graph} of cases){
 const semantic=JSON.stringify(graph);
 ctx.newBranchLayout(graph.nodes,graph.edges,graph);
 const by=new Map(graph.nodes.map(n=>[n.id,n]));
 // Shared terminal siblings must remain distinct even when they share a receiver.
 for(const root of graph.nodes){
  const children=[...new Set(graph.edges.filter(e=>e.source===root.id&&e.action==='split').map(e=>e.target))].map(id=>by.get(id));
  const portions=children.filter(n=>n.domain==='main'&&['merged_exact','merged_similar'].includes(n.kind)&&
   !graph.edges.some(e=>e.target===n.id&&e.action!=='split')&&
   graph.edges.some(e=>e.source===n.id)&&graph.edges.filter(e=>e.source===n.id).every(e=>e.action==='add'));
  if(portions.length<2||portions.length!==children.length)continue;
  groups++;
  for(let i=0;i<portions.length;i++)for(let j=i+1;j<portions.length;j++){
   const a=portions[i],b=portions[j];
   assert(Math.hypot(a.x-b.x,a.y-b.y)>=70,name+': shared split siblings overlap');
   const area=Math.abs((a.x-root.x)*(b.y-root.y)-(a.y-root.y)*(b.x-root.x));
   assert(area/Math.max(Math.hypot(a.x-root.x,a.y-root.y),Math.hypot(b.x-root.x,b.y-root.y))>=25,name+': split rays overlap');
   for(const n of [a,b])for(const other of graph.nodes){
    if(other.domain!=='main'||portions.includes(other)||other===root)continue;
    assert(Math.hypot(n.x-other.x,n.y-other.y)>=60,name+': split output overlaps another main node');
   }
  }
 }

 assert.equal(JSON.stringify({...graph,nodes:graph.nodes.map(({x,y,...n})=>n)}),semantic,name+': changed semantics');
 const positions=JSON.stringify(graph.nodes.map(n=>[n.x,n.y]));
 ctx.newBranchLayout(graph.nodes,graph.edges,graph);
 assert.equal(JSON.stringify(graph.nodes.map(n=>[n.x,n.y])),positions,name+': unstable layout');
}
assert(groups>0);
console.log('PASS:',cases.length,'recipe comparisons;',groups,'shared split fans with separate nodes and split rays');
