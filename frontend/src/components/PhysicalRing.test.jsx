import {describe,expect,it} from "vitest";
import {physicalRingSpec} from "./PhysicalRing";

describe("physicalRingSpec",()=>{
  it("increases solid segmentation as particle size decreases",()=>{
    expect(["whole","chunk","slice","shred","powder"].map(state=>physicalRingSpec(state).segments))
      .toEqual([0,4,6,9,14]);
  });

  it("uses round dots for liquid",()=>{
    expect(physicalRingSpec("liquid")).toEqual({kind:"liquid",count:9});
  });

  it("orders mixtures by liquid proportion",()=>{
    const ratios=["batter","paste","mash","dough"].map(state=>physicalRingSpec(state).liquid);
    expect(ratios).toEqual([.75,.55,.35,.20]);
  });

  it("keeps legacy solid aliases compatible",()=>{
    expect(physicalRingSpec("cube").segments).toBe(4);
    expect(physicalRingSpec("dice").segments).toBe(6);
    expect(physicalRingSpec("unknown").segments).toBe(0);
  });
});
