// Where to scroll the source-text panel so the selected steps are in view.
// Rects are viewport rects ({top,bottom}); `header` is the height of the sticky
// column title that covers the top of the panel. Returns the scrollTop change
// (0 when everything selected is already fully visible).
export function scrollDelta(panel,items,header=44,margin=8){
  if(!items.length)return 0;
  const top=Math.min(...items.map(item=>item.top)),bottom=Math.max(...items.map(item=>item.bottom));
  const visibleTop=panel.top+header+margin,visibleBottom=panel.bottom-margin;
  if(top>=visibleTop&&bottom<=visibleBottom)return 0;
  // Both sides fit together: centre their span; otherwise show the first step at the top.
  if(bottom-top<=visibleBottom-visibleTop)return (top+bottom)/2-(visibleTop+visibleBottom)/2;
  return top-visibleTop;
}
