const fs=require('fs'),assert=require('assert'),{spawnSync}=require('child_process');
const source=fs.readFileSync('frontend/app.js','utf8');
const code=source.slice(source.indexOf('function nb_buildNodeById('),source.indexOf('function renderGraph('));
const api=new Function('isContainerNode','isAddEdge','getHalfOffsetForNode','console',code+';return {layout:newBranchLayout,geometry:nb_finalBranchGeometry};')(
 n=>[n.state_r1,n.state_r2].some(s=>s?.[1]==='container'),e=>e.action==='add',n=>n.domain==='aux'?12:25,{log(){},group(){},groupEnd(){}});
const result=spawnSync(process.env.RECIPE_TEST_PYTHON||'python',['-c',String.raw`
import json,contextlib,io
from pathlib import Path
from backend.graph_builder import build_full_graph_main_aux
from backend.matcher import compare_recipes
ps=[Path('data/9 Classic Moussaka.json'),Path('data/10 Moussaka with Potato and Eggplant.json')]
rs=[json.loads(p.read_text(encoding='utf-8')) for p in ps]
graphs=[]
with contextlib.redirect_stdout(io.StringIO()):
 for a,b in ((rs[0],rs[1]),(rs[1],rs[0])):
  graphs.append(build_full_graph_main_aux(a,b,compare_main_fn=compare_recipes))
print(json.dumps(graphs))
`],{encoding:'utf8',maxBuffer:64*1024*1024});
assert.equal(result.status,0,result.stderr);

for(const graph of JSON.parse(result.stdout)){
 const semantic=JSON.stringify(graph);
 api.layout(graph.nodes,graph.edges,graph);
 const by=new Map(graph.nodes.map(n=>[n.id,n]));
 const candidates=graph.nodes.map(target=>({target,incoming:graph.edges.filter(e=>e.target===target.id&&e.action==='add'&&by.get(e.source)?.domain==='main')}))
  .filter(x=>x.incoming.length>=3).sort((a,b)=>b.incoming.length-a.incoming.length);
 assert(candidates.length,'Expected a many-to-one terminal merge');
 const {target,incoming}=candidates[0],sources=incoming.map(e=>by.get(e.source));
 assert(sources.every(n=>n.x<target.x),'Terminal branches must approach the final receiver from the left');
 assert(sources.every(n=>n.y<target.y),'Final receiver must follow the compact incoming stack');
 const ys=[...new Set(sources.map(n=>n.y))].sort((a,b)=>a-b);
 const clusters=[];
 for(const y of ys){
  const last=clusters[clusters.length-1];
  if(last&&y-last[last.length-1]<=40)last.push(y);else clusters.push([y]);
 }
 const centers=clusters.map(c=>c.reduce((a,b)=>a+b,0)/c.length);
 assert(centers.length>=3,'Expected several ordered terminal branch groups');
 const maxDistance=Math.max(...sources.map(n=>Math.hypot(target.x-n.x,target.y-n.y)));
 assert(maxDistance<=1100,`Terminal merge fan remains too long: ${maxDistance}`);
 const processIn=graph.edges.find(e=>e.target===target.id&&e.action!=='add');
 assert(processIn,'Expected the final process feeder');
 assert.equal(by.get(processIn.source).y,target.y,'Final process feeder must move with the receiver');
 const {groups,owner}=api.geometry(graph.nodes,graph.edges);
 const branchGroups=[...new Set(sources.map(n=>owner.get(n.id)))];
 const bounds=n=>{const outer=[n.state_r1,n.state_r2].some(s=>s?.[1]==='container')?16:(n.domain==='aux'?11:24);
  const half=(n.kind==='merged_similar'||n.shape_dumbbell)?(n.domain==='aux'?12:25):0;
  return {l:n.x-outer,r:n.x+outer,t:n.y-half-outer,b:n.y+half+outer};};
 for(let i=0;i<branchGroups.length;i++)for(let j=i+1;j<branchGroups.length;j++)
  for(const aNode of groups[branchGroups[i]].nodes)for(const bNode of groups[branchGroups[j]].nodes){
   const a=bounds(aNode),b=bounds(bNode);
   if(a.r<=b.l||b.r<=a.l)continue;
   assert(a.b+14<=b.t||b.b+14<=a.t,'Terminal branch node bodies overlap');
  }
 assert.equal(JSON.stringify({...graph,nodes:graph.nodes.map(({x,y,...n})=>n)}),semantic,'Layout changed graph semantics');
 const positions=JSON.stringify(graph.nodes.map(n=>[n.x,n.y]));
 api.layout(graph.nodes,graph.edges,graph);
 assert.equal(JSON.stringify(graph.nodes.map(n=>[n.x,n.y])),positions,'Terminal merge layout must be stable');
}
console.log('PASS: final many-to-one branches form a compact ordered merge fan');
