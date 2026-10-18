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
return {newBranchLayout, nb_finalBranchGeometry, nb_resolveFinalBranchCollisions, nb_receiverBranchConnectors,
 get nb_angleBranchAdditions(){return nb_angleBranchAdditions;},
 set nb_angleBranchAdditions(value){nb_angleBranchAdditions=value;},
 get nb_avoidBranchObstructions(){return nb_avoidBranchObstructions;},
 set nb_avoidBranchObstructions(value){nb_avoidBranchObstructions=value;}};
`)(ctx.isContainerNode,ctx.isAddEdge,ctx.getHalfOffsetForNode,ctx.console);
Object.defineProperties(ctx,Object.getOwnPropertyDescriptors(layout));
const cases=JSON.parse(fs.readFileSync('tests/tmp_live_cases.json','utf8'));
let cross=0,internal=0,examples=[];
for(const c of cases){
 ctx.newBranchLayout(c.graph.nodes,c.graph.edges,c.graph);
 const {groups,owner}=ctx.nb_finalBranchGeometry(c.graph.nodes,c.graph.edges);
 for(let i=0;i<c.graph.nodes.length;i++)for(let j=i+1;j<c.graph.nodes.length;j++){
  const a=c.graph.nodes[i],b=c.graph.nodes[j];
  const r=n=>ctx.isContainerNode(n)?16:n.domain==='aux'?11:24;
  const h=n=>(n.kind==='merged_similar'||n.shape_dumbbell)?ctx.getHalfOffsetForNode(n):0;
  if(Math.abs(a.x-b.x)<r(a)+r(b)+2&&Math.abs(a.y-b.y)<r(a)+r(b)+h(a)+h(b)+2){
   if(owner.get(a.id)===owner.get(b.id))internal++;else cross++;
   if(examples.length<12)examples.push([c.name,[a.id,a.kind,a.x,a.y],[b.id,b.kind,b.x,b.y],c.graph.edges.filter(e=>[a.id,b.id].includes(e.source)&&[a.id,b.id].includes(e.target))]);
  }
 }
 if(c.name.includes('basic_cake_baking_2')&&c.name.includes('basic_cake_baking_3'))fs.writeFileSync('tests/tmp_split_'+(c.name.startsWith('basic_cake_baking_2')?'14_15':'15_14')+'.json',JSON.stringify(c.graph));
}
console.log(JSON.stringify({cases:cases.length,cross,internal,examples},null,2));
