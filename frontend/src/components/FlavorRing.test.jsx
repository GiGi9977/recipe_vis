import {describe,expect,it} from "vitest";
import {FLAVOR_COLORS,flavorColor,normalizeFlavors,readableTextColor} from "./FlavorRing";

describe("flavor encoding",()=>{
  it("reuses the established flavor palette",()=>{
    expect(FLAVOR_COLORS).toMatchObject({savory:"#7F7F7F",sweet:"#e39ac7",sour:"#e3ff65",umami:"#7A5C8E",aromatic:"#5FAF5F",spicing:"#9A6A3A",spicy:"#EC5823",deodorizing:"#4FA3A5"});
  });

  it("normalizes arrays and comma-separated flavor lists",()=>{
    expect(normalizeFlavors(["Savory","none"," Aromatic "])).toEqual(["savory","aromatic"]);
    expect(normalizeFlavors("sweet, sour")).toEqual(["sweet","sour"]);
  });

  it("uses the old fallback and readable label colors",()=>{
    expect(flavorColor("unknown")).toBe("#bdbdbd");
    expect(readableTextColor(flavorColor("sour"))).toBe("#000000");
    expect(readableTextColor(flavorColor("umami"))).toBe("#ffffff");
  });
});
