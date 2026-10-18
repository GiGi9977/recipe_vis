// Visual encoding of PROCESS edges: heat_level sets the thickness (relative to the
// default width: low thinner, middle the default, high thicker) and a stated duration
// turns the line into a sine wave whose number of cycles grows with the duration.

export const LEVEL_FACTOR={low:.55,middle:1,high:1.75};

// Ordered [level, share] pairs from "low" or {"high":0.2,"low":0.8}; [] when unstated.
export function heatShares(value){
  if(typeof value==="string"&&LEVEL_FACTOR[value.toLowerCase()])return [[value.toLowerCase(),1]];
  if(value&&typeof value==="object"&&!Array.isArray(value)){
    const entries=Object.entries(value).filter(([level,share])=>LEVEL_FACTOR[level]&&Number(share)>0).map(([level,share])=>[level,Number(share)]);
    const total=entries.reduce((sum,[,share])=>sum+share,0);
    return total?entries.map(([level,share])=>[level,share/total]):[];
  }
  return [];
}

// Minutes from "40 minutes", "about 1 hour", "3-5 minutes", "30–40 minutes"; null if unreadable.
export function durationMinutes(text){
  if(typeof text!=="string")return null;
  const numbers=(text.match(/\d+(?:\.\d+)?/g)||[]).map(Number);
  if(!numbers.length)return null;
  const value=numbers.length>1?(numbers[0]+numbers[1])/2:numbers[0];
  const lower=text.toLowerCase();
  const unit=/hour|hr|小时|钟头/.test(lower)?60:/second|sec|秒/.test(lower)?1/60:/day|天/.test(lower)?1440:1;
  return value*unit>0?value*unit:null;
}

// Whole sine cycles for a duration: one per MINUTES_PER_CYCLE minutes (so 35 and 45
// minutes differ by two cycles), at least 2, and never so many that a wave is shorter
// than MIN_WAVELENGTH px on an edge of the given length.
export const MINUTES_PER_CYCLE=4,MIN_WAVELENGTH=8;
export function waveCycles(minutes,length=Infinity){
  if(!minutes)return 0;
  const room=Number.isFinite(length)?Math.max(2,Math.floor(length/MIN_WAVELENGTH)):40;
  return Math.max(2,Math.min(40,room,Math.round(minutes/MINUTES_PER_CYCLE)));
}

// Centre line from (x1,y1) to (x2,y2): straight, or a sine wave of the given cycles
// that starts and ends on the line (amplitude eases in and out).
export function edgeCenters(x1,y1,x2,y2,cycles=0,maxAmplitude=3.6){
  const length=Math.hypot(x2-x1,y2-y1)||1,nx=-(y2-y1)/length,ny=(x2-x1)/length;
  // A short wavelength gets a smaller swing so the line stays a smooth wave.
  const amplitude=cycles?Math.min(maxAmplitude,length/cycles*.3):0;
  const steps=cycles?Math.max(24,cycles*14):1;
  return Array.from({length:steps+1},(_,index)=>{
    const t=index/steps,ease=Math.min(1,t*5,(1-t)*5),offset=cycles?amplitude*ease*Math.sin(2*Math.PI*cycles*t):0;
    return [x1+(x2-x1)*t+nx*offset,y1+(y2-y1)*t+ny*offset];
  });
}

// Polyline split into one piece per heat level, in order, each as an SVG path with its
// stroke width (base * level factor). Without a stated level there is one piece at the
// base width. Neighbouring pieces share their joint sample so the line stays unbroken.
export function levelSegments(centers,shares,base){
  const pathOf=points=>points.map(([x,y],index)=>`${index?"L":"M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  if(!shares.length)return [{d:pathOf(centers),width:base}];
  const last=centers.length-1,pieces=[];
  let start=0,acc=0;
  shares.forEach(([level,share],index)=>{
    acc+=share;
    const end=index===shares.length-1?last:Math.max(start+1,Math.min(last,Math.round(acc*last)));
    pieces.push({d:pathOf(centers.slice(start,end+1)),width:base*LEVEL_FACTOR[level]});
    start=end;
  });
  return pieces;
}
