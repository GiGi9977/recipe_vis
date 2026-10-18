import {edgeAnchorOffset,edgeRecipe,isAdd,nodeSize,recipeAnchor} from "../graph.js";

const BAND_GAP=190,ADD_GAP=72,MERGE_X_GAP=84,EMPTY_CONTAINER_GAP=56;
const COLLISION_MARGIN=16,COLLISION_STEP=24,MAX_COLLISION_STEPS=64;
const ownership=nodes=>nodes.every(n=>n.kind==="only_r1")?"R1":nodes.every(n=>n.kind==="only_r2")?"R2":"shared";
const isBranchProcess=edge=>!isAdd(edge)&&String(edge.action||"").toLowerCase()!=="split";

function processComponents(graph){
  const byId=new Map(graph.nodes.map(n=>[n.id,n]));
  const adj=new Map(graph.nodes.map(n=>[n.id,[]]));
  for(const edge of graph.edges.filter(isBranchProcess)){adj.get(edge.source)?.push(edge.target);adj.get(edge.target)?.push(edge.source);}
  const seen=new Set(),components=[],componentOf=new Map();
  for(const node of graph.nodes){if(seen.has(node.id))continue;const ids=[],stack=[node.id];seen.add(node.id);while(stack.length){const id=stack.pop();ids.push(id);for(const next of adj.get(id)||[])if(!seen.has(next)){seen.add(next);stack.push(next);}}const component={id:components.length,ids,nodes:ids.map(id=>byId.get(id))};components.push(component);for(const id of ids)componentOf.set(id,component);}
  return{components,componentOf,byId};
}

function alignProcessLanes(graph,positions,components,componentOf,byId){
  const processEdges=graph.edges.filter(isBranchProcess),band={R1:-BAND_GAP,shared:0,R2:BAND_GAP};
  for(const component of components){
    const rel=new Map([[component.ids[0],0]]),queue=[component.ids[0]];
    while(queue.length){const id=queue.shift();for(const edge of processEdges){let next,delta;if(edge.source===id){next=edge.target;delta=edgeAnchorOffset(byId.get(edge.source),edge,"source")-edgeAnchorOffset(byId.get(edge.target),edge,"target");}else if(edge.target===id){next=edge.source;delta=edgeAnchorOffset(byId.get(edge.target),edge,"target")-edgeAnchorOffset(byId.get(edge.source),edge,"source");}else continue;if(componentOf.get(next)!==component||rel.has(next))continue;rel.set(next,rel.get(id)+delta);queue.push(next);}}
    const values=[...rel.values()],mean=values.reduce((a,b)=>a+b,0)/Math.max(1,values.length),base=band[ownership(component.nodes)];
    for(const id of component.ids){const node=byId.get(id),p=positions.get(id),s=nodeSize(node);p.y=base+(rel.get(id)||0)-mean-s.height/2;}
  }
}

function bounds(component,positions,byId){const boxes=component.ids.map(id=>{const p=positions.get(id),s=nodeSize(byId.get(id));return{x1:p.x,y1:p.y,x2:p.x+s.width,y2:p.y+s.height};});return{x1:Math.min(...boxes.map(b=>b.x1)),y1:Math.min(...boxes.map(b=>b.y1)),x2:Math.max(...boxes.map(b=>b.x2)),y2:Math.max(...boxes.map(b=>b.y2))};}
function move(component,positions,dx,dy){for(const id of component.ids){const p=positions.get(id);p.x+=dx;p.y+=dy;}}
function overlaps(a,b,margin=COLLISION_MARGIN){return a.x1<b.x2+margin&&a.x2+margin>b.x1&&a.y1<b.y2+margin&&a.y2+margin>b.y1;}
function nodeBox(id,positions,byId){const p=positions.get(id),s=nodeSize(byId.get(id));return{x1:p.x,y1:p.y,x2:p.x+s.width,y2:p.y+s.height};}
function componentsOverlap(a,b,positions,byId){return a.ids.some(aid=>b.ids.some(bid=>overlaps(nodeBox(aid,positions,byId),nodeBox(bid,positions,byId))));}

function collisionDirection(item){
  const side=edgeRecipe(item.edge)||"shared",container=item.target.domain==="container";
  if(container&&item.provenance){if(side==="R2")return{dx:COLLISION_STEP,dy:COLLISION_STEP};return{dx:-COLLISION_STEP,dy:-COLLISION_STEP};}
  if(container)return{dx:-COLLISION_STEP,dy:0};
  if(side==="R1")return{dx:0,dy:-COLLISION_STEP};
  if(side==="R2")return{dx:0,dy:COLLISION_STEP};
  return{dx:-COLLISION_STEP,dy:0};
}

function resolveAddCollisions(placements,components,positions,byId){
  for(const item of placements){
    const direction=collisionDirection(item),memberIds=new Set(item.sourceComp.ids);let steps=0;
    while(steps<MAX_COLLISION_STEPS){
      const hit=components.some(other=>!other.ids.every(id=>memberIds.has(id))&&componentsOverlap(item.sourceComp,other,positions,byId));
      if(!hit)break;
      move(item.sourceComp,positions,direction.dx,direction.dy);steps++;
    }
  }
}

function packSingleAdditions(graph,positions,componentOf,byId){
  const processIncident=new Set(graph.edges.filter(e=>!isAdd(e)).flatMap(e=>[e.source,e.target])),outgoing=new Map();
  for(const edge of graph.edges){if(!outgoing.has(edge.source))outgoing.set(edge.source,[]);outgoing.get(edge.source).push(edge);}
  const groups=new Map(),handled=new Set();
  for(const edge of graph.edges.filter(isAdd)){
    const source=byId.get(edge.source),outs=outgoing.get(edge.source)||[],component=componentOf.get(edge.source);
    const target=byId.get(edge.target);
    const provenanceContainer=target?.domain==="container"&&graph.edges.some(candidate=>candidate.target===target.id&&!isAdd(candidate));
    if(!source||(provenanceContainer&&source.domain==="main")||processIncident.has(source.id)||component?.ids.length!==1||!outs.length||outs.some(e=>!isAdd(e)||e.target!==edge.target))continue;
    const side=edgeRecipe(edge)||"shared",key=`${edge.target}:${side}`;
    if(!groups.has(key))groups.set(key,{edge,target:byId.get(edge.target),targetComp:componentOf.get(edge.target),side,ids:[]});
    if(!groups.get(key).ids.includes(source.id))groups.get(key).ids.push(source.id);handled.add(source.id);
  }
  const clusters=[];
  for(const group of groups.values()){
    group.ids.sort();const sizes=group.ids.map(id=>nodeSize(byId.get(id))),cellW=Math.max(...sizes.map(s=>s.width))+COLLISION_MARGIN,cellH=Math.max(...sizes.map(s=>s.height))+COLLISION_MARGIN,columns=Math.min(5,group.ids.length),targetAnchor=recipeAnchor(group.target,positions.get(group.target.id),group.edge,"target");
    const emptyContainer=group.target.domain==="container"&&!graph.edges.some(edge=>edge.target===group.target.id&&!isAdd(edge));
    group.ids.forEach((id,index)=>{const row=Math.floor(index/columns),itemsInRow=Math.min(columns,group.ids.length-row*columns),column=index%columns,s=nodeSize(byId.get(id));let cx,cy;if(group.side==="shared"||emptyContainer){cx=targetAnchor.x-ADD_GAP-row*cellW;cy=targetAnchor.y+(column-(itemsInRow-1)/2)*cellH;}else{cx=targetAnchor.x+(column-(itemsInRow-1)/2)*cellW;cy=targetAnchor.y+(group.side==="R1"?-1:1)*(ADD_GAP+row*cellH);}const p=positions.get(id);p.x=cx-s.width/2;p.y=cy-s.height/2;});
    clusters.push({edge:group.edge,sourceComp:{id:`cluster:${group.edge.target}:${group.side}`,ids:group.ids,nodes:group.ids.map(id=>byId.get(id))},targetComp:group.targetComp,target:group.target,provenance:false});
  }
  return{clusters,handled};
}

function placeAddBranches(graph,positions,componentOf,byId,handled){
  const processIncoming=new Set(graph.edges.filter(e=>!isAdd(e)).map(e=>e.target)),candidates=new Map();
  for(const edge of graph.edges.filter(isAdd)){if(handled.has(edge.source))continue;const sourceComp=componentOf.get(edge.source),targetComp=componentOf.get(edge.target);if(!sourceComp||sourceComp===targetComp)continue;const target=byId.get(edge.target),provenance=target?.domain==="container"&&processIncoming.has(target.id),rank=provenance?3:target?.domain==="container"?2:1,previous=candidates.get(sourceComp.id);if(!previous||rank>previous.rank)candidates.set(sourceComp.id,{edge,sourceComp,targetComp,target,rank,provenance});}
  const slots=new Map();
  const placements=[...candidates.values()].sort((a,b)=>a.sourceComp.id-b.sourceComp.id);
  for(const item of placements){
    const{edge,sourceComp,target,targetComp,provenance}=item,side=edgeRecipe(edge)||"shared",key=`${edge.target}:${side}:${provenance?"merge":"add"}`,slot=slots.get(key)||0;slots.set(key,slot+1);
    const sourceAnchor=recipeAnchor(byId.get(edge.source),positions.get(edge.source),edge,"source"),targetAnchor=recipeAnchor(target,positions.get(edge.target),edge,"target");
    let desiredY=targetAnchor.y+(side==="R1"?-ADD_GAP:side==="R2"?ADD_GAP:0);if(target.domain==="container"&&!provenance)desiredY=targetAnchor.y;
    const stagger=(slot%2?1:-1)*Math.ceil(slot/2)*64,sourceBox=bounds(sourceComp,positions,byId),targetBox=bounds(targetComp,positions,byId);let dx=stagger,dy=desiredY-sourceAnchor.y;
    if(target.domain==="container"&&provenance){if(side==="R2")dx=Math.max(dx,targetBox.x2+MERGE_X_GAP-sourceBox.x1);else dx=Math.min(dx,targetBox.x1-MERGE_X_GAP-sourceBox.x2);}
    else if(target.domain==="container")dx=Math.min(dx,targetBox.x1-EMPTY_CONTAINER_GAP-sourceBox.x2);
    else dx+=targetAnchor.x-(sourceBox.x1+sourceBox.x2)/2;
    move(sourceComp,positions,dx,dy);
  }
  return placements;
}

export function refineLayout(graph,inputPositions){
  const positions=new Map([...inputPositions].map(([id,p])=>[id,{...p}])),{components,componentOf,byId}=processComponents(graph);
  alignProcessLanes(graph,positions,components,componentOf,byId);const{clusters,handled}=packSingleAdditions(graph,positions,componentOf,byId),placements=placeAddBranches(graph,positions,componentOf,byId,handled);resolveAddCollisions([...placements,...clusters],components,positions,byId);
  const boxes=graph.nodes.map(n=>{const p=positions.get(n.id),s=nodeSize(n);return{x1:p.x,y1:p.y,x2:p.x+s.width,y2:p.y+s.height};}),minX=Math.min(...boxes.map(b=>b.x1)),minY=Math.min(...boxes.map(b=>b.y1));
  for(const p of positions.values()){p.x+=60-minX;p.y+=60-minY;}return positions;
}
