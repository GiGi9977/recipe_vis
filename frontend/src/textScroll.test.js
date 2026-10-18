import {describe,expect,it} from "vitest";
import {scrollDelta} from "./textScroll.js";

const panel={top:100,bottom:500};
describe("text panel scrolling",()=>{
  it("does nothing when the selected steps are already visible",()=>{
    expect(scrollDelta(panel,[{top:200,bottom:240}])).toBe(0);
    expect(scrollDelta(panel,[])).toBe(0);
  });
  it("scrolls down to a step below the panel and centres it",()=>{
    const delta=scrollDelta(panel,[{top:900,bottom:940}]);
    expect(delta).toBeGreaterThan(0);
    expect(900-delta).toBeGreaterThanOrEqual(100+44);
    expect(940-delta).toBeLessThanOrEqual(500);
  });
  it("scrolls up to a step above the panel",()=>{
    expect(scrollDelta(panel,[{top:-300,bottom:-260}])).toBeLessThan(0);
  });
  it("keeps a step out from under the sticky title",()=>{
    const delta=scrollDelta(panel,[{top:110,bottom:150}]);
    expect(delta).toBeLessThan(0);
    expect(110-delta).toBeGreaterThanOrEqual(100+44);
  });
  it("shows the first step at the top when two sides do not fit together",()=>{
    const delta=scrollDelta(panel,[{top:700,bottom:740},{top:1700,bottom:1740}]);
    expect(700-delta).toBe(100+44+8);
  });
});
