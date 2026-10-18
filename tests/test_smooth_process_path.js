const assert=require('assert'),fs=require('fs');
const source=fs.readFileSync('frontend/app.js','utf8');
const fn=new Function(source.slice(source.indexOf('function smoothProcessPath('),source.indexOf('function smoothAddFlowPath('))+';return smoothProcessPath;')();
assert.equal(fn(0,0,100,0),'M 0,0 L 100,0');
assert.equal(fn(0,0,100,80),'M 0,0 C 50,0 50,80 100,80');
assert.equal(fn(0,80,100,0),'M 0,80 C 50,80 50,0 100,0');
assert.equal(fn(100,0,0,80),'M 100,0 C 50,0 50,80 0,80');
assert.equal(fn(0,0,0,100),'M 0,0 C 0,50 0,50 0,100');
console.log('PASS: horizontal process lines and smooth upward/downward/reverse/vertical process paths.');
