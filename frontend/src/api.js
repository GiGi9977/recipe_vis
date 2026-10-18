async function json(url,options){const response=await fetch(url,options);if(!response.ok)throw new Error((await response.json().catch(()=>({}))).detail||`Request failed (${response.status})`);return response.json();}
export const listRecipes=()=>json("/recipes").then(data=>[...data.recipes].sort((a,b)=>(parseInt(a.id)||0)-(parseInt(b.id)||0)));
export const compareRecipes=(recipe1,recipe2,signal)=>json("/compare",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recipe1,recipe2}),signal});
