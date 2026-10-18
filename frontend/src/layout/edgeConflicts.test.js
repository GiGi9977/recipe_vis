import {describe,expect,it} from "vitest";
import {minimizeEdgeConflicts} from "./portedLayout.js";

const scene=()=>{
  const nodes=[
    {id:"target",domain:"main",kind:"only_r2",x:400,y:100},
    {id:"src",domain:"main",kind:"only_r2",x:100,y:200},
    {id:"dst",domain:"main",kind:"only_r2",x:700,y:100},
    {id:"f1",domain:"aux",kind:"only_r2",x:100,y:400},
    {id:"f2",domain:"aux",kind:"only_r2",x:152,y:400}
  ];
  const edges=[
    {source:"src",target:"dst",action:"add",style:"R2"},
    {source:"f1",target:"f2",action:"cut",style:"R2"},
    {source:"f2",target:"target",action:"add",style:"R2"}
  ];
  return{nodes,edges};
};

describe("edge conflict minimisation",()=>{
  it("places a prepared feeder near its receiver, on the recipe side, off a long ADD ribbon",()=>{
    const {nodes,edges}=scene();
    minimizeEdgeConflicts(nodes,edges);
    const by=new Map(nodes.map(n=>[n.id,n]));
    const ribbonY=200,target=by.get("target");
    for(const id of ["f1","f2"]){
      const n=by.get(id);
      expect(Math.abs(n.y-ribbonY)).toBeGreaterThan(14);
      expect(n.y).toBeGreaterThan(target.y);
      expect(Math.hypot(n.x-target.x,n.y-target.y)).toBeLessThan(260);
    }
    expect(by.get("f2").y).toBe(by.get("f1").y);
    expect(by.get("f2").x-by.get("f1").x).toBe(52);
  });

  it("is deterministic and leaves node domain, kind and the other nodes untouched",()=>{
    const first=scene(),second=scene();
    minimizeEdgeConflicts(first.nodes,first.edges);minimizeEdgeConflicts(second.nodes,second.edges);
    expect(second.nodes).toEqual(first.nodes);
    for(const id of ["target","src","dst"])expect(first.nodes.find(n=>n.id===id)).toEqual(scene().nodes.find(n=>n.id===id));
  });
});

describe("aux split fan root",()=>{
  const fan=()=>{
    const nodes=[
      {id:"r1",domain:"main",kind:"only_r1",x:300,y:100},{id:"r2",domain:"main",kind:"only_r1",x:430,y:100},
      {id:"root",domain:"aux",kind:"only_r1",x:365,y:160},
      {id:"k1",domain:"aux",kind:"only_r1",x:300,y:160},{id:"k2",domain:"aux",kind:"only_r1",x:430,y:160}];
    const edges=[
      {source:"root",target:"k1",action:"split",style:"R1"},{source:"root",target:"k2",action:"split",style:"R1"},
      {source:"k1",target:"r1",action:"add",style:"R1"},{source:"k2",target:"r2",action:"add",style:"R1"}];
    return{nodes,edges};
  };
  it("puts the root below its portions (away from their receivers), never right of any portion, close enough to stay clear of ribbons above",()=>{
    const {nodes,edges}=fan();
    minimizeEdgeConflicts(nodes,edges);
    const by=new Map(nodes.map(n=>[n.id,n]));
    expect(by.get("root").x).toBe(300);
    expect(by.get("root").x).toBeLessThanOrEqual(Math.min(by.get("k1").x,by.get("k2").x));
    expect(by.get("root").y-by.get("k1").y).toBeGreaterThanOrEqual(35);
    expect(by.get("k1").y).toBe(160);
  });
});
