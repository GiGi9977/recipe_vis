import {describe,expect,it} from "vitest";
import {compactSplitLanes} from "./establishedLayout.js";

const node=(id,kind="only_r1")=>({id,domain:"main",kind});
const box=(x,y)=>({x:x-28,y:y-28,width:56,height:56});
const cy=(positions,id)=>positions.get(id).y+28;

describe("split lane compaction",()=>{
  it("moves a split child's whole chain close to its split source so the edge is no steeper than 45 degrees",()=>{
    const graph={nodes:[node("root","merged_exact"),node("a"),node("b"),node("feed","only_r1")],edges:[
      {source:"root",target:"a",action:"split",style:"R1"},
      {source:"a",target:"b",action:"stir",style:"R1"}]};
    const positions=new Map([["root",box(100,300)],["a",box(230,900)],["b",box(360,900)],["feed",box(600,900)]]);
    compactSplitLanes(graph,positions);
    const dy=Math.abs(cy(positions,"a")-300),dx=230-100;
    expect(Math.atan2(dy,dx)*180/Math.PI).toBeLessThanOrEqual(46);
    expect(cy(positions,"b")).toBe(cy(positions,"a"));
    expect(positions.get("a").x).toBe(box(230,900).x);
  });

  it("leaves a lane alone when it would land on another node",()=>{
    const graph={nodes:[node("root","merged_exact"),node("a"),node("b"),node("block")],edges:[
      {source:"root",target:"a",action:"split",style:"R1"},
      {source:"a",target:"b",action:"stir",style:"R1"}]};
    const positions=new Map([["root",box(100,300)],["a",box(230,900)],["b",box(360,900)],["block",box(260,420)]]);
    compactSplitLanes(graph,positions);
    const a=positions.get("a"),k=positions.get("block");
    expect(a.y+a.height<=k.y-6||a.y>=k.y+k.height+6||a.x+a.width<=k.x-6||a.x>=k.x+k.width+6).toBe(true);
  });
});
