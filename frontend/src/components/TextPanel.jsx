import React,{useEffect,useRef} from "react";
import {scrollDelta} from "../textScroll";

export default function TextPanel({alignment={},selected,onSelect}){
  const panel=useRef(null),fromPanel=useRef(false);
  // A selection made on the graph scrolls the panel to the exact steps; a click inside
  // the panel keeps it where it is.
  useEffect(()=>{
    if(fromPanel.current){fromPanel.current=false;return;}
    const box=panel.current;if(!box||!selected.size)return;
    const items=[...box.querySelectorAll("button.active")].map(button=>button.getBoundingClientRect());
    const header=Math.max(0,...[...box.querySelectorAll("h2")].map(title=>title.getBoundingClientRect().height));
    const delta=scrollDelta(box.getBoundingClientRect(),items,header||44);
    if(delta)box.scrollBy({top:delta,behavior:window.matchMedia?.("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
  },[selected]);
  // Steps selected on both recipes belong to a shared part of the graph: shown in blue.
  const shared=[...selected].some(key=>key.startsWith("R1:"))&&[...selected].some(key=>key.startsWith("R2:"));
  return <aside className="text-panel" aria-label="Recipe source text" ref={panel}>{["R1","R2"].map(side=>{const data=alignment[side];return <section key={side} className={`side-${side}`}><h2>{side} · {data?.id||""}</h2>{data?.text_steps?.map(step=>{const key=`${side}:${step.id}`;return <button key={key} className={selected.has(key)?(shared?"active shared":"active"):""} onClick={()=>{fromPanel.current=true;onSelect(new Set([key]));}}><b>{step.id}</b><span><strong>{step.text_en||step.text}</strong>{step.text_en&&step.text!==step.text_en?<small>{step.text}</small>:null}</span></button>})||<p>No aligned source steps.</p>}</section>})}</aside>;
}
