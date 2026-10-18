import {describe,expect,it} from "vitest";
import {CHAR_WIDTH,LABEL_HEIGHT,placeEdgeLabels} from "./edgeLabels.js";

const node=(id,kind="only_r1")=>({id,domain:"main",kind});
const pos=(x,y)=>({x:x-28,y:y-28,width:56,height:56});

describe("edge labels",()=>{
  it("puts each label on its own edge and keeps labels apart",()=>{
    // Two siblings split from one source: their straight edges start together.
    const graph={nodes:[node("a"),node("b"),node("c")],edges:[
      {source:"a",target:"b",action:"split",style:"R1",type:"prep"},
      {source:"a",target:"c",action:"split",style:"R1",type:"prep"}]};
    const positions=new Map([["a",pos(200,0)],["b",pos(60,200)],["c",pos(200,200)]]);
    const labels=placeEdgeLabels(graph,id=>positions.get(id));
    expect(labels).toHaveLength(2);
    const [first,second]=labels;
    const w=text=>text.length*CHAR_WIDTH+4;
    expect(Math.abs(first.x-second.x)>=w(first.text)||Math.abs(first.y-second.y)>=LABEL_HEIGHT).toBe(true);
    // Each label sits beside the straight line between its own endpoints, not on it.
    for(const label of labels){
      const target=positions.get(label.edge.target),ax=200,ay=0,bx=target.x+28,by=target.y+28;
      const distance=Math.abs((bx-ax)*(label.y-ay)-(by-ay)*(label.x-ax))/Math.hypot(bx-ax,by-ay);
      expect(distance).toBeGreaterThan(4);
      expect(distance).toBeLessThan(80);
    }
  });

  it("separates the two recipe edges between the same pair of nodes and skips ADD edges",()=>{
    const graph={nodes:[node("a","merged_exact"),{id:"b",domain:"main",kind:"merged_similar"},node("x")],edges:[
      {source:"a",target:"b",action:"low heat",style:"R1",type:"heat"},
      {source:"a",target:"b",action:"heat",style:"R2",type:"heat"},
      {source:"x",target:"b",action:"add",style:"R1"}]};
    const positions=new Map([["a",pos(0,100)],["b",pos(300,100)],["x",pos(150,0)]]);
    const labels=placeEdgeLabels(graph,id=>positions.get(id));
    expect(labels.map(l=>l.text).sort()).toEqual(["heat","low heat"]);
    const [first,second]=labels;
    expect(Math.abs(first.y-second.y)>=LABEL_HEIGHT||Math.abs(first.x-second.x)>=first.text.length*CHAR_WIDTH).toBe(true);
  });
});

describe("edge labels vs other edges",()=>{
  it("moves a label off another edge's line when its midpoint is crossed",()=>{
    const graph={nodes:[node("a"),node("b"),node("c"),node("d")],edges:[
      {source:"a",target:"b",action:"scrape",style:"R1",type:"prep"},
      {source:"c",target:"d",action:"split",style:"R1",type:"prep"}]};
    // The split line from c to d crosses the middle of the a-b edge.
    const positions=new Map([["a",pos(100,200)],["b",pos(340,200)],["c",pos(220,0)],["d",pos(220,400)]]);
    const labels=placeEdgeLabels(graph,id=>positions.get(id));
    const scrape=labels.find(l=>l.text==="scrape");
    // The label box must not straddle x=220 (where the split line passes).
    expect(Math.abs(scrape.x-220)).toBeGreaterThanOrEqual(("scrape".length*CHAR_WIDTH+4)/2);
  });
});

describe("edge label side",()=>{
  it("puts the label of a flat edge just above its line",()=>{
    const graph={nodes:[node("a"),node("b")],edges:[{source:"a",target:"b",action:"stir",style:"R1",type:"prep"}]};
    const positions=new Map([["a",pos(100,300)],["b",pos(400,300)]]);
    const [label]=placeEdgeLabels(graph,id=>positions.get(id));
    expect(label.y).toBeLessThan(300-LABEL_HEIGHT/2);
    expect(label.y).toBeGreaterThan(300-LABEL_HEIGHT-20);
  });
  it("puts the label of a steep edge beside the line",()=>{
    const graph={nodes:[node("a"),node("b")],edges:[{source:"a",target:"b",action:"split",style:"R1",type:"prep"}]};
    const positions=new Map([["a",pos(100,0)],["b",pos(120,400)]]);
    const [label]=placeEdgeLabels(graph,id=>positions.get(id));
    const lineX=100+20*((label.y-0)/400);
    expect(Math.abs(label.x-lineX)).toBeGreaterThanOrEqual(("split".length*CHAR_WIDTH+4)/2);
  });
  it("leaves more room above a line that is drawn as a sine wave",()=>{
    const make=duration=>{
      const graph={nodes:[node("a"),node("b")],edges:[{source:"a",target:"b",action:"simmer",style:"R1",type:"heat",duration}]};
      const positions=new Map([["a",pos(100,300)],["b",pos(400,300)]]);
      return placeEdgeLabels(graph,id=>positions.get(id))[0].y;
    };
    expect(make("40 minutes")).toBeLessThan(make(undefined));
  });
});
