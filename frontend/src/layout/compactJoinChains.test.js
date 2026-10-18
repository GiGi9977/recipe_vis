import {describe,expect,it} from "vitest";
import {compactJoinChains} from "./establishedLayout.js";

const node=(id,kind="only_r1")=>({id,domain:"main",kind});
const box=(x,y)=>({x:x-28,y:y-28,width:56,height:56});
const cx=(positions,id)=>positions.get(id).x+28;

describe("join chain compaction",()=>{
  it("slides an independent chain right so its edge into a far join has the usual length",()=>{
    const graph={nodes:[node("a"),node("b"),node("join"),node("feed")],edges:[
      {source:"a",target:"b",action:"stir",style:"R1"},
      {source:"b",target:"join",action:"stir",style:"R1"},
      {source:"feed",target:"join",action:"add",style:"R1"}]};
    const positions=new Map([["a",box(100,100)],["b",box(230,100)],["join",box(1000,100)],["feed",box(900,300)]]);
    compactJoinChains(graph,positions);
    expect(cx(positions,"join")-cx(positions,"b")).toBe(130);
    expect(cx(positions,"b")-cx(positions,"a")).toBe(130);
    expect(cx(positions,"join")).toBe(1000);
    expect(positions.get("a").y).toBe(box(100,100).y);
  });

  it("moves a chain started by a split, and a branching chain, together as one unit",()=>{
    const split={nodes:[node("root"),node("a"),node("join")],edges:[
      {source:"root",target:"a",action:"split",style:"R1"},
      {source:"a",target:"join",action:"stir",style:"R1"}]};
    const p1=new Map([["root",box(0,0)],["a",box(100,0)],["join",box(900,0)]]);
    compactJoinChains(split,p1);
    expect(cx(p1,"join")-cx(p1,"a")).toBe(130);
    expect(cx(p1,"root")).toBe(0);
    const branching={nodes:[node("a"),node("join"),node("other")],edges:[
      {source:"a",target:"join",action:"stir",style:"R1"},
      {source:"a",target:"other",action:"heat",style:"R1"}]};
    const p2=new Map([["a",box(100,0)],["join",box(900,0)],["other",box(230,200)]]);
    compactJoinChains(branching,p2);
    expect(cx(p2,"join")-cx(p2,"a")).toBe(130);
    expect(cx(p2,"other")-cx(p2,"a")).toBe(130);
  });

  it("never moves a chain so far that one of its ADD exits would point backward",()=>{
    const graph={nodes:[node("a"),node("join"),node("late")],edges:[
      {source:"a",target:"join",action:"stir",style:"R1"},
      {source:"a",target:"late",action:"add",style:"R1"}]};
    const positions=new Map([["a",box(100,0)],["join",box(900,0)],["late",box(300,200)]]);
    compactJoinChains(graph,positions);
    expect(cx(positions,"a")).toBeLessThan(cx(positions,"late")-20);
  });
});
