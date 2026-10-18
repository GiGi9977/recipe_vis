const fs=require('fs');
(async()=>{
 const response=await fetch('http://127.0.0.1:8000/recipes');const {recipes}=await response.json();
 const cases=[];
 for(const a of recipes)for(const b of recipes){
  const r=await fetch('http://127.0.0.1:8000/compare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recipe1:a.id,recipe2:b.id})});
  if(!r.ok)throw Error(a.id+' / '+b.id+': '+r.status);
  const data=await r.json();cases.push({name:a.id.replace(/^\d+\s*/, '')+' / '+b.id.replace(/^\d+\s*/, ''),graph:data.graph});
 }
 fs.writeFileSync('tests/tmp_live_cases.json',JSON.stringify(cases));console.log('Saved',cases.length,'live API comparisons');
})().catch(e=>{console.error(e);process.exitCode=1});
