const assert = require('assert');
const fs = require('fs');
const source = fs.readFileSync('frontend/app.js', 'utf8');
const code = source.slice(source.indexOf('function effectiveAnchor('), source.indexOf('function boundaryPointFromCenter('));
const anchor = new Function(code + ';return effectiveAnchor;')();
for (const node of [{kind:'merged_similar'}, {kind:'merged_exact',shape_dumbbell:true}]) {
  for (const raw of ['T','B','M',undefined]) for (const isSource of [true,false]) {
    assert.equal(anchor(node,raw,'shared',isSource),'M');
    assert.equal(anchor(node,raw,'R1',isSource),'T');
    assert.equal(anchor(node,raw,'R2',isSource),'B');
  }
}
assert.equal(anchor({kind:'merged_exact'},'M','shared',true),'M');
console.log('PASS: shared dumbbell edges use the waist; recipe-specific edges retain their own circles.');
