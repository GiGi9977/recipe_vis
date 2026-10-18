const assert=require('assert'),fs=require('fs');
const source=fs.readFileSync('frontend/app.js','utf8');
const code=source.slice(source.indexOf('function nb_packSingleAdditions('),source.indexOf('function newBranchLayout('));
const pack=new Function('nb_inlineContainerTransfers','nb_isContainer','getHalfOffsetForNode','isAddEdge','nb_nodeIdx',code+';return nb_packSingleAdditions;')(
 ()=>new Set(),()=>false,n=>n.domain==='aux'?12:25,e=>e.action==='add',n=>Number(n.id.replace(/\D/g,''))||0);
for(const kind of ['merged_similar','merged_exact']) {
 const target={id:'t',domain:'main',kind,shape_dumbbell:true,x:300,y:200};
 const left={id:'l',domain:'main',kind:'merged_exact',x:100,y:200};
 const inputs=Array.from({length:6},(_,i)=>({id:'a'+i,domain:'aux',kind:'merged_exact',x:0,y:0}));
 const edges=[{source:'l',target:'t',action:'fry',style:'shared'},...inputs.map(n=>({source:n.id,target:'t',action:'add',style:'shared'}))];
 pack([left,target,...inputs],edges,new Set());
 assert.equal(target.y,200);assert.equal(left.y,200);
 for(const n of inputs){
  assert(Math.abs(n.y-target.y)<=66,'shared additions stay near waist height');
  assert(Math.abs(n.x-target.x)>=40,'cluster sits beside dumbbell');
  assert(Math.abs(n.y-200)>=19 || n.x<100 || n.x>300,'input clears process line');
 }
 for(let i=0;i<inputs.length;i++)for(let j=i+1;j<inputs.length;j++)
  assert(Math.hypot(inputs[i].x-inputs[j].x,inputs[i].y-inputs[j].y)>=26,'input circles remain separate');
}
console.log('PASS: exact shared ADD clusters sit beside dumbbell waist and clear process edges.');
