import React from "react";
import PhysicalRing from "./PhysicalRing";
import FlavorRing,{flavorColor,normalizeFlavors,readableTextColor} from "./FlavorRing";
import {isDumbbell,nodeSize,stateName} from "../graph";
const COLORS={merged_exact:"#AEEDFF",only_r1:"#C4D1FF",only_r2:"#CAF95F"};
const auxLabel=name=>String(name||"").replace(/[^a-z0-9]/gi,"").slice(0,2).toLowerCase();
function Disc({node,side,cy,radius}){
  const state=side==="R1"?node.state_r1:node.state_r2;
  const flavor=side==="R1"?node.flavor_r1:node.flavor_r2;
  const icon=side==="R1"?node.icon_r1:node.icon_r2;
  const containerName=side==="R1"?node.container_r1:node.container_r2;
  const container=state?.[1]==="container"||node.domain==="container";
  const name=state?.[0]||"",image=icon||(container?containerName:null);
  const flavors=normalizeFlavors(flavor),primary=flavorColor(flavors[0]||"none"),aux=node.domain==="aux";
  const centerRadius=aux?radius-5:radius-7;
  return <g transform={`translate(0 ${cy})`}>
    <circle r={centerRadius} fill={aux?primary:"#fff"}/>
    {!aux&&<FlavorRing innerRadius={centerRadius-2} outerRadius={centerRadius} flavors={flavors}/>} 
    {image&&!aux?<image href={`/icons/${image}.png`} x={-radius*.48} y={-radius*.48} width={radius*.96} height={radius*.96}/>:aux?<text className="aux-label" fill={readableTextColor(primary)}>{auxLabel(name)}</text>:null}
    {!container&&<PhysicalRing radius={radius} state={state?.[2]} color={aux?primary:"#fff"} strokeWidth={aux?1:1.75} inset={aux?3:5}/>} 
  </g>;
}
function flavorText(value){const list=Array.isArray(value)?value:value==null?[]:[value];const names=list.map(item=>String(item)).filter(Boolean);return names.length?names.join(", "):"none";}
function sideTooltip(node,side){const index=node[side==="R1"?"r1_node":"r2_node"];if(index==null)return null;const state=node[side==="R1"?"state_r1":"state_r2"]||[],flavor=node[side==="R1"?"flavor_r1":"flavor_r2"];return `${side} original node index: ${index} · ${state[0]||""}
  type: ${state[1]||"-"} · physical state: ${state[2]||"-"} · chemical state: ${state[3]||"-"}
  flavor: ${flavorText(flavor)}`;}
function nodeTooltip(node){return ["R1","R2"].map(side=>sideTooltip(node,side)).filter(Boolean).join("\n");}
const HALO={R1:"#C4D1FF",R2:"#CAF95F",both:"#AEEDFF"};
function GraphNode({node,position,selected,onSelect,onPointerDown,dragging}){const size=nodeSize(node),dumbbell=isDumbbell(node),sharedExact=selected==="both"&&node.kind==="merged_exact",color=COLORS[node.kind]||"#AEEDFF";const centerX=position.x+size.width/2,centerY=position.y+size.height/2;return <g className={`node ${selected?`selected sel-${selected}`:""}`} transform={`translate(${centerX} ${centerY})`} onPointerDown={event=>onPointerDown(event,node)} onClick={()=>onSelect(node)} style={{cursor:dragging?"grabbing":"grab",touchAction:"none"}}><title>{nodeTooltip(node)}</title>{selected&&<g className="node-halo" filter="url(#halo-blur)" opacity=".55" pointerEvents="none">{dumbbell?<>{(selected==="R1"||selected==="both")&&<circle cy={-size.halfOffset} r={size.radius+4} fill={sharedExact?HALO.both:HALO.R1}/>}{(selected==="R2"||selected==="both")&&<circle cy={size.halfOffset} r={size.radius+4} fill={sharedExact?HALO.both:HALO.R2}/>}</>:<circle r={size.radius+4} fill={HALO[selected]}/>}</g>}{dumbbell?<><path d={`M0 ${-size.halfOffset-size.radius} A${size.radius} ${size.radius} 0 1 1 0 ${-size.halfOffset+size.radius} C${size.radius*.35} -4 ${size.radius*.35} 4 0 ${size.halfOffset-size.radius} A${size.radius} ${size.radius} 0 1 1 0 ${size.halfOffset+size.radius} A${size.radius} ${size.radius} 0 1 1 0 ${size.halfOffset-size.radius} C${-size.radius*.35} 4 ${-size.radius*.35} -4 0 ${-size.halfOffset+size.radius} A${size.radius} ${size.radius} 0 1 1 0 ${-size.halfOffset-size.radius}`} fill={node.kind==="merged_exact"?COLORS.merged_exact:"url(#dumbbell-gradient)"}/><Disc node={node} side="R1" cy={-size.halfOffset} radius={size.radius}/><Disc node={node} side="R2" cy={size.halfOffset} radius={size.radius}/></>:<><circle r={size.radius} fill={color}/><Disc node={node} side={node.kind==="only_r2"?"R2":"R1"} cy={0} radius={size.radius}/></>}</g>;}

// Re-render only when this item's own inputs change, so panning and dragging another node stay cheap.
export default React.memo(GraphNode);
