const assert=require('assert'),fs=require('fs');
const source=fs.readFileSync('frontend/app.js','utf8');
const code=source.slice(source.indexOf('function smoothAddFlowPath('),source.indexOf('function getAnchorPosition('));
const path=new Function(code+';return smoothAddFlowPath;')();
assert.equal(path(0,0,0,0),'');
for(const [x,y] of [[200,100],[200,-100],[-200,100],[0,100],[2,1],[200,0]]){
 const d=path(0,0,x,y);
 assert.equal((d.match(/ C /g)||[]).length,2,'closed ribbon uses two smooth cubic sides');
 assert(d.endsWith(' Z'));
 assert(d.includes(` ${x},${y} C `),'ribbon tapers to exact receiving port');
 assert(!/NaN|Infinity/.test(d));
 const numbers=d.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
 assert(Math.hypot(numbers[0]-numbers[numbers.length-2],numbers[1]-numbers[numbers.length-1])>0,'source has visible width');
}
console.log('PASS: smooth tapered ADD paths for forward, reverse, vertical and short flows.');
