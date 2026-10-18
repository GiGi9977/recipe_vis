import {describe,expect,it} from "vitest";
import {compactComponentsLeft} from "./establishedLayout.js";

const node=(id,kind="only_r1",domain="main")=>({id,domain,kind});
const box=(x,y)=>({x:x-28,y:y-28,width:56,height:56});
const cx=(positions,id)=>positions.get(id).x+28;

describe("component left compaction",()=>{
  it("slides a far-right process group left, as a unit, towards the node that adds into it",()=>{
    const graph={nodes:[node("root"),node("src"),node("b1"),node("b2")],edges:[
      {source:"root",target:"src",action:"split",style:"R1"},
      {source:"b1",target:"b2",action:"stir",style:"R1"},
      {source:"src",target:"b1",action:"add",style:"R1"}]};
    const positions=new Map([["root",box(0,300)],["src",box(100,300)],["b1",box(1000,100)],["b2",box(1130,100)]]);
    compactComponentsLeft(graph,positions);
    const span=cx(positions,"b1")-cx(positions,"src");
    expect(span).toBeGreaterThanOrEqual(130);
    expect(span).toBeLessThan(130+65);
    expect(cx(positions,"b2")-cx(positions,"b1")).toBe(130);
    expect(positions.get("b1").y).toBe(box(1000,100).y);
  });

  it("carries a feeder chain with the group and never overlaps another node",()=>{
    const graph={nodes:[node("root"),node("src"),node("b1"),node("b2"),node("f1","only_r1","aux"),node("f2","only_r1","aux"),node("block")],edges:[
      {source:"root",target:"src",action:"split",style:"R1"},
      {source:"b1",target:"b2",action:"stir",style:"R1"},
      {source:"f1",target:"f2",action:"cut",style:"R1"},
      {source:"f2",target:"b1",action:"add",style:"R1"},
      {source:"src",target:"b1",action:"add",style:"R1"}]};
    const positions=new Map([["root",box(0,300)],["src",box(100,300)],["b1",box(1000,100)],["b2",box(1130,100)],["f1",box(870,40)],["f2",box(950,40)],["block",box(600,100)]]);
    compactComponentsLeft(graph,positions);
    expect(cx(positions,"f2")-cx(positions,"f1")).toBe(80);
    expect(cx(positions,"b1")-cx(positions,"f2")).toBe(50);
    const a=positions.get("b1"),b=positions.get("block");
    expect(a.x>=b.x+b.width+6||a.x+a.width<=b.x-6||a.y>=b.y+b.height+6||a.y+a.height<=b.y-6).toBe(true);
    expect(cx(positions,"b1")).toBeLessThan(1000);
  });
});
