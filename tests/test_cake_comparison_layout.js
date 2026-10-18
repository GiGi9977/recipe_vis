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
recipes=[(p.stem,json.loads(p.read_text(encoding='utf-8'))) for p in [Path('data/cake_1.json'),Path('data/cake_2.json'),Path('data/cake_3.json')]]
results=[]
with contextlib.redirect_stdout(io.StringIO()):
 for an,a in recipes:
  for bn,b in recipes:
   results.append(dict(name=an+' / '+bn,graph=build_full_graph_main_aux(a,b,compare_main_fn=compare_recipes)))
print(json.dumps(results))
`],{encoding:'utf8',maxBuffer:64*1024*1024});
assert.equal(result.status,0,result.stderr);
const cases=JSON.parse(result.stdout);
let horizontalNodes;
const angleAdditions=ctx.nb_angleBranchAdditions;
ctx.nb_angleBranchAdditions=(nodes,edges,attached)=>{horizontalNodes=nodes.map(n=>({...n}));angleAdditions(nodes,edges,attached);};
for(const {name,graph} of cases) {
 const semantic=JSON.stringify(graph);
 ctx.newBranchLayout(graph.nodes,graph.edges,graph);
 assert(graph.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)),name);
 assert.equal(JSON.stringify({...graph,nodes:graph.nodes.map(({x,y,...n})=>n)}),semantic);
 if(name==='cake_1 / cake_2' || name==='cake_2 / cake_1') {
  const cake1Side=name.startsWith('cake_1')?'r1':'r2';
  const cake2Side=cake1Side==='r1'?'r2':'r1';
  const at=(side,index)=>graph.nodes.find(n=>n[side+'_node']===index);
  const portY=(n,side)=>n.y+((n.kind==='merged_similar'||n.shape_dumbbell) ? (side==='r1'?-25:25) : 0);
  for(const [side,from,to] of [[cake1Side,15,17],[cake1Side,17,19],[cake2Side,3,12]]) {
   assert.equal(portY(at(side,from),side),portY(at(side,to),side),
    name+': independent lower whisk branch must stay horizontal '+from+'->'+to);
  }
  console.log('PASS:',name,'lower process branches remain horizontal');
 }
 if(name==='cake_2 / cake_3'||name==='cake_3 / cake_2'){
  const side=name.startsWith('cake_3')?'r1':'r2',sign=side==='r1'?-1:1;
  const at=i=>graph.nodes.find(n=>n[side+'_node']===i);
  const donor=at(10),donorY=donor.y+((donor.kind==='merged_similar'||donor.shape_dumbbell)?sign*25:0);
  const neighbour=at(11);
  if(sign*(neighbour.y-donorY)>0)assert(sign*(neighbour.y-at(2).y)>0,name+': receiver cannot cross the egg-white sibling branch');
  for(const i of [2,3,6,8]){
   assert.equal(at(i).y,at(2).y,name+': prepared heat/stir receiver must move as a whole');
   assert(sign*(at(i).y-donorY)>=60,name+': prepared receiver must separate on its recipe side');
  }
 }
 const byId=new Map(graph.nodes.map(n=>[n.id,n]));
 if(name==='cake_1 / cake_2'||name==='cake_2 / cake_1'){
  const portion=graph.nodes.find(n=>graph.edges.filter(e=>e.target===n.id&&e.action==='split').length===2&&graph.edges.filter(e=>e.source===n.id).every(e=>e.action==='add'));
  assert(portion,name+': matched split portion exists');
  for(const e of graph.edges.filter(e=>e.source===portion.id)){
   const target=byId.get(e.target);
   assert(Math.hypot(target.x-portion.x,target.y-portion.y)>=100,name+': split portion clears receiving nodes');
   assert(target.x>portion.x,name+': split ADD flows forward');
  }
 }
 // Whole-branch translation must retain the FINAL process axes.
 for(const e of graph.edges) {
  if(e.action==='add'||e.action==='split'||ctx.nb_receiverBranchConnectors(graph.nodes,graph.edges).has(e))continue;
  const a=byId.get(e.source),b=byId.get(e.target);
  const merged=n=>n.kind==='merged_exact'||n.kind==='merged_similar';
  const lane=n=>n.kind==='only_r1'?-25:n.kind==='only_r2'?25:0;
  if(a.domain!=='main'||b.domain!=='main')continue;
  if(merged(a)||merged(b)) assert.equal(a.y-lane(a),b.y-lane(b),name+': shared branch axis '+e.source+'->'+e.target);
  else if(a.kind===b.kind) assert.equal(a.y,b.y,name+': process chain horizontal '+e.source+'->'+e.target);
 }
 console.log('PASS:',name,'process branch axes and comparison lanes');
 for(const n of graph.nodes){
  if(n.kind!=='only_r1'&&n.kind!=='only_r2')continue;
  const ins=graph.edges.filter(e=>e.target===n.id),outs=graph.edges.filter(e=>e.source===n.id);
  if(ins.length!==1||ins[0].action!=='split'||!outs.length||!outs.every(e=>e.action==='add'))continue;
  const p=byId.get(ins[0].source),direction=n.kind==='only_r2'?1:-1;
  const port=p.y+((p.kind==='merged_similar'||p.shape_dumbbell)?direction*25:0);
  assert(direction*(n.y-port)>=0,name+': split portion must stay on its recipe side '+n.id);
 }
 const positions=JSON.stringify(graph.nodes.map(n=>[n.x,n.y]));
 ctx.newBranchLayout(graph.nodes,graph.edges,graph);
 assert.equal(JSON.stringify(graph.nodes.map(n=>[n.x,n.y])),positions,name+': unstable layout');
}