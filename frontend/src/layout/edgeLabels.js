import {isAdd,nodeSize} from "../graph.js";
import {createConflictModel} from "./portedLayout.js";

export const FONT_SIZE=13,CHAR_WIDTH=7.4,LABEL_HEIGHT=17;
const PAD=2,GAP=5,WAVE_ROOM=4,STEEP=1.2;
// Positions along the edge tried in order: centre first, then alternately
// towards either end, so a label always stays on its own edge.
const FRACTIONS=[.5,.42,.58,.34,.66,.26,.74,.18,.82];

const overlaps=(a,b)=>Math.abs(a.x-b.x)<a.w/2+b.w/2+PAD&&Math.abs(a.y-b.y)<a.h/2+b.h/2+PAD;

// Does the segment a-b pass through the box (centre x,y, size w,h)? Liang-Barsky.
function segmentTouchesBox(a,b,box){
  const left=box.x-box.w/2,right=box.x+box.w/2,top=box.y-box.h/2,bottom=box.y+box.h/2;
  let t0=0,t1=1;const dx=b.x-a.x,dy=b.y-a.y;
  for(const [p,q] of [[-dx,a.x-left],[dx,right-a.x],[-dy,a.y-top],[dy,bottom-a.y]]){
    if(p===0){if(q<0)return false;}
    else{const r=q/p;if(p<0){if(r>t1)return false;if(r>t0)t0=r;}else{if(r<t0)return false;if(r<t1)t1=r;}}
  }
  return true;
}
const polylineTouchesBox=(points,box)=>points.some((point,index)=>index<points.length-1&&segmentTouchesBox(point,points[index+1],box));

// One label per PROCESS edge, sitting right beside that edge, not on its line: just
// above a flat edge, to the right of a steep one (below / to the left only when the
// first side is taken). It stays away from nodes, other labels and other edges' lines.
export function placeEdgeLabels(graph,positionFor){
  const centred=[],obstacles=[];
  for(const node of graph.nodes){
    const p=positionFor(node.id);if(!p)continue;
    const size=nodeSize(node),x=p.x+p.width/2,y=p.y+p.height/2;
    centred.push({...node,x,y});
    obstacles.push({x,y,w:size.width+4,h:size.height+4});
  }
  const model=createConflictModel(centred,graph.edges);
  const routes=new Map(model.live.map(edge=>[edge,model.route(edge)]));
  const placed=[],result=[];
  graph.edges.forEach((edge,index)=>{
    if(isAdd(edge)||!edge.action||!routes.has(edge))return;
    const [a,b]=routes.get(edge);
    const text=String(edge.action),w=text.length*CHAR_WIDTH+4;
    const others=[...routes].filter(([other])=>other!==edge&&other.source!==edge.source&&other.target!==edge.target&&other.source!==edge.target&&other.target!==edge.source).map(([,points])=>points);
    // Clearance from the line: the sine wave of an edge with a duration swings a few px.
    const room=GAP+(edge.duration?WAVE_ROOM:0),dx=b.x-a.x,dy=b.y-a.y;
    const slope=Math.abs(dy)/Math.max(Math.abs(dx),1e-6),steep=slope>STEEP;
    const offsetFor=side=>steep
      ?{x:side*(w/2+room),y:0}
      :{x:0,y:-side*(LABEL_HEIGHT/2+room+Math.min(w/2*slope,40))};
    let best=null,bestCost=Infinity;
    for(const side of [1,-1]){
      const offset=offsetFor(side);
      for(const t of FRACTIONS){
        const box={x:a.x+dx*t+offset.x,y:a.y+dy*t+offset.y,w,h:LABEL_HEIGHT};
        const boxes=[...obstacles,...placed].filter(other=>overlaps(box,other)).length;
        const lines=others.filter(points=>polylineTouchesBox(points,box)).length;
        const cost=boxes*3+lines+(side===1?0:.5);
        if(cost<bestCost){best=box;bestCost=cost;if(!cost)break;}
      }
      if(bestCost<.5)break;
    }
    placed.push(best);
    result.push({key:edge.id||index,edge,x:best.x,y:best.y,text});
  });
  return result;
}
