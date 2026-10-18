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
// The heat predecessor AND downstream processing must move with the receiver.
{
 const node=(id,x,y)=>({id,x,y,kind:'only_r2',domain:'main'});
 const nodes=[node('s0',0,0),node('s1',130,0),node('r0',100,0),node('r1',260,0),node('r2',390,0),{...node('a',230,20),domain:'aux'}];
 const edges=[{source:'s0',target:'s1',action:'wash'},{source:'r0',target:'r1',action:'heat'},{source:'r1',target:'r2',action:'sear'},{source:'s1',target:'r1',action:'add',style:'R2'},{source:'a',target:'r1',action:'add',style:'R2'}];
 ctx.nb_angleBranchAdditions(nodes,edges,new Set());
 assert.equal(nodes[0].y,0);assert.equal(nodes[1].y,0);
 assert(nodes[3].y>=65,'R2 receiver branch must move downward');
 assert.equal(nodes[2].y,nodes[3].y,'Heat predecessor moves with receiver');
 assert.equal(nodes[4].y,nodes[3].y,'Downstream sear stays horizontal');
 assert.equal(nodes[5].y-nodes[3].y,20,'Attachment follows entire branch');
 const joined=[node('j0',0,0),node('j1',130,0),node('j2',260,0)];
 const same=[{source:'j0',target:'j1',action:'prepare'},{source:'j1',target:'j2',action:'heat'},{source:'j0',target:'j2',action:'add',style:'R2'}];
 const before=JSON.stringify(joined);ctx.nb_angleBranchAdditions(joined,same,new Set());
 assert.equal(JSON.stringify(joined),before,'An internal ADD cannot split a process-connected branch');
 const ordinary=[node('raw',0,0),node('empty',130,0),node('food',260,0)];
 const transfer=[{source:'raw',target:'empty',action:'add',style:'R2'},{source:'empty',target:'food',action:'fry',style:'R2'}];
 const original=JSON.stringify(ordinary);ctx.nb_angleBranchAdditions(ordinary,transfer,new Set());
 assert.equal(JSON.stringify(ordinary),original,'An ordinary addition to an unprepared receiver must remain unchanged');
 const upper=[node('u0',0,0),node('u1',130,0),node('v0',100,0),node('v1',260,0),node('v2',390,0)].map(n=>({...n,kind:'only_r1'}));
 const upperEdges=[{source:'u0',target:'u1',action:'wash'},{source:'v0',target:'v1',action:'heat'},{source:'v1',target:'v2',action:'sear'},{source:'u1',target:'v1',action:'add',style:'R1'}];
 ctx.nb_angleBranchAdditions(upper,upperEdges,new Set());
 assert(upper[3].y<=-65,'R1 receiver branch must move upward');
 assert.equal(upper[2].y,upper[3].y);assert.equal(upper[4].y,upper[3].y);
 for(const sign of [1,-1]){
  const kind=sign===1?'only_r2':'only_r1',style=sign===1?'R2':'R1';
  const bounded=[node('s0',0,0),node('s1',130,0),node('r0',100,0),node('r1',260,0),node('r2',390,0),node('b0',100,sign*110),node('b1',390,sign*110)].map(n=>({...n,kind}));
  bounded.push({...node('root',-30,sign*64),kind});
  const links=edges.filter(e=>e.source!=='a').map(e=>({...e,style}));
  links.push({source:'root',target:'s0',action:'split',style});
  links.push({source:'b0',target:'b1',action:'whisk',style});
  ctx.nb_angleBranchAdditions(bounded,links,new Set());
  assert(sign*bounded[3].y===50,'Use a shallower angle without crossing nearest unrelated branch');
  assert.equal(bounded[2].y,bounded[3].y);assert.equal(bounded[4].y,bounded[3].y);
  assert.equal(bounded[5].y,sign*110,'Neighbour branch remains fixed');
 }
 console.log('PASS: whole receiving branch and attachments move together; internal ADD does not deform branch');
}
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
let checked=0;
const angle=ctx.nb_angleBranchAdditions;
ctx.nb_angleBranchAdditions=(nodes,edges,attached)=>{
 const connectors=ctx.nb_receiverBranchConnectors(nodes,edges);
 const before=new Map(nodes.map(n=>[n.id,{x:n.x,y:n.y}]));
 angle(nodes,edges,attached);
 const by=new Map(nodes.map(n=>[n.id,n]));
 for(const n of nodes)assert.equal(n.x,before.get(n.id).x,'Branch separation must not change x');
 for(const e of edges){
  if(e.action==='add'||connectors.has(e))continue;
  assert.equal(by.get(e.target).y-by.get(e.source).y,
   before.get(e.target).y-before.get(e.source).y,'Never deform process/split edge '+e.source+'->'+e.target);
 }
};
for(const {name,graph} of cases){
 const semantic=JSON.stringify(graph);
 ctx.newBranchLayout(graph.nodes,graph.edges,graph);
 const by=new Map(graph.nodes.map(n=>[n.id,n]));
 if(name==='broccoli_with_shrimp / oil_braised_shrimp'||name==='oil_braised_shrimp / broccoli_with_shrimp'){
  const side=name.startsWith('oil_')?'r1':'r2',sign=side==='r2'?1:-1;
  const other=side==='r1'?'r2':'r1';
  const at=(s,i)=>graph.nodes.find(n=>n[s+'_node']===i);
  const root=at(side,16),cut=at(side,17),receiver=at(side,21),direct=at(other,17);
  const directPort=direct.y+((direct.kind==='merged_similar'||direct.shape_dumbbell)?-sign*25:0);
  assert.equal(root.y,directPort,name+': shared raw input aligned with direct receiver');
  assert(sign*(cut.y-receiver.y)>=60&&sign*(cut.y-receiver.y)<=160,name+': prepared shrimp approaches its own recipe side');
  assert(sign*(cut.y-root.y)>0,name+': cut branch cannot overlap the opposite feeding lane');
  assert(Math.abs(root.y-at(other,6).y)>=60,name+': shrimp root clear of blanched vegetable branch');
 }
 if(name.includes('no_churn_homemade_ice_cream')&&name.includes('homemade_häagen_dazs_style_ice_cream')){
  const side=name.startsWith('no_churn')?'r1':'r2',sign=side==='r1'?-1:1;
  const at=(i,s=side)=>graph.nodes.find(n=>n[s+'_node']===i);
  const offset=sign*(at(9).y-at(6).y);
  assert(offset>=60&&offset<=160,name+': heated feeder stays near receiver on correct side');
  assert.equal(at(8).y,at(9).y,name+': feeder heat stays horizontal');
  assert.equal(at(10).y,at(12).y,name+': processed inline transfer into empty pot stays horizontal');
  assert.equal(at(12).y,at(13).y,name+': downstream heat chain follows inline transfer');
  assert.equal(at(7).y,at(8).y,name+': raw milk to empty pot is horizontal');
  const other=side==='r1'?'r2':'r1',otherSign=-sign;
  assert(otherSign*(at(3,other).y-at(2,other).y)>=100,name+': original egg split must keep independent lanes');
  assert(otherSign*(at(24,other).y-at(25,other).y)>=0,name+': split outputs follow receiver order');
  assert(otherSign*(at(25,other).y-at(26,other).y)>=0,name+': split outputs cannot twist');
  const fanA=[15,16].map(i=>at(i,other)),fanB=[24,25,26].map(i=>at(i,other));
  for(const group of [fanA,fanB])for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++)
   assert(Math.hypot(group[i].x-group[j].x,group[i].y-group[j].y)>=70,name+': split nodes have visible gaps');
  const orient=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const crossings=(a,b,c,d)=>orient(a,b,c)*orient(a,b,d)<-0.01&&orient(c,d,a)*orient(c,d,b)<-0.01;
  const segment=group=>group.flatMap(n=>graph.edges.filter(e=>(e.target===n.id&&e.action==='split')||(e.source===n.id&&e.action==='add')).map(e=>[by.get(e.source),by.get(e.target)]));
  for(const [a,b] of segment(fanA))for(const [c,d] of segment(fanB))assert(!crossings(a,b,c,d),name+': separate split fans must not cross');
  for(const i of [5,6,7]){
   const distance=otherSign*(at(i,other).y-at(3,other).y);
   assert(distance>=60&&distance<=160,name+': aux split feeder stays near receiving branch');
  }
 }
 const connectors=ctx.nb_receiverBranchConnectors(graph.nodes,graph.edges);
 const adj=new Map(graph.nodes.map(n=>[n.id,[]]));
 for(const e of graph.edges){
  const target=by.get(e.target);
  const container=ctx.isContainerNode(target);
  const prepared=graph.edges.some(p=>p.target===e.target&&p.action!=='add');
  const mainInputs=new Set(graph.edges.filter(p=>p.target===e.target&&p.action==='add'&&by.get(p.source).domain==='main').map(p=>p.source));
  const inline=e.action==='add'&&by.get(e.source).domain==='main'&&container&&!prepared&&mainInputs.size===1;
  if((e.action!=='add'&&!connectors.has(e))||inline){adj.get(e.source).push(e.target);adj.get(e.target).push(e.source);}
 }
 const component=new Map();let count=0;
 for(const n of graph.nodes){if(component.has(n.id))continue;const q=[n.id];while(q.length){const id=q.pop();if(component.has(id))continue;component.set(id,count);q.push(...adj.get(id));}count++;}
 const port=(n,other,e,source)=>{
  if(n.kind!=='merged_similar'&&!n.shape_dumbbell)return n.y;
  let side=e.style==='R1'?'T':e.style==='R2'?'B':(source?e.source_anchor:e.target_anchor);
  if(other.kind==='only_r1')side='T';else if(other.kind==='only_r2')side='B';
  return n.y+(side==='T'?-ctx.getHalfOffsetForNode(n):side==='B'?ctx.getHalfOffsetForNode(n):0);
 };
 for(const e of graph.edges){
  const a=by.get(e.source),b=by.get(e.target);
  if(e.action!=='add'||a.domain!=='main'||b.domain!=='main'||component.get(a.id)===component.get(b.id))continue;
  if(!graph.edges.some(f=>f.target===a.id&&f.action!=='add')||!graph.edges.some(f=>f.target===b.id&&f.action!=='add'))continue;
  // Only independently processed inputs combine two existing branches.
  const incoming=graph.edges.filter(f=>f.target===a.id);
  const out=graph.edges.filter(f=>f.source===a.id);
  if(!incoming.length&&out.every(f=>f.action==='add')&&new Set(out.map(f=>f.target)).size===1)continue;
  assert(Math.abs(port(a,b,e,true)-port(b,a,e,false))>0.001,name+': flat branch ADD '+e.source+'->'+e.target);
  checked++;
 }
 if(name==='braised_pork_with_potato / redpork_2'||name==='redpork_2 / braised_pork_with_potato'){
  const side=name.startsWith('redpork_2')?'r1':'r2';
  const at=i=>graph.nodes.find(n=>n[side+'_node']===i);
  const lane=n=>n.y+((n.kind==='merged_similar'||n.shape_dumbbell)?(side==='r1'?-25:25):0);
  assert.equal(lane(at(6)),lane(at(9)),name+': heat must remain horizontal');
  assert.equal(lane(at(9)),lane(at(10)),name+': sear must remain horizontal');
  assert.equal(lane(at(15)),lane(at(17)),name+': ordinary pork-to-simmering-pot ADD stays horizontal');
  const otherSide=side==='r1'?'r2':'r1';
  const other=i=>graph.nodes.find(n=>n[otherSide+'_node']===i);
  const otherLane=n=>n.y+((n.kind==='merged_similar'||n.shape_dumbbell)?(otherSide==='r1'?-25:25):0);
  assert.equal(otherLane(other(32)),otherLane(other(33)),name+': ordinary pork-to-wok ADD stays horizontal');
  const direction=side==='r1'?-1:1;
  assert(direction*(lane(at(6))-lane(at(5)))>0.001,name+': R1 pot above / R2 pot below donor pork');
  assert(Math.abs(lane(at(5))-lane(at(9)))>0.001,name+': add must not overlap heat');
  console.log('PASS:',name,'separate pork/preheated-pot branches; horizontal heat and sear');
 }
 assert(graph.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)),name);
 assert.equal(JSON.stringify({...graph,nodes:graph.nodes.map(({x,y,...n})=>n)}),semantic,name+': changed semantics');
 const pos=JSON.stringify(graph.nodes.map(n=>[n.x,n.y]));
 ctx.newBranchLayout(graph.nodes,graph.edges,graph);
 assert.equal(JSON.stringify(graph.nodes.map(n=>[n.x,n.y])),pos,name+': unstable');
}
assert(checked>0);
console.log('PASS:',cases.length,'comparisons;',checked,'angled main-branch additions, stable finite coordinates and unchanged semantics');
