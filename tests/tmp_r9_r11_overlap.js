const fs=require('fs'),{spawnSync}=require('child_process');
const s=fs.readFileSync('frontend/app.js','utf8'),code=s.slice(s.indexOf('function nb_buildNodeById('),s.indexOf('function renderGraph('));
const api=new Function('isContainerNode','isAddEdge','getHalfOffsetForNode','console',code+';return {layout:newBranchLayout,geometry:nb_finalBranchGeometry};')(
 n=>[n.state_r1,n.state_r2].some(x=>x?.[1]==='container'),e=>e.action==='add',n=>n.domain==='aux'?12:25,{log(){},group(){},groupEnd(){}});
const p=spawnSync(process.env.RECIPE_TEST_PYTHON||'python',['-c',String.raw`
import json,contextlib,io
from pathlib import Path
from backend.graph_builder import build_full_graph_main_aux
from backend.matcher import compare_recipes
ps=[Path('data/9 Classic Moussaka.json'),Path('data/11 Moussaka with Potato, Eggplant, Beef and Béchamel.json')]
rs=[json.loads(x.read_text(encoding='utf-8')) for x in ps]
with contextlib.redirect_stdout(io.StringIO()):g=build_full_graph_main_aux(rs[0],rs[1],compare_main_fn=compare_recipes)
print(json.dumps(g))
`],{encoding:'utf8',maxBuffer:64*1024*1024});if(p.status)throw Error(p.stderr);
const g=JSON.parse(p.stdout);api.layout(g.nodes,g.edges,g);const {groups,owner}=api.geometry(g.nodes,g.edges);
const b=n=>{const r=n.domain==='aux'?11:24,h=(n.kind==='merged_similar'||n.shape_dumbbell)?(n.domain==='aux'?12:25):0;return {l:n.x-r,r:n.x+r,t:n.y-h-r,b:n.y+h+r};};
for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++)for(const a of groups[i].nodes)for(const c of groups[j].nodes){
 if(a.domain!=='main'||c.domain!=='main')continue;const x=b(a),y=b(c);if(x.r+8<=y.l||y.r+8<=x.l||x.b+8<=y.t||y.b+8<=x.t)continue;
 console.log('OVERLAP g'+i,a.id,a.r1_node,a.r2_node,a.state_r1?.[0],a.state_r2?.[0],a.x,a.y,'g'+j,c.id,c.r1_node,c.r2_node,c.state_r1?.[0],c.state_r2?.[0],c.x,c.y);
}
