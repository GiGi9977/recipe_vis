import {isAdd,nodeSize,edgeAnchorOffset,recipeAnchor} from "../graph.js";
import {runPortedLayout,minimizeEdgeConflicts,createConflictModel} from "./portedLayout.js";

const LAYOUT_TIMEOUT_MS=5000;
const isContainerNode=node=>node?.domain==="container"||node?.state_r1?.[1]==="container"||node?.state_r2?.[1]==="container";

export function separateProcessBranches(graph,positions){
  const parent=new Map(graph.nodes.map(node=>[node.id,node.id]));
  const byId=new Map(graph.nodes.map(node=>[node.id,node]));
  const find=id=>{let root=id;while(parent.get(root)!==root)root=parent.get(root);while(parent.get(id)!==id){const next=parent.get(id);parent.set(id,root);id=next;}return root;};
  const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent.set(b,a);};
  const processIncident=new Set();
  for(const edge of graph.edges){
    if(isAdd(edge)||String(edge.action||"").toLowerCase()==="split")continue;
    if(parent.has(edge.source)&&parent.has(edge.target)){join(edge.source,edge.target);processIncident.add(edge.source);processIncident.add(edge.target);}
  }
  const provenanceContainers=new Set(graph.nodes.filter(isContainerNode).filter(node=>graph.edges.some(edge=>edge.target===node.id&&!isAdd(edge)&&isContainerNode(byId.get(edge.source)))).map(node=>node.id));
  for(const edge of graph.edges){
    if(!isAdd(edge)||!processIncident.has(edge.source)||!isContainerNode(byId.get(edge.target))||provenanceContainers.has(edge.target))continue;
    join(edge.source,edge.target);processIncident.add(edge.target);
  }
  const groups=new Map();
  for(const node of graph.nodes){if(!processIncident.has(node.id))continue;const root=find(node.id);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(node.id);}
  const addTargets=new Map();
  for(const edge of graph.edges){if(!isAdd(edge))continue;if(!addTargets.has(edge.source))addTargets.set(edge.source,[]);addTargets.get(edge.source).push(edge.target);}
  const ownerMemo=new Map();
  function owners(id,trail=new Set()){
    if(processIncident.has(id))return new Set([find(id)]);
    if(ownerMemo.has(id))return ownerMemo.get(id);
    if(trail.has(id))return new Set();
    const nextTrail=new Set(trail).add(id),result=new Set();
    for(const target of addTargets.get(id)||[])for(const owner of owners(target,nextTrail))result.add(owner);
    ownerMemo.set(id,result);return result;
  }
  const followers=new Map();
  for(const node of graph.nodes){
    if(processIncident.has(node.id))continue;
    const nodeOwners=owners(node.id);
    if(nodeOwners.size!==1)continue;
    const owner=[...nodeOwners][0];if(!followers.has(owner))followers.set(owner,[]);followers.get(owner).push(node.id);
  }
  const bounds=ids=>ids.reduce((box,id)=>{const p=positions.get(id);return{x1:Math.min(box.x1,p.x),y1:Math.min(box.y1,p.y),x2:Math.max(box.x2,p.x+p.width),y2:Math.max(box.y2,p.y+p.height)};},{x1:Infinity,y1:Infinity,x2:-Infinity,y2:-Infinity});
  const branches=[...groups].map(([root,ids])=>({ids,moveIds:[...ids,...(followers.get(root)||[])],box:bounds(ids)})).sort((a,b)=>a.box.y1-b.box.y1||a.box.x1-b.box.x1);
  const placed=[],margin=26;
  for(const branch of branches){
    let shift=0;
    for(const prior of placed){
      const crossesX=branch.box.x1<prior.box.x2+margin&&branch.box.x2+margin>prior.box.x1;
      const crossesY=branch.box.y1+shift<prior.box.y2+margin&&branch.box.y2+shift+margin>prior.box.y1;
      if(crossesX&&crossesY)shift=Math.max(shift,prior.box.y2+margin-branch.box.y1);
    }
    if(shift){for(const id of branch.moveIds)positions.get(id).y+=shift;branch.box.y1+=shift;branch.box.y2+=shift;}
    placed.push(branch);
  }
  return{placed,bounds};
}



// Only real collisions move a branch: when a process branch (with its attached
// ingredients) has node bodies overlapping or touching the nodes of a branch
// above it, the whole branch is pushed down just far enough to clear them.
// Branches that do not collide keep the position the layout gave them. Each
// branch moves rigidly, x never changes, and top-to-bottom order is kept.
const BAND_CLEARANCE=8;
export function separateOverlappingBands(graph,positions,{placed}){
  const bands=placed.filter(branch=>branch.ids.length>=2).map(branch=>({branch,top:Math.min(...branch.moveIds.map(id=>positions.get(id).y))})).sort((a,b)=>a.top-b.top);
  const done=[];
  for(const band of bands){
    for(let pass=0;pass<8;pass++){
      let dy=0;
      for(const id of band.branch.moveIds){
        const a=positions.get(id);
        for(const other of done)for(const otherId of other.branch.moveIds){
          const b=positions.get(otherId);
          const xo=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)+BAND_CLEARANCE;
          const yo=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)+BAND_CLEARANCE;
          if(xo<=0||yo<=0||a.y+a.height/2<b.y+b.height/2)continue;
          dy=Math.max(dy,b.y+b.height+BAND_CLEARANCE-a.y);
        }
      }
      if(dy<1)break;
      for(const id of band.branch.moveIds)positions.get(id).y+=dy;
    }
    done.push(band);
  }
}

// Collision guard for moves of a rigid set of nodes: a move is allowed only when
// it adds no edge-through-node hit and no edge crossing (of any kind) around the set.
const LONG_EDGE_WORTH=600;
function makeCollisionGuard(graph,positions){
  const placed=new Map(graph.nodes.filter(node=>positions.has(node.id)).map(node=>{const p=positions.get(node.id);return[node.id,{...node,x:p.x+p.width/2,y:p.y+p.height/2}];}));
  const model=createConflictModel([...placed.values()],graph.edges);
  const shifted=(ids,dx)=>{for(const id of ids)placed.get(id).x+=dx;};
  return{
    // `worth` is how much total edge length the move removes. Normally a move must
    // add no edge-through-node hit and no crossing. A move that removes a very long
    // edge (worth >= LONG_EDGE_WORTH) may add hits and ADD crossings, but never a
    // crossing of a process or split edge.
    allows(ids,dx,worth=0){
      const before=model.partsIds(ids);
      shifted(ids,dx);const after=model.partsIds(ids);shifted(ids,-dx);
      if(after.crossProc>before.crossProc)return false;
      if(worth>=LONG_EDGE_WORTH)return true;
      return after.hits<=before.hits&&after.cross<=before.cross;
    },
    moved(ids,dx){shifted(ids,dx);},
    // Vertical moves are judged by total collision cost (through-node 100, process or
    // split crossing 30, other crossing 10) so a better split angle (`bonus`, in
    // cost units) can pay for a crossing the move adds elsewhere. Never worse in
    // edges through nodes.
    allowsY(ids,dy,bonus=0){
      const before=model.partsIds(ids);
      for(const id of ids)placed.get(id).y+=dy;
      const after=model.partsIds(ids);
      for(const id of ids)placed.get(id).y-=dy;
      if(after.hits>before.hits)return false;
      const cost=q=>q.hits*100+q.cross*10+q.crossProc*20;
      return cost(after)<=cost(before)+bonus;
    },
    // Horizontal move judged by total collision cost (through-node 100, process or
    // split crossing 30, other crossing 10); it must be strictly cheaper and never
    // worse in edges through nodes.
    improvesX(ids,dx){
      const before=model.partsIds(ids);
      shifted(ids,dx);const after=model.partsIds(ids);shifted(ids,-dx);
      const cost=q=>q.hits*100+q.cross*10+q.crossProc*30;
      return after.hits<=before.hits&&cost(after)<cost(before);
    },
    // Move in both axes judged like improvesX: strictly cheaper, never more hits.
    improvesXY(ids,dx,dy){
      const before=model.partsIds(ids);
      for(const id of ids){placed.get(id).x+=dx;placed.get(id).y+=dy;}
      const after=model.partsIds(ids);
      for(const id of ids){placed.get(id).x-=dx;placed.get(id).y-=dy;}
      const cost=q=>q.hits*100+q.cross*10+q.crossProc*30;
      return after.hits<=before.hits&&cost(after)<cost(before);
    },
    movedXY2(ids,dx,dy){for(const id of ids){placed.get(id).x+=dx;placed.get(id).y+=dy;}},
    // A vertical move that straightens a process edge: judged by total collision cost
    // (through-node 100, process or split crossing 20, other crossing 10) with an
    // allowance for the benefit, but never with more process or split crossings.
    allowsStraighten(ids,dy,allowance){
      const before=model.partsIds(ids);
      for(const id of ids)placed.get(id).y+=dy;
      const after=model.partsIds(ids);
      for(const id of ids)placed.get(id).y-=dy;
      if(after.crossProc>before.crossProc)return false;
      const cost=q=>q.hits*100+q.cross*10+q.crossProc*20;
      return cost(after)<=cost(before)+allowance;
    },
    // A move in both axes judged by total collision cost (through-node 100, process or
    // split crossing 20, other crossing 10) within an allowance, never with more
    // process or split crossings.
    allowsShift(ids,dx,dy,allowance){
      const before=model.partsIds(ids);
      for(const id of ids){placed.get(id).x+=dx;placed.get(id).y+=dy;}
      const after=model.partsIds(ids);
      for(const id of ids){placed.get(id).x-=dx;placed.get(id).y-=dy;}
      if(after.crossProc>before.crossProc)return false;
      const cost=q=>q.hits*100+q.cross*10+q.crossProc*20;
      return cost(after)<=cost(before)+allowance;
    },
    movedShift(ids,dx,dy){for(const id of ids){placed.get(id).x+=dx;placed.get(id).y+=dy;}},
    movedY(ids,dy){for(const id of ids)placed.get(id).y+=dy;},
    // Move in both axes: no more through-node hits, no more crossings of any kind.
    allowsXY(ids,dx,dy){
      const before=model.partsIds(ids);
      for(const id of ids){placed.get(id).x+=dx;placed.get(id).y+=dy;}
      const after=model.partsIds(ids);
      for(const id of ids){placed.get(id).x-=dx;placed.get(id).y-=dy;}
      return after.hits<=before.hits&&after.cross<=before.cross&&after.crossProc<=before.crossProc;
    },
    movedXY(ids,dx,dy){for(const id of ids){placed.get(id).x+=dx;placed.get(id).y+=dy;}}
  };
}

// A process chain that joins a node far to its right (the join node was pushed
// right by unrelated ADD feeders) is slid right as one rigid unit until its edge
// into the join has the usual length. The unit is everything process-connected
// to the predecessor once the join node is removed, plus ingredients added only
// into it, so branching chains and chains started by a split move together.
// A move is skipped when it would turn an ADD or split exit of the unit
// backward, or put the unit on top of another node. Split edges themselves are
// not shortened here.
const PROCESS_GAP=130;
export function compactJoinChains(graph,positions,guard=null){
  const isSplit=edge=>String(edge.action||"").toLowerCase()==="split";
  const process=graph.edges.filter(edge=>!isAdd(edge)&&!isSplit(edge)&&positions.has(edge.source)&&positions.has(edge.target));
  const centerX=id=>positions.get(id).x+positions.get(id).width/2;
  const targets=[...new Set(process.map(edge=>edge.target))].sort((a,b)=>centerX(b)-centerX(a));
  for(let pass=0;pass<3;pass++){
    let changed=false;
    for(const target of targets){
      const preds=[...new Set(process.filter(edge=>edge.target===target).map(edge=>edge.source))];
      for(const pred of preds){
        if(centerX(target)-PROCESS_GAP-centerX(pred)<40)continue;
        const adjacency=new Map();
        for(const edge of process){
          if(edge.source===target||edge.target===target)continue;
          if(!adjacency.has(edge.source))adjacency.set(edge.source,[]);if(!adjacency.has(edge.target))adjacency.set(edge.target,[]);
          adjacency.get(edge.source).push(edge.target);adjacency.get(edge.target).push(edge.source);
        }
        const unit=new Set(),queue=[pred];
        while(queue.length){const id=queue.pop();if(unit.has(id))continue;unit.add(id);for(const next of adjacency.get(id)||[])queue.push(next);}
        // Every unit edge into the join must keep at least the usual length.
        const dx=Math.min(...process.filter(edge=>edge.target===target&&unit.has(edge.source)).map(edge=>centerX(target)-PROCESS_GAP-centerX(edge.source)));
        if(!(dx>=40))continue;
        // Ingredients added only into the unit travel with it.
        const carried=new Set(unit);
        for(const node of graph.nodes){
          if(carried.has(node.id)||!positions.has(node.id))continue;
          const entries=graph.edges.filter(edge=>edge.target===node.id),exits=graph.edges.filter(edge=>edge.source===node.id);
          if(!entries.length&&exits.length&&exits.every(edge=>isAdd(edge)&&unit.has(edge.target)))carried.add(node.id);
        }
        const forward=amount=>graph.edges.every(edge=>{
          if(!(isAdd(edge)||isSplit(edge))||!carried.has(edge.source)||carried.has(edge.target)||!positions.has(edge.target))return true;
          return centerX(edge.source)+amount<centerX(edge.target)-20;
        });
        const clear=amount=>[...carried].every(id=>{
          const a=positions.get(id);
          return graph.nodes.every(other=>{
            if(carried.has(other.id)||!positions.has(other.id))return true;
            const b=positions.get(other.id);
            return a.x+amount>=b.x+b.width+6||a.x+a.width+amount<=b.x-6||a.y>=b.y+b.height+6||a.y+a.height<=b.y-6;
          });
        });
        let move=0;
        const edgeLength=centerX(target)-centerX(pred);
        for(let amount=dx;amount>=40;amount-=65)if(forward(amount)&&clear(amount)&&(!guard||guard.allows(carried,amount,edgeLength>300?amount:0))){move=amount;break;}
        if(!move)continue;
        for(const id of carried)positions.get(id).x+=move;
        guard?.moved(carried,move);
        changed=true;
      }
    }
    if(!changed)break;
  }
}

// A process-connected group (with the ingredients added only into it) that sits
// far to the right of the ADD / split sources feeding it is slid left, as one
// rigid unit, to the position that gives the shortest total ADD and split edges
// around it. x only. It never moves so far that an incoming ADD or split edge
// becomes shorter than the usual process length, and never onto another node.
const COMPACT_STEP=65;
export function compactComponentsLeft(graph,positions,guard=null){
  const isSplit=edge=>String(edge.action||"").toLowerCase()==="split";
  const process=graph.edges.filter(edge=>!isAdd(edge)&&!isSplit(edge)&&positions.has(edge.source)&&positions.has(edge.target));
  const parent=new Map(graph.nodes.filter(node=>positions.has(node.id)).map(node=>[node.id,node.id]));
  const find=id=>{while(parent.get(id)!==id){parent.set(id,parent.get(parent.get(id)));id=parent.get(id);}return id;};
  for(const edge of process)parent.set(find(edge.source),find(edge.target));
  const groups=new Map();
  for(const node of graph.nodes){if(!parent.has(node.id))continue;const root=find(node.id);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(node.id);}
  const centerX=id=>positions.get(id).x+positions.get(id).width/2,centerY=id=>positions.get(id).y+positions.get(id).height/2;
  // Moving one group left can free another that was held by it, so repeat.
  for(let pass=0;pass<4;pass++){
  let anyMoved=false;
  const order=[...groups.values()].filter(ids=>ids.length>=2).sort((a,b)=>Math.max(...b.map(centerX))-Math.max(...a.map(centerX)));
  for(const ids of order){
    const unit=new Set(ids);
    // Whole groups that only feed this unit by ADD (ingredients, prepared
    // feeder chains) travel with it.
    const carried=new Set(unit);
    for(let changed=true;changed;){
      changed=false;
      for(const members of groups.values()){
        if(members.every(id=>carried.has(id)))continue;
        const inside=new Set(members);
        const entering=graph.edges.filter(edge=>inside.has(edge.target)&&!inside.has(edge.source));
        const leaving=graph.edges.filter(edge=>inside.has(edge.source)&&!inside.has(edge.target));
        if(!entering.length&&leaving.length&&leaving.every(edge=>isAdd(edge)&&carried.has(edge.target))){for(const id of members)carried.add(id);changed=true;}
      }
    }
    const around=graph.edges.filter(edge=>(isAdd(edge)||isSplit(edge))&&positions.has(edge.source)&&positions.has(edge.target)&&carried.has(edge.source)!==carried.has(edge.target));
    const incoming=around.filter(edge=>carried.has(edge.target));
    if(!incoming.length)continue;
    // Farthest left the unit may go: every incoming edge keeps the usual length.
    const limit=Math.min(...incoming.map(edge=>{const span=centerX(edge.target)-centerX(edge.source);return span>PROCESS_GAP?span-PROCESS_GAP:0;}));
    if(limit<COMPACT_STEP)continue;
    const total=shift=>around.reduce((sum,edge)=>{
      const sx=centerX(edge.source)-(carried.has(edge.source)?shift:0),tx=centerX(edge.target)-(carried.has(edge.target)?shift:0);
      return sum+Math.hypot(tx-sx,centerY(edge.target)-centerY(edge.source));
    },0);
    const clear=shift=>[...carried].every(id=>{
      const a=positions.get(id);
      return graph.nodes.every(other=>{
        if(carried.has(other.id)||!positions.has(other.id))return true;
        const b=positions.get(other.id);
        return a.x-shift>=b.x+b.width+6||a.x+a.width-shift<=b.x-6||a.y>=b.y+b.height+6||a.y+a.height<=b.y-6;
      });
    });
    let best=0,bestTotal=total(0);
    const bestTotal0=bestTotal;
    const longest=Math.max(...around.map(edge=>Math.hypot(centerX(edge.target)-centerX(edge.source),centerY(edge.target)-centerY(edge.source))));
    for(let shift=COMPACT_STEP;shift<=limit;shift+=COMPACT_STEP){
      if(!clear(shift))continue;
      const value=total(shift);
      const worth=longest>=800?bestTotal0-value:0;
      if(guard&&!guard.allows(carried,-shift,worth))continue;
      if(value<bestTotal-1){bestTotal=value;best=shift;}
    }
    if(best){for(const id of carried)positions.get(id).x-=best;guard?.moved(carried,-best);anyMoved=true;}
  }
  if(!anyMoved)break;
  }
}

// No process edge may flow backward: layouts run left to right (or vertically).
// For a backward edge, the group process-connected to its target (without the
// edge) slides right as a unit until the edge has the usual length; if that group
// is boxed in, the source's group slides left instead. Skipped when
// that would turn an ADD/split exit backward, land on another node, or when the
// edge's two ends are connected some other way.
export function fixBackwardProcessEdges(graph,positions,guard=null){
  const isSplit=edge=>String(edge.action||"").toLowerCase()==="split";
  const process=graph.edges.filter(edge=>!isAdd(edge)&&!isSplit(edge)&&positions.has(edge.source)&&positions.has(edge.target));
  const centerX=id=>positions.get(id).x+positions.get(id).width/2;
  for(let pass=0;pass<4;pass++){
    let changed=false;
    for(const edge of process){
      if(centerX(edge.target)>=centerX(edge.source)-1)continue;
      const need=centerX(edge.source)+PROCESS_GAP-centerX(edge.target);
      const adjacency=new Map();
      for(const other of process){
        if(other===edge)continue;
        if(!adjacency.has(other.source))adjacency.set(other.source,[]);if(!adjacency.has(other.target))adjacency.set(other.target,[]);
        adjacency.get(other.source).push(other.target);adjacency.get(other.target).push(other.source);
      }
      const unit=new Set(),queue=[edge.target];
      while(queue.length){const id=queue.pop();if(unit.has(id))continue;unit.add(id);for(const next of adjacency.get(id)||[])queue.push(next);}
      if(unit.has(edge.source))continue;
      const carried=new Set(unit);
      for(const node of graph.nodes){
        if(carried.has(node.id)||!positions.has(node.id))continue;
        const entries=graph.edges.filter(other=>other.target===node.id),exits=graph.edges.filter(other=>other.source===node.id);
        if(!entries.length&&exits.length&&exits.every(other=>isAdd(other)&&unit.has(other.target)))carried.add(node.id);
      }
      const forward=amount=>graph.edges.every(other=>{
        if(!(isAdd(other)||isSplit(other))||!carried.has(other.source)||carried.has(other.target)||!positions.has(other.target))return true;
        return centerX(other.source)+amount<centerX(other.target)-20;
      });
      const clear=amount=>[...carried].every(id=>{
        const a=positions.get(id);
        return graph.nodes.every(node=>{
          if(carried.has(node.id)||!positions.has(node.id))return true;
          const b=positions.get(node.id);
          return a.x+amount>=b.x+b.width+6||a.x+a.width+amount<=b.x-6||a.y>=b.y+b.height+6||a.y+a.height<=b.y-6;
        });
      });
      let move=0;
      for(let amount=need;amount>=1;amount-=65)if(forward(amount)&&clear(amount)&&(!guard||guard.allows(carried,amount))){move=amount;break;}
      if(move){
        for(const id of carried)positions.get(id).x+=move;
        guard?.moved(carried,move);
        changed=true;
        continue;
      }
      // Still boxed in because an ADD/split exit of the group would turn backward:
      // let the group that receives that exit travel along (same rigid x shift),
      // never including the backward edge's own source.
      const expandFor=amount=>{
        const group=new Set(carried);
        for(let grew=true;grew;){
          grew=false;
          for(const other of graph.edges){
            if(!(isAdd(other)||isSplit(other))||!group.has(other.source)||group.has(other.target)||!positions.has(other.target))continue;
            if(centerX(other.source)+amount<centerX(other.target)-20)continue;
            const member=new Set(),stack=[other.target];
            while(stack.length){const id=stack.pop();if(member.has(id))continue;member.add(id);for(const next of adjacency.get(id)||[])stack.push(next);}
            if(member.has(edge.source))return null;
            for(const node of graph.nodes){
              if(member.has(node.id)||!positions.has(node.id))continue;
              const exits=graph.edges.filter(x=>x.source===node.id);
              if(!graph.edges.some(x=>x.target===node.id)&&exits.length&&exits.every(x=>isAdd(x)&&member.has(x.target)))member.add(node.id);
            }
            for(const id of member)group.add(id);
            grew=true;
          }
        }
        return group;
      };
      let expanded=null;
      for(let amount=need;amount>=1&&!move;amount-=65){
        const group=expandFor(amount);
        if(!group||group.size===carried.size)continue;
        const stays=graph.edges.every(other=>{
          if(!(isAdd(other)||isSplit(other))||!group.has(other.source)||group.has(other.target)||!positions.has(other.target))return true;
          return centerX(other.source)+amount<centerX(other.target)-20;
        });
        const free=[...group].every(id=>{
          const a=positions.get(id);
          return graph.nodes.every(node=>{
            if(group.has(node.id)||!positions.has(node.id))return true;
            const b=positions.get(node.id);
            return a.x+amount>=b.x+b.width+6||a.x+a.width+amount<=b.x-6||a.y>=b.y+b.height+6||a.y+a.height<=b.y-6;
          });
        });
        if(stays&&free&&(!guard||guard.allows(group,amount))){move=amount;expanded=group;}
      }
      if(move){
        for(const id of expanded)positions.get(id).x+=move;
        guard?.moved(expanded,move);
        changed=true;
        continue;
      }
      // The downstream group is boxed in: slide the source's group left instead.
      const unit2=new Set(),queue2=[edge.source];
      while(queue2.length){const id=queue2.pop();if(unit2.has(id))continue;unit2.add(id);for(const next of adjacency.get(id)||[])queue2.push(next);}
      if(unit2.has(edge.target))continue;
      const carried2=new Set(unit2);
      for(const node of graph.nodes){
        if(carried2.has(node.id)||!positions.has(node.id))continue;
        const entries=graph.edges.filter(other=>other.target===node.id),exits=graph.edges.filter(other=>other.source===node.id);
        if(!entries.length&&exits.length&&exits.every(other=>isAdd(other)&&unit2.has(other.target)))carried2.add(node.id);
      }
      const forwardLeft=amount=>graph.edges.every(other=>{
        if(!(isAdd(other)||isSplit(other))||carried2.has(other.source)||!carried2.has(other.target)||!positions.has(other.source))return true;
        return centerX(other.source)<centerX(other.target)-amount-20;
      });
      const clearLeft=amount=>[...carried2].every(id=>{
        const a=positions.get(id);
        return graph.nodes.every(node=>{
          if(carried2.has(node.id)||!positions.has(node.id))return true;
          const b=positions.get(node.id);
          return a.x-amount>=b.x+b.width+6||a.x+a.width-amount<=b.x-6||a.y>=b.y+b.height+6||a.y+a.height<=b.y-6;
        });
      });
      let moveLeft=0;
      for(let amount=need;amount>=1;amount-=65)if(forwardLeft(amount)&&clearLeft(amount)&&(!guard||guard.allows(carried2,-amount))){moveLeft=amount;break;}
      if(!moveLeft)continue;
      for(const id of carried2)positions.get(id).x-=moveLeft;
      guard?.moved(carried2,-moveLeft);
      changed=true;
    }
    if(!changed)break;
  }
}

// The space inserted between branch groups can leave a split child's lane far
// above or below its split source, so split edges come out nearly vertical and
// with a different angle in every pair. This pass moves such a child's whole
// group (everything process-connected to it, plus ingredients and feeder chains
// that only feed it) vertically toward its split source, to the closest row that
// keeps the edge no steeper than about 45 degrees and passes the collision guard.
// Only y changes. Used for main children of main split sources.
const SPLIT_MIN_DY=65;
export function compactSplitLanes(graph,positions,guard=null){
  const isSplit=edge=>String(edge.action||"").toLowerCase()==="split";
  const process=graph.edges.filter(edge=>!isAdd(edge)&&!isSplit(edge)&&positions.has(edge.source)&&positions.has(edge.target));
  const adjacency=new Map();
  for(const edge of process){
    if(!adjacency.has(edge.source))adjacency.set(edge.source,[]);if(!adjacency.has(edge.target))adjacency.set(edge.target,[]);
    adjacency.get(edge.source).push(edge.target);adjacency.get(edge.target).push(edge.source);
  }
  const center=id=>({x:positions.get(id).x+positions.get(id).width/2,y:positions.get(id).y+positions.get(id).height/2});
  const nodeById=new Map(graph.nodes.map(node=>[node.id,node]));
  const splits=graph.edges.filter(edge=>isSplit(edge)&&positions.has(edge.source)&&positions.has(edge.target)&&nodeById.get(edge.source)?.domain==="main"&&nodeById.get(edge.target)?.domain==="main");
  for(let pass=0;pass<3;pass++){
    let changed=false;
    for(const edge of splits){
      const source=center(edge.source),child=center(edge.target);
      const dx=Math.max(1,child.x-source.x),dy=child.y-source.y,sign=Math.sign(dy)||1;
      if(Math.abs(dy)<=Math.max(SPLIT_MIN_DY,dx))continue;
      const unit=new Set(),queue=[edge.target];
      while(queue.length){const id=queue.pop();if(unit.has(id))continue;unit.add(id);for(const next of adjacency.get(id)||[])queue.push(next);}
      if(unit.has(edge.source))continue;
      // Ingredients and feeder groups that only feed this unit travel with it.
      const carried=new Set(unit);
      const processGroup=new Map();
      {
        const seen=new Set();
        for(const node of graph.nodes){
          if(!positions.has(node.id)||seen.has(node.id))continue;
          const group=[],stack=[node.id];
          while(stack.length){const id=stack.pop();if(seen.has(id))continue;seen.add(id);group.push(id);for(const next of adjacency.get(id)||[])stack.push(next);}
          for(const id of group)processGroup.set(id,group);
        }
      }
      for(let grew=true;grew;){
        grew=false;
        for(const group of new Set(processGroup.values())){
          if(group.every(id=>carried.has(id)))continue;
          const inside=new Set(group);
          const entering=graph.edges.filter(other=>inside.has(other.target)&&!inside.has(other.source));
          const leaving=graph.edges.filter(other=>inside.has(other.source)&&!inside.has(other.target));
          if(!entering.length&&leaving.length&&leaving.every(other=>isAdd(other)&&carried.has(other.target))){for(const id of group)carried.add(id);grew=true;}
        }
      }
      const clear=shift=>[...carried].every(id=>{
        const a=positions.get(id);
        return graph.nodes.every(node=>{
          if(carried.has(node.id)||!positions.has(node.id))return true;
          const b=positions.get(node.id);
          return a.x>=b.x+b.width+6||a.x+a.width<=b.x-6||a.y+shift>=b.y+b.height+6||a.y+a.height+shift<=b.y-6;
        });
      });
      // Closest row to the split source first, then outwards to the current row.
      const floor=Math.max(SPLIT_MIN_DY,Math.round(0.35*dx));
      let move=0;
      for(let rowDy=floor;rowDy<Math.abs(dy)-1;rowDy+=10){
        const shift=-sign*(Math.abs(dy)-rowDy);
        const angleBefore=Math.atan2(Math.abs(dy),dx)*180/Math.PI,angleAfter=Math.atan2(rowDy,dx)*180/Math.PI;
        const bonus=Math.max(0,angleBefore-Math.max(angleAfter,45));
        if(clear(shift)&&(!guard||guard.allowsY(carried,shift,bonus))){move=shift;break;}
      }
      if(!move)continue;
      for(const id of carried)positions.get(id).y+=move;
      guard?.movedY(carried,move);
      changed=true;
    }
    if(!changed)break;
  }
}

// A one-recipe split child belongs on its recipe's side of a same-recipe split
// source (R1 above, R2 below). Group shifts made while separating branches can
// leave such a child on the wrong side, so its split edge cuts across the other
// recipe's process row. The child's whole group (process-connected nodes plus the
// ingredients that only feed it) moves vertically to the nearest row on the right
// side that is clear and passes the collision guard. Only y changes.
export function fixSplitSides(graph,positions,guard=null){
  const isSplit=edge=>String(edge.action||"").toLowerCase()==="split";
  const process=graph.edges.filter(edge=>!isAdd(edge)&&!isSplit(edge)&&positions.has(edge.source)&&positions.has(edge.target));
  const adjacency=new Map();
  for(const edge of process){
    if(!adjacency.has(edge.source))adjacency.set(edge.source,[]);if(!adjacency.has(edge.target))adjacency.set(edge.target,[]);
    adjacency.get(edge.source).push(edge.target);adjacency.get(edge.target).push(edge.source);
  }
  const nodeById=new Map(graph.nodes.map(node=>[node.id,node]));
  const centerY=id=>positions.get(id).y+positions.get(id).height/2;
  for(const edge of graph.edges){
    if(!isSplit(edge)||!positions.has(edge.source)||!positions.has(edge.target))continue;
    const source=nodeById.get(edge.source),child=nodeById.get(edge.target);
    if(source?.domain!=="main"||child?.domain!=="main"||child.kind!==source.kind||!["only_r1","only_r2"].includes(child.kind))continue;
    const side=child.kind==="only_r1"?-1:1;
    const dy=centerY(edge.target)-centerY(edge.source);
    if(side*dy>-1)continue;
    const unit=new Set(),queue=[edge.target];
    while(queue.length){const id=queue.pop();if(unit.has(id))continue;unit.add(id);for(const next of adjacency.get(id)||[])queue.push(next);}
    if(unit.has(edge.source))continue;
    const carried=new Set(unit);
    for(const node of graph.nodes){
      if(carried.has(node.id)||!positions.has(node.id))continue;
      const exits=graph.edges.filter(other=>other.source===node.id);
      if(!graph.edges.some(other=>other.target===node.id)&&exits.length&&exits.every(other=>isAdd(other)&&unit.has(other.target)))carried.add(node.id);
    }
    const clear=shift=>[...carried].every(id=>{
      const a=positions.get(id);
      return graph.nodes.every(node=>{
        if(carried.has(node.id)||!positions.has(node.id))return true;
        const b=positions.get(node.id);
        return a.x>=b.x+b.width+6||a.x+a.width<=b.x-6||a.y+shift>=b.y+b.height+6||a.y+a.height+shift<=b.y-6;
      });
    });
    // Nearest row on the correct side: level with the source first, then outwards.
    let move=0;
    for(let row=0;row<=8;row++){
      const shift=centerY(edge.source)+side*row*65-centerY(edge.target);
      if(clear(shift)&&(!guard||guard.allowsY(carried,shift,0))){move=shift;break;}
    }
    if(!move)continue;
    for(const id of carried)positions.get(id).y+=move;
    guard?.movedY(carried,move);
  }
}

// A free root (no inputs; exits are split and ADD edges only) whose split edges
// cut across a process edge is moved to the nearby spot, left and/or up or down in
// whole 65px steps, where that crossing is gone and the root's own split and ADD
// edges are shortest in total: the splits then pass beside the process chain
// instead of through it, without sending the root far away. Only the root moves,
// and the spot must be clear of other nodes and strictly reduce the total
// collision cost.
const SPLIT_ROOT_STEP=65,SPLIT_ROOT_STEPS=8;
export function clearSplitRootCrossings(graph,positions,guard=null){
  const isSplit=edge=>String(edge.action||"").toLowerCase()==="split";
  const nodeById=new Map(graph.nodes.map(node=>[node.id,node]));
  const center=id=>({x:positions.get(id).x+positions.get(id).width/2,y:positions.get(id).y+positions.get(id).height/2});
  const orient=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const cuts=(a,b,c,d)=>orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0;
  const process=graph.edges.filter(edge=>!isAdd(edge)&&!isSplit(edge)&&positions.has(edge.source)&&positions.has(edge.target));
  for(const root of graph.nodes){
    if(root.domain!=="main"||!positions.has(root.id)||graph.edges.some(edge=>edge.target===root.id))continue;
    const out=graph.edges.filter(edge=>edge.source===root.id&&positions.has(edge.target));
    const splits=out.filter(isSplit);
    if(!splits.length||!out.every(edge=>isSplit(edge)||isAdd(edge)))continue;
    const crossing=at=>splits.some(split=>process.some(edge=>
      ![split.source,split.target].some(id=>id===edge.source||id===edge.target)
      &&cuts(at,center(split.target),center(edge.source),center(edge.target))));
    const here=center(root.id);
    if(!crossing(here))continue;
    const clear=(dx,dy)=>{
      const a=positions.get(root.id);
      return graph.nodes.every(node=>{
        if(node.id===root.id||!positions.has(node.id))return true;
        const b=positions.get(node.id);
        return a.x+dx>=b.x+b.width+6||a.x+a.width+dx<=b.x-6||a.y+dy>=b.y+b.height+6||a.y+a.height+dy<=b.y-6;
      });
    };
    const length=at=>out.reduce((sum,edge)=>{const t=center(edge.target);return sum+Math.hypot(t.x-at.x,t.y-at.y);},0);
    const candidates=[];
    for(let i=0;i<=SPLIT_ROOT_STEPS;i++)for(let j=-SPLIT_ROOT_STEPS;j<=SPLIT_ROOT_STEPS;j++){
      if(!i&&!j)continue;
      const dx=-i*SPLIT_ROOT_STEP,dy=j*SPLIT_ROOT_STEP,at={x:here.x+dx,y:here.y+dy};
      if(crossing(at))continue;
      candidates.push([length(at)+0.5*Math.hypot(dx,dy),dx,dy]);
    }
    candidates.sort((a,b)=>a[0]-b[0]);
    for(const [,dx,dy] of candidates){
      if(!clear(dx,dy))continue;
      if(guard&&!guard.improvesXY(new Set([root.id]),dx,dy))continue;
      positions.get(root.id).x+=dx;positions.get(root.id).y+=dy;
      guard?.movedXY2(new Set([root.id]),dx,dy);
      break;
    }
  }
}

// A process edge from a one-recipe chain into a half of a dumbbell node should be
// horizontal: the chain's last node sits at the height of that half's port. When
// group shifts left it off by more than a few px, the whole one-recipe chain
// feeding the edge (every node process-connected to its source without crossing the
// edge, plus the ingredients that only feed it) moves vertically by that gap, if the
// move is clear of other nodes and its collision cost stays within a small allowance
// (straight process edges take priority over ADD ribbon collisions), but never adds
// process or split crossings. Only y changes.
const PORT_TOLERANCE=6,PORT_ALLOWANCE=120,PORT_OVERLAP=8;
export function alignChainsIntoDumbbells(graph,positions,guard=null){
  const isSplit=edge=>String(edge.action||"").toLowerCase()==="split";
  const nodeById=new Map(graph.nodes.map(node=>[node.id,node]));
  const process=graph.edges.filter(edge=>!isAdd(edge)&&!isSplit(edge)&&positions.has(edge.source)&&positions.has(edge.target));
  const centerY=id=>positions.get(id).y+positions.get(id).height/2;
  const port=(id,edge,end)=>centerY(id)+edgeAnchorOffset(nodeById.get(id),edge,end);
  for(const edge of process){
    const source=nodeById.get(edge.source),target=nodeById.get(edge.target);
    if(!["only_r1","only_r2"].includes(source.kind)||source.domain!=="main")continue;
    if(!(target.kind==="merged_similar"||(target.kind==="merged_exact"&&target.shape_dumbbell)))continue;
    const gap=port(edge.target,edge,"target")-port(edge.source,edge,"source");
    if(Math.abs(gap)<=PORT_TOLERANCE)continue;
    const adjacency=new Map();
    for(const other of process){
      if(other===edge)continue;
      if(!adjacency.has(other.source))adjacency.set(other.source,[]);if(!adjacency.has(other.target))adjacency.set(other.target,[]);
      adjacency.get(other.source).push(other.target);adjacency.get(other.target).push(other.source);
    }
    const unit=new Set(),stack=[edge.source];
    while(stack.length){const id=stack.pop();if(unit.has(id))continue;unit.add(id);for(const next of adjacency.get(id)||[])stack.push(next);}
    if(unit.has(edge.target))continue;
    // Only a chain of this one recipe moves; shared or other-recipe nodes stay put.
    if([...unit].some(id=>{const node=nodeById.get(id);return node.kind!==source.kind||node.domain!=="main";}))continue;
    const carried=new Set(unit);
    for(const node of graph.nodes){
      if(carried.has(node.id)||!positions.has(node.id))continue;
      const exits=graph.edges.filter(other=>other.source===node.id);
      if(!graph.edges.some(other=>other.target===node.id)&&exits.length&&exits.every(other=>isAdd(other)&&unit.has(other.target)))carried.add(node.id);
    }
    // ADD and split edges entering the chain from outside must still come from nodes
    // that are not carried, otherwise the chain would drag unrelated nodes.
    const clear=shift=>[...carried].every(id=>{
      const a=positions.get(id);
      return graph.nodes.every(node=>{
        if(carried.has(node.id)||!positions.has(node.id))return true;
        const b=positions.get(node.id);
        // The R1 and R2 chains entering one dumbbell sit at its two half heights, only
        // about 50px apart, so main nodes may come within PORT_OVERLAP of touching.
        const margin=node.domain==="main"?-PORT_OVERLAP:6;
        return a.x>=b.x+b.width+margin||a.x+a.width<=b.x-margin||a.y+shift>=b.y+b.height+margin||a.y+a.height+shift<=b.y-margin;
      });
    });
    if(!clear(gap)||(guard&&!guard.allowsStraighten(carried,gap,PORT_ALLOWANCE)))continue;
    for(const id of carried)positions.get(id).y+=gap;
    guard?.movedY(carried,gap);
  }
}

// Final safety net: two main node bodies that overlap are separated. The one-recipe
// chain involved (R2 chains move down, R1 chains move up; otherwise the later node's
// chain moves away from the other) slides vertically, together with the ingredients
// that only feed it, to the nearest row that is clear of every other node and whose
// collision cost stays within an allowance. Chains holding shared or other-recipe
// nodes are not moved. Only y changes.
// R1 and R2 rows that enter one dumbbell are only 50px apart, so their 56px nodes
// legitimately overlap by about 6px. Only a clearly larger overlap is a collision.
const OVERLAP_MIN=12,OVERLAP_STEP=13,OVERLAP_MAX=780,OVERLAP_ALLOWANCE=300;
export function resolveNodeOverlaps(graph,positions,makeGuard){
  const isSplit=edge=>String(edge.action||"").toLowerCase()==="split";
  const nodeById=new Map(graph.nodes.map(node=>[node.id,node]));
  const process=graph.edges.filter(edge=>!isAdd(edge)&&!isSplit(edge)&&positions.has(edge.source)&&positions.has(edge.target));
  const adjacency=new Map();
  for(const edge of process){
    if(!adjacency.has(edge.source))adjacency.set(edge.source,[]);if(!adjacency.has(edge.target))adjacency.set(edge.target,[]);
    adjacency.get(edge.source).push(edge.target);adjacency.get(edge.target).push(edge.source);
  }
  const mains=graph.nodes.filter(node=>node.domain==="main"&&positions.has(node.id));
  const overlap=(a,b)=>Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>OVERLAP_MIN&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>OVERLAP_MIN;
  const unitOf=node=>{
    // The whole process-connected chain when it is all one recipe; otherwise just the
    // run of same-recipe nodes around this one (an edge into a shared neighbour may
    // then slant, which is better than two nodes on top of each other).
    const group=new Set(),stack=[node.id];
    while(stack.length){
      const id=stack.pop();if(group.has(id))continue;
      const member=nodeById.get(id);
      if(member.kind!==node.kind||member.domain!=="main")continue;
      group.add(id);for(const next of adjacency.get(id)||[])stack.push(next);
    }
    const carried=new Set(group);
    for(const other of graph.nodes){
      if(carried.has(other.id)||!positions.has(other.id))continue;
      const exits=graph.edges.filter(edge=>edge.source===other.id);
      if(!graph.edges.some(edge=>edge.target===other.id)&&exits.length&&exits.every(edge=>isAdd(edge)&&group.has(edge.target)))carried.add(other.id);
    }
    return carried;
  };
  for(let pass=0;pass<8;pass++){
    let moved=false;
    for(let i=0;i<mains.length;i++)for(let j=i+1;j<mains.length;j++){
      const a=mains[i],b=mains[j];
      if(!overlap(positions.get(a.id),positions.get(b.id)))continue;
      const single=node=>["only_r1","only_r2"].includes(node.kind);
      let mover=null,other=null;
      if(single(a)&&!single(b)){mover=a;other=b;}
      else if(single(b)&&!single(a)){mover=b;other=a;}
      else if(single(a)&&single(b)){
        // Different recipes: R1 stays above, R2 below. Same recipe: the later node moves.
        if(a.kind!==b.kind){mover=a.kind==="only_r2"?a:b;other=mover===a?b:a;}
        else{mover=a.id<b.id?b:a;other=mover===a?b:a;}
      }
      if(!mover)continue;
      const carried=unitOf(mover);
      if(!carried||carried.has(other.id))continue;
      const pm=positions.get(mover.id),po=positions.get(other.id);
      const down=mover.kind==="only_r2"?true:mover.kind==="only_r1"?false:pm.y+pm.height/2>=po.y+po.height/2;
      const clear=shift=>[...carried].every(id=>{
        const x=positions.get(id);
        return graph.nodes.every(node=>{
          if(carried.has(node.id)||!positions.has(node.id))return true;
          const y=positions.get(node.id);
          return x.x>=y.x+y.width+6||x.x+x.width<=y.x-6||x.y+shift>=y.y+y.height+6||x.y+x.height+shift<=y.y-6;
        });
      });
      const guard=makeGuard();
      let move=0;
      // Smallest move first; at equal distance the recipe's own side wins.
      for(let step=OVERLAP_STEP;step<=OVERLAP_MAX&&!move;step+=OVERLAP_STEP)for(const direction of [down?1:-1,down?-1:1]){
        const shift=direction*step;
        if(clear(shift)&&guard.allowsStraighten(carried,shift,OVERLAP_ALLOWANCE)){move=shift;break;}
      }
      if(!move)continue;
      for(const id of carried)positions.get(id).y+=move;
      moved=true;
    }
    if(!moved)break;
  }
}

// An aux node that feeds a main node through a process edge (for example water
// that is stirred into a sauce) belongs right beside that node, on its row. When
// the layout left it far away, it moves, together with the ingredient aux that only
// feed it, to the nearest gap left of the target where the group is clear of other
// nodes and its collision cost stays within a small allowance. The target port is
// the one the edge actually uses (shared edges use the dumbbell's middle).
const AUX_SOURCE_NEAR=200,AUX_SOURCE_GAPS=[65,130,195,260],AUX_SOURCE_ALLOWANCE=120;
export function attachAuxProcessSources(graph,positions,guard=null){
  const isSplit=edge=>String(edge.action||"").toLowerCase()==="split";
  const nodeById=new Map(graph.nodes.map(node=>[node.id,node]));
  const center=id=>({x:positions.get(id).x+positions.get(id).width/2,y:positions.get(id).y+positions.get(id).height/2});
  for(const edge of graph.edges){
    if(isAdd(edge)||isSplit(edge)||!positions.has(edge.source)||!positions.has(edge.target))continue;
    const source=nodeById.get(edge.source),target=nodeById.get(edge.target);
    if(source.domain!=="aux"||target.domain!=="main")continue;
    if(graph.edges.some(other=>other.target===source.id&&!isAdd(other)))continue;
    const here=center(source.id),goal=center(target.id);
    const sourcePort=here.y+edgeAnchorOffset(source,edge,"source"),targetPort=goal.y+edgeAnchorOffset(target,edge,"target");
    if(Math.hypot(here.x-goal.x,sourcePort-targetPort)<=AUX_SOURCE_NEAR)continue;
    // The source plus every aux that only feeds the group (through ADD edges).
    const carried=new Set([source.id]);
    for(let grew=true;grew;){
      grew=false;
      for(const node of graph.nodes){
        if(carried.has(node.id)||!positions.has(node.id)||node.domain!=="aux")continue;
        const exits=graph.edges.filter(other=>other.source===node.id);
        if(!graph.edges.some(other=>other.target===node.id)&&exits.length&&exits.every(other=>isAdd(other)&&carried.has(other.target))){carried.add(node.id);grew=true;}
      }
    }
    const clear=(dx,dy)=>[...carried].every(id=>{
      const a=positions.get(id);
      return graph.nodes.every(node=>{
        if(carried.has(node.id)||!positions.has(node.id))return true;
        const b=positions.get(node.id);
        return a.x+dx>=b.x+b.width+6||a.x+a.width+dx<=b.x-6||a.y+dy>=b.y+b.height+6||a.y+a.height+dy<=b.y-6;
      });
    });
    const dy=targetPort-sourcePort;
    let move=null;
    for(const gap of AUX_SOURCE_GAPS){
      const dx=goal.x-gap-here.x;
      if(Math.hypot(dx,dy)>=Math.hypot(here.x-goal.x,sourcePort-targetPort)-20)continue;
      if(clear(dx,dy)&&(!guard||guard.allowsShift(carried,dx,dy,AUX_SOURCE_ALLOWANCE))){move=[dx,dy];break;}
    }
    if(!move)continue;
    for(const id of carried){positions.get(id).x+=move[0];positions.get(id).y+=move[1];}
    guard?.movedShift(carried,move[0],move[1]);
  }
}

// An ingredient (or a one-recipe main root) with no input that is split into
// portions, each added into a process node (a "fan"), keeps the row the branch
// separation left it on, which can be hundreds of px from the nodes it feeds. The
// whole fan (root and portions) slides vertically toward its receivers as far as the
// collision guard allows, keeping every portion at least FAN_GAP (MAIN_FAN_GAP for a
// main fan) from its receivers. A main fan blocked by another node may also step
// right, FAN_STEP_X at a time, while keeping the usual gap to its receivers.
const FAN_GAP=130,MAIN_FAN_GAP=90,FAN_STEP_X=65,FAN_MAX_X=260,FAN_KID_GAP=110,FAN_MAX_KID_X=500;
export function compactAuxFans(graph,positions,guard=null){
  const isSplit=edge=>String(edge.action||"").toLowerCase()==="split";
  const nodeById=new Map(graph.nodes.map(node=>[node.id,node]));
  const centerX=id=>positions.get(id).x+positions.get(id).width/2;
  const centerY=id=>positions.get(id).y+positions.get(id).height/2;
  for(const root of graph.nodes){
    const oneRecipeMain=root.domain==="main"&&(root.kind==="only_r1"||root.kind==="only_r2");
    if((root.domain!=="aux"&&!oneRecipeMain)||!positions.has(root.id)||graph.edges.some(edge=>edge.target===root.id))continue;
    const out=graph.edges.filter(edge=>edge.source===root.id);
    if(out.length<2||!out.every(isSplit))continue;
    const kids=out.map(edge=>nodeById.get(edge.target));
    if(kids.some(kid=>!kid||kid.domain!==root.domain||(oneRecipeMain&&kid.kind!==root.kind)||!positions.has(kid.id)))continue;
    const adds=kids.flatMap(kid=>graph.edges.filter(edge=>edge.source===kid.id));
    if(!adds.length||!adds.every(edge=>isAdd(edge)&&positions.has(edge.target))||kids.some(kid=>!graph.edges.some(edge=>edge.source===kid.id)))continue;
    const members=new Set([root.id,...kids.map(kid=>kid.id)]);
    const mean=list=>list.reduce((sum,value)=>sum+value,0)/list.length;
    const dir=Math.sign(mean(kids.map(kid=>centerY(kid.id)))-mean(adds.map(edge=>centerY(edge.target))));
    if(!dir)continue;
    const clear=(dx,shift)=>[...members].every(id=>{
      const a=positions.get(id);
      return graph.nodes.every(node=>{
        if(members.has(node.id)||!positions.has(node.id))return true;
        const b=positions.get(node.id);
        return a.x+dx>=b.x+b.width+6||a.x+a.width+dx<=b.x-6||a.y+shift>=b.y+b.height+6||a.y+a.height+shift<=b.y-6;
      });
    });
    // Largest slide toward the receivers first, then back towards the current row.
    const room=Math.min(...adds.map(edge=>dir*(centerY(edge.source)-centerY(edge.target))))-(oneRecipeMain?MAIN_FAN_GAP:FAN_GAP);
    let move=0,moveX=0;
    for(let slide=Math.floor(room/10)*10;slide>=10;slide-=10){
      const shift=-dir*slide;
      if(clear(0,shift)&&(!guard||guard.allowsY(members,shift,oneRecipeMain?60:0))){move=shift;break;}
    }
    if(!move&&oneRecipeMain){
      const roomX=Math.min(...adds.map(edge=>centerX(edge.target)-centerX(edge.source)))-PROCESS_GAP;
      search:for(let dx=FAN_STEP_X;dx<=Math.min(FAN_MAX_X,roomX);dx+=FAN_STEP_X){
        for(let slide=Math.floor(room/10)*10;slide>=10;slide-=10){
          const shift=-dir*slide;
          if(clear(dx,shift)&&(!guard||guard.allowsShift(members,dx,shift,60))){move=shift;moveX=dx;break search;}
        }
      }
    }
    if(!move)continue;
    for(const id of members){positions.get(id).y+=move;positions.get(id).x+=moveX;}
    if(moveX)guard?.movedShift(members,moveX,move);else guard?.movedY(members,move);
    // A main root then re-centres on its portions so the split edges stay short.
    if(oneRecipeMain){
      const solo=new Set([root.id]),want=Math.round((mean(kids.map(kid=>centerY(kid.id)))-centerY(root.id))/10)*10;
      const rp=positions.get(root.id);
      const free=graph.nodes.every(node=>{
        if(node.id===root.id||!positions.has(node.id))return true;
        const b=positions.get(node.id);
        return rp.x>=b.x+b.width+6||rp.x+rp.width<=b.x-6||rp.y+want>=b.y+b.height+6||rp.y+rp.height+want<=b.y-6;
      });
      if(want&&free&&(!guard||guard.allowsY(solo,want,0))){rp.y+=want;guard?.movedY(solo,want);}
      // Each portion then steps right to sit FAN_KID_GAP before its receiver, and the
      // root follows the leftmost portion, so the fan hugs the chain it feeds.
      const stepRight=(ids,goal)=>{
        const set=new Set(ids);
        for(let dx=Math.floor(goal/13)*13;dx>=13;dx-=13){
          // A small upward nudge may be needed to clear a node that sits beside the portion.
          for(const dy of [0,-13,-26,-39]){
            const fits=ids.every(id=>{
              const a=positions.get(id);
              return graph.nodes.every(node=>{
                if(set.has(node.id)||!positions.has(node.id))return true;
                const b=positions.get(node.id);
                return a.x+dx>=b.x+b.width+6||a.x+a.width+dx<=b.x-6||a.y+dy>=b.y+b.height+6||a.y+a.height+dy<=b.y-6;
              });
            });
            if(fits&&(!guard||guard.allowsShift(set,dx,dy,60))){for(const id of ids){positions.get(id).x+=dx;positions.get(id).y+=dy;}guard?.movedShift(set,dx,dy);return;}
          }
        }
      };
      for(const kid of [...kids].sort((a,b)=>centerX(b.id)-centerX(a.id))){
        const receivers=graph.edges.filter(edge=>edge.source===kid.id&&isAdd(edge));
        if(!receivers.length)continue;
        const goal=Math.min(...receivers.map(edge=>centerX(edge.target)))-FAN_KID_GAP-centerX(kid.id);
        if(goal>=13&&goal<=FAN_MAX_KID_X)stepRight([kid.id],goal);
      }
      const leftmost=Math.min(...kids.map(kid=>centerX(kid.id)));
      const rootGoal=leftmost-centerX(root.id);
      if(rootGoal>=13&&rootGoal<=FAN_MAX_KID_X)stepRight([root.id],rootGoal);
      // A portion that another edge runs through, or whose split edge another edge
      // crosses (an ADD curve from a node on the left, for example), is nudged up or
      // down, 13px at a time, until neither happens. Edges are tested as drawn: ADD
      // edges follow the cubic of GraphEdge.addGeometry.
      const curve=edge=>{
        const s=recipeAnchor(nodeById.get(edge.source),positions.get(edge.source),edge,"source"),t=recipeAnchor(nodeById.get(edge.target),positions.get(edge.target),edge,"target");
        if(!isAdd(edge))return [[s.x,s.y],[t.x,t.y]];
        const span=t.x-s.x,vertical=t.y-s.y,side=String(edge.style||"shared").toUpperCase(),approach=side==="R1"?-48:side==="R2"?48:0;
        let pts;
        if(Math.abs(span)>180&&Math.abs(vertical)>60)pts=[[s.x,s.y],[s.x+span*.70,s.y],[s.x+span*.88,t.y],[t.x,t.y]];
        else if(approach)pts=[[s.x,s.y],[s.x,s.y],[t.x,t.y+approach],[t.x,t.y]];
        else{const dx=Math.max(34,Math.abs(span)*.45);pts=[[s.x,s.y],[s.x+dx*.55,s.y],[t.x-dx*.55,t.y],[t.x,t.y]];}
        return Array.from({length:25},(_,i)=>{const k=i/24,u=1-k;return [u*u*u*pts[0][0]+3*u*u*k*pts[1][0]+3*u*k*k*pts[2][0]+k*k*k*pts[3][0],u*u*u*pts[0][1]+3*u*u*k*pts[1][1]+3*u*k*k*pts[2][1]+k*k*k*pts[3][1]];});
      };
      const orient=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
      const crosses=(p,q,r,s)=>orient(p,q,r)*orient(p,q,s)<0&&orient(r,s,p)*orient(r,s,q)<0;
      const segmentInBox=(p,q,box)=>{
        let t0=0,t1=1;const d=[q[0]-p[0],q[1]-p[1]];
        for(const [delta,lo,hi,from] of [[d[0],box.x,box.x+box.width,p[0]],[d[1],box.y,box.y+box.height,p[1]]]){
          if(Math.abs(delta)<1e-9){if(from<lo||from>hi)return false;continue;}
          let u=(lo-from)/delta,v=(hi-from)/delta;if(u>v)[u,v]=[v,u];
          t0=Math.max(t0,u);t1=Math.min(t1,v);if(t0>t1)return false;
        }
        return true;
      };
      const others=graph.edges.filter(edge=>positions.has(edge.source)&&positions.has(edge.target)&&!members.has(edge.source)&&!members.has(edge.target));
      const polylines=others.map(curve);
      const spoiled=(kid,dy)=>{
        const p=positions.get(kid.id),box={x:p.x-4,y:p.y+dy-4,width:p.width+8,height:p.height+8};
        const split=graph.edges.find(edge=>isSplit(edge)&&edge.target===kid.id&&edge.source===root.id);
        const a=split?[centerX(root.id),centerY(root.id)]:null,b=[centerX(kid.id),centerY(kid.id)+dy];
        return polylines.some(line=>{
          for(let i=1;i<line.length;i++){
            if(segmentInBox(line[i-1],line[i],box))return true;
            if(a&&crosses(a,b,line[i-1],line[i]))return true;
          }
          return false;
        });
      };
      for(const kid of kids){
        if(!spoiled(kid,0))continue;
        const p=positions.get(kid.id);
        for(let step=13;step<=130;step+=13){
          let done=false;
          for(const dy of [-step,step]){
            const free=graph.nodes.every(node=>{
              if(node.id===kid.id||!positions.has(node.id))return true;
              const b=positions.get(node.id);
              return p.x>=b.x+b.width+6||p.x+p.width<=b.x-6||p.y+dy>=b.y+b.height+6||p.y+p.height+dy<=b.y-6;
            });
            if(free&&!spoiled(kid,dy)&&(!guard||guard.allowsY(new Set([kid.id]),dy,0))){p.y+=dy;guard?.movedY(new Set([kid.id]),dy);done=true;break;}
          }
          if(done)break;
        }
      }
      // A long ADD curve that still crosses an edge of this fan (a portion's ADD to its
      // receiver, or its split edge) is lifted clear: the whole process chain of its
      // source node moves up until the curve passes above the fan.
      const fanLines=()=>graph.edges.filter(edge=>(members.has(edge.source)||members.has(edge.target))&&positions.has(edge.source)&&positions.has(edge.target)).map(edge=>({edge,line:curve(edge)}));
      const offenders=graph.edges.filter(edge=>isAdd(edge)&&!members.has(edge.source)&&!members.has(edge.target)&&positions.has(edge.source)&&positions.has(edge.target)&&nodeById.get(edge.source)?.domain==="main");
      const crossesFan=edge=>{
        const mine=curve(edge);
        for(const id of members){
          const p=positions.get(id),box={x:p.x-12,y:p.y-12,width:p.width+24,height:p.height+24};
          for(let a=1;a<mine.length;a++)if(segmentInBox(mine[a-1],mine[a],box))return true;
        }
        return fanLines().some(({edge:other,line})=>{
          if([edge.source,edge.target].some(id=>id===other.source||id===other.target))return false;
          for(let a=1;a<mine.length;a++)for(let b=1;b<line.length;b++)if(crosses(mine[a-1],mine[a],line[b-1],line[b]))return true;
          return false;
        });
      };
      const processNeighbours=new Map();
      for(const edge of graph.edges){
        if(isAdd(edge)||isSplit(edge)||!positions.has(edge.source)||!positions.has(edge.target))continue;
        if(!processNeighbours.has(edge.source))processNeighbours.set(edge.source,[]);if(!processNeighbours.has(edge.target))processNeighbours.set(edge.target,[]);
        processNeighbours.get(edge.source).push(edge.target);processNeighbours.get(edge.target).push(edge.source);
      }
      for(const edge of offenders){
        if(!crossesFan(edge))continue;
        const group=new Set(),stack=[edge.source];
        const kindOf=nodeById.get(edge.source)?.kind;
        while(stack.length){const id=stack.pop();if(group.has(id))continue;group.add(id);for(const next of processNeighbours.get(id)||[])if(!members.has(next)&&nodeById.get(next)?.kind===kindOf)stack.push(next);}
        const carriedUp=new Set(group);
        for(const node of graph.nodes){
          if(carriedUp.has(node.id)||!positions.has(node.id))continue;
          const exits=graph.edges.filter(other=>other.source===node.id);
          if(!graph.edges.some(other=>other.target===node.id)&&exits.length&&exits.every(other=>isAdd(other)&&carriedUp.has(other.target)))carriedUp.add(node.id);
        }
        const clearUp=dy=>[...carriedUp].every(id=>{
          const a=positions.get(id);
          return graph.nodes.every(node=>{
            if(carriedUp.has(node.id)||!positions.has(node.id))return true;
            const b=positions.get(node.id);
            return a.x>=b.x+b.width+6||a.x+a.width<=b.x-6||a.y+dy>=b.y+b.height+6||a.y+a.height+dy<=b.y-6;
          });
        });
        for(let lift=13;lift<=520;lift+=13){
          const dy=-lift;
          if(!clearUp(dy))continue;
          for(const id of carriedUp)positions.get(id).y+=dy;
          const ok=!crossesFan(edge)&&(!guard||guard.allowsY(carriedUp,0,60));
          for(const id of carriedUp)positions.get(id).y-=dy;
          if(ok&&(!guard||guard.allowsY(carriedUp,dy,60))){for(const id of carriedUp)positions.get(id).y+=dy;guard?.movedY(carriedUp,dy);break;}
        }
      }
    }
  }
}

// A one-recipe process chain that is fed only by ADD edges (a prepared feeder
// chain) belongs on its recipe's side of the other recipe's process rows it shares
// columns with: R1 above, R2 below. Group shifts made while separating branches
// can leave it on the wrong side (an R1 feeder under an R2 row). The chain, with
// the ingredients that only feed it, moves vertically to the row on the correct
// side that is closest to the middle of its ADD neighbours, if that row is clear
// and passes the collision guard. Only y changes.
export function fixFeederChainSides(graph,positions,guard=null){
  const isSplit=edge=>String(edge.action||"").toLowerCase()==="split";
  const process=graph.edges.filter(edge=>!isAdd(edge)&&!isSplit(edge)&&positions.has(edge.source)&&positions.has(edge.target));
  const nodeById=new Map(graph.nodes.map(node=>[node.id,node]));
  const adjacency=new Map();
  for(const edge of process){
    if(!adjacency.has(edge.source))adjacency.set(edge.source,[]);if(!adjacency.has(edge.target))adjacency.set(edge.target,[]);
    adjacency.get(edge.source).push(edge.target);adjacency.get(edge.target).push(edge.source);
  }
  const centerX=id=>positions.get(id).x+positions.get(id).width/2,centerY=id=>positions.get(id).y+positions.get(id).height/2;
  const seen=new Set();
  for(const start of adjacency.keys()){
    if(seen.has(start))continue;
    const group=new Set(),stack=[start];
    while(stack.length){const id=stack.pop();if(group.has(id))continue;group.add(id);seen.add(id);for(const next of adjacency.get(id)||[])stack.push(next);}
    const kind=nodeById.get(start)?.kind;
    if(!["only_r1","only_r2"].includes(kind)||[...group].some(id=>nodeById.get(id).kind!==kind||nodeById.get(id).domain!=="main"))continue;
    if(graph.edges.some(edge=>group.has(edge.target)&&!group.has(edge.source)&&!isAdd(edge)))continue;
    // A container with no process predecessor that takes an ADD from a main node is
    // the inline continuation of that flow: the ADD stays horizontal. A lone
    // ingredient source moves together with the chain; a source that ends another
    // process chain pins this chain to its row, so the chain is left alone.
    const inlineSources=[];
    let pinned=false;
    for(const edge of graph.edges){
      if(!isAdd(edge)||!group.has(edge.target)||group.has(edge.source)||nodeById.get(edge.source)?.domain!=="main"||!isContainerNode(nodeById.get(edge.target))||process.some(other=>other.target===edge.target))continue;
      const exits=graph.edges.filter(other=>other.source===edge.source);
      if(!graph.edges.some(other=>other.target===edge.source)&&exits.every(other=>isAdd(other)&&group.has(other.target)))inlineSources.push(edge.source);else pinned=true;
    }
    if(pinned)continue;
    const side=kind==="only_r1"?-1:1;
    const carried=new Set([...group,...inlineSources]);
    for(const node of graph.nodes){
      if(carried.has(node.id)||!positions.has(node.id))continue;
      const exits=graph.edges.filter(other=>other.source===node.id);
      if(!graph.edges.some(other=>other.target===node.id)&&exits.length&&exits.every(other=>isAdd(other)&&carried.has(other.target)))carried.add(node.id);
    }
    // A prepared aux feeder (aux nodes joined by process edges such as a cut) whose
    // only exits are ADDs into the carried nodes travels with them too.
    for(let grew=true;grew;){
      grew=false;
      for(const node of graph.nodes){
        if(carried.has(node.id)||!positions.has(node.id)||node.domain!=="aux")continue;
        const part=new Set(),walk=[node.id];
        while(walk.length){const id=walk.pop();if(part.has(id))continue;part.add(id);for(const next of adjacency.get(id)||[])walk.push(next);}
        if([...part].some(id=>nodeById.get(id)?.domain!=="aux"||carried.has(id)||!positions.has(id)))continue;
        const entering=graph.edges.some(other=>part.has(other.target)&&!part.has(other.source));
        const leaving=graph.edges.filter(other=>part.has(other.source)&&!part.has(other.target));
        if(!entering&&leaving.length&&leaving.every(other=>isAdd(other)&&carried.has(other.target))){for(const id of part)carried.add(id);grew=true;}
      }
    }
    const left=Math.min(...[...group].map(centerX))-65,right=Math.max(...[...group].map(centerX))+65;
    // Other-recipe process nodes sharing columns with the chain, and other-recipe
    // process edges running over those columns (a long edge such as a simmer into a
    // dumbbell half is a rival too: the chain's ADD must not have to cross it).
    const rivalYs=[];
    for(const edge of process){
      for(const id of [edge.source,edge.target]){
        const node=nodeById.get(id);
        if(group.has(id)||node.domain!=="main"||!["only_r1","only_r2"].includes(node.kind)||node.kind===kind)continue;
        if(centerX(id)>=left&&centerX(id)<=right)rivalYs.push(centerY(id));
      }
      const style=String(edge.style||"").toUpperCase();
      if(style!==(kind==="only_r1"?"R2":"R1")||group.has(edge.source)||group.has(edge.target))continue;
      const sourceX=centerX(edge.source),targetX=centerX(edge.target);
      const lo=Math.min(sourceX,targetX),hi=Math.max(sourceX,targetX);
      if(hi<left||lo>right||hi-lo<1)continue;
      const sourceY=centerY(edge.source)+edgeAnchorOffset(nodeById.get(edge.source),edge,"source"),targetY=centerY(edge.target)+edgeAnchorOffset(nodeById.get(edge.target),edge,"target");
      const mid=Math.min(Math.max((left+right)/2,lo),hi);
      rivalYs.push(sourceY+(targetY-sourceY)*(mid-sourceX)/(targetX-sourceX));
    }
    if(!rivalYs.length)continue;
    const mine=Math.max(...[...group].map(centerY)),mineTop=Math.min(...[...group].map(centerY));
    const rivalLimit=side<0?Math.min(...rivalYs):Math.max(...rivalYs);
    const onWrongSide=side<0?mine>rivalLimit:mineTop<rivalLimit;
    if(!onWrongSide)continue;
    const neighbours=graph.edges.filter(edge=>isAdd(edge)&&(carried.has(edge.source)!==carried.has(edge.target))&&positions.has(edge.source)&&positions.has(edge.target)).map(edge=>carried.has(edge.source)?edge.target:edge.source);
    if(!neighbours.length)continue;
    const middle=neighbours.map(centerY).reduce((a,b)=>a+b,0)/neighbours.length;
    const anchor=side<0?mine:mineTop,clear=shift=>[...carried].every(id=>{
      const a=positions.get(id);
      return graph.nodes.every(node=>{
        if(carried.has(node.id)||!positions.has(node.id))return true;
        const b=positions.get(node.id);
        return a.x>=b.x+b.width+6||a.x+a.width<=b.x-6||a.y+shift>=b.y+b.height+6||a.y+a.height+shift<=b.y-6;
      });
    });
    const candidates=[];
    for(let target=Math.round(middle/13)*13-520;target<=middle+520;target+=13){
      const shift=target-anchor;
      const after=side<0?mine+shift:mineTop+shift;
      if(side<0?after>rivalLimit-40:after<rivalLimit+40)continue;
      candidates.push([Math.abs(target-middle),shift]);
    }
    candidates.sort((a,b)=>a[0]-b[0]);
    let move=0;
    for(const [,shift] of candidates)if(clear(shift)&&(!guard||guard.allowsY(carried,shift,0))){move=shift;break;}
    if(!move)continue;
    for(const id of carried)positions.get(id).y+=move;
    guard?.movedY(carried,move);
  }
}

// Free single additions (aux ingredients with no input and one ADD exit) that
// feed the same receiver from the same recipe side form one cluster. When the
// layout left that cluster far from the receiver, it slides vertically, as a
// rigid unit, toward the receiver as far as the collision guard allows, keeping
// at least ADDITION_GAP between the cluster and the receiver. Only y changes.
const ADDITION_GAP=50;
export function compactAuxAdditions(graph,positions,guard=null){
  const nodeById=new Map(graph.nodes.map(node=>[node.id,node]));
  const centerY=id=>positions.get(id).y+positions.get(id).height/2;
  const groups=new Map();
  for(const node of graph.nodes){
    if(node.domain!=="aux"||!positions.has(node.id)||!["only_r1","only_r2"].includes(node.kind))continue;
    if(graph.edges.some(edge=>edge.target===node.id))continue;
    const out=graph.edges.filter(edge=>edge.source===node.id);
    if(!out.length||!out.every(edge=>isAdd(edge))||new Set(out.map(edge=>edge.target)).size!==1)continue;
    const target=nodeById.get(out[0].target);
    if(!target||target.domain!=="aux"||!positions.has(target.id))continue;
    const key=target.id+"|"+node.kind;
    if(!groups.has(key))groups.set(key,{target:target.id,members:[]});
    groups.get(key).members.push(node.id);
  }
  for(const {target,members:list} of groups.values()){
    const members=new Set(list);
    const dir=Math.sign(list.reduce((sum,id)=>sum+centerY(id),0)/list.length-centerY(target));
    if(!dir)continue;
    // Nearest side of the cluster to the receiver.
    const near=dir<0?Math.max(...list.map(centerY)):Math.min(...list.map(centerY));
    const room=dir*(centerY(target)-near)*-1-ADDITION_GAP;
    if(room<10)continue;
    const clear=shift=>list.every(id=>{
      const a=positions.get(id);
      return graph.nodes.every(node=>{
        if(members.has(node.id)||!positions.has(node.id))return true;
        const b=positions.get(node.id);
        return a.x>=b.x+b.width+6||a.x+a.width<=b.x-6||a.y+shift>=b.y+b.height+6||a.y+a.height+shift<=b.y-6;
      });
    });
    let move=0;
    for(let slide=Math.floor(room/10)*10;slide>=10;slide-=10){
      const shift=-dir*slide;
      if(clear(shift)&&(!guard||guard.allowsY(members,shift,0))){move=shift;break;}
    }
    if(!move)continue;
    for(const id of members)positions.get(id).y+=move;
    guard?.movedY(members,move);
  }
}

// A one-recipe (or shared exact) main process chain with no inputs whose only exits
// are ADD edges into one receiver, made of plain ingredients (no container), is a
// prepared feeder such as an egg that is cracked and then added.
export function findFeederChains(graph){
  const isSplit=edge=>String(edge.action||"").toLowerCase()==="split";
  const nodeById=new Map(graph.nodes.map(node=>[node.id,node]));
  const adjacency=new Map();
  for(const edge of graph.edges){
    if(isAdd(edge)||isSplit(edge)||!nodeById.has(edge.source)||!nodeById.has(edge.target))continue;
    if(!adjacency.has(edge.source))adjacency.set(edge.source,[]);if(!adjacency.has(edge.target))adjacency.set(edge.target,[]);
    adjacency.get(edge.source).push(edge.target);adjacency.get(edge.target).push(edge.source);
  }
  const chains=[],seen=new Set();
  for(const start of adjacency.keys()){
    if(seen.has(start))continue;
    const group=new Set(),stack=[start];
    while(stack.length){const id=stack.pop();if(group.has(id))continue;group.add(id);seen.add(id);for(const next of adjacency.get(id)||[])stack.push(next);}
    const kind=nodeById.get(start).kind;
    if(group.size<2||!["only_r1","only_r2","merged_exact"].includes(kind))continue;
    if([...group].some(id=>{const node=nodeById.get(id);return node.kind!==kind||node.domain!=="main"||isContainerNode(node);}))continue;
    if(graph.edges.some(edge=>group.has(edge.target)&&!group.has(edge.source)))continue;
    const exits=graph.edges.filter(edge=>group.has(edge.source)&&!group.has(edge.target));
    if(!exits.length||!exits.every(edge=>isAdd(edge)&&nodeById.has(edge.target))||new Set(exits.map(edge=>edge.target)).size!==1||new Set(exits.map(edge=>edge.source)).size!==1)continue;
    chains.push({ids:[...group],source:exits[0].source,target:exits[0].target});
  }
  return chains;
}

// Such a chain that the normal layout leaves far from its receiver (it got a lane
// of its own) is laid out like an aux feeder instead: beside its receiver. The
// layout is recomputed on a view of the graph in which only those chains are aux;
// the real graph, node sizes, domains, states and matching never change. Chains
// already beside their receiver, and every other branch, keep the normal layout.
const SPLIT_GAIN=80,RELAX_HEIGHT_GAIN=50;
const FEEDER_NEAR=250;
export function feederChainView(graph,chains){
  if(!chains.length)return graph;
  const flip=new Set(chains.flatMap(chain=>chain.ids));
  return{...graph,nodes:graph.nodes.map(node=>flip.has(node.id)?{...node,domain:"aux"}:node)};
}

function runInWorker(graph){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL("./portedLayout.worker.js",import.meta.url),{type:"module"});
    const timeout=setTimeout(()=>{
      worker.terminate();
      reject(new Error("Ported layout exceeded its time limit"));
    },LAYOUT_TIMEOUT_MS);
    const finish=callback=>value=>{clearTimeout(timeout);worker.terminate();callback(value);};
    worker.onmessage=finish(event=>event.data.ok?resolve(event.data.coordinates):reject(new Error(event.data.error)));
    worker.onerror=finish(event=>reject(new Error(event.message||"Ported layout worker failed")));
    worker.postMessage(graph);
  });
}

async function layoutOnce(graph,realGraph,moveSplitRoots=false,relaxSplitRoots=false){
  const realById=new Map(realGraph.nodes.map(node=>[node.id,node]));
  const coordinates=typeof Worker==="undefined"?runPortedLayout(graph):await runInWorker(graph),byId=new Map(coordinates.map(item=>[item.id,item])),positions=new Map();
  for(const node of graph.nodes){
    const point=byId.get(node.id);
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))throw new Error(`Ported layout omitted ${node.id}`);
    const size=nodeSize(realById.get(node.id)||node);
    positions.set(node.id,{x:point.x-size.width/2,y:point.y-size.height/2,width:size.width,height:size.height});
  }
  separateOverlappingBands(graph,positions,separateProcessBranches(graph,positions));
  compactJoinChains(graph,positions,makeCollisionGuard(graph,positions));
  // Collision-aware placement of free feeders on the final branch geometry.
  const placed=graph.nodes.map(node=>{const p=positions.get(node.id);return{...node,x:p.x+p.width/2,y:p.y+p.height/2};});
  minimizeEdgeConflicts(placed,graph.edges,{relaxSplitRoots});
  for(const node of placed){const p=positions.get(node.id);p.x=node.x-p.width/2;p.y=node.y-p.height/2;}
  compactComponentsLeft(graph,positions,makeCollisionGuard(graph,positions));
  compactSplitLanes(graph,positions,makeCollisionGuard(graph,positions));
  fixSplitSides(graph,positions,makeCollisionGuard(graph,positions));
  alignChainsIntoDumbbells(graph,positions,makeCollisionGuard(graph,positions));
  if(moveSplitRoots)clearSplitRootCrossings(graph,positions,makeCollisionGuard(graph,positions));
  attachAuxProcessSources(graph,positions,makeCollisionGuard(graph,positions));
  fixFeederChainSides(graph,positions,makeCollisionGuard(graph,positions));
  compactAuxFans(graph,positions,makeCollisionGuard(graph,positions));
  compactAuxAdditions(graph,positions,makeCollisionGuard(graph,positions));
  fixBackwardProcessEdges(graph,positions,makeCollisionGuard(graph,positions));
  resolveNodeOverlaps(graph,positions,()=>makeCollisionGuard(graph,positions));
  const minX=Math.min(...[...positions.values()].map(p=>p.x)),minY=Math.min(...[...positions.values()].map(p=>p.y));
  for(const p of positions.values()){p.x+=60-minX;p.y+=60-minY;}
  return positions;
}

export async function runEstablishedLayout(graph){
  const height=map=>Math.max(...[...map.values()].map(p=>p.y+p.height))-Math.min(...[...map.values()].map(p=>p.y));
  const centers=map=>id=>({x:map.get(id).x+map.get(id).width/2,y:map.get(id).y+map.get(id).height/2});
  const addLength=map=>graph.edges.reduce((sum,edge)=>{
    if(!isAdd(edge)||!map.has(edge.source)||!map.has(edge.target))return sum;
    const a=centers(map)(edge.source),b=centers(map)(edge.target);
    return sum+Math.hypot(a.x-b.x,a.y-b.y);
  },0);
  const collisions=map=>{
    const placed=graph.nodes.filter(node=>map.has(node.id)).map(node=>({...node,...centers(map)(node.id)}));
    const parts=createConflictModel(placed,graph.edges).partsIds(new Set(placed.map(node=>node.id)));
    return parts.hits*100+parts.crossProc*20+parts.cross*10;
  };
  const orient=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const cuts=(a,b,c,d)=>orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0;
  const splitOverProcess=map=>{
    const at=centers(map),split=graph.edges.filter(edge=>String(edge.action||"").toLowerCase()==="split"&&map.has(edge.source)&&map.has(edge.target));
    const process=graph.edges.filter(edge=>!isAdd(edge)&&String(edge.action||"").toLowerCase()!=="split"&&map.has(edge.source)&&map.has(edge.target));
    let count=0;
    for(const s of split)for(const q of process){
      if([s.source,s.target].some(id=>id===q.source||id===q.target))continue;
      if(cuts(at(s.source),at(s.target),at(q.source),at(q.target)))count++;
    }
    return count;
  };

  // 1. Prepared feeder chains that the normal layout leaves far from their receiver
  // are laid out like aux feeders. Keep that layout only when it is no taller, its
  // ADD edges are no longer overall, and it has no more collisions.
  let chosenGraph=graph,positions=await layoutOnce(graph,graph);
  const center=centers(positions);
  const far=findFeederChains(graph).filter(chain=>{const a=center(chain.source),b=center(chain.target);return Math.hypot(a.x-b.x,a.y-b.y)>FEEDER_NEAR;});
  if(far.length){
    const view=feederChainView(graph,far),attached=await layoutOnce(view,graph);
    if(height(attached)<=height(positions)+1&&addLength(attached)<=addLength(positions)&&collisions(attached)<=collisions(positions)){chosenGraph=view;positions=attached;}
  }

  // 2. A free split root may move to clear a split edge that cuts a process edge.
  // Keep the result only when it removes such crossings without more collisions or height.
  if(splitOverProcess(positions)>0){
    const moved=await layoutOnce(chosenGraph,graph,true);
    if(splitOverProcess(moved)<splitOverProcess(positions)&&collisions(moved)<=collisions(positions)&&height(moved)<=height(positions)+1)positions=moved;
  }

  // 3. A free split root keeps its one-recipe outputs near it when that is possible:
  // the variant is kept only when its split edges are clearly shorter and it is no
  // taller, has no more collisions (one more edge through a node is accepted when the
  // variant is at least RELAX_HEIGHT_GAIN shorter and its ADD edges are no longer), and any
  // longer ADD edges cost less than the split edges gain.
  const splitLength=map=>graph.edges.reduce((sum,edge)=>{
    if(String(edge.action||"").toLowerCase()!=="split"||!map.has(edge.source)||!map.has(edge.target))return sum;
    const a=centers(map)(edge.source),b=centers(map)(edge.target);
    return sum+Math.hypot(a.x-b.x,a.y-b.y);
  },0);
  const relaxed=await layoutOnce(chosenGraph,graph,false,true);
  const relaxedGain=splitLength(positions)-splitLength(relaxed);
  const clearlyShorter=height(relaxed)<=height(positions)-RELAX_HEIGHT_GAIN&&addLength(relaxed)<=addLength(positions)+1;
  const noWorse=collisions(relaxed)<=collisions(positions)&&addLength(relaxed)-addLength(positions)<=Math.max(relaxedGain,0);
  const compact=clearlyShorter&&relaxedGain>-2*SPLIT_GAIN&&collisions(relaxed)<=collisions(positions)+100;
  if(height(relaxed)<=height(positions)+1&&((relaxedGain>SPLIT_GAIN&&noWorse)||compact))positions=relaxed;
  return positions;
}
