import {edgeRecipe,isAdd,nodeSize} from "../graph.js";
import {runEstablishedLayout} from "./establishedLayout.js";

const X_GAP=150,Y_GAP=82;
const lane=node=>node.kind==="only_r1"?0:node.kind==="only_r2"?2:1;

function separateBranches(graph,positions){
  const parent=new Map(graph.nodes.map(node=>[node.id,node.id]));
  const find=id=>{let root=id;while(parent.get(root)!==root)root=parent.get(root);while(parent.get(id)!==id){const next=parent.get(id);parent.set(id,root);id=next;}return root;};
  const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent.set(b,a);};
  const processIncident=new Set();
  for(const edge of graph.edges){
    if(isAdd(edge)||String(edge.action||"").toLowerCase()==="split")continue;
    if(parent.has(edge.source)&&parent.has(edge.target)){join(edge.source,edge.target);processIncident.add(edge.source);processIncident.add(edge.target);}
  }
  // Standalone ingredients travel with the branch they feed, so their compact
  // cluster does not get separated from its target during collision removal.
  for(const edge of graph.edges){
    if(!isAdd(edge)||processIncident.has(edge.source)||!parent.has(edge.target))continue;
    if(parent.has(edge.source))join(edge.source,edge.target);
  }
  const groups=new Map();
  for(const node of graph.nodes){const root=find(node.id);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(node.id);}
  const box=ids=>ids.reduce((bounds,id)=>{const p=positions.get(id);return{x1:Math.min(bounds.x1,p.x),y1:Math.min(bounds.y1,p.y),x2:Math.max(bounds.x2,p.x+p.width),y2:Math.max(bounds.y2,p.y+p.height)};},{x1:Infinity,y1:Infinity,x2:-Infinity,y2:-Infinity});
  const items=[...groups.values()].map(ids=>({ids,bounds:box(ids)})).sort((a,b)=>a.bounds.y1-b.bounds.y1||a.bounds.x1-b.bounds.x1);
  const placed=[],margin=34;
  for(const item of items){
    let shift=0;
    for(const prior of placed){
      const horizontal=item.bounds.x1<prior.bounds.x2+margin&&item.bounds.x2+margin>prior.bounds.x1;
      if(horizontal&&item.bounds.y1+shift<prior.bounds.y2+margin&&item.bounds.y2+shift+margin>prior.bounds.y1)shift=Math.max(shift,prior.bounds.y2+margin-item.bounds.y1);
    }
    if(shift){for(const id of item.ids)positions.get(id).y+=shift;item.bounds.y1+=shift;item.bounds.y2+=shift;}
    placed.push(item);
  }
}

function fastLayout(graph){
  const byId=new Map(graph.nodes.map(node=>[node.id,node]));
  const processEdges=graph.edges.filter(edge=>!isAdd(edge)&&byId.has(edge.source)&&byId.has(edge.target));
  const outgoing=new Map(graph.nodes.map(node=>[node.id,[]]));
  const indegree=new Map(graph.nodes.map(node=>[node.id,0]));
  for(const edge of processEdges){outgoing.get(edge.source).push(edge.target);indegree.set(edge.target,indegree.get(edge.target)+1);}
  const depth=new Map(graph.nodes.map(node=>[node.id,0]));
  const queue=graph.nodes.filter(node=>indegree.get(node.id)===0).map(node=>node.id);
  for(let cursor=0;cursor<queue.length;cursor+=1){const id=queue[cursor];for(const next of outgoing.get(id)){depth.set(next,Math.max(depth.get(next),depth.get(id)+1));indegree.set(next,indegree.get(next)-1);if(indegree.get(next)===0)queue.push(next);}}
  const positions=new Map(),slots=new Map();
  for(const node of graph.nodes.filter(node=>node.domain!=="aux")){
    const column=depth.get(node.id)||0,band=lane(node),key=`${column}:${band}`,slot=slots.get(key)||0;slots.set(key,slot+1);
    const size=nodeSize(node);positions.set(node.id,{x:60+column*X_GAP,y:60+band*210+slot*Y_GAP,width:size.width,height:size.height});
  }
  for(const node of graph.nodes.filter(node=>node.domain==="aux")){
    const edge=graph.edges.find(candidate=>isAdd(candidate)&&candidate.source===node.id),target=edge&&positions.get(edge.target),size=nodeSize(node),side=edgeRecipe(edge);
    const x=target?target.x-70:60+(depth.get(node.id)||0)*X_GAP,key=`aux:${Math.round(x)}:${Math.round(target?.y||300)}`,slot=slots.get(key)||0;slots.set(key,slot+1);
    const y=(target?target.y+(side==="R1"?-70:side==="R2"?90:10):300)+slot*34;
    positions.set(node.id,{x,y,width:size.width,height:size.height});
  }
  separateBranches(graph,positions);
  return positions;
}

export async function runLayout(graph,mode="established"){
  let positions;
  try{
    if(mode==="auto"){
      const{runSemanticElkLayout}=await import("./semanticElkLayout.js");
      positions=await runSemanticElkLayout(graph);
    }else positions=await runEstablishedLayout(graph);
  }
  catch(error){
    if(mode==="auto"){
      console.warn("Semantic ELK unavailable; using established layout",error);
      try{positions=await runEstablishedLayout(graph);}
      catch(fallbackError){console.warn("Established layout unavailable; using fast fallback",fallbackError);positions=fastLayout(graph);}
    }else{console.warn("Established layout unavailable; using fast fallback",error);positions=fastLayout(graph);}
  }
  const values=[...positions.values()],minX=Math.min(...values.map(p=>p.x)),minY=Math.min(...values.map(p=>p.y));
  for(const p of values){p.x+=60-minX;p.y+=60-minY;}
  const bounds=values.reduce((acc,p)=>({width:Math.max(acc.width,p.x+p.width+60),height:Math.max(acc.height,p.y+p.height+60)}),{width:900,height:620});
  return{positions,bounds};
}
