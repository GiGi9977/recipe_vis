const fs=require('fs'),{chromium}=require('C:/Users/yang2767/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}});page.on('pageerror',e=>console.error('PAGE',e.message));await page.goto('http://127.0.0.1:3000');await page.waitForFunction(()=>typeof NB_BASE_Y==='number');
 const cases=JSON.parse(fs.readFileSync('tests/tmp_live_cases.json','utf8'));let count=0,examples=[];
 for(const [caseIndex,c] of cases.entries()){if(caseIndex%15===0)console.log("Auditing",caseIndex,"/",cases.length);const collisions=await page.evaluate(json=>{const {graph}=JSON.parse(json);
  newBranchLayout(graph.nodes,graph.edges,graph);
  const found=[];
  const geom=nb_finalBranchGeometry(graph.nodes,graph.edges);
  for(let i=0;i<geom.groups.length;i++)for(let j=i+1;j<geom.groups.length;j++)
   for(const a of geom.groups[i].shapes)for(const b of geom.groups[j].shapes)
    if(a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom)found.push(['footprint',a.type,b.type]);

  for(let i=0;i<graph.nodes.length;i++)for(let j=i+1;j<graph.nodes.length;j++){
   const a=graph.nodes[i],b=graph.nodes[j],sa=nodeVisualSpec(a),sb=nodeVisualSpec(b);
   if(Math.abs(a.x-b.x)<sa.outerR+sb.outerR+2&&Math.abs(a.y-b.y)<sa.outerR+sb.outerR+(sa.halfOffset||0)+(sb.halfOffset||0)+2)found.push([a.id,b.id,a.x,a.y,b.x,b.y]);
  }return found;
 },JSON.stringify(c));count+=collisions.length;if(collisions.length)examples.push([c.name,collisions]);}
 console.log(JSON.stringify({count,examples:examples.slice(0,12)},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
