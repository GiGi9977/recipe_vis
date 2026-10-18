export const isAdd=edge=>String(edge.action||"").toLowerCase()==="add"||String(edge.type||"").toLowerCase()==="add";
export const isDumbbell=node=>node.kind==="merged_similar"||(node.kind==="merged_exact"&&node.shape_dumbbell);
export const stateName=(node,side="R1")=>node[side==="R1"?"state_r1":"state_r2"]?.[0]||"";
// Which recipe(s) own the selected source steps of a node or edge: "R1", "R2", "both" or null.
export function selectedSides(item,selected){const r1=(item.text_step_keys_r1||[]).some(key=>selected.has(key)),r2=(item.text_step_keys_r2||[]).some(key=>selected.has(key));return r1&&r2?"both":r1?"R1":r2?"R2":null;}
export const stepKeys=item=>[...(item.text_step_keys_r1||[]),...(item.text_step_keys_r2||[])];
export function nodeSize(node){const aux=node.domain==="aux",container=node.domain==="container";const radius=aux?11:container?16:24;return isDumbbell(node)?{width:radius*2+8,height:radius*4+10,radius,halfOffset:radius+1}:{width:radius*2+8,height:radius*2+8,radius,halfOffset:0};}

// Edge ownership is carried by `style`. Shared edges use the visual center;
// recipe-specific edges use the matching disc in a dumbbell node.
export function edgeRecipe(edge){
  const style=String(edge?.style||"").toUpperCase();
  return style==="R1"||style==="R2"?style:null;
}

export function edgeAnchorOffset(node,edge,endpoint){
  const size=nodeSize(node);
  if(!isDumbbell(node))return 0;
  const explicit=edge?.[endpoint==="source"?"source_anchor":"target_anchor"];
  if(explicit==="T")return-size.halfOffset;
  if(explicit==="B")return size.halfOffset;
  if(explicit==="M"||explicit==="S")return 0;
  const recipe=edgeRecipe(edge);
  return recipe==="R1"?-size.halfOffset:recipe==="R2"?size.halfOffset:0;
}

export function recipeAnchor(node,position,edge,endpoint="target"){
  const size=nodeSize(node);
  const y=position.y+size.height/2+edgeAnchorOffset(node,edge,endpoint);
  return{x:position.x+size.width/2,y};
}
