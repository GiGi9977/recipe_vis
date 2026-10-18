// The backend can drop a request while its worker restarts (a reload or a crash);
// retry those a few times before showing an error. Aborted requests are never retried.
const RETRIES=4,DELAY_MS=600,RESTARTING=new Set([502,503,504]);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function fetchWithRetry(url,options,{retries=RETRIES,delay=DELAY_MS}={}){
  let last;
  for(let attempt=0;attempt<=retries;attempt++){
    try{
      const response=await fetch(url,options);
      if(!RESTARTING.has(response.status)||attempt===retries)return response;
      last=new Error(`Backend unavailable (${response.status})`);
    }catch(error){
      if(error?.name==="AbortError"||options?.signal?.aborted)throw error;
      last=error;
      if(attempt===retries)throw error;
    }
    await wait(delay*(attempt+1));
  }
  throw last;
}

async function json(url,options){const response=await fetchWithRetry(url,options);if(!response.ok)throw new Error((await response.json().catch(()=>({}))).detail||`Request failed (${response.status})`);return response.json();}
export const listRecipes=()=>json("/recipes").then(data=>[...data.recipes].sort((a,b)=>(parseInt(a.id)||0)-(parseInt(b.id)||0)));
export const compareRecipes=(recipe1,recipe2,signal)=>json("/compare",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recipe1,recipe2}),signal});

