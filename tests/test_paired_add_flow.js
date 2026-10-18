const assert=require('assert'),fs=require('fs');
const source=fs.readFileSync('frontend/app.js','utf8');
const code=source.slice(source.indexOf('function smoothAddFlowPath('),source.indexOf('function getAnchorPosition('));
const path=new Function(code+';return smoothAddFlowPath;')();
const upper=path(0,-25,300,0,10,true);
const lower=path(0,25,300,0,10,true);
const controls=d=>d.match(/-?\d+(?:\.\d+)?/g).map(Number);
const u=controls(upper),l=controls(lower);
// The second cubic control pair stays on the source lane, so paired ribbons
// remain vertically ordered until their final approach to the destination.
assert(u[5]<-20&&u[9]<-20,'Upper ribbon must retain its upper source lane');
assert(l[5]>20&&l[9]>20,'Lower ribbon must retain its lower source lane');
assert(u[5]<l[9]&&u[9]<l[5],'Paired ribbon control bands cannot overlap');
assert(upper.includes(' 300,0 C ')&&lower.includes(' 300,0 C '),'Both ribbons retain the exact destination');
console.log('PASS: paired dumbbell ADD ribbons preserve upper/lower lanes until final approach');
