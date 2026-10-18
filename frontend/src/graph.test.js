import {describe,expect,it} from "vitest";
import {nodeSize,recipeAnchor} from "./graph";

const dumbbell={kind:"merged_similar",domain:"ingredient"};
const single={kind:"only_r1",domain:"ingredient"};
const position={x:100,y:200};

describe("recipe-aware edge anchors",()=>{
  it("anchors single-recipe nodes at their center",()=>{
    const size=nodeSize(single);
    expect(recipeAnchor(single,position,{style:"R1"})).toEqual({
      x:position.x+size.width/2,
      y:position.y+size.height/2,
    });
  });

  it("anchors R1 to the upper and R2 to the lower dumbbell disc",()=>{
    const size=nodeSize(dumbbell);
    const centerY=position.y+size.height/2;
    expect(recipeAnchor(dumbbell,position,{style:"R1"}).y).toBe(centerY-size.halfOffset);
    expect(recipeAnchor(dumbbell,position,{style:"R2"}).y).toBe(centerY+size.halfOffset);
  });

  it("keeps shared edges at the dumbbell visual center",()=>{
    const size=nodeSize(dumbbell);
    expect(recipeAnchor(dumbbell,position,{style:"shared"}).y).toBe(position.y+size.height/2);
  });
});
