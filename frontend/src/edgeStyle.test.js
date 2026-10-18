import {describe,expect,it} from "vitest";
import {heatShares,durationMinutes,waveCycles,edgeCenters,levelSegments,LEVEL_FACTOR,MIN_WAVELENGTH} from "./edgeStyle.js";

describe("edge style",()=>{
  it("reads a level string or ordered shares and ignores anything else",()=>{
    expect(heatShares("high")).toEqual([["high",1]]);
    expect(heatShares({high:.2,low:.8})).toEqual([["high",.2],["low",.8]]);
    expect(heatShares(["low"])).toEqual([]);
    expect(heatShares(undefined)).toEqual([]);
  });
  it("thickness grows from low to middle (default) to high",()=>{
    expect(LEVEL_FACTOR.low).toBeLessThan(LEVEL_FACTOR.middle);
    expect(LEVEL_FACTOR.middle).toBe(1);
    expect(LEVEL_FACTOR.high).toBeGreaterThan(LEVEL_FACTOR.middle);
  });
  it("parses durations to minutes",()=>{
    expect(durationMinutes("40 minutes")).toBe(40);
    expect(durationMinutes("about 1 hour")).toBe(60);
    expect(durationMinutes("3-5 minutes")).toBe(4);
    expect(durationMinutes("30–40 minutes")).toBe(35);
    expect(durationMinutes("overnight")).toBeNull();
    expect(durationMinutes(undefined)).toBeNull();
  });
  it("longer durations give more sine cycles, none without a duration",()=>{
    expect(waveCycles(null)).toBe(0);
    expect(waveCycles(1,130)).toBe(2);
    expect(waveCycles(10,130)).toBeLessThan(waveCycles(40,130));
    expect(waveCycles(40,130)).toBeLessThan(waveCycles(50,130));
    expect(waveCycles(100000)).toBeLessThanOrEqual(40);
  });
  it("30-40 and 40-50 minutes are clearly different on a normal edge",()=>{
    const a=waveCycles(durationMinutes("30-40 minutes"),130),b=waveCycles(durationMinutes("40-50 minutes"),130);
    expect(b-a).toBeGreaterThanOrEqual(2);
  });
  it("never packs waves tighter than the minimum wavelength",()=>{
    expect(waveCycles(600,60)).toBeLessThanOrEqual(Math.floor(60/MIN_WAVELENGTH));
  });
  it("a sine line starts and ends on the straight line and swings both ways",()=>{
    const points=edgeCenters(0,0,200,0,4);
    expect(points[0]).toEqual([0,0]);
    expect(points.at(-1)[0]).toBeCloseTo(200);
    expect(Math.abs(points.at(-1)[1])).toBeLessThan(1e-6);
    expect(Math.max(...points.map(p=>p[1]))).toBeGreaterThan(2);
    expect(Math.min(...points.map(p=>p[1]))).toBeLessThan(-2);
    expect(edgeCenters(0,0,200,0,0)).toEqual([[0,0],[200,0]]);
  });
  it("splits a line into one piece per level with that level's width",()=>{
    const centers=edgeCenters(0,0,100,0,0);
    expect(levelSegments(centers,[],1.8)).toHaveLength(1);
    const pieces=levelSegments(edgeCenters(0,0,100,0,5),[["high",.2],["low",.8]],2);
    expect(pieces.map(p=>p.width)).toEqual([2*LEVEL_FACTOR.high,2*LEVEL_FACTOR.low]);
  });
});
