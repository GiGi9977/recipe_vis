import {describe,expect,it} from "vitest";
import {runLayout} from "./safeLayout";
import {refineLayout} from "./refineLayout";
import {recipeAnchor} from "../graph";
describe("ELK layout",()=>{it("is deterministic and keeps process direction",async()=>{const graph={nodes:[{id:"a",domain:"main",kind:"only_r1"},{id:"b",domain:"main",kind:"only_r1"}],edges:[{id:"e",source:"a",target:"b",action:"cut",type:"prep",style:"R1"}]};const first=await runLayout(graph),second=await runLayout(graph);expect(first.positions.get("a").x).toBeLessThan(first.positions.get("b").x);expect(second.positions.get("b").x).toBe(first.positions.get("b").x);});});

describe("semantic ELK layout",()=>{it("is deterministic and preserves recipe bands",async()=>{const nodes=[{id:"r1a",domain:"main",kind:"only_r1"},{id:"r1b",domain:"main",kind:"only_r1"},{id:"shared",domain:"main",kind:"merged_similar"},{id:"r2a",domain:"main",kind:"only_r2"}],edges=[{source:"r1a",target:"r1b",action:"heat",style:"R1"},{source:"r1b",target:"shared",action:"add",style:"R1"},{source:"r2a",target:"shared",action:"add",style:"R2"}],graph={nodes,edges};const first=await runLayout(graph,"auto"),second=await runLayout(graph,"auto");expect(first.positions.get("r1a").x).toBeLessThan(first.positions.get("r1b").x);expect(first.positions.get("r1b").y).toBeLessThan(first.positions.get("shared").y);expect(first.positions.get("r2a").y).toBeGreaterThan(first.positions.get("shared").y);expect(second.positions.get("shared")).toEqual(first.positions.get("shared"));});});
describe("semantic ELK branch offsets",()=>{it("separates overlapping process branches as rigid groups",async()=>{const nodes=["a","b","c","d"].map(id=>({id,domain:"main",kind:"only_r1"})),edges=[{source:"a",target:"b",action:"cut",style:"R1"},{source:"c",target:"d",action:"heat",style:"R1"}],graph={nodes,edges};const{positions}=await runLayout(graph,"auto"),ab=positions.get("a"),bb=positions.get("b"),cb=positions.get("c"),db=positions.get("d");expect(ab.y).toBe(bb.y);expect(cb.y).toBe(db.y);expect(Math.abs(ab.y-cb.y)).toBeGreaterThanOrEqual(82);});});
describe("semantic ELK compact additions",()=>{it("moves a standalone addition with its offset receiver branch",async()=>{const nodes=[{id:"a",domain:"main",kind:"only_r1"},{id:"b",domain:"main",kind:"only_r1"},{id:"c",domain:"main",kind:"only_r1"},{id:"d",domain:"main",kind:"only_r1"},{id:"i",domain:"aux",kind:"only_r1"}],edges=[{source:"a",target:"b",action:"cut",style:"R1"},{source:"c",target:"d",action:"heat",style:"R1"},{source:"i",target:"b",action:"add",style:"R1"}],graph={nodes,edges};const{positions}=await runLayout(graph,"auto"),source=positions.get("i"),target=positions.get("b"),distance=Math.hypot(source.x-target.x,source.y-target.y);expect(distance).toBeLessThan(150);});});
describe("semantic ELK standalone placement",()=>{it("uses the Established offset for a pure ADD node",async()=>{const nodes=[{id:"ingredient",domain:"aux",kind:"only_r1"},{id:"start",domain:"main",kind:"only_r1"},{id:"receiver",domain:"main",kind:"only_r1"}],edges=[{source:"start",target:"receiver",action:"heat",style:"R1"},{source:"ingredient",target:"receiver",action:"add",style:"R1"}],graph={nodes,edges},auto=await runLayout(graph,"auto"),established=await runLayout(graph,"established");expect(auto.positions.get("ingredient").x-auto.positions.get("receiver").x).toBeCloseTo(established.positions.get("ingredient").x-established.positions.get("receiver").x);expect(auto.positions.get("ingredient").y-auto.positions.get("receiver").y).toBeCloseTo(established.positions.get("ingredient").y-established.positions.get("receiver").y);});});
describe("semantic ELK donor compaction",()=>{it("reuses the Established ADD relationship for a complete prepared branch",async()=>{const nodes=[{id:"a",domain:"main",kind:"only_r1"},{id:"b",domain:"main",kind:"only_r1"},{id:"c",domain:"main",kind:"merged_exact"},{id:"d",domain:"main",kind:"merged_exact"}],edges=[{source:"a",target:"b",action:"heat",style:"R1"},{source:"c",target:"d",action:"stir",style:"shared"},{source:"b",target:"d",action:"add",style:"R1"}],graph={nodes,edges},add=edges[2];const auto=await runLayout(graph,"auto"),established=await runLayout(graph,"established"),autoSource=recipeAnchor(nodes[1],auto.positions.get("b"),add,"source"),autoTarget=recipeAnchor(nodes[3],auto.positions.get("d"),add,"target"),establishedSource=recipeAnchor(nodes[1],established.positions.get("b"),add,"source"),establishedTarget=recipeAnchor(nodes[3],established.positions.get("d"),add,"target");expect(autoSource.x-autoTarget.x).toBeCloseTo(establishedSource.x-establishedTarget.x);expect(autoSource.y-autoTarget.y).toBeCloseTo(establishedSource.y-establishedTarget.y);expect(auto.positions.get("a").y).toBe(auto.positions.get("b").y);});});

const raw=nodes=>new Map(nodes.map((node,index)=>[node.id,{x:index*140,y:index*35,width:56,height:56}]));
describe("branch refinement",()=>{
  it("keeps process anchors horizontal, including a dumbbell half",()=>{
    const nodes=[{id:"a",domain:"main",kind:"only_r1"},{id:"b",domain:"main",kind:"merged_similar"}];
    const edge={source:"a",target:"b",action:"heat",style:"R1",source_anchor:"S",target_anchor:"T"};
    const positions=refineLayout({nodes,edges:[edge]},raw(nodes));
    expect(recipeAnchor(nodes[0],positions.get("a"),edge,"source").y).toBe(recipeAnchor(nodes[1],positions.get("b"),edge,"target").y);
  });

  it("places ingredient additions above, centered, and below by recipe",()=>{
    const nodes=[{id:"r1",domain:"aux",kind:"only_r1"},{id:"shared",domain:"aux",kind:"merged_exact"},{id:"r2",domain:"aux",kind:"only_r2"},{id:"target",domain:"main",kind:"merged_exact"}];
    const edges=[{source:"r1",target:"target",action:"add",style:"R1"},{source:"shared",target:"target",action:"add",style:"shared"},{source:"r2",target:"target",action:"add",style:"R2"}];
    const positions=refineLayout({nodes,edges},raw(nodes));
    const ys=edges.map((edge,index)=>recipeAnchor(nodes[index],positions.get(nodes[index].id),edge,"source").y);
    const targetYs=edges.map(edge=>recipeAnchor(nodes[3],positions.get("target"),edge,"target").y);
    expect(ys[0]).toBeLessThan(targetYs[0]);expect(ys[1]).toBe(targetYs[1]);expect(ys[2]).toBeGreaterThan(targetYs[2]);
  });

  it("keeps empty-container adds horizontal and provenance merges diagonal",()=>{
    const nodes=[{id:"source",domain:"main",kind:"only_r1"},{id:"parent",domain:"container",kind:"only_r1"},{id:"container",domain:"container",kind:"only_r1"}];
    const process={source:"parent",target:"container",action:"heat",style:"R1"},add={source:"source",target:"container",action:"add",style:"R1"};
    const positions=refineLayout({nodes,edges:[process,add]},raw(nodes));
    const sa=recipeAnchor(nodes[0],positions.get("source"),add,"source"),ta=recipeAnchor(nodes[2],positions.get("container"),add,"target");
    expect(sa.y).toBeLessThan(ta.y);expect(sa.x).toBeLessThan(ta.x);
    const empty=refineLayout({nodes:[nodes[0],nodes[2]],edges:[add]},raw([nodes[0],nodes[2]]));
    expect(recipeAnchor(nodes[0],empty.get("source"),add,"source").y).toBe(recipeAnchor(nodes[2],empty.get("container"),add,"target").y);
  });

  it("lengthens ADD feeders until their branch bounds no longer overlap",()=>{
    const nodes=[{id:"a",domain:"main",kind:"only_r1"},{id:"b",domain:"main",kind:"only_r1"},{id:"target",domain:"main",kind:"merged_exact"}];
    const edges=[{source:"a",target:"target",action:"add",style:"R1"},{source:"b",target:"target",action:"add",style:"R1"}];
    const crowded=new Map([["a",{x:0,y:0,width:56,height:56}],["b",{x:0,y:0,width:56,height:56}],["target",{x:140,y:0,width:56,height:56}]]);
    const positions=refineLayout({nodes,edges},crowded),pa=positions.get("a"),pb=positions.get("b");
    const separated=Math.abs(pa.x-pb.x)>=72||Math.abs(pa.y-pb.y)>=72;
    expect(separated).toBe(true);
    expect(pa.y).toBeLessThan(positions.get("target").y);expect(pb.y).toBeLessThan(positions.get("target").y);
  });

  it("keeps a clear ADD feeder close instead of applying a long fixed edge",()=>{
    const nodes=[{id:"source",domain:"aux",kind:"only_r1"},{id:"target",domain:"main",kind:"merged_exact"}],edge={source:"source",target:"target",action:"add",style:"R1"};
    const positions=refineLayout({nodes,edges:[edge]},raw(nodes));
    const sy=recipeAnchor(nodes[0],positions.get("source"),edge,"source").y,ty=recipeAnchor(nodes[1],positions.get("target"),edge,"target").y;
    expect(ty-sy).toBeGreaterThanOrEqual(72);expect(ty-sy).toBeLessThan(120);
  });

  it("packs standalone ingredients beside their target instead of making long rays",()=>{
    const ingredients=Array.from({length:7},(_,i)=>({id:`i${i}`,domain:"aux",kind:"only_r1"})),target={id:"target",domain:"main",kind:"merged_exact"},nodes=[...ingredients,target],edges=ingredients.map(node=>({source:node.id,target:"target",action:"add",style:"R1"}));
    const positions=refineLayout({nodes,edges},raw(nodes)),xs=ingredients.map(n=>positions.get(n.id).x),ys=ingredients.map(n=>positions.get(n.id).y),targetY=positions.get("target").y;
    expect(Math.max(...xs)-Math.min(...xs)).toBeLessThanOrEqual(184);
    expect(Math.max(...ys)-Math.min(...ys)).toBeLessThanOrEqual(46);
    expect(targetY-Math.min(...ys)).toBeLessThan(150);
  });
});
