import React from "react";

export const FLAVOR_COLORS={
  savory:"#7F7F7F",
  sweet:"#e39ac7",
  sour:"#e3ff65",
  umami:"#7A5C8E",
  aromatic:"#5FAF5F",
  spicing:"#9A6A3A",
  spicy:"#EC5823",
  deodorizing:"#4FA3A5",
  none:"#ffffff",
};

export function normalizeFlavors(value){
  const values=Array.isArray(value)?value:String(value??"").split(",");
  return values.map(item=>String(item).trim().toLowerCase()).filter(item=>item&&item!=="none");
}

export function flavorColor(value){return FLAVOR_COLORS[String(value||"none").trim().toLowerCase()]||"#bdbdbd";}

export function readableTextColor(color){
  const value=String(color||"").replace("#","");
  if(value.length!==6)return"#000000";
  const red=parseInt(value.slice(0,2),16),green=parseInt(value.slice(2,4),16),blue=parseInt(value.slice(4,6),16);
  return .299*red+.587*green+.114*blue>160?"#000000":"#ffffff";
}

export default function FlavorRing({innerRadius,outerRadius,flavors}){
  const values=normalizeFlavors(flavors);
  if(!values.length)return null;
  const radius=(innerRadius+outerRadius)/2,strokeWidth=outerRadius-innerRadius;
  const circumference=2*Math.PI*radius,part=circumference/values.length;
  return <g className="flavor-ring" transform="rotate(-90)">
    {values.map((flavor,index)=><circle key={`${flavor}-${index}`} r={radius} fill="none"
      stroke={flavorColor(flavor)} strokeWidth={strokeWidth}
      strokeDasharray={`${part} ${circumference-part}`}
      strokeDashoffset={-index*part}/>) }
  </g>;
}
