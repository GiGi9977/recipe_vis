import ELK from "elkjs/lib/elk.bundled.js";
import {edgeAnchorOffset,isAdd,nodeSize} from "../graph.js";
import {refineLayout} from "./refineLayout.js";
import {runEstablishedLayout,separateProcessBranches} from "./establishedLayout.js";

const elk=new ELK();
const PROCESS_PRIORITY="100",ADD_PRIORITY="1";

function compactAddDonorBranches(graph,positions,establishedPositions){
  const byId=new Map(graph.nodes.map(node=>[node.id,node])),parent=new Map(graph.nodes.map(node=>[node.id,node.id]));
  const find=id=>{let root=id;while(parent.get(root)!==root)root=parent.get(root);while(parent.get(id)!==id){const next=parent.get(id);parent.set(id,root);id=next;}return root;};
  const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent.set(b,a);};
  const processIncident=new Set();
  for(const edge of graph.edges){
    if(isAdd(edge)||String(edge.action||"").toLowerCase()==="split")continue;
    join(edge.source,edge.target);processIncident.add(edge.source);processIncident.add(edge.target);
  }
  const groups=new Map();
  for(const node of graph.nodes){const root=find(node.id);if(!groups.has(root))groups.set(root,new Set());groups.get(root).add(node.id);}
  const addEdges=graph.edges.filter(isAdd),moved=new Set();
  const rank=new Map([...groups.keys()].map(root=>[root,0]));
  for(let pass=0;pass<groups.size;pass++)for(const edge of addEdges){
    const sourceRoot=find(edge.source),targetRoot=find(edge.target);
    if(sourceRoot!==targetRoot)rank.set(targetRoot,Math.max(rank.get(targetRoot)||0,(rank.get(sourceRoot)||0)+1));
  }
  const orderedGroups=[...groups].sort((a,b)=>(rank.get(a[0])||0)-(rank.get(b[0])||0));
  const bounds=ids=>[...ids].reduce((box,id)=>{const p=positions.get(id);return{x1:Math.min(box.x1,p.x),x2:Math.max(box.x2,p.x+p.width)};},{x1:Infinity,x2:-Infinity});
  for(const [root,ids] of orderedGroups){
    if([...ids].some(id=>moved.has(id)))continue;
    // Standalone ingredients were already packed into compact rows by
    // refineLayout and are carried with their receiver's upstream bundle.
    if(![...ids].some(id=>processIncident.has(id)))continue;
    const exits=addEdges.filter(edge=>ids.has(edge.source)&&!ids.has(edge.target));
    if(!exits.length)continue;
    const targetRoots=new Set(exits.map(edge=>processIncident.has(edge.target)?find(edge.target):edge.target));
    if(targetRoots.size!==1)continue;
    const targetRoot=[...targetRoots][0],targetIds=groups.get(targetRoot);
    if(!targetIds||targetRoot===root)continue;
    const exitLengths=exits.map(edge=>{const a=positions.get(edge.source),b=positions.get(edge.target);return Math.hypot((a.x+a.width/2)-(b.x+b.width/2),(a.y+a.height/2)-(b.y+b.height/2));});
    if(Math.max(...exitLengths)<=145)continue;
    const moveIds=new Set(ids);
    // Carry every upstream component whose external ADD exits all feed the
    // moving bundle. This shortens a terminal ADD without stretching its
    // preparation inputs behind it.
    let changed=true;
    while(changed){changed=false;for(const [upstreamRoot,upstreamIds] of groups){
      if(upstreamRoot===targetRoot||[...upstreamIds].some(id=>moveIds.has(id)))continue;
      const outgoing=addEdges.filter(edge=>upstreamIds.has(edge.source)&&!upstreamIds.has(edge.target));
      if(outgoing.length&&outgoing.every(edge=>moveIds.has(edge.target))){for(const id of upstreamIds)moveIds.add(id);changed=true;}
    }}
    const edge=exits[0],a=positions.get(edge.source),b=positions.get(edge.target),source=byId.get(edge.source),target=byId.get(edge.target);
    const sx=a.x+a.width/2,tx=b.x+b.width/2;
    const sy=a.y+a.height/2+edgeAnchorOffset(source,edge,"source"),ty=b.y+b.height/2+edgeAnchorOffset(target,edge,"target");
    const establishedSource=establishedPositions.get(edge.source),establishedTarget=establishedPositions.get(edge.target);
    const establishedSx=establishedSource.x+establishedSource.width/2;
    const establishedTx=establishedTarget.x+establishedTarget.width/2;
    const establishedSy=establishedSource.y+establishedSource.height/2+edgeAnchorOffset(source,edge,"source");
    const establishedTy=establishedTarget.y+establishedTarget.height/2+edgeAnchorOffset(target,edge,"target");
    // ELK still decides the overall graph and the shape of each rigid process
    // branch.  The final ADD approach, however, reuses the established view's
    // proven source-to-receiver relationship instead of inventing Auto-only
    // distance slots that can leave the donor far from its receiver.
    const dx=tx+(establishedSx-establishedTx)-sx;
    const dy=ty+(establishedSy-establishedTy)-sy;
    for(const id of moveIds){const p=positions.get(id);p.x+=dx;p.y+=dy;moved.add(id);}
  }
  return moved;
}

function restoreEstablishedStandaloneAdditions(graph,positions,establishedPositions){
  const incoming=new Map(graph.nodes.map(node=>[node.id,[]])),outgoing=new Map(graph.nodes.map(node=>[node.id,[]]));
  for(const edge of graph.edges){incoming.get(edge.target)?.push(edge);outgoing.get(edge.source)?.push(edge);}
  for(const node of graph.nodes){
    const ins=incoming.get(node.id)||[],outs=outgoing.get(node.id)||[];
    if(ins.length||!outs.length||outs.some(edge=>!isAdd(edge)))continue;
    const targets=new Set(outs.map(edge=>edge.target));
    if(targets.size!==1)continue;
    const targetId=[...targets][0],point=positions.get(node.id),target=positions.get(targetId);
    const establishedPoint=establishedPositions.get(node.id),establishedTarget=establishedPositions.get(targetId);
    if(!point||!target||!establishedPoint||!establishedTarget)continue;
    point.x=target.x+(establishedPoint.x-establishedTarget.x);
    point.y=target.y+(establishedPoint.y-establishedTarget.y);
  }
}

// A heating container that starts a process chain (no process input; only
// ingredients added into it) takes the Established offset to its process
// target, together with the standalone ingredients added into it. Skipped when
// the new spot would put it on top of another node.
function restoreEstablishedContainerStarts(graph,positions,establishedPositions){
  const isContainer=node=>node.domain==="container"||node.state_r1?.[1]==="container"||node.state_r2?.[1]==="container";
  const incoming=new Map(graph.nodes.map(node=>[node.id,[]])),outgoing=new Map(graph.nodes.map(node=>[node.id,[]]));
  for(const edge of graph.edges){incoming.get(edge.target)?.push(edge);outgoing.get(edge.source)?.push(edge);}
  const isSplit=edge=>String(edge.action||"").toLowerCase()==="split";
  for(const node of graph.nodes){
    if(!isContainer(node))continue;
    const ins=incoming.get(node.id)||[],outs=(outgoing.get(node.id)||[]).filter(edge=>!isAdd(edge)&&!isSplit(edge));
    if(ins.some(edge=>!isAdd(edge))||!outs.length||new Set(outs.map(edge=>edge.target)).size!==1)continue;
    const point=positions.get(node.id),target=positions.get(outs[0].target),established=establishedPositions.get(node.id),establishedTarget=establishedPositions.get(outs[0].target);
    if(!point||!target||!established||!establishedTarget)continue;
    const dx=target.x+(established.x-establishedTarget.x)-point.x,dy=target.y+(established.y-establishedTarget.y)-point.y;
    if(Math.abs(dx)<1&&Math.abs(dy)<1)continue;
    const moving=new Set([node.id]);
    for(const edge of ins){
      const feeds=(outgoing.get(edge.source)||[]);
      if(!(incoming.get(edge.source)||[]).length&&feeds.length&&feeds.every(other=>other.target===node.id))moving.add(edge.source);
    }
    const margin=4,hit=[...moving].some(id=>{const a=positions.get(id);
      return graph.nodes.some(other=>{if(moving.has(other.id))return false;const b=positions.get(other.id);
        return a.x+dx<b.x+b.width+margin&&a.x+dx+a.width+margin>b.x&&a.y+dy<b.y+b.height+margin&&a.y+dy+a.height+margin>b.y;});});
    if(hit)continue;
    for(const id of moving){const p=positions.get(id);p.x+=dx;p.y+=dy;}
  }
}

function port(node,edge,index,endpoint){
  const size=nodeSize(node),out=endpoint==="source";
  return{id:`${node.id}:${index}:${out?"out":"in"}`,width:1,height:1,
    x:out?size.width:0,
    y:size.height/2+edgeAnchorOffset(node,edge,endpoint),
    layoutOptions:{"elk.port.side":out?"EAST":"WEST"}};
}

export async function runSemanticElkLayout(graph){
  const byId=new Map(graph.nodes.map(node=>[node.id,node])),ports=new Map(graph.nodes.map(node=>[node.id,[]]));
  const edges=graph.edges.map((edge,index)=>{
    const source=port(byId.get(edge.source),edge,index,"source"),target=port(byId.get(edge.target),edge,index,"target");
    ports.get(edge.source).push(source);ports.get(edge.target).push(target);
    const label=String(edge.action||"");
    return{id:edge.id||`edge-${index}`,sources:[source.id],targets:[target.id],
      labels:label?[{id:`label-${index}`,text:label,width:Math.max(24,label.length*7+12),height:16}]:[],
      layoutOptions:{"elk.priority":isAdd(edge)?ADD_PRIORITY:PROCESS_PRIORITY}};
  });
  const model={id:"root",layoutOptions:{
    "elk.algorithm":"layered","elk.direction":"RIGHT","elk.edgeRouting":"SPLINES",
    "elk.hierarchyHandling":"INCLUDE_CHILDREN",
    "elk.layered.considerModelOrder.strategy":"NODES_AND_EDGES",
    "elk.layered.crossingMinimization.strategy":"LAYER_SWEEP",
    "elk.layered.crossingMinimization.forceNodeModelOrder":"false",
    "elk.layered.nodePlacement.strategy":"BRANDES_KOEPF",
    "elk.layered.nodePlacement.bk.fixedAlignment":"BALANCED",
    "elk.layered.spacing.nodeNodeBetweenLayers":"104",
    "elk.spacing.nodeNode":"54","elk.spacing.edgeNode":"28","elk.spacing.edgeEdge":"16",
    "elk.spacing.componentComponent":"72","elk.layered.compaction.postCompaction.strategy":"EDGE_LENGTH"
  },children:graph.nodes.map(node=>{const size=nodeSize(node);return{id:node.id,width:size.width,height:size.height,
    ports:ports.get(node.id),layoutOptions:{"elk.portConstraints":"FIXED_POS"}};}),edges};
  const [result,establishedPositions]=await Promise.all([elk.layout(model),runEstablishedLayout(graph)]),positions=new Map();
  for(const item of result.children||[]){const node=byId.get(item.id),size=nodeSize(node);positions.set(item.id,{x:item.x||0,y:item.y||0,width:size.width,height:size.height});}
  if(positions.size!==graph.nodes.length)throw new Error("Semantic ELK omitted graph nodes");
  const refined=refineLayout(graph,positions);
  separateProcessBranches(graph,refined);
  compactAddDonorBranches(graph,refined,establishedPositions);
  restoreEstablishedStandaloneAdditions(graph,refined,establishedPositions);
  restoreEstablishedContainerStarts(graph,refined,establishedPositions);
  return refined;
}
