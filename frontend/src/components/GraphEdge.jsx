import React from "react";
import {isAdd,recipeAnchor} from "../graph";
import {heatShares,durationMinutes,waveCycles,edgeCenters,levelSegments} from "../edgeStyle";

const typeColor={heat:"#e78c75",cold:"#66a2e2",prep:"#b8bec2"};
const recipeColor={shared:"#AEEDFF",R1:"#C4D1FF",R2:"#CAF95F"};

function addGeometry(x1,y1,x2,y2,side){
  const span=x2-x1,vertical=y2-y1;
  if(Math.abs(span)>180&&Math.abs(vertical)>60){
    return [[x1,y1],[x1+span*.70,y1],[x1+span*.88,y2],[x2,y2]];
  }
  const dx=Math.max(34,Math.abs(span)*.45);
  const approach=side==="R1"?-48:side==="R2"?48:0;
  return approach
    ?[[x1,y1],[x1,y1],[x2,y2+approach],[x2,y2]]
    :[[x1,y1],[x1+dx*.55,y1],[x2-dx*.55,y2],[x2,y2]];
}

function cubicPath(points){
  const [[x1,y1],[c1x,c1y],[c2x,c2y],[x2,y2]]=points;
  return `M${x1},${y1} C${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`;
}

function taperedPath(points,startWidth=7,endWidth=2.5,steps=28){
  const sample=t=>{
    const u=1-t,[[x0,y0],[x1,y1],[x2,y2],[x3,y3]]=points;
    return [u*u*u*x0+3*u*u*t*x1+3*u*t*t*x2+t*t*t*x3,u*u*u*y0+3*u*u*t*y1+3*u*t*t*y2+t*t*t*y3];
  };
  const centers=Array.from({length:steps+1},(_,index)=>sample(index/steps));
  const sides=centers.map(([x,y],index)=>{
    const before=centers[Math.max(0,index-1)],after=centers[Math.min(steps,index+1)];
    const dx=after[0]-before[0],dy=after[1]-before[1],length=Math.hypot(dx,dy)||1;
    const half=(startWidth+(endWidth-startWidth)*(index/steps))/2;
    return [[x-dy/length*half,y+dx/length*half],[x+dy/length*half,y-dx/length*half]];
  });
  const outline=[...sides.map(pair=>pair[0]),...sides.reverse().map(pair=>pair[1])];
  return `${outline.map((point,index)=>`${index?"L":"M"}${point[0]},${point[1]}`).join(" ")} Z`;
}

function GraphEdge({edge,source,target,sourceNode,targetNode,selected,onSelect}){
  const start=recipeAnchor(sourceNode,source,edge,"source"),end=recipeAnchor(targetNode,target,edge,"target");
  const x1=start.x,y1=start.y,x2=end.x,y2=end.y,add=isAdd(edge);
  const side=String(edge.style||"shared").toUpperCase();
  const addPoints=add?addGeometry(x1,y1,x2,y2,side):null;
  const path=add?cubicPath(addPoints):`M${x1},${y1} L${x2},${y2}`;
  const dx=x2-x1,dy=y2-y1,distance=Math.hypot(dx,dy)||1;
  const targetRadius=targetNode?.domain==="aux"?11:24;
  const arrowX=x2-dx/distance*(targetRadius-1),arrowY=y2-dy/distance*(targetRadius-1);
  const processMarkerPath=`M${x1},${y1} L${arrowX},${arrowY}`;
  // Thickness follows heat_level; a stated duration draws the line as a sine wave.
  const baseWidth=edge.style==="shared"?2.5:1.8,shares=add?[]:heatShares(edge.heat_level),cycles=add?0:waveCycles(durationMinutes(edge.duration),Math.hypot(x2-x1,y2-y1));
  const processPieces=!add&&(shares.length||cycles)?levelSegments(edgeCenters(x1,y1,x2,y2,cycles),shares,baseWidth):null;
  const color=add?(recipeColor[edge.style]||"#aaa"):(typeColor[String(edge.type||"prep").toLowerCase()]||"#999");
  return <g className={`edge ${selected?`selected sel-${selected}`:""}`} onClick={()=>onSelect(edge)}>
    {add?<>
      <path className="add-taper" d={taperedPath(addPoints)} fill={color} stroke="none" opacity="0.72"/>
      <path className="add-hit-target" d={path} fill="none" stroke="transparent" strokeWidth="10" vectorEffect="non-scaling-stroke"/>
      <path className="add-centerline" d={path} fill="none" stroke="transparent" strokeWidth="1" markerEnd={`url(#add-${edge.style||"shared"})`} pointerEvents="none" vectorEffect="non-scaling-stroke"/>
    </>:<>
      {processPieces?processPieces.map((piece,index)=><path key={index} className="process-piece" d={piece.d} fill="none" stroke={color} strokeWidth={piece.width} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>):<path d={path} fill="none" stroke={color} strokeWidth={baseWidth} strokeLinecap="round" vectorEffect="non-scaling-stroke"/>}
      <path className="process-marker-line" d={processMarkerPath} fill="none" stroke="transparent" strokeWidth="1" markerEnd={`url(#arrow-${String(edge.type||"prep").toLowerCase()})`} pointerEvents="none" vectorEffect="non-scaling-stroke"/>
    </>}
    <title>{edge.action}{edge.duration?` · ${edge.duration}`:""}</title>
  </g>;
}

// Re-render only when this item's own inputs change, so panning and dragging another node stay cheap.
export default React.memo(GraphEdge);
