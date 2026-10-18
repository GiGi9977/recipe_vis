const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const source = fs.readFileSync('frontend/app.js', 'utf8');
const code = source.slice(source.indexOf('function nb_buildNodeById('), source.indexOf('function renderGraph('));
const context = {
  console: {log() {}},
  isContainerNode: n => n.state_r1?.[1] === 'container',
  isAddEdge: e => e.action === 'add',
  getHalfOffsetForNode: n => n.domain === 'aux' ? 12 : 25,
};
vm.createContext(context);
vm.runInContext(code, context);
function n(id, name = 'pork', kind = 'only_r1') {
 return {id, domain:'main', kind, r1_node:Number(id.slice(1)), state_r1:[name,'main','solid','raw']};
}
const nodes = [n('M1'), n('M2'), n('M3','potato'), n('M4')];
const edges = [{source:'M1',target:'M2',action:'cut'},
 {source:'M2',target:'M4',action:'add'}, {source:'M3',target:'M4',action:'add'}];
assert.deepEqual([...context.findAttachedMainNodes(nodes,edges)], ['M3']);
const before = nodes.map(x=>[x.domain,x.kind,x.r1_node]);
const branches = context.newBranchLayout(nodes,edges,{});
assert(!branches.some(b=>b.spine.some(n=>n.id==='M3')));
assert(nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
assert(Math.abs(nodes[2].y-nodes[3].y)<150);
assert.deepEqual(nodes.map(x=>[x.domain,x.kind,x.r1_node]),before);
assert.equal(context.findAttachedMainNodes(nodes,[...edges,{source:'M1',target:'M3',action:'cut'}]).size,0);
assert.equal(context.findAttachedMainNodes(nodes,[...edges,{source:'M3',target:'M2',action:'add'}]).size,0);
assert.equal(context.findAttachedMainNodes(nodes,[...edges,{source:'M3',target:'M4',action:'stir'}]).size,0);
// A sole ingredient entering its initial container is still a main spine.
const pot = {...n('M5'),state_r1:['wok_pot','container','','']};
assert.equal(context.findAttachedMainNodes([nodes[2],pot],[{source:'M3',target:'M5',action:'add'}]).size,0);
// Shared and second-recipe nodes use the same local layout without changing type.
for (const kind of ['only_r2', 'merged_exact', 'merged_similar']) {
 const ns = nodes.map(x=>({...x, kind}));
 const bs = context.newBranchLayout(ns, edges, {});
 assert(!bs.some(b=>b.spine.some(n=>n.id==='M3')));
 assert(ns.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
 assert(ns[2].domain==='main' && ns[2].kind===kind);
}
console.log('PASS: attached positioning, backbone preservation, processed/multi-target/mixed exclusions, unchanged semantics.');
// Prepared branches entering an empty assembly container keep separate lanes.
context.console.group = () => {};
context.console.groupEnd = () => {};
const assemblyNodes = [n('M11'), n('M12'), n('M21'), n('M22'),
 {...n('M30'),state_r1:['mold','container','','']}, n('M31','dish')];
const assemblyEdges = [
 {source:'M11',target:'M12',action:'fry'},
 {source:'M21',target:'M22',action:'stir'},
 {source:'M12',target:'M30',action:'add'},
 {source:'M12',target:'M30',action:'add'},
 {source:'M22',target:'M30',action:'add'},
 {source:'M30',target:'M31',action:'bake'},
];
const assemblyBranches = context.newBranchLayout(assemblyNodes, assemblyEdges, {});
assert(!assemblyBranches.some(b => b.spine.some(n=>n.id==='M12') && b.spine.some(n=>n.id==='M22')));
assert.notEqual(assemblyNodes[1].y,assemblyNodes[3].y);
assert(assemblyNodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
console.log('PASS: prepared branches stay separate at an empty assembly container.');

// Single raw main additions use centered rows: five per row, diameter-aware wrap.
const shelfNodes = [n('M100'),n('M101'), ...Array.from({length:12},(_,i)=>n('M'+(200+i),'ingredient'))];
const shelfEdges = [{source:'M100',target:'M101',action:'stir'},
 ...shelfNodes.slice(2).map(node=>({source:node.id,target:'M101',action:'add'}))];
const shelfBranches=context.newBranchLayout(shelfNodes,shelfEdges,{});
const shelves=new Map();
for(const node of shelfNodes.slice(2)) {
 if(!shelves.has(node.y)) shelves.set(node.y,[]);
 shelves.get(node.y).push(node);
 assert(!shelfBranches.some(b=>b.spine.some(n=>n.id===node.id)));
}
assert.deepEqual([...shelves.values()].map(row=>row.length).sort(),[2,5,5]);
const ys=[...shelves.keys()].sort((a,b)=>a-b);
assert.equal(ys[1]-ys[0],52); assert.equal(ys[2]-ys[1],52);
for(const row of shelves.values()) assert.equal(new Set(row.map(n=>n.x)).size,row.length);
console.log('PASS: single-main attachments use five horizontal slots per row and diameter-aware compact rows.');
// A process chain stays evenly spaced when ingredients arrive at its destination.
for (const kind of ['only_r1', 'only_r2', 'merged_exact', 'merged_similar']) {
 const ns = [
  {...n('M500','oven',kind),domain:'aux',state_r1:['oven','container','','']},
  {...n('M501','oven',kind),domain:'aux',state_r1:['oven','container','','']},
  ...[510,511,512,513].map(i=>n('M'+i,'batter',kind)),
 ];
 const es = [{source:'M500',target:'M501',action:'heat'},
  {source:'M510',target:'M511',action:'stir'},
  {source:'M511',target:'M512',action:'stir'},
  {source:'M512',target:'M513',action:'shake'},
  {source:'M513',target:'M501',action:'add'}];
 context.newBranchLayout(ns,es,{});
 assert.equal(ns[1].x-ns[0].x,130,kind+': add input must not stretch a process step');
 // With a second process predecessor, the join really does constrain alignment.
 const joined=ns.map(({x,y,...node})=>({...node}));
 context.newBranchLayout(joined,es.map(e=>e.source==='M513'?{...e,action:'bake'}:e),{});
 assert(joined[1].x-joined[0].x>130,kind+': real process join must retain its alignment');
}
console.log('PASS: incoming additions allow chain compaction; multiple process predecessors retain join constraints.');
// Standalone seasonings pack densely beside their receiver, clear of both
// horizontal process links and a diagonal processed-ingredient addition.
const clusterTarget={...n('M900','sauce','merged_exact'),x:0,y:0};
const clusterSources=[{...n('M901','sauce','merged_exact'),x:-130,y:0},
 {...n('M902','prepared','merged_exact'),x:-130,y:-130}];
const seasonings=Array.from({length:10},(_,i)=>({...n('M'+(910+i),'spice','merged_exact'),
 domain:'aux',x:-300-i*38,y:-180,state_r1:['spice','aux','powder','raw']}));
const rawMain={...n('M930','meat','merged_exact'),x:-100,y:-160};
const clusterNodes=[clusterTarget,...clusterSources,...seasonings,rawMain];
const clusterEdges=[{source:'M901',target:'M900',action:'stir'},
 {source:'M902',target:'M900',action:'add'},
 ...[...seasonings,rawMain].map(n=>({source:n.id,target:'M900',action:'add'}))];
context.nb_packSingleAdditions(clusterNodes,clusterEdges,new Set(['M930']));
assert(Math.max(...seasonings.map(n=>n.x))-Math.min(...seasonings.map(n=>n.x))<=104);
assert.equal(new Set(seasonings.map(n=>n.y)).size,2);
assert(Math.abs(rawMain.x-clusterTarget.x)<=52);
for(const node of [...seasonings,rawMain]) for(const start of clusterSources) {
 const dx=clusterTarget.x-start.x,dy=clusterTarget.y-start.y,len=dx*dx+dy*dy;
 const t=Math.max(0,Math.min(1,((node.x-start.x)*dx+(node.y-start.y)*dy)/len));
 assert(Math.hypot(node.x-start.x-t*dx,node.y-start.y-t*dy)>=(node.domain==='aux'?19:32),
  'Compact additions must clear the incoming process and prepared-add paths');
}
assert.deepEqual(clusterSources.map(n=>[n.x,n.y]),[[-130,0],[-130,-130]]);
console.log('PASS: ten seasonings fit in a 104px-wide cluster and clear process/prepared-add links.');
// Side placement applies to a complete process branch, never just its only_* tail.
const regionNodes=[
 {...n('M1000','shared','merged_exact'),x:0,y:100},
 {...n('M1001','tail','only_r1'),x:130,y:200},
 {...n('M1002','tail','only_r1'),x:260,y:300},
 {...n('M1010','r1','only_r1'),x:0,y:600},
 {...n('M1011','r1','only_r1'),x:130,y:600},
 {...n('M1020','r2','only_r2'),x:0,y:-200},
 {...n('M1021','r2','only_r2'),x:130,y:-200},
 {...n('M1030','end','only_r1'),x:0,y:700},
];
const regionEdges=[
 {source:'M1000',target:'M1001',action:'stir'},
 {source:'M1001',target:'M1002',action:'stir'},
 {source:'M1010',target:'M1011',action:'cut'},
 {source:'M1011',target:'M1002',action:'add'},
 {source:'M1020',target:'M1021',action:'cut'},
 {source:'M1021',target:'M1002',action:'add'},
];
const regionBefore=regionNodes.map(n=>[n.x,n.y]);
context.nb_placeComparisonRegions(regionNodes,regionEdges,new Set(regionNodes.map(n=>n.id)));
assert.deepEqual(regionNodes.slice(0,3).map(n=>[n.x,n.y]),regionBefore.slice(0,3),
 'A matched node exempts the entire process chain, including an only_r1 tail');
assert(regionNodes[3].y<100 && regionNodes[4].y<100);
assert(regionNodes[5].y>300 && regionNodes[6].y>300);
assert.equal(regionNodes[7].y,700,'A terminal branch without an outgoing add retains original layout');
console.log('PASS: only entirely one-recipe add-feeding process branches receive side placement.');
