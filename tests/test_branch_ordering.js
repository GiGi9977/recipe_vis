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
return {newBranchLayout,
 get nb_avoidBranchObstructions(){return nb_avoidBranchObstructions;},
 set nb_avoidBranchObstructions(value){nb_avoidBranchObstructions=value;}};
`)(ctx.isContainerNode,ctx.isAddEdge,ctx.getHalfOffsetForNode,ctx.console);
Object.defineProperties(ctx,Object.getOwnPropertyDescriptors(layout));
const compactStart=layoutCode.indexOf('  // Compact vertical separation without forcing process edges');
const compactEnd=layoutCode.indexOf('  // An independently heated vessel',compactStart);
assert(compactStart>=0 && compactEnd>compactStart);
const priorLayout=new Function('isContainerNode','isAddEdge','getHalfOffsetForNode','console',
 layoutCode.slice(0,compactStart)+layoutCode.slice(compactEnd)+';return newBranchLayout;')(
 ctx.isContainerNode,ctx.isAddEdge,ctx.getHalfOffsetForNode,ctx.console);
const result = spawnSync(process.env.RECIPE_TEST_PYTHON || 'python',['-c',`
import json,contextlib,io
from pathlib import Path
from backend.graph_builder import build_full_graph_main_aux
from backend.matcher import compare_recipes
recipes=[(p.stem,json.loads(p.read_text(encoding='utf-8'))) for p in sorted(Path('data').glob('*.json'))]
results=[]
with contextlib.redirect_stdout(io.StringIO()):
 for an,a in recipes:
  for bn,b in recipes:
   results.append(dict(name=an+' / '+bn,graph=build_full_graph_main_aux(a,b,compare_main_fn=compare_recipes)))
print(json.dumps(results))
`],{encoding:'utf8',maxBuffer:64*1024*1024});
assert.equal(result.status,0,result.stderr);
const cases=JSON.parse(result.stdout);
let improved=0, maxMs=0;
function obstructions(nodes,edges,owner) {
 const byId=new Map(nodes.map(n=>[n.id,n])); let hits=0;
 for(const e of edges) {
  if(!owner.has(e.source)||!owner.has(e.target)||owner.get(e.source)===owner.get(e.target))continue;
  const a=byId.get(e.source),b=byId.get(e.target);if(!a||!b)continue;
  const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;if(!len)continue;
  for(const n of nodes){
   if(n===a||n===b)continue;
   const t=((n.x-a.x)*dx+(n.y-a.y)*dy)/len;if(t<=0||t>=1)continue;
   const r=(n.domain==='main'?24:11)+((n.kind==='merged_similar'||n.shape_dumbbell)?ctx.getHalfOffsetForNode(n):0);
   if(Math.hypot(n.x-a.x-t*dx,n.y-a.y-t*dy)<r+8)hits++;
  }
 }
 return hits;
}
const optimize=ctx.nb_avoidBranchObstructions;
let report;
ctx.nb_avoidBranchObstructions=(nodes,edges,owner)=>{
 const before=obstructions(nodes,edges,owner);
 optimize(nodes,edges,owner);
 const after=obstructions(nodes,edges,owner);
 report={before,after};
};
for(const {name,graph} of cases){
 const previous = name==='cake_1 / cake_1' ? JSON.parse(JSON.stringify(graph)) : null;
 if(previous) priorLayout(previous.nodes,previous.edges,previous);
 const semantic=JSON.stringify(graph),start=Date.now();
 const branches=ctx.newBranchLayout(graph.nodes,graph.edges,graph);maxMs=Math.max(maxMs,Date.now()-start);
 assert(graph.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)),name);
 const bare={...graph,nodes:graph.nodes.map(({x,y,...n})=>n)};
 assert.equal(JSON.stringify(bare),semantic,name+': semantics changed');
 assert(report.after<=report.before,name+': edge/node obstructions worsened');
 if(report.after<report.before)improved++;
 if(previous) {
  const oldBy=new Map(previous.nodes.map(n=>[n.id,n])), by=new Map(graph.nodes.map(n=>[n.id,n]));
  let beforeMax=0,afterMax=0;
  for(const e of graph.edges) {
   const oa=oldBy.get(e.source),ob=oldBy.get(e.target),a=by.get(e.source),b=by.get(e.target);
   if(e.action==='split') {beforeMax=Math.max(beforeMax,Math.abs(ob.y-oa.y));afterMax=Math.max(afterMax,Math.abs(b.y-a.y));}
   if(e.action==='add') assert(Math.hypot(b.x-a.x,b.y-a.y)<=Math.hypot(ob.x-oa.x,ob.y-oa.y)+0.01,'Process compaction must not lengthen additions');
  }
  console.log('CAKE1 split vertical span',beforeMax,'->',afterMax);
  assert(afterMax<beforeMax,'Long cake split edges must become shorter');
  assert(afterMax<=260,'Split edges must not span more than two standard rows');
 }

 const positions=JSON.stringify(graph.nodes.map(n=>[n.x,n.y]));
 ctx.newBranchLayout(graph.nodes,graph.edges,graph);
 assert.equal(JSON.stringify(graph.nodes.map(n=>[n.x,n.y])),positions,name+': unstable layout');
 if(name==='cake_3 / cake_3') {
  const at=i=>graph.nodes.find(n=>n.r1_node===i);
  for(const [a,b] of [[11,8],[22,12],[23,24]]) {
   assert.equal(at(b).x-at(a).x,130,'Split portion must be close to its receiving node');
   assert.equal(at(b).y-at(a).y,130,'Cake split additions must have matching downward 45-degree angles');
  }
  assert(at(11).x<at(22).x && at(22).x<at(23).x,'Split endpoints follow receiver order');
  assert.equal(at(3).x-at(2).x,130,'Pot-to-oil process step must be compact');
  assert.equal(at(3).y,at(2).y);
  assert.equal(at(29).x-at(28).x,130,'Oven heating step uses standard spacing');
  assert.equal(at(29).y,at(28).y);
  assert.equal(at(29).y-at(27).y,130,'Oven preparation is on a separate row below batter');
  console.log('PASS: cake_3 short ordered 45-degree additions, compact pot/oil step, separate oven heating');
 }
 if(name==='cake_2 / cake_2') {
  const beforeHeat=graph.nodes.find(n=>n.r1_node===17);
  const afterHeat=graph.nodes.find(n=>n.r1_node===18);
  assert(beforeHeat && afterHeat);
  assert.equal(afterHeat.x-beforeHeat.x,130,'Incoming batter must not stretch the oven heating step');
  assert.equal(afterHeat.y,beforeHeat.y,'Oven heating remains horizontal');
  console.log('PASS: cake_2 oven 17→18 uses one 130px interval despite incoming batter');
 }
 if(name==='braised_pork_with_potato / braised_pork_with_potato') {
  const at = index => graph.nodes.find(n=>n.r1_node===index);
  assert.equal(at(15).x-at(14).x,130,'Reduction chain must use one standard interval');
  assert.equal(at(42).x-at(41).x,130,'Potato cutting chain must use one standard interval');
  for (const [from,to] of [[10,15],[42,38]]) {
   assert.equal(at(to).x-at(from).x,130,'Preparation branch must be one interval from receiver');
   assert.equal(Math.abs(at(to).y-at(from).y),130,'Both add edges should have a 45-degree angle');
  }
  assert.equal(at(10).y,at(42).y,'Separated preparation chains can reuse the same row');
  console.log('PASS: pork/potato receiver proximity, equal 130px intervals and matching 45-degree joins');
 }
 if(name==='classic_moussaka / classic_moussaka') {
  const hasInput=new Set(graph.edges.map(e=>e.target)), groups=new Map();
  for(const node of graph.nodes) {
   if(node.domain!=='aux'||ctx.isContainerNode(node)||hasInput.has(node.id)) continue;
   const out=graph.edges.filter(e=>e.source===node.id);
   if(!out.length||!out.every(e=>e.action==='add')||new Set(out.map(e=>e.target)).size!==1)continue;
   const id=out[0].target;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(node);
  }
  const largest=[...groups.values()].sort((a,b)=>b.length-a.length)[0];
  assert(largest.length>=5,'Expected the moussaka seasoning cluster');
  assert(Math.max(...largest.map(n=>n.x))-Math.min(...largest.map(n=>n.x))<=104,
   'Actual moussaka seasonings must use compact rows');
  console.log('PASS: actual moussaka seasoning cluster is compact');
 }
 if(name==='classic_moussaka / classic_moussaka'||name==='potato_eggplant_moussaka / potato_eggplant_moussaka') {
  console.log(name,report);
  if(name.startsWith('potato_')) {
   const white=graph.nodes.find(n=>n.r1_node===44), meat=graph.nodes.find(n=>n.r1_node===21);
   assert(white && meat && white.y<meat.y,'White sauce must be above meat sauce, as requested');
  }
  assert(report.after<=report.before,name+': joining-edge obstruction must not worsen');
  if(name.startsWith('potato_')) assert(report.after<report.before,'Potato moussaka regression must improve');
 }
}
console.log('PASS:',cases.length,'actual backend recipe graphs; finite/deterministic coordinates, unchanged semantics;',improved,'graphs with fewer edge/node obstructions; max layout',maxMs,'ms');
