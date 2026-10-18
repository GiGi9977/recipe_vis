import React from "react";

const DEFAULT_COLOR="#ffffff";
const SOLID_SEGMENTS={
  whole:0,solid:0,
  chunk:4,cube:4,cut:4,"块":4,
  slice:6,dice:6,"片":6,"丁":6,
  shred:9,"丝":9,
  powder:14,
};
const MIXTURE_LIQUID={batter:.75,paste:.55,mash:.35,dough:.20,"solid-liquid mixture":.5};

export function physicalRingSpec(value){
  const state=String(value||"whole").trim().toLowerCase();
  if(state==="liquid")return{kind:"liquid",count:9};
  if(Object.hasOwn(MIXTURE_LIQUID,state))return{kind:"mixture",slots:12,liquid:MIXTURE_LIQUID[state]};
  return{kind:"solid",segments:Object.hasOwn(SOLID_SEGMENTS,state)?SOLID_SEGMENTS[state]:0};
}

function segmentedDash(radius,count){
  if(!count)return undefined;
  const circumference=2*Math.PI*radius,gap=Math.min(4,circumference/(count*4));
  return `${circumference/count-gap} ${gap}`;
}

function LiquidDots({radius,count,color,strokeWidth}){
  return Array.from({length:count},(_,index)=>{
    const angle=-Math.PI/2+index*2*Math.PI/count;
    return <circle key={index} cx={Math.cos(angle)*radius} cy={Math.sin(angle)*radius} r={strokeWidth*.75} fill={color}/>;
  });
}

function MixtureMarks({radius,slots,liquid,color,strokeWidth}){
  const dotCount=Math.round(slots*liquid),solidCount=slots-dotCount;
  const dotSlots=new Set(Array.from({length:dotCount},(_,index)=>Math.floor((index+.5)*slots/dotCount)%slots));
  return Array.from({length:slots},(_,index)=>{
    const angle=-Math.PI/2+index*2*Math.PI/slots,x=Math.cos(angle)*radius,y=Math.sin(angle)*radius;
    if(dotSlots.has(index))return <circle key={index} cx={x} cy={y} r={strokeWidth*.75} fill={color}/>;
    const half=solidCount<=3?5:4;
    const tx=-Math.sin(angle)*half,ty=Math.cos(angle)*half;
    return <line key={index} x1={x-tx} y1={y-ty} x2={x+tx} y2={y+ty} stroke={color} strokeWidth={strokeWidth} strokeLinecap="butt"/>;
  });
}

export default function PhysicalRing({radius,state,color=DEFAULT_COLOR,strokeWidth=2,inset=5}){
  const ringRadius=radius-inset,spec=physicalRingSpec(state);
  if(spec.kind==="liquid")return <g className="physical-ring"><LiquidDots radius={ringRadius} count={spec.count} color={color} strokeWidth={strokeWidth}/></g>;
  if(spec.kind==="mixture")return <g className="physical-ring"><MixtureMarks radius={ringRadius} slots={spec.slots} liquid={spec.liquid} color={color} strokeWidth={strokeWidth}/></g>;
  return <circle className="physical-ring" r={ringRadius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={segmentedDash(ringRadius,spec.segments)} strokeLinecap="butt"/>;
}
