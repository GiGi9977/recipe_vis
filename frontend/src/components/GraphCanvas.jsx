import React,{useCallback,useEffect,useMemo,useRef,useState} from "react";
import {selectedSides} from "../graph";
import {useGraphLayout} from "../layout/useGraphLayout";
import GraphNode from "./GraphNode";
import GraphEdge from "./GraphEdge";
import {placeEdgeLabels} from "../layout/edgeLabels";

const MIN_SCALE=.18,MAX_SCALE=3.5,ZOOM_FACTOR=1.18;
const clamp=value=>Math.max(MIN_SCALE,Math.min(MAX_SCALE,value));

export default function GraphCanvas({graph,selected,onSelect,layoutMode}){
  const{status,layout,error}=useGraphLayout(graph,layoutMode);
  const canvasRef=useRef(null),dragRef=useRef(null),suppressClickRef=useRef(false);
  const[view,setView]=useState({x:0,y:0,scale:1});
  const[dragging,setDragging]=useState(false);
  const[nodePositions,setNodePositions]=useState(new Map());
  const byId=useMemo(()=>new Map(graph.nodes.map(node=>[node.id,node])),[graph]);
  const fit=useCallback(()=>{const canvas=canvasRef.current;if(!canvas||!layout)return;const width=canvas.clientWidth,height=canvas.clientHeight,padding=48,scale=clamp(Math.min((width-padding*2)/layout.bounds.width,(height-padding*2)/layout.bounds.height));setView({scale,x:(width-layout.bounds.width*scale)/2,y:(height-layout.bounds.height*scale)/2});},[layout]);
  const zoomAt=useCallback((factor,clientX,clientY)=>{const canvas=canvasRef.current;if(!canvas)return;const rect=canvas.getBoundingClientRect(),px=(clientX??rect.left+rect.width/2)-rect.left,py=(clientY??rect.top+rect.height/2)-rect.top;setView(current=>{const scale=clamp(current.scale*factor),ratio=scale/current.scale;return{scale,x:px-(px-current.x)*ratio,y:py-(py-current.y)*ratio};});},[]);
  useEffect(()=>{if(layout)requestAnimationFrame(fit);},[layout,fit]);
  useEffect(()=>{setNodePositions(new Map());},[graph,layoutMode]);
  useEffect(()=>{const canvas=canvasRef.current;if(!canvas)return;const observer=new ResizeObserver(fit);observer.observe(canvas);return()=>observer.disconnect();},[fit]);
  useEffect(()=>{const keydown=event=>{if(event.target instanceof HTMLInputElement||event.target instanceof HTMLSelectElement||event.target instanceof HTMLTextAreaElement)return;switch(event.key){case"+":case"=":event.preventDefault();zoomAt(ZOOM_FACTOR);break;case"-":case"_":event.preventDefault();zoomAt(1/ZOOM_FACTOR);break;case"0":case"f":case"F":event.preventDefault();fit();break;case"ArrowLeft":event.preventDefault();setView(v=>({...v,x:v.x+48}));break;case"ArrowRight":event.preventDefault();setView(v=>({...v,x:v.x-48}));break;case"ArrowUp":event.preventDefault();setView(v=>({...v,y:v.y+48}));break;case"ArrowDown":event.preventDefault();setView(v=>({...v,y:v.y-48}));break;default:break;}};window.addEventListener("keydown",keydown);return()=>window.removeEventListener("keydown",keydown);},[fit,zoomAt]);
  function pointerDown(event){if(event.button!==0)return;canvasRef.current?.focus();event.currentTarget.setPointerCapture(event.pointerId);dragRef.current={kind:"canvas",capture:event.currentTarget,pointerId:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY};setDragging(true);}
  function nodePointerDown(event,node){if(event.button!==0)return;event.stopPropagation();canvasRef.current?.focus();event.currentTarget.setPointerCapture(event.pointerId);dragRef.current={kind:"node",nodeId:node.id,capture:event.currentTarget,pointerId:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY};setDragging(true);}
  function pointerMove(event){const drag=dragRef.current;if(!drag||drag.pointerId!==event.pointerId)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>4)suppressClickRef.current=true;drag.x=event.clientX;drag.y=event.clientY;if(drag.kind==="node")setNodePositions(current=>{const next=new Map(current),base=next.get(drag.nodeId)||layout.positions.get(drag.nodeId);next.set(drag.nodeId,{...base,x:base.x+dx/view.scale,y:base.y+dy/view.scale});return next;});else setView(v=>({...v,x:v.x+dx,y:v.y+dy}));}
  function pointerUp(event){const drag=dragRef.current;if(!drag||drag.pointerId!==event.pointerId)return;dragRef.current=null;setDragging(false);if(drag.capture?.hasPointerCapture?.(event.pointerId))drag.capture.releasePointerCapture(event.pointerId);}
  function selectItem(item){if(suppressClickRef.current){suppressClickRef.current=false;return;}onSelect(item);}
  function wheel(event){event.preventDefault();zoomAt(Math.exp(-event.deltaY*.0015),event.clientX,event.clientY);}
  if(status==="loading"||status==="idle")return <div className="canvas-status">Calculating layout…</div>;
  if(error)return <div className="canvas-status error">{error.message}</div>;
  const active=item=>selectedSides(item,selected);
  const positionFor=id=>nodePositions.get(id)||layout.positions.get(id);
  const edgeLabels=placeEdgeLabels(graph,positionFor);
  return <div ref={canvasRef} className={`canvas${dragging?" is-dragging":""}`} tabIndex={0} onWheel={wheel}>
    <div className="canvas-tools"><button onClick={()=>zoomAt(ZOOM_FACTOR)} title="Zoom in (+)">+</button><button onClick={()=>zoomAt(1/ZOOM_FACTOR)} title="Zoom out (−)">−</button><button onClick={fit} title="Fit graph (0 or F)">Fit</button><output>{Math.round(view.scale*100)}%</output></div>
    <svg className="graph-stage" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
      <defs><filter id="halo-blur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.5"/></filter><linearGradient id="dumbbell-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="45%" stopColor="#C4D1FF"/><stop offset="55%" stopColor="#CAF95F"/></linearGradient>{[["heat","#e78c75"],["cold","#66a2e2"],["prep","#b8bec2"]].map(([id,color])=><marker key={id} id={`arrow-${id}`} viewBox="0 -5 10 10" refX="9" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,-5L10,0L0,5" fill={color}/></marker>)}{[["shared","#AEEDFF"],["R1","#C4D1FF"],["R2","#CAF95F"]].map(([id,color])=><marker key={id} id={`add-${id}`} viewBox="0 -5 10 10" refX="9" markerWidth="5" markerHeight="5" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,-5L10,0L0,5Z" fill={color}/></marker>)}</defs>
      <g className="graph-viewport" transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}><g>{graph.edges.map((edge,index)=>{const source=positionFor(edge.source),target=positionFor(edge.target);return source&&target?<GraphEdge key={edge.id||index} edge={edge} source={source} target={target} sourceNode={byId.get(edge.source)} targetNode={byId.get(edge.target)} selected={active(edge)} onSelect={selectItem}/>:null})}</g><g className="edge-labels">{edgeLabels.map(label=><text key={label.key} x={label.x} y={label.y} fill="#000">{label.text}</text>)}</g><g>{graph.nodes.map(node=><GraphNode key={node.id} node={node} position={positionFor(node.id)} selected={active(node)} onSelect={selectItem} onPointerDown={nodePointerDown} dragging={dragRef.current?.kind==="node"&&dragRef.current.nodeId===node.id}/>)}</g></g>
    </svg>
  </div>;
}
